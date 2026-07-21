import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
} from "@/features/dashboard/types"
import { normalizeMerchantName } from "@/lib/merchant-normalization"

import type {
  ExpenseDistributionEntry,
  LargestPurchase,
  ReportingPeriodRange,
  TopMerchant,
} from "../types"
import { formatDateKey } from "./period"
import { resolveLimit } from "./validation"

// Expense Distribution, Top Merchants, and Largest Purchases are grouped in
// one file per docs/architecture/Architecture.md's "Analytics module
// structure" section: all three are "rank or bucket a single period's/
// all-time's expense transactions by one dimension" (category, merchant,
// amount respectively) — the simplest, single-`groupBy`-or-`orderBy` group.
// Every function scopes by the caller-supplied `userId` (resolved from
// `getCurrentUser()` by the caller, never by this module itself) and
// imports `EXCLUDE_SPLIT_PARENTS` from its canonical home
// (`features/transactions/server/service.ts`), per that same document's
// pre-existing-duplication note.

const DEFAULT_TOP_MERCHANTS_LIMIT = 20
const DEFAULT_LARGEST_PURCHASES_LIMIT = 20

/** Builds the `date` fragment of a Prisma `where` for an optional period —
 * `undefined` (no period at all, Top Merchants'/Largest Purchases' own
 * "defaults to all-time" behavior) omits the date filter entirely;
 * `period.start === null` ("All Time" explicitly selected) filters only by
 * `lte: period.end`. Shared by every function in this file that accepts an
 * optional period. */
function optionalPeriodDateWhere(
  period: ReportingPeriodRange | undefined,
): Prisma.TransactionWhereInput["date"] | undefined {
  if (!period) {
    return undefined
  }
  return period.start ? { gte: period.start, lte: period.end } : { lte: period.end }
}

/**
 * Expense Distribution (analytics.md AC8): the selected period's total
 * spending by category — functionally the same shape as
 * `features/dashboard/server/service.ts`'s `getSpendingByCategory`, but
 * bounded to an arbitrary reporting-period range instead of fixed to one
 * calendar month. Reuses that function's exact "Uncategorized" sentinel
 * convention (imported, not redefined) rather than inventing a parallel
 * definition of "uncategorized," per analytics.md AC4/Edge Cases.
 *
 * Ordered by amount descending (largest spending category first), matching
 * `getSpendingByCategory`'s own sort convention.
 */
export async function getExpenseDistribution(
  userId: string,
  period: ReportingPeriodRange,
): Promise<ExpenseDistributionEntry[]> {
  const groups = await db.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      amount: { lt: 0 },
      date: period.start ? { gte: period.start, lte: period.end } : { lte: period.end },
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

  const distribution: ExpenseDistributionEntry[] = groups.map((group) => {
    const amount = -(group._sum.amount?.toNumber() ?? 0) || 0

    if (group.categoryId === null) {
      return {
        categoryId: UNCATEGORIZED_CATEGORY_ID,
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        amount,
      }
    }

    return {
      categoryId: group.categoryId,
      categoryName: categoryNameById.get(group.categoryId) ?? group.categoryId,
      amount,
    }
  })

  return distribution.sort((a, b) => b.amount - a.amount)
}

/**
 * Top Merchants (analytics.md AC10): merchants ranked by total spend within
 * `options.period` (defaults to all-time, per api-contracts.md — Top
 * Merchants is one of the two metrics that ignores the shared
 * reporting-period control by default).
 *
 * Merchant grouping cannot be expressed via Prisma's `groupBy` (the grouping
 * key is `normalizeMerchantName(merchant)`, a JS function, not a raw
 * column) — this fetches only `merchant`/`amount`/`date` (never a full
 * transaction row) for the period and reduces once in application code, the
 * same "bounded, column-projected findMany" shape Architecture.md's Risk #11
 * sanctions for Category Trends.
 *
 * `displayName` is the most-recent raw merchant string seen within the
 * group (tracked by comparing each row's `date`), per analytics.md's own
 * "most-recent raw merchant string ... for display" convention.
 */
export async function getTopMerchants(
  userId: string,
  options: { period?: ReportingPeriodRange; limit?: number } = {},
): Promise<TopMerchant[]> {
  const boundedLimit = resolveLimit(options.limit, DEFAULT_TOP_MERCHANTS_LIMIT)

  const transactions = await db.transaction.findMany({
    where: {
      userId,
      amount: { lt: 0 },
      ...EXCLUDE_SPLIT_PARENTS,
      date: optionalPeriodDateWhere(options.period),
    },
    select: { merchant: true, amount: true, date: true },
  })

  interface MerchantAccumulator {
    displayName: string
    displayDate: Date
    totalSpend: number
    transactionCount: number
  }

  const merchantsByKey = new Map<string, MerchantAccumulator>()

  for (const txn of transactions) {
    const key = normalizeMerchantName(txn.merchant)
    const amount = -(txn.amount.toNumber()) || 0
    const existing = merchantsByKey.get(key)

    if (!existing) {
      merchantsByKey.set(key, {
        displayName: txn.merchant,
        displayDate: txn.date,
        totalSpend: amount,
        transactionCount: 1,
      })
      continue
    }

    existing.totalSpend += amount
    existing.transactionCount += 1
    if (txn.date >= existing.displayDate) {
      existing.displayName = txn.merchant
      existing.displayDate = txn.date
    }
  }

  return [...merchantsByKey.entries()]
    .map(([normalizedMerchantName, data]) => ({
      normalizedMerchantName,
      displayName: data.displayName,
      totalSpend: data.totalSpend,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, boundedLimit)
}

/**
 * Largest Purchases (analytics.md AC11): the individual highest-amount
 * expense transactions within `options.period` (defaults to all-time, same
 * as `getTopMerchants`).
 *
 * A plain `orderBy: { amount: "asc" }` + `take` — expenses are stored as
 * negative amounts, so ascending order surfaces the most-negative (largest
 * expense) rows first. No heavier than Transactions' own existing
 * paginated list query (Architecture.md's Risk #11 note on this metric
 * family).
 */
export async function getLargestPurchases(
  userId: string,
  options: { period?: ReportingPeriodRange; limit?: number } = {},
): Promise<LargestPurchase[]> {
  const boundedLimit = resolveLimit(options.limit, DEFAULT_LARGEST_PURCHASES_LIMIT)

  const transactions = await db.transaction.findMany({
    where: {
      userId,
      amount: { lt: 0 },
      ...EXCLUDE_SPLIT_PARENTS,
      date: optionalPeriodDateWhere(options.period),
    },
    select: {
      id: true,
      date: true,
      merchant: true,
      amount: true,
      category: { select: { name: true } },
    },
    orderBy: { amount: "asc" },
    take: boundedLimit,
  })

  return transactions.map((txn) => ({
    transactionId: txn.id,
    date: formatDateKey(txn.date),
    merchant: txn.merchant,
    categoryName: txn.category?.name ?? UNCATEGORIZED_CATEGORY_NAME,
    amount: -(txn.amount.toNumber()) || 0,
  }))
}
