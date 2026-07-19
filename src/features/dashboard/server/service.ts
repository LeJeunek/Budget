import type { Prisma } from "@prisma/client"
import { AccountType } from "@prisma/client"

import { db } from "@/lib/db"

import type {
  CategorySpending,
  MonthlySummary,
  MonthlyTrend,
  NetWorth,
} from "../types"
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Dashboard section: read-only
// aggregation, no Server Actions/routes in Phase 1) — never from a Client
// Component. Every exported function takes a pre-resolved `userId` from the
// caller's `getCurrentUser()` (see lib/auth.ts) and scopes every Prisma query
// by it; this module never calls `getCurrentUser()` itself and never trusts
// a client-supplied user id, per folder-tree.md's note on risk-register.md
// item #4 (cross-user data leak prevention).

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

/**
 * A Prisma `where` fragment that excludes split-parent transactions from any
 * sum/groupBy, per dashboard-overview.md AC10 ("every dollar of transaction
 * volume is counted exactly once ... a split transaction's line items are
 * counted, never the original parent plus its splits together").
 *
 * `splits: { none: {} }` reads as "no other transaction points at this one
 * via `parentTransactionId`" (the `TransactionSplits` self-relation in
 * prisma/schema.prisma). That condition is true for:
 *   - ordinary, never-split transactions (no children) — counted, correct.
 *   - split *children* themselves (they have no children of their own,
 *     splitting is one level deep) — counted, correct.
 * and false only for a transaction that has been split, i.e. has one or more
 * rows with `parentTransactionId` pointing at it — excluded, because once
 * split, that parent's own `amount` is purely informational (per the schema
 * comment on `Transaction.parentTransactionId`) and only its split children
 * should contribute to sums.
 */
const EXCLUDE_SPLIT_PARENTS: Prisma.TransactionWhereInput = {
  splits: { none: {} },
}

/** Builds a UTC midnight `Date` for the first of the given year/month
 * (0-indexed month, matching `Date.UTC`/`getUTCMonth` conventions). Always
 * constructed via `Date.UTC` rather than the local-timezone `Date`
 * constructor, since `Transaction.date` is stored as a UTC calendar date
 * (see the schema comment and risk-register.md #8) and Phase 1 has no
 * per-user timezone preference to compute against yet. */
function utcMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1))
}

/**
 * Resolves the `[gte, lte]` date range to filter transactions by for a given
 * "target month" (any `Date` whose UTC year/month identifies the month of
 * interest, typically `new Date()` for "the current month").
 *
 * Implements the month-to-date framing required by dashboard-overview.md's
 * stat cards (AC2, AC3, AC5, AC6) and the future-dated-transaction edge case
 * ("must not be included in 'this month to date' totals if their date is
 * after today"): the upper bound is `min(last day of the target month,
 * today)`. For a past month this always resolves to that month's last day
 * (today is later), giving the full month. For the current month it resolves
 * to today, excluding both future-dated transactions and days that haven't
 * happened yet. This single rule handles both cases without branching on
 * "is this the current month?" — deliberately, to avoid that logic drifting
 * out of sync between callers.
 *
 * If the target month is entirely in the future (today is before the
 * month's start), `end` comes back before `start`; callers do not need to
 * special-case this — a Prisma `gte`/`lte` range where `lte < gte` simply
 * matches zero rows, which is the correct "no activity yet" result.
 */
function resolveMonthToDateRange(
  targetMonth: Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const year = targetMonth.getUTCFullYear()
  const monthIndex = targetMonth.getUTCMonth()

  const start = utcMonthStart(year, monthIndex)
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0))
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )

  const end = lastDayOfMonth < today ? lastDayOfMonth : today

  return { start, end }
}

/** `"yyyy-MM"` key for a UTC month-start `Date`. Built manually from UTC
 * getters (not e.g. `date-fns`'s `format`, which formats in the process's
 * local timezone) so the key never shifts to an adjacent month depending on
 * where the server happens to run — see the `MonthlyTrend.month` JSDoc. */
