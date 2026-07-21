"use client"

/**
 * AllocationChart — a donut breakdown of active-holdings' current value by
 * asset type or by sector (docs/product/investments.md AC9), reused for both
 * dimensions from app/(dashboard)/investments/page.tsx rather than building
 * two near-identical charts, per the company's "avoid duplication" rule.
 *
 * Structurally mirrors `features/dashboard/components/
 * spending-by-category-chart.tsx`'s `SpendingByCategoryChart` (this
 * feature's closest existing "donut + legend list" Recharts pattern) —
 * same slice-color cycling via the `--chart-1`..`--chart-5` CSS variables,
 * same Tooltip/legend structure. `"use client"` for the same reason: Recharts'
 * `ResponsiveContainer` measures the DOM at runtime.
 *
 * Edge Cases: "allocation percentages must still render legibly for very
 * small holdings" and "only one slice ... rather than looking broken" are
 * both satisfied by Recharts' own rendering (a single 100% slice, or a
 * legend row per entry regardless of how thin its wedge is) — no special-
 * casing needed here beyond what SpendingByCategoryChart already
 * establishes for the identical single-category case.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import type { AllocationEntry } from "@/features/investments/types"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export interface AllocationChartProps {
  title: string
  data: AllocationEntry[]
  emptyMessage: string
}

export function AllocationChart({ title, data, emptyMessage }: AllocationChartProps) {
  const hasData = data.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-56 flex-col items-center justify-center gap-1 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-56 w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={data.length > 1 ? 2 : 0}
                    stroke="var(--card)"
                  >
                    {data.map((row, index) => (
                      <Cell
                        key={row.label}
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
                  key={row.label}
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
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {row.percent.toFixed(1)}%
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
