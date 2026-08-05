import type { Transaction } from "@/features/transactions/types"
import type { MonthlySummary } from "@/features/dashboard/types"

/**
 * Mirrors `features/dashboard/server/service.ts`'s month-to-date range
 * resolution (`resolveMonthToDateRange`) exactly: `[start of targetMonth,
 * min(end of targetMonth, today)]` — a past month always resolves to its
 * full calendar span; the current, in-progress month is capped at "today" so
 * a future-dated transaction (there are none in this fixture, but the rule
 * is kept faithful regardless) is never counted.
 */
export function resolveMonthToDateRange(
  targetMonth: Date,
  now: Date,
): { start: Date; end: Date } {
  const year = targetMonth.getUTCFullYear()
  const monthIndex = targetMonth.getUTCMonth()

  const start = new Date(Date.UTC(year, monthIndex, 1))
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0))
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const end = lastDayOfMonth < today ? lastDayOfMonth : today

  return { start, end }
}

/** Filters `transactions` to those dated within `[start, end]`, inclusive —
 * this fixture's transactions are never split parents/children, so unlike
 * the real `EXCLUDE_SPLIT_PARENTS` filter `dashboard/server/service.ts`
 * applies, there is nothing to exclude here. */
function transactionsInRange(
  transactions: Transaction[],
  start: Date,
  end: Date,
): Transaction[] {
  return transactions.filter((txn) => txn.date >= start && txn.date <= end)
}

/** `(income - expenses) / income`, or `null` when `income` is 0 — mirrors
 * `features/dashboard/server/service.ts`'s `computeSavingsRate` exactly
 * (that file lives under `features/dashboard/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule, hence
 * this reimplementation — flagged per §2.2). */
export function computeSavingsRate(income: number, expenses: number): number | null {
  if (income === 0) {
    return null
  }
  return (income - expenses) / income
}

/**
 * Mirrors `features/dashboard/server/service.ts`'s `getMonthlySummary`
 * (via its shared `getIncomeAndExpenses` internal) exactly: income is the
 * sum of positive-amount transactions in the resolved month-to-date range,
 * expenses is the absolute sum of negative-amount transactions in that same
 * range, `cashFlow = income - expenses`, `savingsRate` per
 * `computeSavingsRate` above.
 */
export function deriveMonthlySummary(
  transactions: Transaction[],
  targetMonth: Date,
  now: Date,
): MonthlySummary {
  const { start, end } = resolveMonthToDateRange(targetMonth, now)
  const inRange = transactionsInRange(transactions, start, end)

  const income = inRange
    .filter((txn) => txn.amount > 0)
    .reduce((sum, txn) => sum + txn.amount, 0)
  // `|| 0` normalizes IEEE-754 negative zero for a $0 expense total, matching
  // `getIncomeAndExpenses`'s own convention.
  const expenses =
    -inRange.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + txn.amount, 0) || 0

  const cashFlow = income - expenses
  const savingsRate = computeSavingsRate(income, expenses)

  return { income, expenses, cashFlow, savingsRate }
}
