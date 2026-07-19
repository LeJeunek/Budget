import { db } from "@/lib/db"

import { EXCLUDE_SPLIT_PARENTS } from "./service"

/**
 * Shared "Spent for a category+month" aggregation, extracted per
 * docs/architecture/api-contracts.md's Budgeting section ("Duplication
 * note (Spent calculation)"): both `features/dashboard/server/service.ts`
 * (Phase 1's Spending by Category chart) and `features/budgeting/server/
 * service.ts` (Phase 2's per-category Spent/Remaining/percentUsed, AC6/AC10)
 * need the identical "sum of a category's expense transactions for a month,
 * counting split line items and never their split-parent" rule. Keeping one
 * implementation here — rather than two independently-maintained copies —
 * is what the Dashboard and Budgeting specs' Definition of Done both call
 * out as a correctness risk ("zero reported discrepancies... between the
 * budget page's Spent figures and a manual recalculation from the
 * transaction table").
 *
 * This module intentionally holds only the two functions below, not the
 * broader `getSpendingByCategory` Dashboard already ships (that function
 * merges "Uncategorized" into the same list with a sentinel id, a shape
 * specific to the chart it backs — see dashboard/types.ts). Budgeting needs
 * "real categories" and "Uncategorized" as two separate figures (AC9/AC10 —
 * unbudgeted/uncategorized spend must never be folded into budgeted
 * totals), so the two functions here are split accordingly and are the ones
 * Budgeting calls directly. Dashboard's own `getSpendingByCategory` is left
 * as-is (out of this task's scope — see the Backend Engineer's report) but
 * could be refactored onto these in a follow-up without any behavior
 * change, per the api-contracts.md note.
 */

/** One category's total expense spend for a month. `amount` is always
 * positive (a spend total, not a signed transaction amount) — mirrors
 * `features/dashboard/types.ts`'s `CategorySpending.amount` convention. */
export interface CategorySpendingForMonth {
  categoryId: string
  amount: number
}

/** `[start, end]` UTC date bounds for the *full* calendar month identified
 * by `monthStart` (a UTC first-of-month `Date`, e.g. `Budget.month`'s
 * representation — see `features/budgeting/server/validation.ts`).
 *
 * Deliberately not month-to-date-capped the way `features/dashboard/server/
 * service.ts`'s `resolveMonthToDateRange` is: docs/product/budgeting.md AC6
 * defines Spent as "the sum of that category's expense transactions for the
 * month" with no month-to-date framing, unlike Dashboard's stat cards. Using
 * the full calendar month here (rather than capping at "today") is also
 * what makes a past month's Spent figure stable regardless of when it's
 * viewed.
 */
function fullMonthRange(monthStart: Date): { start: Date; end: Date } {
  const year = monthStart.getUTCFullYear()
  const monthIndex = monthStart.getUTCMonth()
  const end = new Date(Date.UTC(year, monthIndex + 1, 0))
  return { start: monthStart, end }
}

/**
 * Sums each category's expense transactions (`amount < 0`) for `month`,
 * grouped by `categoryId`. Excludes transactions with no category — see
 * `getUncategorizedSpendingForMonth` for that figure — and split-parent
 * transactions (`EXCLUDE_SPLIT_PARENTS`, per AC6/Edge Cases: "each split
 * line item counts only toward its own category's Spent total").
 *
 * Pushed to Postgres via `groupBy`/`_sum` (not fetched and summed in JS),
 * matching `features/dashboard/server/service.ts`'s existing convention
 * (docs/database/performance-considerations.md).
 */
export async function getSpendingByCategoryForMonth(
  userId: string,
  month: Date,
): Promise<CategorySpendingForMonth[]> {
  const { start, end } = fullMonthRange(month)

  const groups = await db.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      date: { gte: start, lte: end },
      amount: { lt: 0 },
      categoryId: { not: null },
      ...EXCLUDE_SPLIT_PARENTS,
    },
    _sum: { amount: true },
  })

  return groups
    .filter((group): group is typeof group & { categoryId: string } => group.categoryId !== null)
    .map((group) => ({
      categoryId: group.categoryId,
      // Expenses are stored as negative amounts; negate to a positive
      // spend total. `|| 0` normalizes IEEE-754 negative zero the same way
      // features/dashboard/server/service.ts's getIncomeAndExpenses does
      // (a category with $0 net expense activity must never render "-$0").
      amount: -(group._sum.amount?.toNumber() ?? 0) || 0,
    }))
}

/**
 * Sums expense transactions with no category (`categoryId: null`) for
 * `month` — either never assigned a category, or their category was since
 * deleted (`onDelete: SetNull`, see prisma/schema.prisma). Per budgeting.md's
 * Edge Cases, "Uncategorized" is not a real, budgetable category: this
 * figure is informational only and must never be folded into a budgeted
 * category's Spent or into Budgeting's month-level totals.
 */
export async function getUncategorizedSpendingForMonth(
  userId: string,
  month: Date,
): Promise<number> {
  const { start, end } = fullMonthRange(month)

  const result = await db.transaction.aggregate({
    where: {
      userId,
      date: { gte: start, lte: end },
      amount: { lt: 0 },
      categoryId: null,
      ...EXCLUDE_SPLIT_PARENTS,
    },
    _sum: { amount: true },
  })

  return -(result._sum.amount?.toNumber() ?? 0) || 0
}
