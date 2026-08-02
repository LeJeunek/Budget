"use client"

/**
 * CalendarGrid — Calendar v2's month grid (calendar-v2.md), the single
 * Client Component `app/(dashboard)/calendar/page.tsx` (a Server Component)
 * renders directly.
 *
 * Reuses `components/shared/month-navigator.tsx` directly for the
 * prev/current/next stepper — per this task's explicit instruction not to
 * build a new one, and per that component's own JSDoc ("meant to be shared
 * by every feature that plans/reports on a per-calendar-month basis"). This
 * component owns the URL-updating glue itself (`router.push` on a new
 * `?month=` search param) rather than needing a separate wrapper file — the
 * identical, already-proven "thin Client Component bridges MonthNavigator's
 * controlled API to a URL update" shape as
 * `features/budgeting/components/budget-month-nav.tsx`, just folded into
 * this grid instead of split into its own file, since Calendar v2 (unlike
 * Bills) has no List/Calendar tab toggle sharing the same page.
 *
 * The grid-layout math (leading/trailing blank cells so day 1 lands in its
 * correct weekday column) mirrors Calendar v1's own
 * `features/bills/components/bill-calendar.tsx` — the same, already-proven
 * approach, extended to a day cell that now composes three entry kinds
 * (`BillEntry`, `PaydayEntry`, `BudgetResetMarker`) instead of one
 * (calendar-v2.md's "a day with more than one payday, or a day with both a
 * bill and a payday, shows all of them... without one crowding out another"
 * edge case, extended from Calendar v1's own "multiple bills due the same
 * day" handling).
 *
 * `hasNoDataAnywhere` is resolved once, at the page level
 * (`bills.service.getBills`/`recurring-income.service.getIncomeStreams`,
 * both active and archived, all empty across the whole app — not just this
 * month) and passed down as a plain boolean — per
 * phase-4c-technical-design.md §2.5, this is page-level composition, not a
 * `calendar.service` concern, so this component never fetches either list
 * itself to compute it. When `true`, the combined empty-state prompt
 * (calendar-v2.md's Edge Case) replaces the grid entirely, mirroring
 * `BillsClient`'s/`IncomeClient`'s own "nothing set up yet" empty states in
 * tone — this is a different case from "this particular month has nothing
 * due," which still renders the ordinary grid (with only the always-present
 * budget-reset marker to show, per AC10).
 *
 * **Phase 5a addition (docs/architecture/phase-5a-technical-design.md §4):**
 * below `sm` (640px), each day cell renders a condensed, tap-to-expand
 * variant (date number + `DayEntryIndicators`) instead of the full
 * `BillEntry`/`PaydayEntry`/`BudgetResetMarker` list — both variants exist
 * in the DOM simultaneously, CSS-toggled (`sm:hidden` / `hidden sm:flex`),
 * the same dual-render-then-hide discipline `BottomNav`/`ResponsiveDataTable`
 * already use, never a JS media-query check. This component owns the one
 * `useState<string | null>` tracking which day (`CalendarMonthDay.day` key)
 * is currently expanded, and renders `DayDetailSheet` controlled by it.
 */

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays } from "lucide-react"

import { MonthNavigator } from "@/components/shared/month-navigator"
import type { CalendarMonthDay } from "@/features/calendar/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"
import { useCurrencyDisplay } from "@/app/(dashboard)/currency-preference-provider"

import { BillEntry } from "./bill-entry"
import { PaydayEntry } from "./payday-entry"
import { BudgetResetMarker } from "./budget-reset-marker"
import { DayEntryIndicators } from "./day-entry-indicators"
import { DayDetailSheet } from "./day-detail-sheet"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** UTC day-of-week (0 = Sunday) for a `"YYYY-MM-DD"` day key — used to pad
 * the grid so the 1st of the month lands in its correct weekday column.
 * Mirrors `bill-calendar.tsx`'s identical helper (Calendar v1's own file,
 * left untouched — duplicated here for the same "no exported home to import
 * from without modifying that file" reason as `bill-entry.tsx`'s
 * `STATUS_ENTRY_CLASSNAME`). */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

function dayNumber(day: string): number {
  return Number(day.split("-")[2])
}

/** Accessible-name summary for the condensed mobile day-cell's tap target
 * (§4's `DayEntryIndicators` row is itself `aria-hidden`, so the `<button>`
 * wrapping it needs its own full, non-visual summary of what that day
 * holds — never left to be inferred from the glyphs alone). */
function describeDayEntries(day: CalendarMonthDay): string {
  const parts: string[] = []
  if (day.bills.length > 0) {
    parts.push(`${day.bills.length} bill${day.bills.length === 1 ? "" : "s"}`)
  }
  if (day.paydays.length > 0) {
    parts.push(`${day.paydays.length} payday${day.paydays.length === 1 ? "" : "s"}`)
  }
  if (day.isBudgetResetDay) {
    parts.push("budget reset")
  }
  return parts.length > 0 ? `, ${parts.join(", ")}` : ", nothing scheduled"
}

