import Link from "next/link"
import { redirect } from "next/navigation"
import { Wallet } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
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
import {
  getMostRecentSummary,
  getSummaryHistory,
} from "@/features/dashboard/server/monthly-summary"
import { getFinancialHealthScore } from "@/features/financial-health-score/server/service"
import { getDashboardCardPreferences } from "@/features/settings/server/service"
import { buildDashboardCardGroups } from "./_lib/dashboard-card-groups"

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
 * `getBudgetHealthScore` and `getFinancialHealthScore` are deliberately two
 * independent, unchained entries in the same `Promise.all` batch (each a
 * plain sibling call, `getFinancialHealthScore`'s Budget Adherence component
 * re-fetching Budget Health Score on its own) rather than one sharing a
 * single fetch — see docs/testing/bug-reports/
 * dashboard-shared-budget-health-score-promise-crash-and-latency.md for why
 * an earlier attempt at sharing this fetch was reverted: it let one
 * `getBudgetHealthScore` failure crash this entire batch (no `error.tsx` in
 * this route segment) and didn't reliably deliver the latency win it was
 * built for.
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
 *
 * **Phase 4c addition (docs/product/customization.md, "Dashboard Layout"
 * capability):** which of the cards below actually render, and in what
 * order, is no longer this file's own fixed decision — it is resolved per
 * user via Settings' `getDashboardCardPreferences` (a plain, database-free
 * read, so it joins the same independent `Promise.all` batch as everything
 * else above) and applied by the render step at the bottom of this
 * function. Every card's own data-fetching/computation above is completely
 * unaffected by this — hiding a card only ever changes whether its already-
 * computed JSX gets mounted, never what was computed (customization.md's
 * "hiding is a display preference, never a deletion" AC1).
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
    mostRecentMonthlyRecap,
    monthlyRecapHistory,
    financialHealthScore,
    cardPreferences,
  ] = await Promise.all([
    getNetWorth(user.id),
    getMonthlySummary(user.id, new Date()),
    getSpendingByCategory(user.id, new Date()),
    getMonthlyTrends(user.id, 6),
    getBudgetMonthSummary(user.id, currentMonth),
    getBudgetHealthScore(user.id, currentMonth),
    resolveDefaultRange(user.id),
    // (Phase 4a) Automatic Monthly Summaries (ai-features.md Feature 3): the
    // most recent completed month's recap plus its full history, both plain
    // row reads (never an AI call on this path — see
    // `monthly-summary.ts`'s own "persisted, never regenerated on view"
    // note), so they join this same independent Promise.all batch.
    getMostRecentSummary(user.id),
    getSummaryHistory(user.id),
    // (Phase 4a) Financial Health Score (ai-features.md Feature 5): zero AI
    // dependency, a plain deterministic read — called directly from this
    // feature's own service, not via a `dashboard.service` pass-through, per
    // that service's own documented circular-import avoidance (see
    // `app/(dashboard)/financial-health-score/page.tsx`'s identical note).
    //
    // Bugfix: docs/testing/bug-reports/
    // dashboard-shared-budget-health-score-promise-crash-and-latency.md — this
    // used to be chained behind a `budgetHealthScorePromise` shared with the
    // `getBudgetHealthScore` entry above (so `getFinancialHealthScore`'s
    // internal Budget Adherence component could reuse that one fetch instead
    // of independently re-querying it). That sharing meant a single
    // `getBudgetHealthScore` rejection (it has no internal try/catch, by
    // design) took down this entire `Promise.all` — every other Dashboard
    // card along with it — since there's no `error.tsx` in this route
    // segment to contain it; it also serialized this function's other three
    // component gathers behind `getBudgetHealthScore` via `.then()`,
    // contradicting the "load time unaffected" rationale that justified the
    // sharing (see that service's `precomputedBudgetHealthScore` param's own
    // doc comment for the accepted trade-off going forward). Reverted to a
    // plain, unchained sibling call: `getFinancialHealthScore`'s Budget
    // Adherence component independently re-fetches Budget Health Score
    // again, restoring this codebase's own stated principle that "every
    // metric degrades independently... one failing metric never blanks out
    // the others."
    getFinancialHealthScore(user.id, new Date()),
    // (Phase 4c) Settings' fully-resolved show/hide/order state for every
    // canonical Dashboard card (`DASHBOARD_CARD_KEYS`) — see this page's
    // module doc above. A Server-Component-direct-call read, same contract
    // as every other entry in this batch.
    getDashboardCardPreferences(user.id),
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
  // for real data. Deliberately rendered before any card-visibility
  // resolution below — this empty state isn't itself a customizable card,
  // it's what replaces the entire customizable set when there's nothing yet
  // for any of them to show.
  const hasAccounts = netWorth.byAccount.length > 0

  // Phase 4c: resolves which cards render, in what order, and how the
  // visible ones lay out (grid tiles vs. full-width rows) — see
  // `./_lib/dashboard-card-groups.tsx` for the key -> JSX registry and
  // grouping algorithm this delegates to. Every card's own data above is
  // completely unaffected by this call; it only ever decides which
  // already-computed JSX gets mounted, and in what arrangement
  // (customization.md's "hiding is a display preference, never a deletion"
  // AC1). Trusted precondition, not re-validated here: `cardGroups` is
  // guaranteed non-empty whenever `hasAccounts` is true, since
  // `updateDashboardCardVisibility` (`features/settings/server/actions.ts`)
  // already enforces "at least one card must remain visible at all times"
  // (AC3) server-side before a hide can ever persist — this page has no
  // defensive "what if zero cards are visible" branch, since that would
  // reproduce a guarantee the backend already owns rather than add real
  // safety.
  const cardGroups = buildDashboardCardGroups(
    {
      netWorth,
      monthlySummary,
      spendingByCategory,
      monthlyTrends,
      budgetSummary,
      budgetHealthScore,
      financialHealthScore,
      netWorthHistoryRange: defaultRangeResolution.defaultRange,
      netWorthHistory,
      mostRecentMonthlyRecap,
      monthlyRecapHistory,
    },
    cardPreferences,
  )

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
        cardGroups.map((group, index) =>
          group.kind === "stat" ? (
            <div
              key={`stat-group-${index}`}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            >
              {group.entries.map((entry) => (
                <div key={entry.key}>{entry.render()}</div>
              ))}
            </div>
          ) : (
            group.entries.map((entry) => (
              <div key={entry.key}>{entry.render()}</div>
            ))
          ),
        )
      )}
    </div>
  )
}
