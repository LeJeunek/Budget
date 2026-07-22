import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
} from "@/features/dashboard/types"

import type { CategoryTrend, ReportingPeriodRange, YearlySpendingPoint } from "../types"
import { enumerateMonthKeys, formatMonthKey } from "./period"

// Per docs/architecture/api-contracts.md's Phase 3b note: every Analytics
// function touching expense transactions imports `EXCLUDE_SPLIT_PARENTS`
// from `features/transactions/server/service.ts` (its canonical, exported
// home) — never redefines a third copy, never imports Dashboard's separate
// copy. Every function below also takes a pre-resolved `userId` from the
// caller's `getCurrentUser()` and scopes every query by it, per
// folder-tree.md's cross-user data-leak defense — this module never calls
// `getCurrentUser()` itself.

/** Sums a user's earliest *expense* transaction date — the "All Time" floor
 * for both functions below, whenever the caller's period is unbounded
 * (`period.start === null`). Deliberately scoped to expense transactions
 * only (not any transaction), since both functions in this file only ever
 * bucket expense activity — an income-only user's history shouldn't extend
 * either function's date range with months that could never contain a
 * spending data point. Returns `null` when the user has no expense history
 * at all, the signal both callers use for their own "not enough data yet"
 * empty-array result. */
async function resolveEarliestExpenseDate(userId: string): Promise<Date | null> {
  const result = await db.transaction.aggregate({
    where: { userId, amount: { lt: 0 }, ...EXCLUDE_SPLIT_PARENTS },
    _min: { date: true },
  })
  return result._min.date ?? null
}

/**
 * Pure year-range enumeration + per-year spend normalization, extracted out
 * of `getYearlySpending` below (Unit Test Engineer, Phase 3b Analytics gate-
 * review follow-up: `getYearlySpending` itself always queries the database
 * per year with no way to inject fixture data, so this calculation-only
 * portion — building every year in `[startYear, endYear]` inclusive, with
 * each year's raw signed `Transaction.amount` sum negated to a positive spend
 * total — is pulled into its own exported function purely so it can be unit
 * tested in isolation, mirroring `features/investments/server/service.ts`'s
 * `computeAllocationEntries` precedent: a mechanical, behavior-preserving
 * extraction, not a formula change).
 *
 * `rawExpenseSumByYear` holds each year's already-fetched raw signed sum
 * (`undefined`/`null` for a year with zero matching transactions, exactly
 * what `result._sum.amount?.toNumber()` yields) — every year in range is
 * still emitted, even at `$0`, per this function's own "true gap, not a
 * missing year" convention (matches `getMonthlyTrends`'s equivalent
 * per-month rule). `|| 0` normalizes IEEE-754 negative zero for a `$0` year,
 * same convention as `features/dashboard/server/service.ts`'s
 * `getIncomeAndExpenses`.
 */
export function buildYearlySpendingPoints(
  startYear: number,
  endYear: number,
  rawExpenseSumByYear: Map<number, number | null | undefined>,
): YearlySpendingPoint[] {
  const points: YearlySpendingPoint[] = []
  for (let year = startYear; year <= endYear; year++) {
    const totalExpenses = -(rawExpenseSumByYear.get(year) ?? 0) || 0
    points.push({ year, totalExpenses })
  }
  return points
}

/**
 * Yearly Spending (analytics.md AC6): total expenses for every calendar
 * year the user has expense history for — always all-time by definition
 * (this function takes no `period` argument), per api-contracts.md.
 *
 * Implemented as a bounded loop of one `aggregate` per year (from the
 * user's earliest expense transaction's year through the current year),
 * exactly mirroring `features/dashboard/server/service.ts`'s
 * `getMonthlyTrends` bounded-per-month-loop shape — per Architecture.md's
 * Risk #11 reasoning, Yearly Spending's single time dimension (year) needs
 * no findMany-and-reduce the way Category Trends' two-dimensional bucketing
 * does; a small, real, per-user-bounded set of years is cheap to loop.
 *
 * Every year in range is included even when its total is $0 (a genuine
 * "spending dropped to zero" data point for a multi-year trend, never
 * silently skipped) — same "true gap, not a missing month" convention
 * `getMonthlyTrends` already established. See `buildYearlySpendingPoints`
 * above for the per-year enumeration/normalization math this function
 * delegates to.
 */
