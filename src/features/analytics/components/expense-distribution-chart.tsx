"use client"

/**
 * ExpenseDistributionChart — Expense Distribution (analytics.md AC8): the
 * selected period's total spending by category, functionally the same shape
 * as the Dashboard's Spending by Category chart but analyzable across an
 * arbitrary reporting period rather than fixed to the current month. Mirrors
 * `dashboard/components/spending-by-category-chart.tsx`'s donut-plus-legend
 * layout for visual consistency, kept as its own copy per folder-tree.md's
 * module boundary rule (features/<domain>/components isn't a shared import
 * target across domains — see `chart-format.ts`'s header comment for the
 * same reasoning applied to this feature's formatters).
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `ExpenseDistributionEntry[]` and passes it down verbatim, already sorted
 * descending and with "Uncategorized" pre-folded in by the service.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { ExpenseDistributionEntry } from "../types"
import { CHART_PALETTE } from "./chart-format"

export interface ExpenseDistributionChartProps {
  data: ExpenseDistributionEntry[]
}

export function ExpenseDistributionChart({ data }: ExpenseDistributionChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No spending in this period yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Categorized expenses will show up here once you log a
              transaction in the selected period.
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
                    nameKey="categoryName"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={data.length > 1 ? 2 : 0}
                    stroke="var(--card)"
                  >
                    {data.map((row, index) => (
                      <Cell
                        key={row.categoryId}
                        fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
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
                <li
                  key={row.categoryId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-foreground">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
                      }}
                    />
                    <span className="truncate">{row.categoryName}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatCurrency(row.amount)}
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
