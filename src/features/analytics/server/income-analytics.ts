import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import { getActualReceivedIncomeBySource } from "@/features/recurring-income/server/service"

import type {
  IncomeGrowthPoint,
  IncomeSourceEntry,
  IncomeSourceType,
  ReportingPeriodRange,
} from "../types"
import { enumerateMonthKeys, formatMonthKey, resolveMonthKeyRange } from "./period"

// Income Growth (analytics.md AC13) and Income Sources (AC14) are grouped in
// one file, per docs/architecture/folder-tree.md's Phase 3b file layout —
// both derive from the exact same underlying data (a month's actual income
// transactions, plus Recurring Income's actual-received-by-type breakdown of
// that same total), just reshaped differently (per-month trend vs.
// whole-period proportions).
//
// **The "Untracked/Other" partition, the one non-obvious design decision in
// this file:** every dollar counted in a period's `total` is accounted for
// exactly once, either as one of the six named `IncomeType`s or as
// `"UNTRACKED"` — never both, and never a `bySource` sum that silently
// disagrees with `total`. This is achieved by keeping `total` computed
// exactly the way `dashboard.service.getMonthlySummary`'s income figure is
// (a plain sum of that month's income `Transaction` rows, via the identical
// `EXCLUDE_SPLIT_PARENTS`/`amount > 0` shape, clamped to `now` for an
// in-progress month via `resolveMonthKeyRange` — see that function's JSDoc),
// so this metric can never disagree with the Dashboard figure it overlaps
// with (analytics.md's Success Metrics). `UNTRACKED = max(0, total -
// trackedSum)`: the `max(0, ...)` guards the one edge case where a
// manually-marked-received `IncomeOccurrence`/`IrregularIncomeEvent` (no
// linked `Transaction` at all, per recurring-income.md AC8's "manual"
// receipt path) pushes `trackedSum` for a month above that month's real
// Transaction-based `total` — a documented judgment call (the same
// "never show a negative residual, clamp to zero" precedent already used
// throughout this codebase, e.g. Financial Goals' `percentPaidOff` clamp),
// not a division-by-zero-style defensive no-op.

const UNTRACKED_INCOME_TYPE = "UNTRACKED" as const

/** All-time floor for both functions below when `period.start === null` —
 * the earliest month with any income activity at all, matching
 * `spending-trends.ts`'s `resolveEarliestExpenseDate` pattern exactly, just
 * for income (`amount > 0`) instead of expenses. */
async function resolveEarliestIncomeDate(userId: string): Promise<Date | null> {
  const result = await db.transaction.aggregate({
    where: { userId, amount: { gt: 0 }, ...EXCLUDE_SPLIT_PARENTS },
    _min: { date: true },
  })
  return result._min.date ?? null
}

/** One month's total actual income-transaction activity — see this file's
 * top-level JSDoc for why this is deliberately computed the same way
 * `dashboard.service.getMonthlySummary`'s income figure is, rather than
 * summing `getActualReceivedIncomeBySource`'s records (which would silently
 * diverge from Dashboard whenever manually-received, non-linked recurring
 * income exists). */
async function getMonthlyIncomeTotal(userId: string, monthKey: string): Promise<number> {
  const { start, end } = resolveMonthKeyRange(monthKey)
  const result = await db.transaction.aggregate({
    where: { userId, amount: { gt: 0 }, date: { gte: start, lte: end }, ...EXCLUDE_SPLIT_PARENTS },
    _sum: { amount: true },
  })
  return result._sum.amount?.toNumber() ?? 0
}

/**
 * Pure per-month Income Growth point builder, extracted out of
 * `getIncomeGrowth` below (Unit Test Engineer, Phase 3b Analytics gate-review
 * follow-up — same "calculation-only portion pulled into its own exported
 * function" rationale as `spending-trends.ts`/`budget-comparison.ts`'s
 * equivalent extractions; a mechanical, behavior-preserving extraction, not a
 * formula change).
 *
 * Implements this file's own top-level "Untracked/Other" partition rule:
 * `bySource` is every tracked `IncomeType`'s sum for the month, plus
 * `"UNTRACKED"` for `max(0, total - trackedSum)` whenever that residual is
 * positive — see this file's top-level JSDoc for exactly why the `max(0, ...)`
 * clamp exists (a manually-marked-received recurring-income record with no
 * linked `Transaction` can push `trackedSum` above `total`).
 */
export function buildIncomeGrowthPoint(
  monthKey: string,
  total: number,
  trackedByType: Map<IncomeSourceType, number>,
): IncomeGrowthPoint {
  const trackedSum = [...trackedByType.values()].reduce((sum, amount) => sum + amount, 0)

  const bySource: IncomeGrowthPoint["bySource"] = [...trackedByType.entries()].map(
    ([type, amount]) => ({ type, amount }),
  )

  const untracked = Math.max(0, total - trackedSum)
  if (untracked > 0) {
    bySource.push({ type: UNTRACKED_INCOME_TYPE, amount: untracked })
  }

  return { month: monthKey, total, bySource }
}