function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Core income/expense aggregation shared by `getMonthlySummary` and
 * `getMonthlyTrends`, so the month-to-date range resolution, split-parent
 * exclusion, and income/expense sign convention live in exactly one place
 * (per the "avoid duplication" standard) rather than being reimplemented per
 * caller.
 *
 * Per prisma/schema.prisma's comment on `Transaction.amount` ("positive =
 * income/credit, negative = expense/debit"): income is the sum of positive
 * amounts, expenses is the sum of the absolute value of negative amounts.
 * Both sums are pushed to Postgres via `aggregate` (not fetched into memory
 * and summed in JS), per docs/database/performance-considerations.md.
 */
async function getIncomeAndExpenses(
  userId: string,
  targetMonth: Date,
): Promise<{ income: number; expenses: number }> {
  const { start, end } = resolveMonthToDateRange(targetMonth)

  const dateRangeWhere: Prisma.TransactionWhereInput = {
    userId,
    date: { gte: start, lte: end },
    ...EXCLUDE_SPLIT_PARENTS,
  }

  const [incomeResult, expenseResult] = await Promise.all([
    db.transaction.aggregate({
      where: { ...dateRangeWhere, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.transaction.aggregate({
      where: { ...dateRangeWhere, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ])

  const income = incomeResult._sum.amount?.toNumber() ?? 0
  // Expenses are stored as negative amounts; negate to the positive total
  // the API contract and UI expect ("sum of money-out transactions").
  const expenses = -(expenseResult._sum.amount?.toNumber() ?? 0)

  return { income, expenses }
}

/**
 * `(income - expenses) / income`, or `null` when `income` is 0.
 *
 * dashboard-overview.md AC6 requires the divide-by-zero case to surface as
 * an explicit "not enough data" state, not a misleading `0%`, `NaN`, or a
 * thrown error. Returning `null` (rather than `0`) is the sentinel that lets
 * the Frontend Lead distinguish "0% savings rate" (a real, computed value —
 * e.g. income exactly offset expenses) from "no income this period to
 * compute a rate from" — collapsing both to `0` would make them
 * indistinguishable and misleading, which the spec explicitly forbids.
 */
function computeSavingsRate(income: number, expenses: number): number | null {
  if (income === 0) {
    return null
  }
  return (income - expenses) / income
}

// ---------------------------------------------------------------------------
// Public service functions (docs/architecture/api-contracts.md — Dashboard)
// ---------------------------------------------------------------------------

/**
 * Net Worth: sum of every non-archived account's balance, with
 * `CREDIT_CARD` balances subtracted (liability) and every other account
 * type added (asset), per docs/product/accounts.md's sign convention and
 * dashboard-overview.md AC1.
 *
 * Archived accounts are excluded entirely (`archivedAt: null`) — AC11:
 * archiving only removes an account from *current* Net Worth, it does not
 * rewrite history, so this function is intentionally not involved in
 * historical month calculations (those key off `Transaction.date` via
 * `getMonthlySummary`/`getMonthlyTrends`, independent of account state).
 *
 * Uses `findMany` rather than a `groupBy`/`aggregate`: per-account
 * granularity is part of the required return shape (`byAccount`), and a
 * user's account count is small (tens, not thousands) unlike the
 * transaction table this performance guidance targets — see
 * docs/database/performance-considerations.md.
 */
export async function getNetWorth(userId: string): Promise<NetWorth> {
  const accounts = await db.account.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, type: true, balance: true },
    orderBy: { createdAt: "asc" },
  })

  const byAccount = accounts.map((account) => {
    const rawBalance = account.balance.toNumber()
    const balance =
      account.type === AccountType.CREDIT_CARD ? -rawBalance : rawBalance

    return { accountId: account.id, balance }
  })

  const total = byAccount.reduce((sum, account) => sum + account.balance, 0)

  return { total, byAccount }
}

/**
 * Monthly Income, Expenses, Cash Flow, and Savings Rate for `month`
 * (month-to-date when `month` is the current calendar month; the full
 * calendar month otherwise — see `resolveMonthToDateRange`).
 *
 * `month` is any `Date` whose UTC year/month identifies the target month
 * (the day-of-month component is ignored) — callers typically pass
 * `new Date()` for "this month". api-contracts.md specifies the parameter
 * name and position but not its concrete type; `Date` was chosen (over e.g.
 * a `"yyyy-MM"` string) to match how `getMonthlyTrends` already needs to
 * generate a sequence of months, keeping one convention across this module.
 */
export async function getMonthlySummary(
  userId: string,
  month: Date,
): Promise<MonthlySummary> {
  const { income, expenses } = await getIncomeAndExpenses(userId, month)
  const cashFlow = income - expenses
  const savingsRate = computeSavingsRate(income, expenses)

  return { income, expenses, cashFlow, savingsRate }
}

/**
 * Spending by Category for `month`: expense transactions (`amount < 0`)
 * grouped by category, using the same month-to-date range and split-parent
 * exclusion as `getMonthlySummary` so the two stay consistent — a user
 * summing this chart's amounts should get exactly `getMonthlySummary`'s
 * `expenses` figure, per dashboard-overview.md's "every dollar counted
 * exactly once" requirement.
 *
 * Transactions with no category (`categoryId: null`) are grouped into an
 * explicit "Uncategorized" bucket (AC7) rather than dropped — see
 * `UNCATEGORIZED_CATEGORY_ID`/`UNCATEGORIZED_CATEGORY_NAME` in `../types.ts`
 * for why a sentinel id is required.
 *
 * Results are ordered by amount descending (largest spending category
 * first), a reasonable default for a spending breakdown chart in the
 * absence of a specified sort in api-contracts.md.
 */
export async function getSpendingByCategory(
  userId: string,
  month: Date,
): Promise<CategorySpending[]> {
  const { start, end } = resolveMonthToDateRange(month)

  const groups = await db.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      date: { gte: start, lte: end },
      amount: { lt: 0 },
      ...EXCLUDE_SPLIT_PARENTS,
    },
    _sum: { amount: true },
  })

  const categoryIds = groups
    .map((group) => group.categoryId)
    .filter((id): id is string => id !== null)

  const categories = categoryIds.length
    ? await db.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : []
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))

  const spending: CategorySpending[] = groups.map((group) => {
    const amount = -(group._sum.amount?.toNumber() ?? 0)

    if (group.categoryId === null) {
      return {
        categoryId: UNCATEGORIZED_CATEGORY_ID,
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        amount,
      }
    }

    return {
      categoryId: group.categoryId,
      // Falls back to the raw id in the unexpected case a category was
      // deleted between the groupBy and this lookup (categories are
      // never hard-deleted per api-contracts.md's Categories section, so
      // this is defensive, not an expected path).
      categoryName: categoryNameById.get(group.categoryId) ?? group.categoryId,
      amount,
    }
  })

  return spending.sort((a, b) => b.amount - a.amount)
}

