"use client"

/**
 * YearlySpendingChart — Yearly Spending (analytics.md AC6): total expenses
 * per calendar year, across every year the user has expense history for.
 * Always all-time by definition — `getYearlySpending` takes no `period`
 * argument (api-contracts.md), so this chart ignores the shared reporting-
 * period control entirely, unlike every other Pass 1 chart in this feature.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `YearlySpendingPoint[]` and passes it down verbatim.
 */

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import type { YearlySpendingPoint } from "../types"
import { formatCompactCurrency } from "./chart-format"

export interface YearlySpendingChartProps {
  data: YearlySpendingPoint[]
}

export function YearlySpendingChart({ data }: YearlySpendingChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Yearly Spending</CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No expense history yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once you&apos;ve logged expenses, each calendar year&apos;s
              total will show up here so you can see whether your spending
              trends up or down year over year.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* A single year is real data (not fabricated), just not yet a
                genuine year-over-year trend — shown plainly with a caveat
                rather than blocked behind an empty state, same "never hide
                real data, just caption it" precedent as
                `net-worth-history-chart.tsx`'s sparse-history banner. */}
            {data.length === 1 && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Only one year of history so far — year-over-year comparisons
                will appear once a second year of data exists.
              </p>
            )}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="year"
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
                  <Bar
                    dataKey="totalExpenses"
                    name="Total Expenses"
                    fill="var(--chart-2)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={96}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
