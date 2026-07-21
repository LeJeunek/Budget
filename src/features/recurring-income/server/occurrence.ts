import type { IncomeSchedule } from "@prisma/client"

import { computeNextRecurrenceDate, toUtcMidnight } from "@/lib/recurrence"

import type { IncomeOccurrenceStatus } from "../types"

/**
 * PURE status math for the Recurring Income module — no Prisma calls, no
 * `getCurrentUser()`, no I/O of any kind. Mirrors
 * `features/bills/server/occurrence.ts`'s structure/role exactly (per
 * docs/architecture/folder-tree.md's Phase 3a section): this file owns only
 * the read-time status computation and a thin, income-specific wrapper
 * around the shared cadence math in `@/lib/recurrence.ts`.
 *
 * `ensureOccurrencesGenerated` — the actual Prisma-touching lazy generator —
 * intentionally lives in `server/service.ts`, not here, exactly matching
 * where Bills' equivalent function lives (`features/bills/server/
 * service.ts`), since it needs database access and this file must stay pure
 * and unit-testable without one (per bills/server/occurrence.ts's own JSDoc
 * on why this split exists — recurrence-generation/status-computation
 * correctness is easiest to get subtly wrong, so it must be testable in
 * isolation by the Integration Test Engineer's recurrence-correctness test
 * matrix, per recurring-income.md's Definition of Done).
 */

/** The five `IncomeSchedule` members that actually generate occurrences —
 * excludes `IRREGULAR`, which has no cadence-math equivalent at all (AC1/
 * AC11). `server/service.ts`'s `ensureOccurrencesGenerated` is responsible
 * for never calling `computeNextExpectedDate` with an `IRREGULAR` stream in
 * the first place (it returns early for one, per its own JSDoc) — this type
 * exists so that guarantee is checked at compile time too, not only at
 * runtime. */
export type ScheduledIncomeSchedule = Exclude<IncomeSchedule, "IRREGULAR">

// Re-exported so `server/service.ts` has one source for both the date-only
// UTC-midnight helper and this module's own status math, without reaching
// into `@/lib/recurrence.ts` a second time for the same thing.
export { toUtcMidnight }

// ---------------------------------------------------------------------------
// Next-expected-date generation
// ---------------------------------------------------------------------------

/**
 * Computes the next occurrence's expected date given the current one and the
 * stream's recurring schedule, per docs/product/recurring-income.md AC1's
 * five supported schedules (weekly, biweekly, monthly, quarterly, annually —
 * `IRREGULAR` is excluded at the type level, see `ScheduledIncomeSchedule`).
 * Thin, income-specific wrapper around `@/lib/recurrence.ts`'s shared
 * `computeNextRecurrenceDate` — no cadence math is duplicated here.
 */
export function computeNextExpectedDate(
  currentExpectedDate: Date,
  schedule: ScheduledIncomeSchedule,
): Date {
  return computeNextRecurrenceDate(currentExpectedDate, schedule)
}

// ---------------------------------------------------------------------------
// Status computation
// ---------------------------------------------------------------------------

/** The minimal fields `computeOccurrenceStatus` needs — a structural subset
 * of `IncomeOccurrence`'s raw (pre-effective-value) Prisma columns, so
 * callers don't need to construct a full occurrence object just to check
 * status. Mirrors `features/bills/server/occurrence.ts`'s
 * `OccurrencePaidState` exactly, renamed to this domain's own vocabulary. */
export interface OccurrenceReceivedState {
  expectedDate: Date
  /** Manual received-amount column (`IncomeOccurrence.receivedAmount`) —
   * `null` unless the manual (non-linked) received path was used. */
  receivedAmount: number | null
  /** Manual received-date column (`IncomeOccurrence.receivedDate`) — `null`
   * unless the manual (non-linked) received path was used. */
  receivedDate: Date | null
  /** The linked Transaction's id, if any (`IncomeOccurrence.transactionId`). */
  transactionId: string | null
}

/**
 * `true` when an occurrence counts as received via either of AC8's two
 * paths: a linked Transaction (`transactionId` set) or a manual amount+date
 * entry (`receivedAmount`/`receivedDate` both set). Exported separately from
 * `computeOccurrenceStatus` for the same reason
 * `features/bills/server/occurrence.ts`'s `isOccurrencePaid` is — callers
 * (e.g. "next *un-received* occurrence" queries in `service.ts`) need this
 * boolean on its own without also resolving the full Upcoming/Expected
 * Today/Not Yet Received distinction that requires `today`.
 */
export function isOccurrenceReceived(occurrence: OccurrenceReceivedState): boolean {
  return (
    occurrence.transactionId !== null ||
    (occurrence.receivedAmount !== null && occurrence.receivedDate !== null)
  )
}

/**
 * Computes an occurrence's status, per docs/product/recurring-income.md AC7:
 * Received (if either received path is populated — checked first, since a
 * received occurrence's status is fixed regardless of how overdue its
 * `expectedDate` now looks), else Not Yet Received (`expectedDate` before
 * `today` — deliberately not "Late", AC7's resolved product decision), else
 * Expected Today (`expectedDate` equals `today`), else Upcoming.
 *
 * Both `expectedDate` and `today` are normalized to UTC midnight before
 * comparison (`toUtcMidnight`), for the identical reason
 * `features/bills/server/occurrence.ts`'s `computeOccurrenceStatus` does —
 * `IncomeOccurrence.expectedDate` is a `@db.Date` column (already date-only
 * in Postgres) but `today` is typically `new Date()` from the caller, which
 * does carry a time-of-day component that must be stripped before comparing.
 */
export function computeOccurrenceStatus(
  occurrence: OccurrenceReceivedState,
  today: Date,
): IncomeOccurrenceStatus {
  if (isOccurrenceReceived(occurrence)) {
    return "RECEIVED"
  }

  const expectedUtc = toUtcMidnight(occurrence.expectedDate).getTime()
  const todayUtc = toUtcMidnight(today).getTime()

  if (expectedUtc < todayUtc) {
    return "NOT_YET_RECEIVED"
  }
  if (expectedUtc === todayUtc) {
    return "EXPECTED_TODAY"
  }
  return "UPCOMING"
}
