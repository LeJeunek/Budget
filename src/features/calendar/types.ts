import type { CalendarOccurrence } from "../bills/types"
import type { PaydayCalendarEntry } from "../recurring-income/types"

// Client-safe shapes for Calendar v2 (Phase 4c), per
// docs/architecture/phase-4c-technical-design.md §2.2. This feature owns no
// data of its own — `CalendarOccurrence` (Bills) and `PaydayCalendarEntry`
// (Recurring Income) are re-exported verbatim below, never redefined a
// second time, so every consumer of this module gets each domain's own
// single, authoritative shape rather than a parallel copy that could drift
// out of sync with it.
export type { CalendarOccurrence, PaydayCalendarEntry }

/**
 * One calendar day in Calendar v2's combined view — the zip of Bills' own
 * `CalendarDay` and Recurring Income's own `PaydayCalendarDay` for the same
 * `day` key, plus the budget-reset annotation neither of those two domains
 * knows about. Per §2.2's exact shape.
 */
export interface CalendarMonthDay {
  /** `"YYYY-MM-DD"`, UTC calendar date. */
  day: string
  /** Every bill occurrence due this day — re-exported, unchanged, from
   * `bills.service.getCalendarMonth`'s own per-day output. */
  bills: CalendarOccurrence[]
  /** Every payday (scheduled occurrence or logged Irregular event) due/
   * logged this day — from `recurringIncome.service.getIncomeCalendarMonth`'s
   * own per-day output. */
  paydays: PaydayCalendarEntry[]
  /** `true` only when `day` ends in `"-01"` — the fixed structural fact that
   * a new Budgeting cycle begins on the 1st of every month (calendar-v2.md
   * AC8/AC10), never a query against Budgeting's own data (§2.2's "no
   * business logic in this file" guarantee). */
  isBudgetResetDay: boolean
}

/**
 * `calendar.service.getCalendarMonth`'s return shape, per §2.2.
 * `budgetResetMonth` is the same `"YYYY-MM"` string passed in — the reset
 * marker's link target is `/budgeting?month=${budgetResetMonth}` (AC11), a
 * page-level (Frontend Lead's) concern, not something this module resolves
 * itself.
 */
export interface CalendarMonthView {
  days: CalendarMonthDay[]
  budgetResetMonth: string
}
