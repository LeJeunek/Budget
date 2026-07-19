"use client"

/**
 * IncomeVsExpenseChart — a direct, at-a-glance comparison of the current
 * month's total income against total expenses, per
 * docs/product/dashboard-overview.md AC8.
 *
 * Presentational only: the page Server Component passes the already-computed
 * `{ income, expenses }` pair from `getMonthlySummary` — this component does
 * no data fetching or aggregation itself.
 */

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { formatCompactCurrency } from "./chart-format"

export interface IncomeVsExpenseChartProps {
  income: number
  expenses: number
}

export function IncomeVsExpenseChart({ income, expenses }: IncomeVsExpenseChartProps) {
  // Mirrors the "user has accounts but no transactions yet" edge case from
  // dashboard-overview.md: both figures at exactly 0 means no activity this
  // month, which reads as an empty state rather than a legitimate two-bar
  // comparison of zero vs. zero.
  const hasActivity = income > 0 || expenses > 0

  const data = [
    { label: "Income", amount: income, fill: "var(--chart-1)" },
    { label: "Expenses", amount: expenses, fill: "var(--chart-2)" },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs. Expense</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasActivity ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No activity yet this month
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Log a transaction to see how income and expenses compare.
            </p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap="35%">
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
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    borderColor: "var(--border)",
                    borderRadius: "var(--radius-lg)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={96}>
                  {data.map((row) => (
                    <Cell key={row.label} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
