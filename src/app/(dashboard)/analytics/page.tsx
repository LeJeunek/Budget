import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { ReportingPeriodSchema } from "@/features/analytics/server/validation"
import { resolveReportingPeriodRange } from "@/features/analytics/server/period"
import { getCategoryTrends, getYearlySpending } from "@/features/analytics/server/spending-trends"
import {
  getExpenseDistribution,
  getLargestPurchases,
  getTopMerchants,
} from "@/features/analytics/server/expense-breakdown"
import { getBudgetVsActual } from "@/features/analytics/server/budget-comparison"
import { getDailySpendingHeatmap } from "@/features/analytics/server/spending-heatmap"
import { getIncomeGrowth, getIncomeSources } from "@/features/analytics/server/income-analytics"
import { getSavingsGrowth } from "@/features/analytics/server/savings-growth"
import {
  getActiveSubscriptionAnnualizedTotal,
  getSubscriptionCandidates,
} from "@/features/analytics/server/subscriptions"

import { ReportingPeriodSelector } from "@/features/analytics/components/reporting-period-selector"
import { YearlySpendingChart } from "@/features/analytics/components/yearly-spending-chart"
import { CategoryTrendsChart } from "@/features/analytics/components/category-trends-chart"
import { ExpenseDistributionChart } from "@/features/analytics/components/expense-distribution-chart"
import { BudgetVsActualTable } from "@/features/analytics/components/budget-vs-actual-table"
import { TopMerchantsList } from "@/features/analytics/components/top-merchants-list"
import { LargestPurchasesList } from "@/features/analytics/components/largest-purchases-list"
import { DailySpendingHeatmap } from "@/features/analytics/components/spending-heatmap"
import { IncomeGrowthChart } from "@/features/analytics/components/income-growth-chart"
import { IncomeSourcesChart } from "@/features/analytics/components/income-sources-chart"
import { SavingsGrowthChart } from "@/features/analytics/components/savings-growth-chart"
import { SubscriptionsList } from "@/features/analytics/components/subscriptions-list"

/**
 * Analytics — replaces the Phase 3 placeholder now that the full Analytics
 * backend (docs/product/analytics.md, docs/architecture/api-contracts.md's
 * Analytics section) exists: eleven metrics, each its own self-contained
 * card/section (AC1), plus the twelfth (Net Worth History) which already
 * lives on the Dashboard per that spec's own note and is intentionally not
 * duplicated here.
 *
 * A Server Component: resolves the authenticated user and the shared
 * reporting-period control (AC2) from the `?period=` search param, then
 * fetches every metric directly via its own `features/analytics/server/*.ts`
 * function in one `Promise.all` — api-contracts.md's Analytics section
 * states every one of these reads is a "Server Component direct call," with
 * no Route Handler/TanStack Query hook anywhere in this feature (unlike the
 * Net Worth History chart's client-side range refetch) — the shared period
 * control is a URL searchParam navigation instead, re-resolved server-side on
 * every request (see `server/period.ts`'s own JSDoc), so changing the period
 * simply re-renders this whole page rather than triggering a client fetch.
 *
 * Next.js 15's `searchParams` page prop is a `Promise` (not a plain object)
 * — must be `await`ed before reading `period` off it, matching
 * `app/(dashboard)/budgeting/page.tsx`'s identical `?month=` pattern.
 *
 * Top Merchants, Largest Purchases, and Subscription Cost Detection all
 * ignore the shared period control by default (api-contracts.md: the first
 * two "default to all-time unless filtered"; Subscription Cost Detection
 * "ignores the shared period control entirely — needs full history"), so
 * their own fetches below take no `range` argument at all — each states its
 * own default plainly in its own card (AC2), per those components' headers.
 *
 * Every metric degrades independently (AC3): each fetch/component pair below
 * renders its own "not enough data yet" state without depending on any other
 * metric's data, so one sparse metric never blanks out the other ten.
 */

export interface AnalyticsPageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const resolvedSearchParams = await searchParams
  const period = ReportingPeriodSchema.parse(resolvedSearchParams.period)
  const range = resolveReportingPeriodRange(period)

  const [
    yearlySpending,
    categoryTrends,
    expenseDistribution,
    budgetVsActual,
    topMerchants,
    largestPurchases,
    dailyHeatmap,
    incomeGrowth,
    incomeSources,
    savingsGrowth,
    subscriptionCandidates,
    subscriptionTotal,
  ] = await Promise.all([
    getYearlySpending(user.id),
    getCategoryTrends(user.id, range),
    getExpenseDistribution(user.id, range),
    getBudgetVsActual(user.id, range),
    getTopMerchants(user.id),
    getLargestPurchases(user.id),
    getDailySpendingHeatmap(user.id, range),
    getIncomeGrowth(user.id, range),
    getIncomeSources(user.id, range),
    getSavingsGrowth(user.id, range),
    getSubscriptionCandidates(user.id),
    getActiveSubscriptionAnnualizedTotal(user.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Spending patterns, income trends, budget discipline, and recurring
            charges — across time, not just this month.
          </p>
        </div>
        <ReportingPeriodSelector period={period} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <YearlySpendingChart data={yearlySpending} />
        <ExpenseDistributionChart data={expenseDistribution} />
      </div>

      <CategoryTrendsChart data={categoryTrends} />

      <BudgetVsActualTable data={budgetVsActual} />

      <DailySpendingHeatmap data={dailyHeatmap} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TopMerchantsList data={topMerchants} />
        <LargestPurchasesList data={largestPurchases} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <IncomeGrowthChart data={incomeGrowth} />
        <IncomeSourcesChart data={incomeSources} />
      </div>

      <SavingsGrowthChart data={savingsGrowth} />

      <SubscriptionsList
        candidates={subscriptionCandidates}
        activeAnnualizedTotal={subscriptionTotal.total}
      />
    </div>
  )
}
