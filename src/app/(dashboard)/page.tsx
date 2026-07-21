import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowLeftRight,
  PiggyBank,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { StatCard } from "@/components/shared/stat-card"
import { currentMonthString } from "@/components/shared/month-utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getMonthlySummary,
  getMonthlyTrends,
  getNetWorth,
  getSpendingByCategory,
} from "@/features/dashboard/server/service"
import {
  getNetWorthHistory,
  resolveDefaultRange,
} from "@/features/dashboard/server/net-worth-history"
import {
  getBudgetHealthScore,
  getBudgetMonthSummary,
} from "@/features/budgeting/server/service"
import { BudgetHealthScoreBadge } from "@/features/budgeting/components/budget-health-score-badge"
import { IncomeVsExpenseChart } from "@/features/dashboard/components/income-vs-expense-chart"
import { MonthlyTrendsChart } from "@/features/dashboard/components/monthly-trends-chart"
import { NetWorthHistoryChart } from "@/features/dashboard/components/net-worth-history-chart"
import { SpendingByCategoryChart } from "@/features/dashboard/components/spending-by-category-chart"

/**
 * Dashboard Overview — Phase 1 (docs/product/dashboard-overview.md).
 *
 * Server Component: resolves the authenticated user, then fetches every
 * Dashboard aggregate in parallel via `features/dashboard/server/service.ts`
 * (a Server-Component-callable service, not Server Actions/API routes per
 * that module's own docs — so there is nothing here for TanStack Query to
 * wire up; the whole page's data is resolved before the first render). The
 * four service calls are independent of each other, so they're issued
 * together with `Promise.all` rather than sequential `await`s, keeping
 * total latency to the slowest single query instead of their sum.
 *
 * This page owns no calculation logic of its own — Net Worth, month-to-date
 * Income/Expenses/Cash Flow/Savings Rate, category breakdown, and monthly
 * trends are all computed by the (already-reviewed) service. This file's
 * only job is arranging those already-correct numbers into the stat
 * cards/charts dashboard-overview.md's acceptance criteria describe.
 *
 * Also fetches the current month's `getBudgetMonthSummary`/
 * `getBudgetHealthScore` from Budgeting's own service (AC11/AC12 of
 * docs/product/budgeting.md) — the two pieces of this page that shipped as
 * intentional Phase 1 placeholders specifically because Budgeting didn't
 * exist yet. Both are `Server-Component-callable reads (same "no REST
 * route/TanStack Query hook" contract `budgeting/page.tsx` relies on), so
 * they join the existing `Promise.all` batch below rather than needing a
 * separate fetch waterfall.
 *
 * **Phase 3b addition (docs/product/net-worth-history.md):** the Net Worth
 * History chart's *initial* range/data are resolved here too, via
 * `resolveDefaultRange` (AC3) then `getNetWorthHistory` for that resolved
 * range — the one dependent fetch in this file (the range has to be known
 * before the history for it can be requested), so it's issued as a second
 * `await` after the independent `Promise.all` batch below rather than inside
 * it. Every range change *after* this initial render is handled entirely
 * client-side by `NetWorthHistoryChart` itself (TanStack Query, via
 * `features/dashboard/hooks/use-net-worth-history.ts`) — this page never
 * re-renders for a range switch.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors to /login before any route under this segment
  // renders. Repeating the check here costs nothing and keeps this page
  // safe to reason about in isolation (e.g. under future test coverage)
  // without relying on the layout always being the only caller.
  if (!user) {
    redirect("/login")
  }

  const currentMonth = currentMonthString()

  const [
    netWorth,
    monthlySummary,
    spendingByCategory,
    monthlyTrends,
    budgetSummary,
    budgetHealthScore,
    defaultRangeResolution,
  ] = await Promise.all([
    getNetWorth(user.id),
    getMonthlySummary(user.id, new Date()),
    getSpendingByCategory(user.id, new Date()),
    getMonthlyTrends(user.id, 6),
    getBudgetMonthSummary(user.id, currentMonth),
    getBudgetHealthScore(user.id, currentMonth),
    resolveDefaultRange(user.id),
  ])

  // Dependent on `defaultRangeResolution` above, so it can't join the
  // `Promise.all` batch — everything independent of the chosen range is
  // still fetched in parallel with it, keeping this to exactly one extra
  // sequential round-trip rather than the whole page waiting on it twice.
  const netWorthHistory = await getNetWorthHistory(
    user.id,
    defaultRangeResolution.defaultRange,
  )

  // dashboard-overview.md's "brand-new user, zero accounts" edge case: every
  // number below (income, expenses, cash flow, savings rate, all three
  // charts) is meaningless with zero accounts, so this renders a single
  // encouraging prompt instead of a grid of zeroes that could be mistaken
  // for real data.
  const hasAccounts = netWorth.byAccount.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your financial overview, built from your own accounts and
          transactions.
        </p>
      </div>

      {!hasAccounts ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-10 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">
                Connect your first account
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add a checking, savings, credit card, or investment account
                to see your net worth, spending, and trends here.
              </p>
            </div>
            <Button asChild>
              <Link href="/accounts">Add an account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Net Worth"
              value={formatCurrency(netWorth.total)}
              icon={Wallet}
            />
            <StatCard
              label="Monthly Income"
              value={formatCurrency(monthlySummary.income)}
              icon={TrendingUp}
            />
            <StatCard
              label="Monthly Expenses"
              value={formatCurrency(monthlySummary.expenses)}
              icon={TrendingDown}
            />
            {/* Budgeting (Phase 2) is now live — AC11: shows Total
                Remaining for the current month once the user has at least
                one category allocation set; `getBudgetMonthSummary` returns
                `null` under the exact same "zero allocations set" condition
                the Phase 1 placeholder covered, so that empty state is
                preserved rather than replaced with a misleading $0. */}
            <StatCard
              label="Remaining Budget"
              value={
                budgetSummary === null
                  ? "No budget set yet"
                  : formatCurrency(budgetSummary.totalRemaining)
              }
              icon={Target}
            />
            <StatCard
              label="Cash Flow"
              value={formatCurrency(monthlySummary.cashFlow)}
              icon={ArrowLeftRight}
            />
            <StatCard
              label="Savings Rate"
              // `savingsRate` is `null` (not `0`) when income was $0 for the
              // period — dashboard-overview.md AC6 requires an explicit
              // "not enough data" state here rather than a misleading "0%",
              // a NaN, or a thrown divide-by-zero. See
              // features/dashboard/types.ts's `MonthlySummary.savingsRate`
              // JSDoc for why the service returns `null` for this case.
              value={
                monthlySummary.savingsRate === null
                  ? "Not enough data"
                  : `${(monthlySummary.savingsRate * 100).toFixed(1)}%`
              }
              icon={PiggyBank}
            />
            {/* AC12: Budget Health Score goes live alongside Remaining
                Budget — `BudgetHealthScoreBadge` already renders its own
                "Not enough data yet" state for the `null` case (same
                "zero allocations set" condition as the card above), so no
                extra branching is needed here. */}
            <BudgetHealthScoreBadge score={budgetHealthScore} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SpendingByCategoryChart data={spendingByCategory} />
            <IncomeVsExpenseChart
              income={monthlySummary.income}
              expenses={monthlySummary.expenses}
            />
          </div>

          <MonthlyTrendsChart data={monthlyTrends} />

          {/* Phase 3b: net-worth-history.md's companion chart to the Net
              Worth stat card above — see this page's module doc for how its
              initial range/data are resolved. */}
          <NetWorthHistoryChart
            initialRange={defaultRangeResolution.defaultRange}
            initialData={netWorthHistory}
          />
        </>
      )}
    </div>
  )
}
