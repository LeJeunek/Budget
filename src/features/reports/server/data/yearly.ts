import { getBudgetMonth } from "@/features/budgeting/server/service"
import { getLargestPurchases, getTopMerchants } from "@/features/analytics/server/expense-breakdown"
import { getCategoryTrends } from "@/features/analytics/server/spending-trends"
import { reshapeBudgetMonthView } from "@/features/analytics/server/budget-comparison"
import { enumerateMonthKeys, resolveMonthKeyRange } from "@/features/analytics/server/period"
import { getMonthlySummary } from "@/features/dashboard/server/service"
import { getNetWorthAsOf } from "@/features/dashboard/server/net-worth-history"
import { getDebts } from "@/features/debt/server/service"
import {
  getAllocation,
  getDividendIncomeForPeriod,
  getGainLossForPeriod,
  getPortfolioOverview,
} from "@/features/investments/server/service"
import { getIncomeStreams, getStreamById } from "@/features/recurring-income/server/service"

import type { ReportIncomeStreamActivity, ReportNetWorthChange, YearlyReportData } from "../../types"
import { assertConcretePeriodStart, type ResolvedPeriod } from "../period"

/**
 * Yearly Report (reports.md §2) — the most data-source-heavy of the six
 * report types (per phase-4b-technical-design.md §3's data-source map), but
 * still pure assembly: every figure below is composed from an already-
 * existing Dashboard/Analytics/Debt/Investments/Recurring-Income read, never
 * recomputed.
 */

/** Builds `ReportIncomeStreamActivity` for one active stream, scoped to
 * `[start, end]` — a bounded loop over the user's own stream count (per
 * phase-4b-technical-design.md §3: "no new function required"), reusing
 * `recurring-income.service.getStreamById`'s existing occurrence/event
 * history rather than a new query. */
async function buildStreamActivity(
  userId: string,
  streamId: string,
  streamName: string,
  type: string,
  start: Date,
  end: Date,
): Promise<ReportIncomeStreamActivity> {
  const detail = await getStreamById(userId, streamId)

  const inRange = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  let occurrenceCount = 0
  let receivedCount = 0
  let receivedTotal = 0

  if (detail && "occurrences" in detail) {
    for (const occurrence of detail.occurrences) {
      if (!inRange(occurrence.expectedDate)) continue
      occurrenceCount += 1
      if (occurrence.status === "RECEIVED" && occurrence.receivedAmount !== null) {
        receivedCount += 1
        receivedTotal += occurrence.receivedAmount
      }
    }
  } else if (detail && "events" in detail) {
    for (const event of detail.events) {
      if (!inRange(event.date)) continue
      // Every logged Irregular event is, by construction, already-received
      // activity (recurring-income.md AC11) — never a forward-looking
      // expectation.
      occurrenceCount += 1
      receivedCount += 1
      receivedTotal += event.amount
    }
  }

  return { streamId, streamName, type, occurrenceCount, receivedCount, receivedTotal }
}

function buildNetWorthChange(
  start: { date: string; netWorth: number } | null,
  end: { date: string; netWorth: number } | null,
): ReportNetWorthChange {
  return { start, end, change: start && end ? end.netWorth - start.netWorth : null }
}

/**
 * Assembles the Yearly Report's content for `period` — always a single
 * calendar year (`server/period.ts`'s `resolveYearlyReportPeriod`).
 */
export async function assembleYearlyReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<YearlyReportData, "type" | "period" | "generatedAt" | "currency">> {
  const yearStart = assertConcretePeriodStart(period)
  const monthKeys = enumerateMonthKeys(yearStart, period.end)

  const [
    monthlySummaries,
    netWorthStart,
    netWorthEnd,
    categoryTrends,
    topMerchants,
    largestPurchases,
    budgetMonths,
    debts,
    portfolioOverview,
    gainLossForYear,
    dividendIncome,
    allocation,
    incomeStreams,
  ] = await Promise.all([
    Promise.all(
      monthKeys.map(async (monthKey) => {
        const { start } = resolveMonthKeyRange(monthKey)
        const summary = await getMonthlySummary(userId, start)
        return { month: monthKey, ...summary }
      }),
    ),
    getNetWorthAsOf(userId, yearStart),
    getNetWorthAsOf(userId, period.end),
    getCategoryTrends(userId, period),
    getTopMerchants(userId, { period }),
    getLargestPurchases(userId, { period }),
    Promise.all(
      monthKeys.map(async (monthKey) => {
        const view = await getBudgetMonth(userId, monthKey)
        return view.hasAnyBudgetData ? reshapeBudgetMonthView(monthKey, view) : null
      }),
    ),
    getDebts(userId),
    getPortfolioOverview(userId),
    getGainLossForPeriod(userId, { start: yearStart, end: period.end }),
    getDividendIncomeForPeriod(userId, { start: yearStart, end: period.end }),
    getAllocation(userId, { by: "assetType" }),
    getIncomeStreams(userId),
  ])

  const annualTotals = monthlySummaries.reduce(
    (acc, month) => ({
      income: acc.income + month.income,
      expenses: acc.expenses + month.expenses,
    }),
    { income: 0, expenses: 0 },
  )
  const cashFlow = annualTotals.income - annualTotals.expenses
  const savingsRate = annualTotals.income === 0 ? null : cashFlow / annualTotals.income

  const streamActivities = await Promise.all(
    incomeStreams.map((stream) =>
      buildStreamActivity(userId, stream.id, stream.name, stream.type, yearStart, period.end),
    ),
  )

  return {
    annualTotals: { ...annualTotals, cashFlow, savingsRate },
    netWorth: buildNetWorthChange(netWorthStart, netWorthEnd),
    monthlyTrend: monthlySummaries.map((month) => ({
      month: month.month,
      income: month.income,
      expenses: month.expenses,
      cashFlow: month.cashFlow,
      savingsRate: month.savingsRate,
    })),
    categoryTrends,
    topMerchants,
    largestPurchases,
    budgetVsActual: budgetMonths.filter((month) => month !== null),
    debts,
    investments: {
      totalCurrentValue: portfolioOverview.totalCurrentValue,
      gainLossForYear,
      dividendIncome,
      allocation,
      hasInvestments: portfolioOverview.byContainer.length > 0,
    },
    recurringIncome: {
      streams: streamActivities,
      hasStreams: incomeStreams.length > 0,
    },
  }
}
