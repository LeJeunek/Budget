import { ArrowLeftRight, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react"

import { StatCard } from "@/components/shared/stat-card"
import { BudgetHealthScoreBadge } from "@/features/budgeting/components/budget-health-score-badge"
import { SpendingByCategoryChart } from "@/features/dashboard/components/spending-by-category-chart"
import { IncomeVsExpenseChart } from "@/features/dashboard/components/income-vs-expense-chart"
import { MonthlyTrendsChart } from "@/features/dashboard/components/monthly-trends-chart"
import { DemoNetWorthHistoryChart } from "@/features/demo/components/demo-net-worth-history-chart"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { relativeMonthStart } from "@/features/demo/fixtures/relative-date"
import { deriveNetWorth } from "@/features/demo/fixtures/derive/net-worth"
import { deriveMonthlySummary } from "@/features/demo/fixtures/derive/monthly-summary"
import { deriveSpendingByCategory } from "@/features/demo/fixtures/derive/spending-by-category"
import { deriveBudgetMonth } from "@/features/demo/fixtures/derive/budget-month"
import { deriveBudgetHealthScore } from "@/features/demo/fixtures/derive/budget-health-score"
import { deriveFinancialHealthScore } from "@/features/demo/fixtures/derive/financial-health-score"
import { deriveNetWorthHistory } from "@/features/demo/fixtures/derive/net-worth-history"
import { DemoAnimatedCurrencyStatValue, DemoAnimatedPercentStatValue } from "./_lib/demo-stat-value"
import { DemoFinancialHealthScoreBadge } from "./_lib/demo-financial-health-score-badge"
import { buildDemoMonthlyTrends } from "./_lib/demo-monthly-trends"

/**
 * `/demo` Dashboard — the demo equivalent of `app/(dashboard)/page.tsx`, per
 * docs/architecture/public-demo-technical-design.md §3.2's Dashboard row.
 *
 * A plain, synchronous Server Component: no `getCurrentUser()`, no
 * `Promise.all` of `server/service.ts` calls. Every figure below comes from
 * a single `getDemoHousehold()` call plus the `derive/*.ts` functions the
 * design doc names for this page — the exact same functions Accounts',
 * Budgeting's, and Analytics' own demo pages call, so this page's numbers
 * can never silently disagree with theirs (public-demo.md Capability 2 AC3).
 *
 * Card set is a fixed, hand-ordered list, not the real page's per-user
 * show/hide/reorder registry (`_lib/dashboard-card-groups.tsx`) — that
 * mechanism is Settings-backed (a per-user `DashboardCardView` read), and
 * `/demo` has no per-visitor preference to resolve (Capability 1 AC3).
 * Budget Advisor, Spending Insights, and the Monthly Summary/Recap card are
 * deliberately omitted (design doc §3.5 — all three are AI-generated
 * narration layers), per the "zero accounts" empty state also never being
 * reachable here (Capability 2 AC4 guarantees the fixture household always
 * has accounts).
 */
export default function DemoDashboardPage() {
  const household = getDemoHousehold()
  const { now, accounts, debts, transactions, categories, budgetAllocations } = household

  const currentMonthStart = relativeMonthStart(0, now)

  const netWorth = deriveNetWorth(accounts, debts)
  const monthlySummary = deriveMonthlySummary(transactions, currentMonthStart, now)
  const spendingByCategory = deriveSpendingByCategory(transactions, currentMonthStart, now)
  const monthlyTrends = buildDemoMonthlyTrends(transactions, now)

  const budgetMonth = deriveBudgetMonth({
    transactions,
    allocations: budgetAllocations,
    categories,
    targetMonth: currentMonthStart,
    now,
  })
  const budgetHealthScore = deriveBudgetHealthScore(budgetMonth)

  const financialHealthScore = deriveFinancialHealthScore({
    now,
    accounts,
    debts,
    transactions,
    budgetHealthScore,
  })

  const netWorthHistory = deriveNetWorthHistory(
    netWorth.total,
    netWorth.totalUnlinkedDebtLiability,
    now,
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          A fictional household&apos;s financial overview — accounts,
          budgeting, debt, and investments, all in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Net Worth"
          value={<DemoAnimatedCurrencyStatValue value={netWorth.total} />}
          icon={Wallet}
        />
        <StatCard
          label="Monthly Income"
          value={<DemoAnimatedCurrencyStatValue value={monthlySummary.income} />}
          icon={TrendingUp}
        />
        <StatCard
          label="Monthly Expenses"
          value={<DemoAnimatedCurrencyStatValue value={monthlySummary.expenses} />}
          icon={TrendingDown}
        />
        <StatCard
          label="Remaining Budget"
          value={<DemoAnimatedCurrencyStatValue value={budgetMonth.totals.totalRemaining} />}
          icon={Target}
        />
        <StatCard
          label="Cash Flow"
          value={<DemoAnimatedCurrencyStatValue value={monthlySummary.cashFlow} />}
          icon={ArrowLeftRight}
        />
        <StatCard
          label="Savings Rate"
          value={
            monthlySummary.savingsRate === null ? (
              "Not enough data"
            ) : (
              <DemoAnimatedPercentStatValue value={monthlySummary.savingsRate * 100} />
            )
          }
          icon={PiggyBank}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BudgetHealthScoreBadge score={budgetHealthScore} />
        <DemoFinancialHealthScoreBadge breakdown={financialHealthScore} />
      </div>

      <SpendingByCategoryChart data={spendingByCategory} />
      <IncomeVsExpenseChart income={monthlySummary.income} expenses={monthlySummary.expenses} />
      <MonthlyTrendsChart data={monthlyTrends} />
      <DemoNetWorthHistoryChart data={netWorthHistory} />
    </div>
  )
}
