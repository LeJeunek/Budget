import {
  getExpenseDistribution,
  getLargestPurchases,
  getTopMerchants,
} from "@/features/analytics/server/expense-breakdown"
import { enumerateMonthKeys, resolveMonthKeyRange } from "@/features/analytics/server/period"
import { getMonthlySummary } from "@/features/dashboard/server/service"
import { getEarliestTransactionDate } from "@/features/transactions/server/service"

import type { ExpenseReportData } from "../../types"
import type { ResolvedPeriod } from "../period"

/**
 * Expense Report (reports.md §5). Per
 * phase-4b-technical-design.md §3's data-source map, the total-expense
 * trend line is the per-month `dashboard.service.getMonthlySummary` loop
 * (never re-derived from `getCategoryTrends`' own per-category buckets,
 * which this report type has no other use for — its by-category section is
 * `getExpenseDistribution`'s own whole-period totals, per reports.md's
 * literal Contents list).
 */
export async function assembleExpenseReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<ExpenseReportData, "type" | "period" | "generatedAt">> {
  // "All Time" (`period.start === null`) has no concrete floor to loop
  // months from until resolved against this user's own real history — every
  // period-aware Analytics function already does this internally, but this
  // report's own per-month `getMonthlySummary` loop is this feature's own
  // bounded iteration, so it needs the same floor explicitly. See
  // `features/transactions/server/service.ts`'s `getEarliestTransactionDate`
  // JSDoc for why this one small read lives there rather than a raw query
  // here.
  const trendStart = period.start ?? (await getEarliestTransactionDate(userId, { direction: "expense" }))

  const [byCategory, topMerchants, largestPurchases, monthlyTrend] = await Promise.all([
    getExpenseDistribution(userId, period),
    getTopMerchants(userId, { period }),
    getLargestPurchases(userId, { period }),
    trendStart
      ? Promise.all(
          enumerateMonthKeys(trendStart, period.end).map(async (monthKey) => {
            const { start } = resolveMonthKeyRange(monthKey)
            const summary = await getMonthlySummary(userId, start)
            return { month: monthKey, expenses: summary.expenses }
          }),
        )
      : Promise.resolve([]),
  ])

  return { monthlyTrend, byCategory, topMerchants, largestPurchases }
}