/**
 * Income and Expenses for each of the last `monthsBack` calendar months
 * (including the current, in-progress month, month-to-date), per
 * dashboard-overview.md AC9.
 *
 * Per the "user whose account history is shorter than 6 months" edge case,
 * this does not fabricate months before the user existed: `User.createdAt`
 * is the floor, and any generated month before the user's signup month is
 * dropped rather than emitted as a zeroed placeholder. Months within the
 * user's history that simply have no transactions still get an explicit
 * `{ income: 0, expenses: 0 }` entry (not omitted), so a trends chart shows
 * a true gap/flat period rather than skipping a month on the x-axis.
 */
export async function getMonthlyTrends(
  userId: string,
  monthsBack: number,
): Promise<MonthlyTrend[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })

  // Defensive only: callers resolve `userId` from an authenticated session
  // (see the module-level note above), so a missing user here would mean
  // the session outlived the user record. Not treated as an error — an
  // empty trends list is a safe, non-crashing fallback.
  if (!user) {
    return []
  }

  const now = new Date()
  const currentMonthStart = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth())
  const userSignupMonthStart = utcMonthStart(
    user.createdAt.getUTCFullYear(),
    user.createdAt.getUTCMonth(),
  )

  const targetMonths: Date[] = []
  for (let offset = monthsBack - 1; offset >= 0; offset--) {
    const monthStart = new Date(
      Date.UTC(
        currentMonthStart.getUTCFullYear(),
        currentMonthStart.getUTCMonth() - offset,
        1,
      ),
    )
    if (monthStart < userSignupMonthStart) {
      continue
    }
    targetMonths.push(monthStart)
  }

  return Promise.all(
    targetMonths.map(async (monthStart) => {
      const { income, expenses } = await getIncomeAndExpenses(userId, monthStart)
      return { month: formatMonthKey(monthStart), income, expenses }
    }),
  )
}