export async function getYearlySpending(userId: string): Promise<YearlySpendingPoint[]> {
  const earliestDate = await resolveEarliestExpenseDate(userId)
  if (!earliestDate) {
    return []
  }

  const startYear = earliestDate.getUTCFullYear()
  const endYear = new Date().getUTCFullYear()

  const years: number[] = []
  for (let year = startYear; year <= endYear; year++) {
    years.push(year)
  }

  const rawSums = await Promise.all(
    years.map(async (year) => {
      const result = await db.transaction.aggregate({
        where: {
          userId,
          amount: { lt: 0 },
          date: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lte: new Date(Date.UTC(year, 11, 31)),
          },
          ...EXCLUDE_SPLIT_PARENTS,
        },
        _sum: { amount: true },
      })
      return result._sum.amount?.toNumber()
    }),
  )

  const rawExpenseSumByYear = new Map<number, number | null | undefined>(
    years.map((year, i) => [year, rawSums[i]]),
  )

  return buildYearlySpendingPoints(startYear, endYear, rawExpenseSumByYear)
}

/** The minimal, plain-number shape `buildCategoryTrends` needs per
 * transaction — deliberately narrower than a full Prisma `Transaction` row
 * (no `Decimal`, no `userId`/`id`/etc.), matching
 * `features/investments/server/service.ts`'s `AllocationSourceHolding`
 * convention, so the bucketing math below can be unit tested with plain
 * fixture data and no database access. */
export interface CategoryTrendTransaction {
  categoryId: string | null
  /** Signed (negative for an expense), already converted from `Decimal`. */
  amount: number
  date: Date
}

/**
 * Pure month × category bucketing, extracted out of `getCategoryTrends`
 * below (Unit Test Engineer, Phase 3b Analytics gate-review follow-up — same
 * "calculation-only portion pulled into its own exported function" rationale
 * as `buildYearlySpendingPoints` above and `computeAllocationEntries` in
 * `features/investments/server/service.ts`; a mechanical, behavior-preserving
 * extraction, not a formula change).
 *
 * Buckets `transactions` by `"yyyy-MM"` month (via `formatMonthKey`) and
 * category (`categoryId`, or `UNCATEGORIZED_CATEGORY_ID` for a `null`
 * category), in a single O(transactions) pass — never filtering the array
 * once per category. `categoryNameById` resolves each real category's display
 * name; a category id with no entry in that map (e.g. deleted after being
 * transacted against) falls back to the raw id rather than throwing, though
 * in practice every caller supplies a complete map for every id this
 * function's own bucketing pass discovers.
 *
 * Every month in `monthKeys` is included in every returned category's
 * `points` (even a `$0` month), and categories are ordered by total period
 * spend descending — see `getCategoryTrends`'s own JSDoc for why (same "true
 * gap, not a missing month" convention as `getYearlySpending`).
 */
