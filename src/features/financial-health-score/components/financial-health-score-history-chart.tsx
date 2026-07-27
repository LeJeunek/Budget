"use client"

/**
 * FinancialHealthScoreHistoryChart — the historical trend sparkline
 * (docs/product/ai-features.md Feature 5 AC7: "a user can view a historical
 * trend of their own past scores — a simple trend line/sparkline").
 *
 * Built with `recharts` (already this codebase's charting library — see
 * `features/dashboard/components/monthly-trends-chart.tsx`/
 * `net-worth-history-chart.tsx`), mirroring `MonthlyTrendsChart`'s exact
 * `ResponsiveContainer`/`LineChart`/theme-token-colored-axes structure — this
 * is a feature-scoped chart composition, the same established pattern every
 * other chart in this codebase already follows, not a new design-system
 * primitive.
 *
 * Presentational only: the page Server Component fetches
 * `FinancialHealthScoreHistoryPoint[]` via `getFinancialHealthScoreHistory`
 * and passes it down verbatim. Per that function's own doc comment, a day
 * with zero computable components contributes no point at all (never a
 * fabricated `0`), so a short/sparse array here is expected and handled by
 * the empty/sparse state below rather than assumed to be a bug.
 */

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FinancialHealthScoreHistoryPoint } from "@/features/financial-health-score/types"

export interface FinancialHealthScoreHistoryChartProps {
  data: FinancialHealthScoreHistoryPoint[]
}

/** Below this many points, a line chart isn't a meaningful trend yet — shown
 * as a "building your history" placeholder instead, mirroring
 * `MonthlyTrendsChart`'s identical "genuinely empty series" empty state. */
const MIN_POINTS_FOR_TREND = 2

export function FinancialHealthScoreHistoryChart({
  data,
}: FinancialHealthScoreHistoryChartProps) {
  if (data.length < MIN_POINTS_FOR_TREND) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Score history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Building your score history
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Check back after a few days of tracking to see your score trend
              over time.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Score history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                stroke="var(--muted-foreground)"
                fontSize={12}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                stroke="var(--muted-foreground)"
                fontSize={12}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-lg)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                name="Score"
                stroke="var(--chart-1)"
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
