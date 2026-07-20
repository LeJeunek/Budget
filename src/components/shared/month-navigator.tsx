"use client"

/**
 * MonthNavigator — a domain-agnostic prev/current/next month stepper.
 *
 * Per the Solution Architect's design, this is meant to be shared by every
 * feature that plans/reports on a per-calendar-month basis — Budgeting's
 * planner page today, and Bills' calendar view once that feature is built —
 * rather than each domain growing its own copy (this company's "avoid
 * duplication" rule). It lives here in `components/shared/` rather than
 * inside `features/budgeting/` for exactly that reason, even though
 * Budgeting is the first (and, as of this writing, only) consumer.
 *
 * Deliberately a controlled component (`month`/`onMonthChange`) rather than
 * one that owns URL or local state itself: Budgeting drives it from a
 * `?month=YYYY-MM` search param (see
 * `features/budgeting/components/budget-month-nav.tsx`), while a future
 * Bills calendar may prefer local component state instead — this component
 * has no opinion on where "the current month" lives, only on how to
 * render/step it. `month`/emitted values are always a `"YYYY-MM"` string,
 * matching `features/budgeting/server/validation.ts`'s `MonthSchema` format
 * exactly (kept independent of it here, though — this file must stay
 * importable from any domain, including ones with no dependency on
 * Budgeting's server module).
 *
 * Usage:
 * ```tsx
 * const [month, setMonth] = useState(currentMonthString())
 * <MonthNavigator month={month} onMonthChange={setMonth} />
 * ```
 */

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function assertValidMonth(month: string): void {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`Invalid month "${month}" — expected "YYYY-MM"`)
  }
}

/** Adds `delta` calendar months to a `"YYYY-MM"` string, wrapping year
 * boundaries correctly in either direction (e.g. `shiftMonth("2026-01", -1)`
 * === `"2025-12"`). */
export function shiftMonth(month: string, delta: number): string {
  assertValidMonth(month)
  const [yearStr, monthStr] = month.split("-")
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + delta
  const year = Math.floor(totalMonths / 12)
  const monthIndex = ((totalMonths % 12) + 12) % 12
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`
}

/** `"YYYY-MM"` for the current UTC calendar month — matches
 * `features/budgeting/server/validation.ts`'s `currentMonthStart`'s own UTC
 * convention (risk-register.md #8), so a client evaluating "is this the
 * current month" never disagrees with the server. */
export function currentMonthString(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Human-readable label for a `"YYYY-MM"` string, e.g. `"July 2026"`. */
export function formatMonthLabel(month: string): string {
  assertValidMonth(month)
  const [yearStr, monthStr] = month.split("-")
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export interface MonthNavigatorProps {
  /** Currently displayed month, `"YYYY-MM"`. */
  month: string
  /** Called with the new `"YYYY-MM"` when the user steps to an adjacent
   * month or jumps back to the current one. This component never mutates
   * its own state — the caller owns where `month` is stored. */
  onMonthChange: (month: string) => void
  className?: string
}

export function MonthNavigator({
  month,
  onMonthChange,
  className,
}: MonthNavigatorProps) {
  const isCurrentMonth = month === currentMonthString()

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Previous month"
        onClick={() => onMonthChange(shiftMonth(month, -1))}
      >
        <ChevronLeftIcon />
      </Button>

      <span
        className="min-w-32 text-center font-heading text-base font-medium text-foreground"
        aria-live="polite"
      >
        {formatMonthLabel(month)}
      </span>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Next month"
        onClick={() => onMonthChange(shiftMonth(month, 1))}
      >
        <ChevronRightIcon />
      </Button>

      {!isCurrentMonth && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onMonthChange(currentMonthString())}
        >
          Today
        </Button>
      )}
    </div>
  )
}
