import { getCalendarMonth as getBillsCalendarMonth } from "@/features/bills/server/service"
import { getIncomeCalendarMonth } from "@/features/recurring-income/server/service"

import type { CalendarMonthDay, CalendarMonthView } from "../types"

// This module is Calendar v2's (Phase 4c) one and only file, and it is PURE
// COMPOSITION, never computation — per
// docs/architecture/phase-4c-technical-design.md §2.2's explicit
// requirement: "verified by construction, not convention: this file
// contains zero Prisma imports and zero calls to
// computeOccurrenceStatus/isOccurrencePaid/isOccurrenceReceived or any
// other status-math function." Every occurrence's status, amount, and
// identity is computed exactly once, inside the domain that already owns
// it (Bills, Recurring Income) — this file only calls those two domains'
// already-exported service functions and does array/map bookkeeping.
//
// This is also why `features/bills/server/service.ts` and
// `features/recurring-income/server/service.ts` are imported directly here
// rather than either domain importing the other: `Architecture.md`'s Phase
// 3a section forbids a direct Bills <-> Recurring Income import in either
// direction (both instead depend one-directionally on
// `lib/transaction-link-guard.ts`). Calendar v2 is a new, third, "leaf"
// module that depends on both without either of them depending on it or on
// each other — see phase-4c-technical-design.md §2.1 for the full
// reasoning. `eslint.config.mjs` enforces the "zero `@/lib/db` import"
// half of this guarantee at build time for this directory.

/**
 * Calendar v2's combined month view (calendar-v2.md), composing exactly
 * three already-existing, already-reviewed sources per §2.2's algorithm:
 *
 * 1. `bills.service.getCalendarMonth` — EXISTING, unchanged (Calendar v1).
 * 2. `recurringIncome.service.getIncomeCalendarMonth` — NEW, §2.3.
 * 3. The budget-reset marker — a pure "does this day's key end in `-01`"
 *    string check, not a query against `features/budgeting/` at all (the
 *    marker annotates the fixed structural fact that a new cycle begins on
 *    the 1st of every month, never Budgeting's own data — §2.2).
 *
 * Both composed sources already return one entry per calendar day in the
 * month (even zero-occurrence/zero-payday days, per each domain's own
 * "every day of the month" contract — see `CalendarDay`/`PaydayCalendarDay`'s
 * JSDoc), so the zip below never needs to backfill a missing day on either
 * side; both arrays are the same length, in the same day order, for the
 * same `month`.
 *
 * Renders dates exactly as Bills' and Recurring Income's own occurrence-
 * generation/status logic already compute them (server/UTC-based) — this
 * function introduces no independent, second notion of "what day is it" and
 * does not read `UserPreference.timezone` anywhere, per §2.4's binding
 * constraint.
 */
export async function getCalendarMonth(
  userId: string,
  month: string,
): Promise<CalendarMonthView> {
  const [billDays, paydayDays] = await Promise.all([
    getBillsCalendarMonth(userId, month),
    getIncomeCalendarMonth(userId, month),
  ])

  const paydaysByDay = new Map(paydayDays.map((day) => [day.day, day.paydays]))

  const days: CalendarMonthDay[] = billDays.map((billDay) => ({
    day: billDay.day,
    bills: billDay.occurrences,
    paydays: paydaysByDay.get(billDay.day) ?? [],
    isBudgetResetDay: billDay.day.endsWith("-01"),
  }))

  return { days, budgetResetMonth: month }
}
