import type { BillSchedule } from "@prisma/client"

import type { OccurrenceStatus } from "../types"

/**
 * PURE schedule/status math for the Bills module — no Prisma calls, no
 * `getCurrentUser()`, no I/O of any kind. Per docs/architecture/folder-tree.md's
 * Phase 2 section, this split exists specifically so the recurrence-generation
 * and status-computation logic (the two easiest things to get subtly wrong in
 * this feature, per date-math and boundary-condition bugs) is unit-testable
 * in isolation, without a database, by the Integration Test Engineer's
 * recurrence-correctness test matrix (docs/product/bills.md's Definition of
 * Done).
 *
 * `server/service.ts` is the only caller — it supplies real `Date`s read from
 * (or about to be written to) Postgres and interprets the results; this file
 * never touches the database itself.
 */

// ---------------------------------------------------------------------------
// Date helpers (UTC only)
// ---------------------------------------------------------------------------

/**
 * Normalizes to UTC midnight for the given `Date`'s UTC calendar date.
 * Every comparison/generation function below funnels through this (or
 * constructs dates via `Date.UTC` directly) so nothing here is ever sensitive
 * to the host process's local timezone — matches the `@db.Date` + UTC
 * convention already established by `Transaction.date` (risk-register.md #8)
 * and `features/dashboard/server/service.ts`'s `utcMonthStart`, which this
 * module's callers must not diverge from.
 */
export function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

/** Adds `days` (may be negative) to `date`'s UTC calendar date. */
function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  )
}

/** The number of days in the given UTC year/0-indexed-month — `day 0` of the
 * following month is, by `Date.UTC`'s own overflow rules, the last day of
 * the requested month. */
function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Adds `months` (may be negative) to `date`'s UTC calendar date, clamping the
 * day-of-month to the target month's actual last day when it would otherwise
 * overflow (e.g. Jan 31 + 1 month -> Feb 28/29, never "Mar 3").
 *
 * This clamp-don't-overflow behavior is the entire reason this helper exists
 * rather than a naive `Date.UTC(year, month + n, day)` call: `Date.UTC`
 * silently rolls an out-of-range day into the *next* month (Feb 31 -> Mar 3),
 * which is wrong for a monthly/quarterly/annual bill schedule — a bill due
 * the 31st must land on Feb's actual last day, not slide into March.
 */
function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  const targetMonthIndexRaw = month + months
  const targetYear = year + Math.floor(targetMonthIndexRaw / 12)
  const targetMonthIndex = ((targetMonthIndexRaw % 12) + 12) % 12

  const clampedDay = Math.min(day, daysInUtcMonth(targetYear, targetMonthIndex))

  return new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay))
}

// Exported for `server/service.ts`'s bounded-horizon math (the lazy
// generator needs "today + N months" too, not just "one occurrence forward"),
// so the same clamp-safe month arithmetic is used in exactly one place.
export { addUtcDays, addUtcMonths }

// ---------------------------------------------------------------------------
// Next-due-date generation
// ---------------------------------------------------------------------------

/**
 * Computes the next occurrence's due date given the current one and the
 * bill's recurring schedule, per docs/product/bills.md AC1/AC2's five
 * supported schedules. All math is calendar-based (weeks/months/years), never
 * a fixed day-count approximation for the month-based schedules — see
 * `addUtcMonths` above for why day-of-month clamping matters.
 */
export function computeNextDueDate(
  currentDueDate: Date,
  schedule: BillSchedule,
): Date {
  switch (schedule) {
    case "WEEKLY":
      return addUtcDays(currentDueDate, 7)
    case "BIWEEKLY":
      return addUtcDays(currentDueDate, 14)
    case "MONTHLY":
      return addUtcMonths(currentDueDate, 1)
    case "QUARTERLY":
      return addUtcMonths(currentDueDate, 3)
    case "ANNUALLY":
      return addUtcMonths(currentDueDate, 12)
    default: {
      // Exhaustiveness guard: if a new BillSchedule enum member is ever added
      // to prisma/schema.prisma without updating this switch, this throws a
      // loud, specific error at generation time instead of silently
      // generating no further occurrences for that schedule type.
      const exhaustiveCheck: never = schedule
      throw new Error(`Unsupported bill schedule: ${String(exhaustiveCheck)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Status computation
// ---------------------------------------------------------------------------

/** The minimal fields `computeOccurrenceStatus` needs — a structural subset
 * of `BillOccurrence`'s raw (pre-effective-value) Prisma columns, so callers
 * don't need to construct a full occurrence object just to check status. */
export interface OccurrencePaidState {
  dueDate: Date
  /** Manual paid-amount column (`BillOccurrence.paidAmount`) — `null` unless
   * the manual (non-linked) paid path was used. */
  paidAmount: number | null
  /** Manual paid-date column (`BillOccurrence.paidDate`) — `null` unless the
   * manual (non-linked) paid path was used. */
  paidDate: Date | null
  /** The linked Transaction's id, if any (`BillOccurrence.transactionId`). */
  transactionId: string | null
}

/**
 * `true` when an occurrence counts as paid via either of bills.md AC7's two
 * paths: a linked Transaction (`transactionId` set) or a manual amount+date
 * entry (`paidAmount`/`paidDate` both set). Exported separately from
 * `computeOccurrenceStatus` because `service.ts` needs this exact "is this
 * occurrence paid" boolean on its own (e.g. to filter for "next *unpaid*
 * occurrence" in `getUpcomingOccurrences`/`getBills`) without needing to also
 * resolve the Upcoming/DueToday/Late distinction that requires `today`.
 */
export function isOccurrencePaid(occurrence: OccurrencePaidState): boolean {
  return (
    occurrence.transactionId !== null ||
    (occurrence.paidAmount !== null && occurrence.paidDate !== null)
  )
}

/**
 * Computes an occurrence's status, per docs/product/bills.md AC6: Paid (if
 * either paid path is populated — checked first, since a paid occurrence's
 * status is fixed regardless of how overdue its `dueDate` now looks), else
 * Late (`dueDate` before `today`), else Due Today (`dueDate` equals `today`),
 * else Upcoming.
 *
 * Both `dueDate` and `today` are normalized to UTC midnight before comparison
 * (`toUtcMidnight`) so this never misclassifies a due date as Late/Upcoming
 * because of a stray time-of-day component on either input — `BillOccurrence.
 * dueDate` is a `@db.Date` column (already date-only in Postgres) but
 * `today` is typically `new Date()` from the caller, which does carry a
 * time-of-day component that must be stripped before comparing.
 */
export function computeOccurrenceStatus(
  occurrence: OccurrencePaidState,
  today: Date,
): OccurrenceStatus {
  if (isOccurrencePaid(occurrence)) {
    return "PAID"
  }

  const dueUtc = toUtcMidnight(occurrence.dueDate).getTime()
  const todayUtc = toUtcMidnight(today).getTime()

  if (dueUtc < todayUtc) {
    return "LATE"
  }
  if (dueUtc === todayUtc) {
    return "DUE_TODAY"
  }
  return "UPCOMING"
}
