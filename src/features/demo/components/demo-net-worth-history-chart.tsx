"use client"

/**
 * DemoNetWorthHistoryChart — demo-owned twin of
 * `features/dashboard/components/net-worth-history-chart.tsx`, built for the
 * public `/demo` route (docs/architecture/public-demo-technical-design.md
 * §3.4).
 *
 * Reuses the real chart's Recharts markup/range-tab UI, but replaces the
 * live `useNetWorthHistory` TanStack Query hook (which refetches `GET
 * /api/dashboard/net-worth-history?range=`, a real, session-authenticated
 * Route Handler) with a `data` prop that already carries every range's
 * fully-resolved `NetWorthHistoryResponse` — switching ranges is a pure,
 * local `useState` change, never a fetch, never a `@tanstack/react-query`
 * import. This is why `NetWorthHistoryChart` itself is never imported here:
 * it is the one dashboard chart the design doc's own §3.4 flags as not
 * purely presentational (its range selector is wired to a live,
 * session-authenticated fetch, which `/demo` must never issue — public-demo.md
 * Capability 3 AC3, Capability 5 AC3).
 *
 * Because the entire fixture dataset is static, every range's data can be
 * (and is) precomputed once by the caller — see
 * `features/demo/fixtures/derive/net-worth-history.ts`'s
 * `deriveNetWorthHistory` — so this chart's range selector is a genuine,
 * fully-functional, zero-network client-side state change, exceeding
 * Capability 5 AC3's own minimum bar ("not required to be functionally
 * wired... a no-op").
 *
 * Usage:
 * ```tsx
 * <DemoNetWorthHistoryChart data={deriveNetWorthHistory(DEMO_HOUSEHOLD, new Date())} />
 *
 * // Start on a specific range tab (defaults to "90d")
 * <DemoNetWorthHistoryChart data={history} initialRange="1y" />
 * ```
 */

import * as React from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useChartAnimationProps } from "@/components/shared/motion"
import { formatCompactCurrency } from "@/features/dashboard/components/chart-format"

import type { NetWorthHistoryRange, NetWorthHistoryResponse } from "@/features/dashboard/types"

/** AC2's four range-selector options — always all four, mirroring the real
 * chart exactly. */
const RANGE_OPTIONS: { value: NetWorthHistoryRange; label: string }[] = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
]

type BreakdownView = "net-worth" | "breakdown"

export interface DemoNetWorthHistoryChartProps {
  /** Every range's already-resolved response, precomputed once by the
   * caller. Switching range tabs below is a pure lookup into this map,
   * never a fetch. */
  data: Record<NetWorthHistoryRange, NetWorthHistoryResponse>
  /** Initial selected range tab. Defaults to "90d", matching this fixture
   * household's expected history depth. */
  initialRange?: NetWorthHistoryRange
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

/** Formats a `NetWorthHistoryPoint.date` `"yyyy-MM-dd"` key into a short
 * display label like "Jul 21" — mirrors the real chart's identical
 * `formatDateLabel` (duplicated per this codebase's cross-domain
 * component-import boundary: `net-worth-history-chart.tsx` also carries the
 * live-fetch range selector this twin must never pull in). */
function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function DemoNetWorthHistoryChart({
  data,
  initialRange = "90d",
  currency = "USD",
}: DemoNetWorthHistoryChartProps) {
  // Chart Transitions (Phase 5b): one shared entrance/update animation gate,
  // reduced-motion-aware — reused directly, since it has no Context/fetch
  // dependency of its own.
  const chartAnimationProps = useChartAnimationProps()
  const [range, setRange] = React.useState<NetWorthHistoryRange>(initialRange)
  const [view, setView] = React.useState<BreakdownView>("net-worth")

  const history = data[range]
  const points = history.points
  const lastPoint = points[points.length - 1] as
    | NetWorthHistoryResponse["points"][number]
    | undefined

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 @container/card-header sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Net Worth History</CardTitle>
          {lastPoint && (
            <CardDescription>As of {formatDateLabel(lastPoint.date)}</CardDescription>
          )}
        </div>

        {points.length > 0 && (
          <div className="flex flex-col gap-2 sm:items-end">
            <Tabs
              value={range}
              onValueChange={(value) => setRange(value as NetWorthHistoryRange)}
            >
              <TabsList>
                {RANGE_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs value={view} onValueChange={(value) => setView(value as BreakdownView)}>
              <TabsList>
                <TabsTrigger value="net-worth">Net Worth</TabsTrigger>
                <TabsTrigger value="breakdown">Assets / Debt</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {history.daysTracked === 0 ? (
          <EmptyHistoryState />
        ) : (
          <>
            {history.isSparse && (
              <SparseHistoryBanner daysTracked={history.daysTracked} />
            )}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    width={64}
                    tickFormatter={(value) => formatCompactCurrency(value, currency)}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value, name) => [formatCurrency(Number(value), currency), name]}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius-lg)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  {view === "breakdown" && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="assets"
                        name="Assets"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={points.length === 1}
                        {...chartAnimationProps}
                      />
                      <Line
                        type="monotone"
                        dataKey="debt"
                        name="Debt"
                        stroke="var(--chart-3)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={points.length === 1}
                        {...chartAnimationProps}
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    dot={points.length === 1}
                    activeDot={{ r: 5 }}
                    {...chartAnimationProps}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Mirrors the real chart's identical zero-snapshot empty state — a fixture
 * household should never actually hit this (Capability 2 AC4's "enough
 * historical breadth" requirement), but kept for shape-parity and defensive
 * rendering if a caller ever passes a range with no points. */
function EmptyHistoryState() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-foreground">No history yet</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Net worth history will start appearing here once an account has been
        tracked for at least a day.
      </p>
    </div>
  )
}

function SparseHistoryBanner({ daysTracked }: { daysTracked: number }) {
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
      Building net worth history — {daysTracked}{" "}
      {daysTracked === 1 ? "day" : "days"} tracked so far.
    </p>
  )
}
