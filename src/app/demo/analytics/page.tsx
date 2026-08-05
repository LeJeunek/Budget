import { YearlySpendingChart } from "@/features/analytics/components/yearly-spending-chart"
import { CategoryTrendsChart } from "@/features/analytics/components/category-trends-chart"
import { ExpenseDistributionChart } from "@/features/analytics/components/expense-distribution-chart"
import { DailySpendingHeatmap } from "@/features/analytics/components/spending-heatmap"
import { IncomeGrowthChart } from "@/features/analytics/components/income-growth-chart"
import { IncomeSourcesChart } from "@/features/analytics/components/income-sources-chart"
import { SavingsGrowthChart } from "@/features/analytics/components/savings-growth-chart"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import {
  deriveYearlySpending,
  deriveCategoryTrends,
  deriveExpenseDistribution,
  deriveIncomeGrowth,
  deriveIncomeSources,
  deriveSavingsGrowth,
  deriveDailySpendingHeatmap,
} from "@/features/demo/fixtures/derive/analytics-metrics"

/**
 * `/demo/analytics` — the demo equivalent of `app/(dashboard)/analytics/
 * page.tsx`, per docs/architecture/public-demo-technical-design.md §3.2's
 * Analytics row.
 *
 * Only the seven chart components `derive/analytics-metrics.ts`'s own module
 * doc names are reused (`YearlySpendingChart`, `CategoryTrendsChart`,
 * `ExpenseDistributionChart`, `IncomeGrowthChart`, `IncomeSourcesChart`,
 * `SavingsGrowthChart`, `DailySpendingHeatmap`) — every metric computed once
 * over this fixture's entire transaction history, never per a period
 * selector (the real `ReportingPeriodSelector` reads `?period=` via
 * `features/analytics/server/validation`/`period.ts`, both blocked by
 * `no-restricted-imports`, so it is omitted entirely rather than rebuilt
 * inert). Top Merchants, Largest Purchases, Budget vs. Actual, Subscription
 * Cost Detection, and the AI Spending Insights widget are all deliberately
 * omitted (design doc §3.2/§3.5 — no demo derive function computes their
 * data, and Spending Insights is AI-generated).
 */
export default function DemoAnalyticsPage() {
  const household = getDemoHousehold()
  const { transactions, holdings, now } = household

  const yearlySpending = deriveYearlySpending(transactions, now)
  const categoryTrends = deriveCategoryTrends(transactions, now)
  const expenseDistribution = deriveExpenseDistribution(transactions)
  const dailyHeatmap = deriveDailySpendingHeatmap(transactions, now)
  const incomeGrowth = deriveIncomeGrowth(transactions, now)
  const incomeSources = deriveIncomeSources(incomeGrowth)
  const savingsGrowth = deriveSavingsGrowth(transactions, holdings, now)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Spending patterns, income trends, and savings growth for this
          fictional household — across time, not just this month.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <YearlySpendingChart data={yearlySpending} />
        <ExpenseDistributionChart data={expenseDistribution} />
      </div>

      <CategoryTrendsChart data={categoryTrends} />

      <DailySpendingHeatmap data={dailyHeatmap} currency="USD" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <IncomeGrowthChart data={incomeGrowth} />
        <IncomeSourcesChart data={incomeSources} />
      </div>

      <SavingsGrowthChart data={savingsGrowth} />
    </div>
  )
}
