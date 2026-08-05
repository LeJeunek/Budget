import type { Transaction, TransactionCategorySummary } from "@/features/transactions/types"
import type { BudgetCategoryLine, BudgetMonthTotals, BudgetMonthView } from "@/features/budgeting/types"

import type { DemoBudgetAllocation } from "../budget"

/**
 * Mirrors `features/budgeting/server/service.ts`'s `buildBudgetMonthView`/
 * `buildCategoryLine` exactly (that file lives under
 * `features/budgeting/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule, hence
 * this reimplementation — flagged per §2.2). `spent` is always computed from
 * `transactions.ts`'s data (never a separately hand-typed number), so
 * Budgeting's per-category Spent figure can never silently disagree with
 * Transactions'/Dashboard's own totals for the same month.
 */

/** `[start, end]` UTC bounds for the *full* calendar month `monthDate`
 * identifies — deliberately not month-to-date-capped, matching
 * `features/transactions/server/aggregations.ts`'s `fullMonthRange`
 * (budgeting.md AC6 defines Spent as the full month's activity, not a
 * month-to-date framing). */
function fullMonthRange(monthDate: Date): { start: Date; end: Date } {
  const year = monthDate.getUTCFullYear()
  const monthIndex = monthDate.getUTCMonth()
  const end = new Date(Date.UTC(year, monthIndex + 1, 0))
  return { start: monthDate, end }
}

/** `true` when `monthDate` is strictly before the current calendar month —
 * mirrors `features/budgeting/server/validation.ts`'s `isPastMonth`. */
function isPastMonth(monthDate: Date, now: Date): boolean {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return monthDate.getTime() < currentMonthStart.getTime()
}

function buildCategoryLine(params: {
  categoryId: string
  categoryName: string
  isSystem: boolean
  allocated: number | null
  spent: number
}): BudgetCategoryLine {
  const { categoryId, categoryName, isSystem, allocated, spent } = params

  if (allocated === null) {
    return {
      categoryId,
      categoryName,
      isSystem,
      allocated: null,
      spent,
      remaining: null,
      percentUsed: null,
      isOverBudget: false,
    }
  }

  const remaining = allocated - spent
  const isOverBudget = spent > allocated
  const percentUsed = allocated === 0 ? (spent > 0 ? 100 : 0) : (spent / allocated) * 100

  return { categoryId, categoryName, isSystem, allocated, spent, remaining, percentUsed, isOverBudget }
}

/** `"YYYY-MM"` for a UTC month-start `Date`, matching every other derive
 * module's month-key convention. */
function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function deriveBudgetMonth(params: {
  transactions: Transaction[]
  allocations: DemoBudgetAllocation[]
  categories: TransactionCategorySummary[]
  targetMonth: Date
  now: Date
}): BudgetMonthView {
  const { transactions, allocations, categories, targetMonth, now } = params
  const { start, end } = fullMonthRange(targetMonth)

  const expensesInMonth = transactions.filter(
    (txn) => txn.amount < 0 && txn.date >= start && txn.date <= end,
  )

  const spentByCategoryId = new Map<string, number>()
  let uncategorizedSpent = 0
  for (const txn of expensesInMonth) {
    const amount = -txn.amount
    if (txn.category === null) {
      uncategorizedSpent += amount
      continue
    }
    spentByCategoryId.set(txn.category.id, (spentByCategoryId.get(txn.category.id) ?? 0) + amount)
  }

  const allocationByCategoryId = new Map(allocations.map((a) => [a.categoryId, a.amount]))

  const lines: BudgetCategoryLine[] = categories.map((category) =>
    buildCategoryLine({
      categoryId: category.id,
      categoryName: category.name,
      // Every demo category mirrors `DEFAULT_CATEGORIES`, the real
      // Charter-fixed starter set — every one of them is `isSystem: true`,
      // same as a real new user's own signup-seeded categories.
      isSystem: true,
      allocated: allocationByCategoryId.get(category.id) ?? null,
      spent: spentByCategoryId.get(category.id) ?? 0,
    }),
  )

  const totals = lines.reduce<BudgetMonthTotals>(
    (acc, line) => {
      if (line.allocated === null) {
        return acc
      }
      return {
        totalAllocated: acc.totalAllocated + line.allocated,
        totalSpent: acc.totalSpent + line.spent,
        totalRemaining: acc.totalRemaining + (line.remaining ?? 0),
      }
    },
    { totalAllocated: 0, totalSpent: 0, totalRemaining: 0 },
  )

  return {
    month: formatMonthKey(targetMonth),
    isEditable: !isPastMonth(targetMonth, now),
    hasAnyBudgetData: true,
    categories: lines,
    totals,
    uncategorizedSpent,
  }
}
