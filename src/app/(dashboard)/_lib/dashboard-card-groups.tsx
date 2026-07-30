import type { ReactNode } from "react"

import { formatCurrency } from "@/lib/utils"
import { StatCard } from "@/components/shared/stat-card"
import {
  ArrowLeftRight,
  PiggyBank,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { BudgetHealthScoreBadge } from "@/features/budgeting/components/budget-health-score-badge"
import { IncomeVsExpenseChart } from "@/features/dashboard/components/income-vs-expense-chart"
import { MonthlyTrendsChart } from "@/features/dashboard/components/monthly-trends-chart"
import { NetWorthHistoryChart } from "@/features/dashboard/components/net-worth-history-chart"
import { SpendingByCategoryChart } from "@/features/dashboard/components/spending-by-category-chart"
import { MonthlySummaryCard } from "@/features/dashboard/components/monthly-summary-card"
import { FinancialHealthScoreBadge } from "@/features/financial-health-score/components/financial-health-score-badge"
import type { DashboardCardView } from "@/features/settings/types"
import type {
  getMonthlySummary,
  getMonthlyTrends,
  getNetWorth,
  getSpendingByCategory,
} from "@/features/dashboard/server/service"
import type {
  getNetWorthHistory,
  resolveDefaultRange,
} from "@/features/dashboard/server/net-worth-history"
import type {
  getBudgetHealthScore,
  getBudgetMonthSummary,
} from "@/features/budgeting/server/service"
import type {
  getMostRecentSummary,
  getSummaryHistory,
} from "@/features/dashboard/server/monthly-summary"
import type { getFinancialHealthScore } from "@/features/financial-health-score/server/service"

/**
 * Dashboard card key -> JSX registry + show/hide/order resolution, per
 * `app/(dashboard)/page.tsx`'s Phase 4c module doc
 * (docs/product/customization.md, "Dashboard Layout" capability).
 *
 * Split out of `page.tsx` itself into this route-private `_lib` module
 * (Next.js ignores any path segment prefixed with `_` for routing purposes)
 * purely to keep `page.tsx` focused on data-fetching/page shell and this
 * file focused on "which card key renders what, and how the visible ones
 * lay out" — a single-responsibility split, not a reusable/shared
 * component (nothing here is meant to be imported outside this one route).
 *
 * Every card's own data-fetching/computation still happens in `page.tsx`
 * (unchanged from before this feature) — this module only ever receives
 * already-resolved data via `DashboardCardData` and arranges it into JSX;
 * it performs no fetching, calculation, or mutation of its own.
 */

/**
 * Every already-resolved value a card's render function might need — the
 * exact same values `page.tsx`'s own `Promise.all` batch already produced
 * before this feature existed. Kept as one bag rather than N separate
 * function parameters so adding a future card's data dependency here never
 * requires touching every existing card's own registry entry.
 *
 * Each field's type is derived directly from its own source service
 * function (`Awaited<ReturnType<typeof ...>>`) rather than hand-copied from
 * that service's own exported interfaces — this guarantees the shape here
 * can never silently drift out of sync with what `page.tsx` actually passes
 * in, without this file needing to know or care about each service's
 * internal type names.
 */
export interface DashboardCardData {
  netWorth: Awaited<ReturnType<typeof getNetWorth>>
  monthlySummary: Awaited<ReturnType<typeof getMonthlySummary>>
  spendingByCategory: Awaited<ReturnType<typeof getSpendingByCategory>>
  monthlyTrends: Awaited<ReturnType<typeof getMonthlyTrends>>
  budgetSummary: Awaited<ReturnType<typeof getBudgetMonthSummary>>
  budgetHealthScore: Awaited<ReturnType<typeof getBudgetHealthScore>>
  financialHealthScore: Awaited<ReturnType<typeof getFinancialHealthScore>>
  netWorthHistoryRange: Awaited<ReturnType<typeof resolveDefaultRange>>["defaultRange"]
  netWorthHistory: Awaited<ReturnType<typeof getNetWorthHistory>>
  mostRecentMonthlyRecap: Awaited<ReturnType<typeof getMostRecentSummary>>
  monthlyRecapHistory: Awaited<ReturnType<typeof getSummaryHistory>>
}

/**
 * How a card lays out, not whether/where it renders (that's `visible`/
 * `order` from `cardPreferences`, resolved entirely below). "stat" cards
 * are small metric tiles that pack into a responsive grid; "wide" cards
 * (the charts, Net Worth History, Monthly Summary) each take a full-width
 * row on their own — the same two shapes `page.tsx` rendered before this
 * feature existed, just now driven by a loop instead of hardcoded JSX.
 */
type DashboardCardKind = "stat" | "wide"

interface DashboardCardRenderEntry {
  key: string
  kind: DashboardCardKind
  render: () => ReactNode
}

export interface DashboardCardGroup {
  kind: DashboardCardKind
  entries: { key: string; render: () => ReactNode }[]
}

/**
 * Builds the key -> JSX registry. Each entry's `key` must match one of
 * `DASHBOARD_CARD_KEYS` (`features/dashboard/dashboard-cards.ts`) exactly —
 * that file remains the canonical source of truth for which cards exist;
 * this function only supplies each key's actual render output and layout
 * kind. Every render body below is the exact, unmodified JSX `page.tsx`
 * rendered inline before this feature existed — only *where* each block
 * lives changed, not what it computes or renders.
 */
function buildCardRenderers(data: DashboardCardData): DashboardCardRenderEntry[] {
  return [
    {
      key: "net-worth",
      kind: "stat",
      render: () => (
        <StatCard
          label="Net Worth"
          value={formatCurrency(data.netWorth.total)}
          icon={Wallet}
        />
      ),
    },
    {
      key: "monthly-income",
      kind: "stat",
      render: () => (
        <StatCard
          label="Monthly Income"
          value={formatCurrency(data.monthlySummary.income)}
          icon={TrendingUp}
        />
      ),
    },
    {
      key: "monthly-expenses",
      kind: "stat",
      render: () => (
        <StatCard
          label="Monthly Expenses"
          value={formatCurrency(data.monthlySummary.expenses)}
          icon={TrendingDown}
        />
      ),
    },
    {
      key: "remaining-budget",
      kind: "stat",
      // Budgeting (Phase 2): AC11 — shows Total Remaining for the current
      // month once the user has at least one category allocation set;
      // `getBudgetMonthSummary` returns `null` under the exact "zero
      // allocations set" condition the Phase 1 placeholder covered, so that
      // empty state is preserved rather than replaced with a misleading $0.
      render: () => (
        <StatCard
          label="Remaining Budget"
          value={
            data.budgetSummary === null
              ? "No budget set yet"
              : formatCurrency(data.budgetSummary.totalRemaining)
          }
          icon={Target}
        />
      ),
    },
    {
      key: "cash-flow",
      kind: "stat",
      render: () => (
        <StatCard
          label="Cash Flow"
          value={formatCurrency(data.monthlySummary.cashFlow)}
          icon={ArrowLeftRight}
        />
      ),
    },
    {
      key: "savings-rate",
      kind: "stat",
      render: () => (
        <StatCard
          label="Savings Rate"
          // `savingsRate` is `null` (not `0`) when income was $0 for the
          // period — dashboard-overview.md AC6 requires an explicit "not
          // enough data" state here rather than a misleading "0%", a NaN,
          // or a thrown divide-by-zero. See
          // features/dashboard/types.ts's `MonthlySummary.savingsRate`
          // JSDoc for why the service returns `null` for this case.
          value={
            data.monthlySummary.savingsRate === null
              ? "Not enough data"
              : `${(data.monthlySummary.savingsRate * 100).toFixed(1)}%`
          }
          icon={PiggyBank}
        />
      ),
    },
    {
      key: "budget-health-score",
      kind: "stat",
      // AC12: Budget Health Score goes live alongside Remaining Budget —
      // `BudgetHealthScoreBadge` already renders its own "Not enough data
      // yet" state for the `null` case (same "zero allocations set"
      // condition as the card above), so no extra branching is needed here.
      render: () => <BudgetHealthScoreBadge score={data.budgetHealthScore} />,
    },
    {
      key: "financial-health-score",
      kind: "stat",
      // (Phase 4a) Feature 5 AC8: "surfaced on the Dashboard (a summary
      // card)" — `FinancialHealthScoreBadge` already renders its own "Not
      // enough data yet" state for the null-score case (same
      // zero-computable-components condition as the Budget Health Score
      // card above), so no extra branching is needed here.
      render: () => (
        <FinancialHealthScoreBadge breakdown={data.financialHealthScore} />
      ),
    },
    {
      key: "spending-by-category-chart",
      kind: "wide",
      render: () => <SpendingByCategoryChart data={data.spendingByCategory} />,
    },
    {
      key: "income-vs-expense-chart",
      kind: "wide",
      render: () => (
        <IncomeVsExpenseChart
          income={data.monthlySummary.income}
          expenses={data.monthlySummary.expenses}
        />
      ),
    },
    {
      key: "monthly-trends-chart",
      kind: "wide",
      render: () => <MonthlyTrendsChart data={data.monthlyTrends} />,
    },
    {
      key: "net-worth-history-chart",
      kind: "wide",
      // Phase 3b: net-worth-history.md's companion chart to the Net Worth
      // stat card above — see `page.tsx`'s module doc for how its initial
      // range/data are resolved.
      render: () => (
        <NetWorthHistoryChart
          initialRange={data.netWorthHistoryRange}
          initialData={data.netWorthHistory}
        />
      ),
    },
    {
      key: "monthly-summary",
      kind: "wide",
      // (Phase 4a) Feature 3 AC4: "the most recently completed month's
      // summary is surfaced on the Dashboard as its own card."
      render: () => (
        <MonthlySummaryCard
          summary={data.mostRecentMonthlyRecap}
          history={data.monthlyRecapHistory}
        />
      ),
    },
  ]
}

/**
 * Resolves `cardPreferences` (`getDashboardCardPreferences`'s already
 * visibility/order-resolved output — every canonical key, exactly once,
 * sorted) into the ordered groups `page.tsx` renders.
 *
 * Consecutive "stat" cards in the resolved order are grouped into one grid
 * row together (so the default order still renders as a single tidy row of
 * tiles); a "wide" card breaks that grouping and starts its own row, after
 * which a later "stat" card starts a *new* grid group. This keeps arbitrary
 * reordering (customization.md AC2 — "any sequence") visually coherent
 * without forcing every card onto its own full-width row. The original,
 * pre-4c layout also paired the Spending by Category and Income vs. Expense
 * charts side by side in a two-column grid; that fixed pairing is
 * intentionally not preserved here, since a fixed pairing becomes
 * incoherent the moment a user reorders or hides just one of the two —
 * every "wide" card now renders as its own full-width row, the only layout
 * that stays correct under any order/visibility combination.
 *
 * Trusted precondition, not re-validated here: `updateDashboardCardVisibility`
 * (`features/settings/server/actions.ts`) already enforces "at least one
 * card must remain visible at all times" (customization.md AC3) server-side
 * before a hide can ever persist, so the returned groups are guaranteed
 * non-empty whenever `cardPreferences` reflects at least one account's
 * worth of real data upstream. This function intentionally has no
 * defensive "what if zero cards are visible" branch — that would be
 * reproducing a guarantee the backend already owns, not adding real safety.
 */
export function buildDashboardCardGroups(
  data: DashboardCardData,
  cardPreferences: DashboardCardView[],
): DashboardCardGroup[] {
  const rendererByKey = new Map(
    buildCardRenderers(data).map((entry) => [entry.key, entry] as const),
  )

  // `cardPreferences` already covers every canonical key exactly once. The
  // `.filter` below is defensive only — a key present in `DASHBOARD_CARD_KEYS`
  // but missing a matching entry in `buildCardRenderers` above would mean
  // this file's registry has drifted out of sync with
  // `features/dashboard/dashboard-cards.ts`, a bug to fix here, not a state
  // this function needs to degrade gracefully around.
  const visibleOrderedCards = cardPreferences
    .filter((preference) => preference.visible)
    .map((preference) => rendererByKey.get(preference.key))
    .filter((entry): entry is DashboardCardRenderEntry => entry !== undefined)

  const groups: DashboardCardGroup[] = []
  for (const entry of visibleOrderedCards) {
    const currentGroup = groups[groups.length - 1]
    if (currentGroup && currentGroup.kind === entry.kind) {
      currentGroup.entries.push({ key: entry.key, render: entry.render })
    } else {
      groups.push({ kind: entry.kind, entries: [{ key: entry.key, render: entry.render }] })
    }
  }

  return groups
}
