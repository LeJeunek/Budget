"use client"

/**
 * SpendingByCategoryChart — donut breakdown of the current month's expense
 * transactions by category, per docs/product/dashboard-overview.md AC7.
 * Includes whatever "Uncategorized" bucket `getSpendingByCategory` already
 * folded in (see `UNCATEGORIZED_CATEGORY_ID` in `../types.ts`) — this
 * component renders every row it's given as-is, so no spending is silently
 * dropped from the chart between the service and the screen.
 *
 * Presentational only: the page Server Component fetches `CategorySpending[]`
 * and passes it down. `"use client"` is required because Recharts'
 * `ResponsiveContainer` measures the DOM at runtime, which only works in a
 * Client Component.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { CategorySpending } from "../types"

// Cycled across pie slices and the legend swatches below. Sourced from the
// `--chart-1` .. `--chart-5` CSS variables shadcn's `init` defined in
// globals.css (rather than hardcoded hex) so the palette adapts correctly in
// dark mode, per the Frontend Lead's chart-color convention.
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export interface SpendingByCategoryChartProps {
  data: CategorySpending[]
}

export function SpendingByCategoryChart({ data }: SpendingByCategoryChartProps) {
  // A row-with-zero-total can't happen from the service (grouped rows only
  // exist when there was at least one expense), but an empty array is the
  // real "no spending yet this month" case dashboard-overview.md's edge
  // cases require an explicit, encouraging state for — never an empty donut.
  const hasSpending = data.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasSpending ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No spending yet this month
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Categorized expenses will show up here once you log a
              transaction.
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
                        fill={SLICE_COLORS[index % SLICE_COLORS.length]}
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
                        backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length],
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
