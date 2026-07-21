"use client"

/**
 * GrowthChart — the historical growth chart (docs/product/investments.md
 * AC7), reused for both the portfolio-level aggregate series
 * (app/(dashboard)/investments/page.tsx) and a single holding's own series
 * (app/(dashboard)/investments/[holdingId]/page.tsx) — one component per the
 * company's "avoid duplication" rule, since `service.getGrowthHistory`
 * already returns the identical `GrowthPoint[]` shape for both call sites
 * (api-contracts.md: "omit `holdingId` for the portfolio-level aggregate
 * growth series").
 *
 * Per api-contracts.md's explicit note: "`getGrowthHistory` returning
 * exactly one entry is a valid, expected response — growth-chart.tsx
 * renders an explicit 'not enough history yet' state for a one-entry array
 * rather than attempting to draw a line chart with a single point." A
 * zero-entry array (no holdings at all, or a `holdingId` that doesn't
 * belong to the caller) gets its own distinct empty state.
 *
 * Line/axis structure mirrors
 * `features/dashboard/components/monthly-trends-chart.tsx`'s
 * `MonthlyTrendsChart` (this feature's closest existing Recharts line-chart
 * reference).
 */

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { GrowthPoint } from "@/features/investments/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** Compact axis-tick currency formatter — duplicated from
 * `features/dashboard/components/chart-format.ts`'s `formatCompactCurrency`
 * rather than imported, since that file lives in the Dashboard feature's own
 * components directory and folder-tree.md's module boundary keeps each
 * feature's `components/` self-contained (no cross-feature imports between
 * sibling feature UI layers). */
function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export interface GrowthChartProps {
  title: string
  data: GrowthPoint[]
}

export function GrowthChart({ title, data }: GrowthChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No growth history yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Add a holding and update its current value over time to build
              a growth history.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Not enough history yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              As of {formatDate(data[0].date)}, this was worth{" "}
              {formatCurrency(data[0].value)}. Update a current value to
              start building a growth history.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatDate(value)}
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
                labelFormatter={(value) => formatDate(value as string)}
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-lg)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name="Value"
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
