"use client"

/**
 * IncomeGrowthChart — Income Growth (analytics.md AC13): total actual-received
 * income per month, trended over the selected period, with a by-source
 * stacked overlay (Salary/Side Hustle/Dividend/Rental/Bonus/Other, plus the
 * "Untracked/Other" residual — analytics.md's own explicit requirement that
 * untracked money-in activity stays in the total rather than being dropped).
 *
 * Rendered as a stacked bar chart (one segment per `IncomeSourceType` present
 * anywhere in the series) rather than a single line, since the by-source
 * breakdown *is* this metric's differentiator from the Dashboard's existing
 * Monthly Trends income line (analytics.md's Data-Dependency Split section) —
 * a plain total-only line would duplicate that existing chart with no new
 * value.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `IncomeGrowthPoint[]` and passes it down verbatim.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { IncomeGrowthPoint, IncomeSourceType } from "../types"
import { CHART_PALETTE, formatCompactCurrency, formatMonthLabel } from "./chart-format"
import { INCOME_SOURCE_TYPE_LABELS } from "./income-source-labels"

export interface IncomeGrowthChartProps {
  data: IncomeGrowthPoint[]
}

export function IncomeGrowthChart({ data }: IncomeGrowthChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Income Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Not enough income history yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once you&apos;ve logged income for at least one month, your
              income trend by source will show up here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Only the source types genuinely present anywhere in the series get their
  // own stacked segment/legend entry, in a stable, deterministic order — a
  // fixed six-plus-one-type legend would otherwise show empty entries for
  // every income type a user has never used.
  const presentTypes = [
    ...new Set(data.flatMap((point) => point.bySource.map((entry) => entry.type))),
  ] as IncomeSourceType[]

  const chartData = data.map((point) => {
    const row: Record<string, string | number> = { month: formatMonthLabel(point.month) }
    for (const entry of point.bySource) {
      row[entry.type] = entry.amount
    }
    return row
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income Growth</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
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
                tickFormatter={formatCompactCurrency}
              />
              <Tooltip
                formatter={(value, name) => [formatCurrency(Number(value)), name]}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-lg)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              {presentTypes.map((type, index) => (
                <Bar
                  key={type}
                  dataKey={type}
                  name={INCOME_SOURCE_TYPE_LABELS[type]}
                  stackId="income"
                  fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                  maxBarSize={64}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
