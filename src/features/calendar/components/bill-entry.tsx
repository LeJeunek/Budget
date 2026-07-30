/**
 * BillEntry — Calendar v2's presentational entry for a single bill
 * occurrence on one calendar day (calendar-v2.md AC1-AC3).
 *
 * The `STATUS_ENTRY_CLASSNAME` color treatment below is deliberately
 * duplicated, byte-for-byte, from Calendar v1's own
 * `features/bills/components/bill-calendar.tsx` (`STATUS_ENTRY_CLASSNAME`)
 * rather than imported from it: that file is Calendar v1's own component,
 * explicitly untouched by this phase (phase-4c-technical-design.md §2.5 —
 * "Bills' own existing `?view=calendar` embedded toggle is untouched by this
 * design"), and it does not export that mapping. AC2 requires this entry to
 * be "visually treated exactly as Calendar v1 already established" — with no
 * shared, exported home for the mapping to import from instead, duplicating
 * it here is the only way to satisfy that without modifying Calendar v1's
 * file. `OccurrenceStatus` (`features/bills/types.ts`) is a small, closed,
 * four-member enum that has not changed since Calendar v1 shipped, so this
 * is a low-risk, explicit mirror, not an open-ended duplication.
 *
 * The one addition beyond Calendar v1's own treatment: a small `Receipt`
 * (invoice-style) icon prefix — calendar-v2.md AC5 requires every entry type
 * to carry "a distinct icon and label" so a colorblind user can tell a bill
 * apart from a payday without reading text, on top of (not instead of) the
 * existing status color. Since this icon is new only to Calendar v2's own
 * rendering (this file), it does not "change or reinterpret" Calendar v1's
 * own bill-status visual meaning (AC2) — that stays exactly the colors
 * below, unchanged.
 */

import Link from "next/link"
import { Receipt } from "lucide-react"

import type { CalendarOccurrence } from "@/features/calendar/types"
import { cn, formatCurrency } from "@/lib/utils"

const STATUS_ENTRY_CLASSNAME: Record<CalendarOccurrence["status"], string> = {
  UPCOMING: "border-border bg-muted/50 text-foreground",
  DUE_TODAY:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  LATE: "border-destructive/40 bg-destructive/10 text-destructive",
  PAID: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
}

export interface BillEntryProps {
  occurrence: CalendarOccurrence
}

/** Selecting an entry navigates to that bill's detail page (AC3, the same
 * "click an entry, land on its source" interaction Calendar v1 AC4 already
 * established). */
export function BillEntry({ occurrence }: BillEntryProps) {
  return (
    <Link
      href={`/bills/${occurrence.billId}`}
      className={cn(
        "flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[0.7rem] leading-tight hover:opacity-80",
        STATUS_ENTRY_CLASSNAME[occurrence.status],
      )}
      title={`${occurrence.billName} — ${formatCurrency(occurrence.amount)}`}
    >
      <Receipt className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {occurrence.billName} · {formatCurrency(occurrence.amount)}
      </span>
    </Link>
  )
}
