import type { ReportingPeriod, ReportingPeriodRange } from "../types"

/**
 * The **one** shared reporting-period resolver, per
 * docs/architecture/Architecture.md's "Analytics module structure" section —
 * every one of the seven period-aware Pass 1 metrics calls this exactly
 * once (via its caller, a Server Component) rather than reimplementing
 * "This Year"/"Last 12 Months"/"Year-to-Date" boundary math independently.
 *
 * PURE — no Prisma, no `lib/db.ts`/`lib/auth.ts` import. Stays under
 * `server/`, not the feature root, per naming-standards.md's Phase 3b note:
 * nothing client-side ever calls this directly (the reporting-period
 * control is a searchParam navigation, re-resolved server-side on every
 * request), unlike `features/debt/payoff-math.ts`'s genuinely isomorphic
 * client-callable case.
 */

/** UTC midnight for the given year/month/day (0-indexed month), matching
 * `features/dashboard/server/service.ts`'s `utcMonthStart` convention —
 * always constructed via `Date.UTC`, never the local-timezone `Date`
 * constructor, since `Transaction.date` is a UTC calendar date
 * (risk-register.md #8). */
function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

/**
 * Resolves `period` into a concrete `{ start, end }` range, relative to
 * `now` (injectable purely for testability, matching
 * `features/budgeting/server/validation.ts`'s `currentMonthStart`/
 * `isPastMonth` convention).
 *
 * **THIS_YEAR vs. YEAR_TO_DATE — the one non-obvious resolution decision in
 * this file, made explicit here since analytics.md's AC2 lists both without
 * defining how they differ:**
 * - `THIS_YEAR` is the current calendar year's own full, fixed window
 *   (Jan 1 – Dec 31), matching Yearly Spending's own per-year bucketing
 *   convention (`spending-trends.ts`'s `getYearlySpending`, which always
 *   buckets by whole calendar year with no "as of today" framing) — useful
 *   for month-bucketed metrics like Category Trends, where enumerating
 *   every month of the year (including ones later than today, which
 *   naturally resolve to $0 since no transaction can yet exist there) gives
 *   a stable, full-year x-axis.
 * - `YEAR_TO_DATE` is explicitly capped at `now` (Jan 1 – today) — the
 *   "how am I doing so far this year" framing, deliberately narrower than
 *   `THIS_YEAR` once the calendar year is in progress.
 *
 * Both start from Jan 1 of the current year, so for a metric that reduces
 * to a single sum (rather than per-month buckets), the two will often
 * compute the *same total* in practice, since a transaction dated after
 * "today" essentially never exists in this app's real usage — that overlap
 * is expected, not a bug; the distinction earns its keep specifically for
 * per-month-bucketed metrics.
 *
 * `LAST_12_MONTHS` mirrors `features/dashboard/server/service.ts`'s
 * `getMonthlyTrends(userId, 12)` window exactly (the 1st of the month 11
 * months before the current month, through today) so the two stay directly
 * comparable.
 *
 * `ALL_TIME` returns `start: null` (open-ended) — every metric that
 * consumes this resolves its own concrete floor from that user's actual
 * data (typically the earliest relevant transaction date), per
 * Architecture.md's Risk #11 resolution ("bounded by that one user's
 * account age," not an unbounded query).
 */
export function resolveReportingPeriodRange(
  period: ReportingPeriod,
  now: Date = new Date(),
): ReportingPeriodRange {
  const today = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const currentYear = today.getUTCFullYear()

  switch (period) {
    case "THIS_YEAR":
      return { start: utcDate(currentYear, 0, 1), end: utcDate(currentYear, 11, 31) }
    case "YEAR_TO_DATE":
      return { start: utcDate(currentYear, 0, 1), end: today }
    case "LAST_12_MONTHS":
      return {
        start: utcDate(today.getUTCFullYear(), today.getUTCMonth() - 11, 1),
        end: today,
      }
    case "ALL_TIME":
      return { start: null, end: today }
    default: {
      // Exhaustiveness guard: TypeScript already rejects any value outside
      // `ReportingPeriod` at compile time, so this only matters if a future
      // union member is added and a case here is forgotten.
      const _exhaustive: never = period
      throw new Error(`Unhandled reporting period: ${String(_exhaustive)}`)
    }
  }
}

/** `"yyyy-MM"` key for a UTC month-start `Date`, matching
 * `features/dashboard/server/service.ts`'s `formatMonthKey` exactly (built
 * from UTC getters, never a local-timezone-dependent formatter). */
export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/** `"yyyy-MM-dd"` key for a UTC `Date`, matching
 * `features/dashboard/types.ts`'s `NetWorthHistoryPoint.date` convention —
 * built from UTC components so the key never shifts to an adjacent day
 * depending on the server process's local timezone. */
export function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Every `"yyyy-MM"` month key from `start`'s month through `end`'s month,
 * inclusive, in chronological order — shared by `spending-trends.ts`'s
 * `getCategoryTrends` and `budget-comparison.ts`'s `getBudgetVsActual`, both
 * of which need to enumerate every month of a period (including months with
 * no data, per `getMonthlyTrends`'s "true gap/flat period, never silently
 * skipped" convention) rather than only the months a query happens to
 * return rows for.
 *
 * Bounded by construction: `start`/`end` are always a resolved
 * `ReportingPeriodRange`'s concrete dates (the caller has already resolved
 * "All Time" down to a real floor before calling this), so this never loops
 * further than one user's own real account history.
 */
export function enumerateMonthKeys(start: Date, end: Date): string[] {
  const keys: string[] = []
  let cursor = utcDate(start.getUTCFullYear(), start.getUTCMonth(), 1)
  const endMonthStart = utcDate(end.getUTCFullYear(), end.getUTCMonth(), 1)

  while (cursor.getTime() <= endMonthStart.getTime()) {
    keys.push(formatMonthKey(cursor))
    cursor = utcDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
  }

  return keys
}

/**
 * Resolves one `"yyyy-MM"` month key (as produced by `enumerateMonthKeys`)
 * into a concrete `{ start, end }` range, with `end` clamped so it never
 * extends past `now` for the current, still-in-progress month — mirrors
 * `features/dashboard/server/service.ts`'s private `resolveMonthToDateRange`
 * exactly (same "the current month's own `end` is `today`, every other
 * month's `end` is its real last day" rule), so that a Pass 2 metric's
 * per-month figure for the current month is computed over the identical
 * date window Dashboard's own month-to-date figures use for that same
 * month — the "zero reported incidents of an Analytics figure disagreeing
 * with the equivalent Dashboard figure" bar analytics.md's Success Metrics
 * holds every Pass 2 metric to.
 *
 * Shared by `income-analytics.ts` (this file's own per-month income total,
 * kept consistent with `dashboard.service.getMonthlySummary`'s income
 * figure) and `savings-growth.ts` (bounding each month's call into
 * `investments.service.getGainLossForPeriod`) — both need this exact
 * boundary, so it lives here once rather than as two near-identical
 * private copies.
 */
export function resolveMonthKeyRange(
  monthKey: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const [yearStr, monthStr] = monthKey.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1

  const start = utcDate(year, monthIndex, 1)
  const lastDayOfMonth = utcDate(year, monthIndex + 1, 0)
  const today = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const end = lastDayOfMonth.getTime() < today.getTime() ? lastDayOfMonth : today

  return { start, end }
}
