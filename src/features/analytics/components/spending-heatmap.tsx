/**
 * DailySpendingHeatmap — Daily Spending Heatmap (analytics.md AC12): a
 * calendar-style view where each day's color intensity reflects that day's
 * spending relative to the user's own typical daily spending over the
 * selected period, so patterns like "I always spend heavily on weekends" or
 * "the 1st and 15th are consistently high" become visible at a glance.
 *
 * `getDailySpendingHeatmap` only ever returns days that actually had
 * spending (per `../types.ts`'s `DailySpendingHeatmapPoint` doc — a $0 day is
 * never emitted as an explicit row), so this component derives which months
 * to render directly from `data`'s own dates rather than needing the
 * resolved period's start/end boundaries passed down separately — `server/
 * period.ts`'s own JSDoc is explicit that nothing client-side should call it
 * directly, so this file does its own small, self-contained calendar-grid
 * math instead of importing that module.
 *
 * Rendered as one mini month-grid per calendar month present in `data`,
 * capped to the most recent `MAX_RENDERED_MONTHS` — a deliberate frontend-only
 * windowing decision for legibility (An "All Time" period spanning several
 * years would otherwise render an unreasonably long page), not a truncation
 * of the underlying data itself (every day is still in `data`, just not every
 * month gets its own grid rendered).
 *
 * A plain Server Component — no hooks of its own; `Tooltip` is a Client
 * Component internally, which a Server Component can render as a child
 * without itself needing `"use client"`.
 */

import { formatCurrency } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import type { DailySpendingHeatmapPoint } from "../types"
import { formatMonthLabel } from "./chart-format"

export interface DailySpendingHeatmapProps {
  data: DailySpendingHeatmapPoint[]
}

const MAX_RENDERED_MONTHS = 6
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]

interface MonthGrid {
  monthKey: string
  /** Each week is exactly 7 cells; `null` = padding before the 1st or after
   * the last day of the month, never a real day. */
  weeks: (string | null)[][]
}

/** Groups `data`'s dates into one `MonthGrid` per calendar month present,
 * built from UTC date components (matching every other date computation in
 * this codebase — `Transaction.date` is a UTC calendar date). */
function buildMonthGrids(dateKeys: string[]): MonthGrid[] {
  const monthKeys = [...new Set(dateKeys.map((date) => date.slice(0, 7)))].sort()

  return monthKeys.map((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()

    const cells: (string | null)[] = [
      ...Array<null>(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, day) => {
        const dayNum = String(day + 1).padStart(2, "0")
        return `${monthKey}-${dayNum}`
      }),
    ]
    while (cells.length % 7 !== 0) {
      cells.push(null)
    }

    const weeks: (string | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7))
    }

    return { monthKey, weeks }
  })
}

/** Maps `relativeIntensity` (per `types.ts`: `amount / averageDailySpend`,
 * typically centered around 1 for a "typical" day) to a cell background
 * opacity — floored so even a low-but-nonzero spending day is visibly
 * distinct from a no-spending day, capped so an extreme outlier day doesn't
 * exceed full opacity. */
function intensityToOpacity(relativeIntensity: number): number {
  return Math.min(0.15 + relativeIntensity * 0.35, 1)
}

export function DailySpendingHeatmap({ data }: DailySpendingHeatmapProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Spending Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No spending data for this period yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once you&apos;ve logged some expenses, a calendar of your daily
              spending patterns will show up here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const byDate = new Map(data.map((point) => [point.date, point]))
  const allGrids = buildMonthGrids(data.map((point) => point.date))
  const grids = allGrids.slice(-MAX_RENDERED_MONTHS)
  const hiddenMonthCount = allGrids.length - grids.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Spending Heatmap</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {hiddenMonthCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing the most recent {MAX_RENDERED_MONTHS} months with activity
            ({hiddenMonthCount} earlier {hiddenMonthCount === 1 ? "month" : "months"} not shown).
          </p>
        )}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {grids.map((grid) => (
            <div key={grid.monthKey} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-foreground">
                {formatMonthLabel(grid.monthKey)}
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
                {WEEKDAY_LABELS.map((label, index) => (
                  <span key={index}>{label}</span>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                {grid.weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-7 gap-1">
                    {week.map((dateKey, dayIndex) => {
                      if (!dateKey) {
                        return <span key={dayIndex} className="size-6" />
                      }

                      const point = byDate.get(dateKey)
                      const dayNumber = Number(dateKey.slice(-2))

                      return (
                        <Tooltip key={dateKey}>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "flex size-6 items-center justify-center rounded-sm text-[10px]",
                                point ? "text-foreground" : "bg-muted text-muted-foreground",
                              )}
                              style={
                                point
                                  ? {
                                      backgroundColor: "var(--chart-2)",
                                      opacity: intensityToOpacity(point.relativeIntensity),
                                    }
                                  : undefined
                              }
                            >
                              {dayNumber}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {point
                              ? `${formatCurrency(point.amount)} on ${dateKey}`
                              : `No spending on ${dateKey}`}
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
