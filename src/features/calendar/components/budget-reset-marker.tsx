/**
 * BudgetResetMarker — the day-1 structural annotation (calendar-v2.md
 * AC8-AC11).
 *
 * Carries no dollar amount and is not a transaction-like occurrence, so it
 * is never rendered with `BillEntry`/`PaydayEntry`'s entry-card treatment
 * (AC9) — a full-width banner strip above that day's number instead, so it
 * reads as a structural divider annotating the whole cell rather than a line
 * item competing with that day's bills/paydays for the same visual slot.
 * `CalendarGrid` renders this unconditionally whenever `day.isBudgetResetDay`
 * is `true` — with no data-dependent check of its own — so it always
 * appears on the 1st regardless of whether the user set any budget
 * allocations that month (AC10).
 *
 * Selecting it navigates to Budgeting for that month (AC11 — "click an
 * entry, land on its source," the same pattern `BillEntry`/`PaydayEntry`
 * establish above). `/budgeting`'s own page already resolves read-only
 * (past month) vs. editable (current/future) per budgeting.md AC3, so this
 * link needs no such distinction of its own — it always points at
 * `/budgeting?month=<the month this calendar view is showing>`.
 */

import Link from "next/link"
import { Milestone } from "lucide-react"

import { formatMonthLabel } from "@/components/shared/month-utils"

export interface BudgetResetMarkerProps {
  /** `"YYYY-MM"` — `CalendarMonthView.budgetResetMonth`, the same month
   * this calendar view is showing (`features/calendar/server/service.ts`'s
   * composition always sets it to the requested `month` verbatim). */
  budgetResetMonth: string
}

export function BudgetResetMarker({ budgetResetMonth }: BudgetResetMarkerProps) {
  return (
    <Link
      href={`/budgeting?month=${budgetResetMonth}`}
      className="-mx-1.5 -mt-1.5 flex items-center gap-1 truncate border-b border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary hover:bg-primary/15"
      title={`Budget resets for ${formatMonthLabel(budgetResetMonth)} — view Budgeting`}
    >
      <Milestone className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">Budget resets</span>
    </Link>
  )
}
