"use client"

/**
 * IncomeSourcesChart — Income Sources (analytics.md AC14): the selected
 * period's share of total actual-received income attributable to each
 * `IncomeType`, plus the "Untracked/Other" residual — e.g. "70% Salary, 20%
 * Rental, 10% Side Hustle." Mirrors `ExpenseDistributionChart`'s donut-plus-
 * legend layout for visual/structural consistency across this feature's two
 * proportion-breakdown charts.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `IncomeSourceEntry[]` (already sorted descending, per `income-analytics.ts`)
 * and passes it down verbatim. `[]` is this metric's own "$0 total income in
 * this period" case (per that function's JSDoc), rendered as this
 * component's empty state below.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { IncomeSourceEntry } from "../types"
import { CHART_PALETTE } from "./chart-format"
import { INCOME_SOURCE_TYPE_LABELS } from "./income-source-labels"

export interface IncomeSourcesChartProps {
  data: IncomeSourceEntry[]
}

export function IncomeSourcesChart({ data }: IncomeSourcesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No income recorded in this period yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once income is recorded for the selected period, its breakdown
              by source will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-64 w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="amount"
                    nameKey="type"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={data.length > 1 ? 2 : 0}
                    stroke="var(--card)"
                  >
                    {data.map((row, index) => (
                      <Cell key={row.type} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      INCOME_SOURCE_TYPE_LABELS[String(name) as IncomeSourceEntry["type"]],
                    ]}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius-lg)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex w-full flex-col gap-2 sm:w-1/2">
              {data.map((row, index) => (
                <li key={row.type} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-foreground">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length] }}
                    />
                    <span className="truncate">{INCOME_SOURCE_TYPE_LABELS[row.type]}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatCurrency(row.amount)} ({row.percent.toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
