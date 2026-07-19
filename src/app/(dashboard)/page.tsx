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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getMonthlySummary,
  getMonthlyTrends,
  getNetWorth,
  getSpendingByCategory,
} from "@/features/dashboard/server/service"
import { IncomeVsExpenseChart } from "@/features/dashboard/components/income-vs-expense-chart"
import { MonthlyTrendsChart } from "@/features/dashboard/components/monthly-trends-chart"
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

  const [netWorth, monthlySummary, spendingByCategory, monthlyTrends] =
    await Promise.all([
      getNetWorth(user.id),
      getMonthlySummary(user.id, new Date()),
      getSpendingByCategory(user.id, new Date()),
      getMonthlyTrends(user.id, 6),
    ])

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
            {/* Phase 2 (Budgeting) placeholder — dashboard-overview.md AC4
                requires this to read as an intentional, forward-looking
                empty state, not a broken/missing card. Do not compute a
                real value here; there is no Budget model yet. */}
            <StatCard
              label="Remaining Budget"
              value="No budget set yet"
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
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SpendingByCategoryChart data={spendingByCategory} />
            <IncomeVsExpenseChart
              income={monthlySummary.income}
              expenses={monthlySummary.expenses}
            />
          </div>

          <MonthlyTrendsChart data={monthlyTrends} />
        </>
      )}
    </div>
  )
}
