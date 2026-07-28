import { getExpenseDistribution } from "@/features/analytics/server/expense-breakdown"
import { getIncomeSources } from "@/features/analytics/server/income-analytics"
import { getDividendIncomeForPeriod, getPortfolioOverview } from "@/features/investments/server/service"

import type { TaxSummaryReportData } from "../../types"
import { assertConcretePeriodStart, type ResolvedPeriod } from "../period"

/**
 * Tax Summary Report (reports.md §3) — deliberately narrower than the
 * Yearly Report: reference income/expense totals plus dividend income and a
 * lifetime cumulative gain/loss figure, explicitly labeled "cumulative since
 * acquisition" per reports.md's own framing (this product tracks no
 * tax-lot/realized-gain detail — see `../../types.ts`'s
 * `TaxSummaryReportData` doc). The disclaimer text itself is a fixed,
 * always-rendered PDF concern (`pdf/document-shell.tsx`'s disclaimer-banner
 * slot), not report data — reports.md: "the disclaimer is always present ...
 * never conditionally hidden."
 */
export async function assembleTaxSummaryReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<TaxSummaryReportData, "type" | "period" | "generatedAt">> {
  const yearStart = assertConcretePeriodStart(period)

  const [incomeBySource, expenseByCategory, dividendIncome, portfolioOverview] = await Promise.all([
    getIncomeSources(userId, period),
    getExpenseDistribution(userId, period),
    getDividendIncomeForPeriod(userId, { start: yearStart, end: period.end }),
    getPortfolioOverview(userId),
  ])

  const hasInvestments = portfolioOverview.byContainer.length > 0

  return {
    incomeBySource,
    expenseByCategory,
    investments: hasInvestments
      ? { dividendIncome, cumulativeGainLoss: portfolioOverview.totalGainLoss }
      : null,
  }
}
