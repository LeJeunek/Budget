/**
 * DayEntryIndicators — Calendar v2's condensed-cell entry-type indicator
 * row, per `docs/architecture/phase-5a-technical-design.md` §4 and
 * `docs/product/phase-5a-accessibility-responsive.md`'s Responsive AC3
 * (Calendar v2's "condensed grid below tablet" mobile treatment).
 *
 * Renders one small, non-color-reliant glyph per entry present on a day
 * (a bill occurrence, a payday, or the budget-reset marker) — distinct
 * icon shapes only (no color-coding of its own), matching
 * `BillEntry`/`PaydayEntry`/`BudgetResetMarker`'s own icon choices
 * (`Receipt`/`ArrowDownToLine`/`Milestone`) so the same visual language a
 * user already reads at `sm`+ carries over to the condensed mobile cell,
 * per Accessibility AC8's "never color alone" bar.
 *
 * Capped at `MAX_VISIBLE_INDICATORS`, with a "+N" overflow signal beyond
 * that — per the product spec's own edge case ("the indicator itself never
 * silently drops entries from view... capped at a few, with a '+N' style
 * overflow signal"). The day's tap-to-expand `DayDetailSheet` remains the
 * complete, authoritative list regardless of how many entries this row can
 * legibly show.
 *
 * Purely decorative/glanceable — the whole row is `aria-hidden`, since the
 * tap target rendering this (a `<button>` in `calendar-grid.tsx`) carries
 * its own accessible name summarizing the day's entries in full, not
 * derived from what this row visually shows.
 */

import { ArrowDownToLine, Milestone, Receipt, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CalendarMonthDay } from "@/features/calendar/types"

const MAX_VISIBLE_INDICATORS = 4

type IndicatorKind = "bill" | "payday" | "budget-reset"

/** Mirrors `BillEntry`/`PaydayEntry`/`BudgetResetMarker`'s own icon choices
 * exactly — see this file's top JSDoc for why. */
const INDICATOR_ICON: Record<IndicatorKind, LucideIcon> = {
  bill: Receipt,
  payday: ArrowDownToLine,
  "budget-reset": Milestone,
}

export interface DayEntryIndicatorsProps {
  day: CalendarMonthDay
  className?: string
}

export function DayEntryIndicators({ day, className }: DayEntryIndicatorsProps) {
  // Order mirrors the full-grid rendering's own top-to-bottom convention
  // (budget-reset banner first, then bills, then paydays) so a user
  // switching between breakpoints sees a consistent ordering.
  const kinds: IndicatorKind[] = [
    ...(day.isBudgetResetDay ? (["budget-reset"] as const) : []),
    ...day.bills.map((): IndicatorKind => "bill"),
    ...day.paydays.map((): IndicatorKind => "payday"),
  ]

  if (kinds.length === 0) return null

  const visible = kinds.slice(0, MAX_VISIBLE_INDICATORS)
  const overflow = kinds.length - visible.length

  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-wrap items-center gap-0.5", className)}
    >
      {visible.map((kind, index) => {
        const Icon = INDICATOR_ICON[kind]
        return (
          <Icon
            key={`${kind}-${index}`}
            className="size-2.5 shrink-0 text-muted-foreground"
          />
        )
      })}
      {overflow > 0 && (
        <span className="text-[0.6rem] leading-none font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  )
}
