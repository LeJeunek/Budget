import { enumerateMonthKeys, resolveMonthKeyRange } from "@/features/analytics/server/period"
import { getMonthlySummary } from "@/features/dashboard/server/service"
import { getEarliestTransactionDate } from "@/features/transactions/server/service"

import type { CashFlowReportData } from "../../types"
import type { ResolvedPeriod } from "../period"

/**
 * Cash Flow Report (reports.md §6) — entirely the per-month
 * `dashboard.service.getMonthlySummary` loop, per
 * phase-4b-technical-design.md §3's data-source map, reusing that
 * function's own `savingsRate: null`-on-`$0`-income convention directly
 * rather than re-deriving it (`computeSavingsRate`'s exact rule, already
 * baked into every `MonthlySummary` this loop reads).
 */
export async function assembleCashFlowReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<CashFlowReportData, "type" | "period" | "generatedAt" | "currency">> {
  // See `expense.ts`'s identical note on `getEarliestTransactionDate` — Cash
  // Flow needs the earliest month with *either* income or expense activity
  // (no `direction` filter), matching what "cash flow" conceptually spans.
  const trendStart = period.start ?? (await getEarliestTransactionDate(userId))

  const monthlyTrend = trendStart
    ? await Promise.all(
        enumerateMonthKeys(trendStart, period.end).map(async (monthKey) => {
          const { start } = resolveMonthKeyRange(monthKey)
          const summary = await getMonthlySummary(userId, start)
          return {
            month: monthKey,
            income: summary.income,
            expenses: summary.expenses,
            cashFlow: summary.cashFlow,
            savingsRate: summary.savingsRate,
          }
        }),
      )
    : []

  let running = 0
  const cumulativeCashFlow = monthlyTrend.map((month) => {
    running += month.cashFlow
    return running
  })

  const ratedMonths = monthlyTrend.filter((month) => month.savingsRate !== null)
  const averageSavingsRate =
    ratedMonths.length === 0
      ? null
      : ratedMonths.reduce((sum, month) => sum + (month.savingsRate as number), 0) /
        ratedMonths.length

  return { monthlyTrend, cumulativeCashFlow, averageSavingsRate }
}
