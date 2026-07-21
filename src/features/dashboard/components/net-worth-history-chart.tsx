"use client"

/**
 * NetWorthHistoryChart — Phase 3b's Net Worth History chart, per
 * docs/product/net-worth-history.md and api-contracts.md's "Net Worth
 * History chart" section.
 *
 * The Server Component (`app/(dashboard)/page.tsx`) resolves the *initial*
 * range (via `resolveDefaultRange`, AC3) and fetches that range's data
 * directly — `initialRange`/`initialData` below are exactly that pair,
 * seeding this component's first render with zero extra client-side
 * round-trip. Every range change *after* that first render goes through
 * `useNetWorthHistory` (TanStack Query, `features/dashboard/hooks/
 * use-net-worth-history.ts`), which refetches `GET
 * /api/dashboard/net-worth-history?range=` — the one Route Handler this
 * phase adds specifically because the range selector is a Client Component
 * control (see that route's own module doc).
 *
 * Breakdown toggle (AC5) is a pure client-side view switch between the
 * default single "Net Worth" line and an "Assets / Debt" view — both series
 * are already present on every point in the one response above (per
 * `NetWorthHistoryPoint`), so toggling never triggers a new fetch. The Net
 * Worth line stays visible and visually prominent (thicker stroke, drawn
 * last so it renders on top) even in the breakdown view, so a user switching
 * views never loses the headline trend they were just looking at.
 *
 * Sparse-history (AC4) and zero-snapshot (Edge Cases) states are both driven
 * by `NetWorthHistoryResponse.daysTracked`/`isSparse`, computed server-side
 * against the user's *entire* history (independent of the selected range),
 * exactly as that field's JSDoc requires.
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

import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { NetWorthHistoryRange, NetWorthHistoryResponse } from "../types"
import { useNetWorthHistory } from "../hooks/use-net-worth-history"
import { formatCompactCurrency } from "./chart-format"

/** AC2's four range-selector options — always all four, never hidden or
 * disabled based on how much history actually exists (AC2's own wording:
 * "a confusing greyed-out control is worse than a range that simply shows
 * the same sparse data as a shorter one"). */
const RANGE_OPTIONS: { value: NetWorthHistoryRange; label: string }[] = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
]

type BreakdownView = "net-worth" | "breakdown"

export interface NetWorthHistoryChartProps {
  initialRange: NetWorthHistoryRange
  initialData: NetWorthHistoryResponse
}

/** Formats a `NetWorthHistoryPoint.date` `"yyyy-MM-dd"` key into a short
 * display label like "Jul 21" — built manually from UTC `Date.UTC`/`Intl`
 * (with `timeZone: "UTC"` pinned explicitly), mirroring
 * `monthly-trends-chart.tsx`'s `formatMonthLabel` so a date never drifts to
 * an adjacent day depending on the browser's local timezone. */
function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function NetWorthHistoryChart({
  initialRange,
  initialData,
}: NetWorthHistoryChartProps) {
  const [range, setRange] = React.useState<NetWorthHistoryRange>(initialRange)
  const [view, setView] = React.useState<BreakdownView>("net-worth")

  const { data, isFetching } = useNetWorthHistory(range, {
    initialRange,
    initialData,
  })
  // `data` is only ever undefined mid-flight for a range TanStack Query has
  // no cache entry for yet (i.e. never the initial range, which is always
  // seeded via `initialData`) — falling back to `initialData` here just
  // avoids a flash of empty content while that first non-default-range fetch
  // resolves.
  const history = data ?? initialData
  const points = history.points
  const lastPoint = points[points.length - 1] as
    | NetWorthHistoryResponse["points"][number]
    | undefined

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 @container/card-header sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Net Worth History</CardTitle>
          {/* AC9: the most recent point may be from earlier today (or
              yesterday, depending on cron timing) — labeled explicitly as
              "as of" rather than implied to be a live, real-time figure, so
              a momentary mismatch with the Dashboard's Net Worth stat card
              (after the user edits an account today) is understood as
              expected, not a bug. */}
          {lastPoint && (
            <CardDescription>
              As of {formatDateLabel(lastPoint.date)}
            </CardDescription>
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
            <div
              className={cn(
                "h-72 w-full transition-opacity",
                isFetching && "opacity-60",
              )}
            >
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
                    tickFormatter={formatCompactCurrency}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value, name) => [formatCurrency(Number(value)), name]}
                    contentStyle={{
                      backgroundColor: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: "var(--radius-lg)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  {/* AC5's breakdown series render underneath the Net Worth
                      line (declared first, so Recharts paints them first) —
                      Net Worth itself is always the visually prominent line
                      per this chart's binding "companion to the stat card"
                      role (net-worth-history.md's Dependencies section). */}
                  {view === "breakdown" && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="assets"
                        name="Assets"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={points.length === 1}
                      />
                      <Line
                        type="monotone"
                        dataKey="debt"
                        name="Debt"
                        stroke="var(--chart-3)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={points.length === 1}
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="var(--chart-1)"
                    strokeWidth={3}
                    // AC4: a single-point history must render as a visible
                    // dot/flat marker, never a broken or blank chart — a
                    // `LineChart` can't draw a line segment with only one
                    // coordinate, so the dot is the only visible mark in
                    // that case. At every other point count, dots are
                    // suppressed to match this codebase's existing chart
                    // style (monthly-trends-chart.tsx, growth-chart.tsx).
                    dot={points.length === 1}
                    activeDot={{ r: 5 }}
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

/** net-worth-history.md's "Zero snapshots yet" edge case — a brand-new user
 * who hasn't had an account for even one full day yet. Distinct from the
 * sparse-history banner below: this is a genuine empty state (no points to
 * plot at all), not "a few points, more coming." */
function EmptyHistoryState() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-foreground">
        No history yet
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Your net worth history will start appearing here once you&apos;ve had
        at least one account for a day.
      </p>
    </div>
  )
}

/** AC4's sparse-history messaging — non-blocking, informational, shown
 * alongside (never instead of) whatever points already exist. */
function SparseHistoryBanner({ daysTracked }: { daysTracked: number }) {
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      Building your net worth history — {daysTracked}{" "}
      {daysTracked === 1 ? "day" : "days"} tracked so far. Check back daily to
      see your trend take shape.
    </p>
  )
}
