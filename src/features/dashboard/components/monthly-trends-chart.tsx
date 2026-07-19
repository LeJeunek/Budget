"use client"

/**
 * MonthlyTrendsChart — income and expenses across recent months, per
 * docs/product/dashboard-overview.md AC9, so a user can see whether their
 * financial position is improving or worsening over time.
 *
 * Presentational only: the page Server Component fetches `MonthlyTrend[]`
 * via `getMonthlyTrends(userId, 6)` and passes it down verbatim — this
 * component renders exactly the months it's given. Per that function's
 * JSDoc, it already floors the range at the user's signup month rather than
 * fabricating blank leading months, so a newer user's chart naturally shows
 * fewer than 6 points; this component must not (and does not) pad the
 * series back out to 6.
 */

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { MonthlyTrend } from "../types"
import { formatCompactCurrency } from "./chart-format"

export interface MonthlyTrendsChartProps {
  data: MonthlyTrend[]
}

/**
 * Formats a `MonthlyTrend.month` `"yyyy-MM"` key (built from UTC components,
 * see the field's JSDoc in `../types.ts`) into a short display label like
 * "Jul 2026". Built manually from UTC `Date.UTC`/`Intl` (with `timeZone:
 * "UTC"` pinned explicitly) rather than a local-timezone-dependent
 * formatter, so the label never drifts to an adjacent month depending on
 * where the browser happens to be — the same reasoning `formatMonthKey` in
 * the service documents for why the key itself is UTC-built.
 */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

export function MonthlyTrendsChart({ data }: MonthlyTrendsChartProps) {
  // Only a genuinely empty series (e.g. a user whose signup month floor
  // dropped every requested month — not expected in practice since the
  // current in-progress month is always included, but defensive per the
  // service's own "shorter than 6 months" edge case) gets the empty state.
  // A series of months that are individually all-zero is a real "flat
  // period" per the service's JSDoc and renders as a normal (flat) chart.
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No trend data yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Come back after a month or two of activity to see how your
              income and expenses trend over time.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((row) => ({
    ...row,
    label: formatMonthLabel(row.month),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
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
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-lg)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Line
                type="monotone"
                dataKey="income"
                name="Income"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