export function buildCategoryTrends(
  transactions: CategoryTrendTransaction[],
  monthKeys: string[],
  categoryNameById: Map<string, string>,
): CategoryTrend[] {
  // `buckets.get(monthKey).get(categoryKey)` = that category's total spend
  // for that month.
  const buckets = new Map<string, Map<string, number>>()
  const categoryKeysSeen = new Set<string>()

  for (const txn of transactions) {
    const monthKey = formatMonthKey(txn.date)
    const categoryKey = txn.categoryId ?? UNCATEGORIZED_CATEGORY_ID
    categoryKeysSeen.add(categoryKey)

    const monthMap = buckets.get(monthKey) ?? new Map<string, number>()
    const amount = -txn.amount || 0
    monthMap.set(categoryKey, (monthMap.get(categoryKey) ?? 0) + amount)
    buckets.set(monthKey, monthMap)
  }

  const rows: (CategoryTrend & { totalForSort: number })[] = [...categoryKeysSeen].map(
    (categoryKey) => {
      const categoryName =
        categoryKey === UNCATEGORIZED_CATEGORY_ID
          ? UNCATEGORIZED_CATEGORY_NAME
          : (categoryNameById.get(categoryKey) ?? categoryKey)

      const points = monthKeys.map((monthKey) => ({
        month: monthKey,
        amount: buckets.get(monthKey)?.get(categoryKey) ?? 0,
      }))

      const totalForSort = points.reduce((sum, point) => sum + point.amount, 0)

      return { categoryId: categoryKey, categoryName, points, totalForSort }
    },
  )

  rows.sort((a, b) => b.totalForSort - a.totalForSort)

  // Built as a separate mapped array (rather than spreading `...rest`, which
  // would leave the sort-only `totalForSort` field's removal implicit and
  // trip `@typescript-eslint/no-unused-vars` on the destructure) so the
  // public return shape stays exactly `CategoryTrend[]`, with the internal
  // sort key never leaking into the returned objects.
  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    points: row.points,
  }))
}

/**
 * Category Trends (analytics.md AC7): for each category with any expense
 * activity in the selected period, total spending per month across the
 * period.
 *
 * This is the one metric Architecture.md's Risk #11 section flags as
 * genuinely needing a column-projected, bounded `findMany` reduced once in
 * application code — a category × month 2D bucket isn't expressible via a
 * single Prisma `groupBy` against a truncated date column. The `findMany`
 * below selects only `categoryId`/`amount`/`date` (never a full transaction
 * row) and is bounded to the resolved period range, matching that
 * guidance exactly.
 *
 * "Uncategorized" is folded into its own bucket via
 * `UNCATEGORIZED_CATEGORY_ID`/`UNCATEGORIZED_CATEGORY_NAME` (Dashboard's own
 * sentinel constants, reused rather than redefined — analytics.md AC4/Edge
 * Cases require the same "Uncategorized" treatment Dashboard already uses,
 * including a category deleted after being budgeted against in a past
 * month, per `Transaction.categoryId`'s `onDelete: SetNull`).
 *
 * Every month in the period is included in every returned category's
 * `points` (even a $0 month), so a multi-series trend chart has a uniform,
 * gap-free x-axis across every category — same "true gap, not a missing
 * month" convention as `getYearlySpending`/`getMonthlyTrends`. Categories
 * are ordered by total period spend descending (largest spender first),
 * matching `getSpendingByCategory`'s existing sort convention. See
 * `buildCategoryTrends` above for the bucketing/sorting math this function
 * delegates to.
 */
export async function getCategoryTrends(
  userId: string,
  period: ReportingPeriodRange,
): Promise<CategoryTrend[]> {
  const start = period.start ?? (await resolveEarliestExpenseDate(userId))
  if (!start) {
    return []
  }

  const monthKeys = enumerateMonthKeys(start, period.end)

  const rows = await db.transaction.findMany({
    where: {
      userId,
      amount: { lt: 0 },
      date: { gte: start, lte: period.end },
      ...EXCLUDE_SPLIT_PARENTS,
    },
    select: { categoryId: true, amount: true, date: true },
  })

  const transactions: CategoryTrendTransaction[] = rows.map((row) => ({
    categoryId: row.categoryId,
    amount: row.amount.toNumber(),
    date: row.date,
  }))

  const realCategoryIds = [
    ...new Set(transactions.map((txn) => txn.categoryId).filter((id): id is string => id !== null)),
  ]
  const categories = realCategoryIds.length
    ? await db.category.findMany({
        where: { id: { in: realCategoryIds } },
        select: { id: true, name: true },
      })
    : []
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))

  return buildCategoryTrends(transactions, monthKeys, categoryNameById)
}