export interface CalendarGridProps {
  /** Currently displayed month, `"YYYY-MM"` — mirrors the server-resolved
   * value `page.tsx` already parsed from `searchParams`. */
  month: string
  days: CalendarMonthDay[]
  /** `CalendarMonthView.budgetResetMonth` — passed straight through to
   * `BudgetResetMarker` for its `/budgeting?month=` link target. */
  budgetResetMonth: string
  hasNoDataAnywhere: boolean
}

export function CalendarGrid({
  month,
  days,
  budgetResetMonth,
  hasNoDataAnywhere,
}: CalendarGridProps) {
  const currency = useCurrencyDisplay()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // §4's "State ownership" — the currently-expanded day's key (or `null`),
  // driving DayDetailSheet's controlled open state below `sm`.
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)
  const expandedDay = days.find((day) => day.day === expandedDayKey) ?? null

  function handleMonthChange(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("month", nextMonth)
    router.push(`${pathname}?${params.toString()}`)
  }

  if (hasNoDataAnywhere) {
    return <EmptyCalendarState />
  }

  const leadingBlanks = days.length > 0 ? weekdayOf(days[0].day) : 0
  const trailingBlanks = days.length > 0 ? (7 - ((leadingBlanks + days.length) % 7)) % 7 : 0

  return (
    <div className="flex flex-col gap-4">
      <MonthNavigator month={month} onMonthChange={handleMonthChange} />

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`lead-${index}`} className="min-h-28 border-r border-b bg-muted/10" />
          ))}

          {days.map((day) => (
            <div key={day.day} className="min-h-28 border-r border-b last:border-r-0">
              {/* Mobile (< 640px): condensed cell, tap-to-expand
                  DayDetailSheet (§4). A different shape than every other
                  mobile-only split in this pass (this variant is
                  interactive, the sm+ one below is static), so — rather than
                  toggling classes on one shared markup block — each variant
                  is its own full-size child of this shared cell box,
                  CSS-toggled the identical `sm:hidden` / `hidden sm:flex`
                  way, both mounted simultaneously to avoid a JS media-query
                  hydration mismatch. */}
              <button
                type="button"
                onClick={() => setExpandedDayKey(day.day)}
                aria-label={`${formatDate(day.day)}${describeDayEntries(day)}`}
                className="flex h-full w-full flex-col items-start gap-1 p-1.5 text-left outline-none sm:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {dayNumber(day.day)}
                </span>
                <DayEntryIndicators day={day} />
              </button>

              {/* Tablet/desktop (>= 640px): ordinary, full multi-entry-per-
                  cell rendering — unchanged from before this pass. */}
              <div className="hidden h-full flex-col gap-1 p-1.5 sm:flex">
                {day.isBudgetResetDay && (
                  <BudgetResetMarker budgetResetMonth={budgetResetMonth} />
                )}
                <span className="text-xs font-medium text-muted-foreground">
                  {dayNumber(day.day)}
                </span>
                <div className="flex flex-col gap-1">
                  {day.bills.map((occurrence) => (
                    <BillEntry
                      key={occurrence.billOccurrenceId}
                      occurrence={occurrence}
                      currency={currency}
                    />
                  ))}
                  {day.paydays.map((payday, index) => (
                    <PaydayEntry
                      key={`${payday.streamId}-${index}`}
                      payday={payday}
                      currency={currency}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}

          {Array.from({ length: trailingBlanks }).map((_, index) => (
            <div
              key={`trail-${index}`}
              className="min-h-28 border-r border-b bg-muted/10 last:border-r-0"
            />
          ))}
        </div>
      </div>

      <DayDetailSheet
        day={expandedDay}
        budgetResetMonth={budgetResetMonth}
        currency={currency}
        open={expandedDayKey !== null}
        onOpenChange={(open) => !open && setExpandedDayKey(null)}
      />
    </div>
  )
}

/** Combined empty state — calendar-v2.md's Edge Case: a user who has never
 * set up any bill or income stream anywhere in the app, not just this
 * month. Mirrors `bills.md`'s/`recurring-income.md`'s own "Zero bills"/
 * "Zero income streams" empty states in tone, pointing toward both setup
 * flows at once rather than stacking two contradictory empty states — "not
 * an error, and not two contradictory empty states stacked on top of each
 * other" per the spec's own framing. */
function EmptyCalendarState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CalendarDays className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            Nothing on your calendar yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a recurring bill or an income stream to start seeing your due dates and paydays
            together here, alongside when each month&apos;s budget resets.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link href="/bills">Set up bills</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/income">Set up income</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
