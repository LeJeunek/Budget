"use client"

/**
 * DayDetailSheet — Calendar v2's mobile (`< 640px`) day-detail affordance,
 * per `docs/architecture/phase-5a-technical-design.md` §4: reuses the
 * existing `Sheet` primitive (`components/ui/sheet.tsx`), `side="bottom"`,
 * rather than a new popover/modal mechanism.
 *
 * Renders `BillEntry`/`PaydayEntry`/`BudgetResetMarker` verbatim inside —
 * no new entry-rendering logic — each still links to its own Bill/Income-
 * stream/Budgeting detail page exactly as the full grid already does at
 * `sm`+ (`calendar-and-notifications.md` AC4, unchanged).
 *
 * Controlled component: `CalendarGrid` (§4's "State ownership") owns the
 * single `useState<string | null>` tracking which day key is currently
 * expanded and passes the resolved day plus `open`/`onOpenChange` down —
 * this component holds no state of its own. Focus-trap/focus-return on
 * open/close is handled automatically by `Sheet`'s underlying Radix
 * primitive (architecture doc §5.2 — confirmed, no new code required here).
 *
 * Usage:
 * ```tsx
 * <DayDetailSheet
 *   day={expandedDay}
 *   budgetResetMonth={budgetResetMonth}
 *   currency={currency}
 *   open={expandedDayKey !== null}
 *   onOpenChange={(open) => !open && setExpandedDayKey(null)}
 * />
 * ```
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate } from "@/lib/utils"
import type { CalendarMonthDay } from "@/features/calendar/types"

import { BillEntry } from "./bill-entry"
import { PaydayEntry } from "./payday-entry"
import { BudgetResetMarker } from "./budget-reset-marker"

export interface DayDetailSheetProps {
  /** The currently-expanded day's full data, or `null` when no day is
   * expanded (or between the sheet's open state and the day list still
   * resolving it — `CalendarGrid` never expands a day it can't find). */
  day: CalendarMonthDay | null
  /** Passed straight through to `BudgetResetMarker` — see that component's
   * own prop doc. */
  budgetResetMonth: string
  /** The caller's resolved `UserPreference.currencyDisplay` — passed
   * straight through to `BillEntry`/`PaydayEntry`, mirroring how
   * `CalendarGrid` already threads it to those same components in the
   * full-grid rendering. */
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DayDetailSheet({
  day,
  budgetResetMonth,
  currency,
  open,
  onOpenChange,
}: DayDetailSheetProps) {
  const hasEntries = day
    ? day.isBudgetResetDay || day.bills.length > 0 || day.paydays.length > 0
    : false

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{day ? formatDate(day.day) : "Day details"}</SheetTitle>
        </SheetHeader>
        {day && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {day.isBudgetResetDay && (
              <BudgetResetMarker budgetResetMonth={budgetResetMonth} />
            )}
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
            {!hasEntries && (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled this day.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
