/**
 * PURE date-cadence math shared by every recurring-schedule feature in this
 * app — no Prisma calls, no `getCurrentUser()`, no I/O of any kind.
 *
 * (Phase 3a) Extracted out of `features/bills/server/occurrence.ts`, per
 * docs/architecture/folder-tree.md's Phase 3a section ("lib/recurrence.ts —
 * NEW: shared pure cadence math, extracted from bills/server/occurrence.ts")
 * and docs/architecture/api-contracts.md's Bills section ("its date-cadence
 * math ... is extracted to lib/recurrence.ts and shared with Recurring
 * Income's own occurrence.ts"). This is a pure extraction — the actual
 * calendar arithmetic below is unchanged from its original Bills-only
 * version; only its location and generic naming changed so a second domain
 * (Recurring Income) can import it without duplicating it.
 *
 * `RecurrenceSchedule` intentionally covers only the five schedule values
 * `BillSchedule` and `IncomeSchedule` have in common (per
 * naming-standards.md: "lib/recurrence.ts's functions only need to accept
 * the five schedule values both enums have in common" — `IncomeSchedule`'s
 * sixth member, `IRREGULAR`, has no cadence-math equivalent at all and must
 * never reach this file; `features/recurring-income/server/occurrence.ts`
 * is responsible for excluding it before calling `computeNextRecurrenceDate`).
 * `BillSchedule` and `IncomeSchedule` are both Prisma-generated string-literal
 * unions, so passing either (Income's, narrowed to exclude `IRREGULAR`) here
 * is a structural, not nominal, type match — no explicit enum import is
 * needed in this file, keeping it decoupled from either domain's own enum.
 *
 * Each domain's own `server/occurrence.ts` re-exports the date helpers it
 * already exposed to its own callers (`toUtcMidnight`/`addUtcDays`/
 * `addUtcMonths`) so this extraction is invisible to every existing
 * consumer — see that file's own header comment for details.
 */

export type RecurrenceSchedule =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUALLY"

// ---------------------------------------------------------------------------
// Date helpers (UTC only)
// ---------------------------------------------------------------------------

/**
 * Normalizes to UTC midnight for the given `Date`'s UTC calendar date.
 * Every comparison/generation function below funnels through this (or
 * constructs dates via `Date.UTC` directly) so nothing here is ever sensitive
 * to the host process's local timezone — matches the `@db.Date` + UTC
 * convention already established by `Transaction.date` (risk-register.md #8)
 * and `features/dashboard/server/service.ts`'s `utcMonthStart`, which every
 * caller of this module must not diverge from.
 */
export function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

/** Adds `days` (may be negative) to `date`'s UTC calendar date. */
export function addUtcDays(date: Date, days: number): Date {
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
 * which is wrong for a monthly/quarterly/annual recurring schedule — an item
 * due/expected the 31st must land on Feb's actual last day, not slide into
 * March.
 */
export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  const targetMonthIndexRaw = month + months
  const targetYear = year + Math.floor(targetMonthIndexRaw / 12)
  const targetMonthIndex = ((targetMonthIndexRaw % 12) + 12) % 12

  const clampedDay = Math.min(day, daysInUtcMonth(targetYear, targetMonthIndex))

  return new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay))
}

// ---------------------------------------------------------------------------
// Next-occurrence-date generation
// ---------------------------------------------------------------------------

/**
 * Computes the next occurrence's date given the current one and a recurring
 * schedule, per docs/product/bills.md AC1/AC2 and docs/product/
 * recurring-income.md AC1's shared five supported schedules (weekly,
 * biweekly, monthly, quarterly, annually). All math is calendar-based
 * (weeks/months/years), never a fixed day-count approximation for the
 * month-based schedules — see `addUtcMonths` above for why day-of-month
 * clamping matters.
 */
export function computeNextRecurrenceDate(
  currentDate: Date,
  schedule: RecurrenceSchedule,
): Date {
  switch (schedule) {
    case "WEEKLY":
      return addUtcDays(currentDate, 7)
    case "BIWEEKLY":
      return addUtcDays(currentDate, 14)
    case "MONTHLY":
      return addUtcMonths(currentDate, 1)
    case "QUARTERLY":
      return addUtcMonths(currentDate, 3)
    case "ANNUALLY":
      return addUtcMonths(currentDate, 12)
    default: {
      // Exhaustiveness guard: if a new schedule value is ever added to either
      // BillSchedule or IncomeSchedule (that isn't IRREGULAR) without
      // updating this switch, this throws a loud, specific error at
      // generation time instead of silently generating no further
      // occurrences for that schedule type.
      const exhaustiveCheck: never = schedule
      throw new Error(`Unsupported recurrence schedule: ${String(exhaustiveCheck)}`)
    }
  }
}