/**
 * Income Growth (analytics.md AC13): total actual-received income per month,
 * with an by-source overlay built from Recurring Income's actual-received
 * data — never the forward-looking "expected" figures (AC13's own explicit
 * requirement, satisfied entirely by `getActualReceivedIncomeBySource`'s own
 * contract).
 *
 * Every month in the period is included even at `$0` (the "true gap, not a
 * missing month" convention every other Pass 1/Pass 2 per-month metric in
 * this module already follows). See `buildIncomeGrowthPoint` above for the
 * per-month Untracked/Other partition math this function delegates to.
 */
export async function getIncomeGrowth(
  userId: string,
  period: ReportingPeriodRange,
): Promise<IncomeGrowthPoint[]> {
  const start = period.start ?? (await resolveEarliestIncomeDate(userId))
  if (!start) {
    return []
  }

  const monthKeys = enumerateMonthKeys(start, period.end)

  const [monthlyTotals, records] = await Promise.all([
    Promise.all(monthKeys.map((monthKey) => getMonthlyIncomeTotal(userId, monthKey))),
    getActualReceivedIncomeBySource(userId, { start, end: period.end }),
  ])

  const totalByMonth = new Map<string, number>(monthKeys.map((key, i) => [key, monthlyTotals[i]]))

  // `trackedByMonth.get(monthKey).get(type)` = that type's actual-received
  // sum for that month — built in one pass over `records` (O(records)),
  // rather than filtering the array once per month per type.
  const trackedByMonth = new Map<string, Map<IncomeSourceType, number>>()
  for (const record of records) {
    const monthKey = formatMonthKey(record.date)
    const typeMap = trackedByMonth.get(monthKey) ?? new Map<IncomeSourceType, number>()
    typeMap.set(record.type, (typeMap.get(record.type) ?? 0) + record.amount)
    trackedByMonth.set(monthKey, typeMap)
  }

  return monthKeys.map((monthKey) => {
    const total = totalByMonth.get(monthKey) ?? 0
    const trackedByType = trackedByMonth.get(monthKey) ?? new Map<IncomeSourceType, number>()
    return buildIncomeGrowthPoint(monthKey, total, trackedByType)
  })
}

/**
 * Pure re-shaping of an already-computed `getIncomeGrowth` result into
 * Income Sources' whole-period-proportions shape (analytics.md AC14) — the
 * actual math `getIncomeSources` below performs, extracted so a caller that
 * has *already* fetched `getIncomeGrowth` for the same `userId`/period (e.g.
 * `app/(dashboard)/analytics/page.tsx`) can derive Income Sources from that
 * one result directly, instead of triggering a second, fully redundant
 * `getIncomeGrowth` call (and therefore a second full set of monthly
 * `Transaction` aggregates plus a second `getActualReceivedIncomeBySource`
 * read) purely to throw its own copy away. Performance follow-up from the
 * Phase 3b Performance Engineer review: `getIncomeSources` and the page were
 * each independently computing `getIncomeGrowth`'s result for the exact same
 * `userId`/`period`.
 *
 * No DB access — plain in-memory aggregation only, so this can be called as
 * many times as needed with zero additional query cost.
 */
export function deriveIncomeSourcesFromGrowth(
  growth: IncomeGrowthPoint[],
): IncomeSourceEntry[] {
  const amountByType = new Map<IncomeSourceType, number>()
  for (const point of growth) {
    for (const entry of point.bySource) {
      amountByType.set(entry.type, (amountByType.get(entry.type) ?? 0) + entry.amount)
    }
  }

  const total = [...amountByType.values()].reduce((sum, amount) => sum + amount, 0)
  if (total === 0) {
    return []
  }

  return [...amountByType.entries()]
    .map(([type, amount]) => ({ type, amount, percent: (amount / total) * 100 }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Income Sources (analytics.md AC14): the selected period's share of total
 * actual-received income attributable to each `IncomeType`, plus the same
 * `"UNTRACKED"` residual bucket as `getIncomeGrowth` (see this file's
 * top-level JSDoc for the shared partition reasoning).
 *
 * Reuses `getIncomeGrowth`'s own per-month computation rather than
 * re-deriving totals/tracked sums independently, then simply sums across
 * every month in the period — guarantees these two metrics can never
 * silently disagree with each other for an overlapping period, the same
 * "single source of truth" requirement analytics.md's Success Metrics holds
 * every pair of related Analytics metrics to.
 *
 * Standalone entry point for any caller that has *not* already fetched
 * `getIncomeGrowth` itself (e.g. a future consumer outside this page) — it
 * still computes `getIncomeGrowth` internally exactly once. A caller that
 * already has that result in hand (like the Analytics page, which renders
 * the Income Growth chart from the same data) should call
 * `deriveIncomeSourcesFromGrowth` directly instead, to avoid the redundant
 * fetch this function's own body would otherwise trigger.
 *
 * Returns `[]` for a period with `$0` total income across every month
 * (nothing to compute a percentage share of) rather than dividing by zero.
 */
export async function getIncomeSources(
  userId: string,
  period: ReportingPeriodRange,
): Promise<IncomeSourceEntry[]> {
  const growth = await getIncomeGrowth(userId, period)
  return deriveIncomeSourcesFromGrowth(growth)
}
