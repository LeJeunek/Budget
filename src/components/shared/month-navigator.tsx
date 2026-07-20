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
 *
 * `shiftMonth`/`currentMonthString`/`formatMonthLabel` live in the sibling
 * `month-utils.ts` module (no `"use client"` directive), not here — see that
 * file's header comment for why: a Server Component (Dashboard/Budgeting/
 * Bills all call `currentMonthString()` directly) cannot call a plain
 * function imported from a `"use client"` file, even though this file used
 * to define them locally and export them. Re-exported below purely so
 * existing client-side imports of `shiftMonth` et al. *from this path*
 * keep working — Server Components must import from `month-utils` directly.
 */

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  currentMonthString,
  formatMonthLabel,
  shiftMonth,
} from "@/components/shared/month-utils"

export { shiftMonth, currentMonthString, formatMonthLabel }

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
