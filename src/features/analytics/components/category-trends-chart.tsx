"use client"

/**
 * CategoryTrendsChart — Category Trends (analytics.md AC7): each category's
 * total spending per month, across the selected reporting period, so a user
 * can spot a category creeping up over several months rather than only ever
 * seeing this month's breakdown.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `CategoryTrend[]` (already sorted by total period spend descending, per
 * `spending-trends.ts`'s own JSDoc) and passes it down verbatim. "Uncategorized"
 * (including a category deleted after being budgeted against) already arrives
 * pre-folded by the service, per analytics.md's Edge Cases — this component
 * renders whatever `categoryName`s it's given without any special-casing.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollAffordanceContainer } from "@/components/shared/scroll-affordance-container"
import {
  useCurrencyDisplay,
  useFormatCurrency,
} from "@/app/(dashboard)/currency-preference-provider"
import { useChartAnimationProps } from "@/components/shared/motion"

import type { CategoryTrend } from "../types"
import { CHART_PALETTE, formatCompactCurrency, formatMonthLabel } from "./chart-format"

export interface CategoryTrendsChartProps {
  data: CategoryTrend[]
}

/** Only the top N categories (by total period spend — `data` already arrives
 * sorted descending) get their own line; a chart with a line per every one of
 * a user's 11+ categories would be unreadable. A deliberate frontend-only
 * windowing decision, not a truncation of the underlying data — every
 * category is still present in `data` itself, just not all rendered as a
 * distinct series. */
const MAX_RENDERED_CATEGORIES = 8

export function CategoryTrendsChart({ data }: CategoryTrendsChartProps) {
  const formatCurrency = useFormatCurrency()
  const currency = useCurrencyDisplay()
  // Chart Transitions (Phase 5b): one shared entrance/update animation gate,
  // reduced-motion-aware — see docs/architecture/phase-5b-technical-design.md §5.1.
  const chartAnimationProps = useChartAnimationProps()

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No category spending in this period yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Categorized expenses will start trending here once you&apos;ve
              logged some transactions.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const monthKeys = data[0].points.map((point) => point.month)
  const renderedCategories = data.slice(0, MAX_RENDERED_CATEGORIES)
  const hiddenCount = data.length - renderedCategories.length

  const chartData = monthKeys.map((monthKey, monthIndex) => {
    const row: Record<string, string | number> = { month: formatMonthLabel(monthKey) }
    for (const category of renderedCategories) {
      row[category.categoryId] = category.points[monthIndex]?.amount ?? 0
    }
    return row
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Trends</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* A period that only resolves to a single month can't show a real
            trend yet — the line chart still renders (a single point per
            category), captioned rather than blocked, mirroring
            `yearly-spending-chart.tsx`'s single-year treatment. */}
        {monthKeys.length <= 1 && (
          // Accessibility fix (docs/testing/e2e/accessibility-run-report.md's
          // 2026-08-02 re-run, finding #2, axe `color-contrast`) — see
          // yearly-spending-chart.tsx's identical fix/comment.
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
            Only one month of data in the selected period so far — trends
            will appear once at least two months have activity.
          </p>
        )}
        {hiddenCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing the top {MAX_RENDERED_CATEGORIES} categories by spend
            ({hiddenCount} more not shown).
          </p>
        )}
        {/* Phase 5a (docs/architecture/phase-5a-technical-design.md §3.2):
            horizontal-scroll-with-affordance — a month-per-tick line chart
            with up to MAX_RENDERED_CATEGORIES series would otherwise
            compress illegibly on a narrow viewport as the period spans more
            months, so this chart keeps a legible minimum width and scrolls
            instead. */}
        <ScrollAffordanceContainer aria-label="Category trends line chart — monthly spending per category, scrollable horizontally">
          <div className="h-80 w-full min-w-[36rem]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  width={56}
                  tickFormatter={(value) => formatCompactCurrency(value, currency)}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    borderColor: "var(--border)",
                    borderRadius: "var(--radius-lg)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                {renderedCategories.map((category, index) => (
                  <Line
                    key={category.categoryId}
                    type="monotone"
                    dataKey={category.categoryId}
                    name={category.categoryName}
                    stroke={CHART_PALETTE[index % CHART_PALETTE.length]}
                    strokeWidth={2}
                    dot={monthKeys.length === 1}
                    {...chartAnimationProps}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ScrollAffordanceContainer>
      </CardContent>
    </Card>
  )
}
