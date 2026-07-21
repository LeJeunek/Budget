"use client"

/**
 * SavingsGrowthChart — Savings Growth (analytics.md AC15): the trend of the
 * user's actual month-by-month savings — actual income minus actual
 * expenses, with that same month's investment gain/loss netted out so
 * unrealized market appreciation is never mistaken for "you saved more."
 * Deliberately a line chart of `actualSavings` alone (not overlaid with raw
 * income/expenses, which the Dashboard's Monthly Trends chart already shows)
 * — this metric's entire point is the *netted* figure Monthly Trends can't
 * show.
 *
 * `actualSavings: null` (the "$0 income month" edge case, per `../types.ts`)
 * is passed straight through as `null` to Recharts' `dataKey` — with
 * `connectNulls` left at its default `false`, a `null` point renders as a
 * genuine gap in the line rather than a misleading `0`, exactly matching
 * analytics.md's edge-case requirement with no extra logic needed here.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `SavingsGrowthPoint[]` and passes it down verbatim.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { SavingsGrowthPoint } from "../types"
import { formatCompactCurrency, formatMonthLabel } from "./chart-format"

export interface SavingsGrowthChartProps {
  data: SavingsGrowthPoint[]
}

export function SavingsGrowthChart({ data }: SavingsGrowthChartProps) {
  const hasAnyMonth = data.some((point) => point.actualSavings !== null)

  if (data.length === 0 || !hasAnyMonth) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Savings Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Not enough data yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once at least one month in this period has recorded income,
              your actual month-by-month savings trend will show up here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((point) => ({
    month: formatMonthLabel(point.month),
    actualSavings: point.actualSavings,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings Growth</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
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
                tickFormatter={formatCompactCurrency}
              />
              <Tooltip
                formatter={(value) =>
                  value === null
                    ? ["Excluded (no income that month)", "Actual Savings"]
                    : [formatCurrency(Number(value)), "Actual Savings"]
                }
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-lg)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="actualSavings"
                name="Actual Savings"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={chartData.length === 1}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
