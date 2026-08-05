import type { Transaction } from "@/features/transactions/types"
import type { CategorySpending } from "@/features/dashboard/types"
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "@/features/dashboard/types"

import { resolveMonthToDateRange } from "./monthly-summary"

/**
 * Mirrors `features/dashboard/server/service.ts`'s `getSpendingByCategory`
 * exactly: expense transactions (`amount < 0`) in the resolved month-to-date
 * range (same `resolveMonthToDateRange` this derive module shares with
 * `monthly-summary.ts`, so the two can never silently disagree), grouped by
 * category, with a `null` `categoryId` folded into the same
 * `UNCATEGORIZED_CATEGORY_ID`/`_NAME` sentinel Dashboard's real read
 * function uses — imported from `@/features/dashboard/types` (a plain
 * `types.ts`, not `server/`, so it's outside
 * public-demo-technical-design.md §4.1's import restriction), never a
 * second, independently-defined sentinel. Ordered by amount descending,
 * matching the real function's own sort.
 */
export function deriveSpendingByCategory(
  transactions: Transaction[],
  targetMonth: Date,
  now: Date,
): CategorySpending[] {
  const { start, end } = resolveMonthToDateRange(targetMonth, now)

  const expensesInRange = transactions.filter(
    (txn) => txn.amount < 0 && txn.date >= start && txn.date <= end,
  )

  const totalsByCategory = new Map<string, { categoryName: string; amount: number }>()

  for (const txn of expensesInRange) {
    const categoryId = txn.category?.id ?? UNCATEGORIZED_CATEGORY_ID
    const categoryName = txn.category?.name ?? UNCATEGORIZED_CATEGORY_NAME
    const existing = totalsByCategory.get(categoryId)
    const amount = -txn.amount

    totalsByCategory.set(categoryId, {
      categoryName,
      amount: (existing?.amount ?? 0) + amount,
    })
  }

  const spending: CategorySpending[] = [...totalsByCategory.entries()].map(
    ([categoryId, { categoryName, amount }]) => ({ categoryId, categoryName, amount }),
  )

  return spending.sort((a, b) => b.amount - a.amount)
}
