import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import {
  getFinancialHealthScore,
  getLatestNarrative,
} from "@/features/financial-health-score/server/service"
import { getFinancialHealthScoreHistory } from "@/features/financial-health-score/server/snapshot"
import { FinancialHealthScoreBreakdownGrid } from "@/features/financial-health-score/components/financial-health-score-breakdown"
import { FinancialHealthScoreNarrativeCard } from "@/features/financial-health-score/components/financial-health-score-narrative"
import { FinancialHealthScoreHistoryChart } from "@/features/financial-health-score/components/financial-health-score-history-chart"
import { FinancialHealthScoreHeadlineCard } from "@/features/financial-health-score/components/financial-health-score-headline-card"
import type { FinancialHealthScoreComponentKey } from "@/features/financial-health-score/types"

/**
 * Financial Health Score detail view (docs/product/ai-features.md Feature 5
 * AC8: "a dedicated detail view showing the full four-component breakdown,
 * the historical trend, and the narrative").
 *
 * A Server Component: resolves the authenticated user, then fetches the
 * score breakdown (zero AI dependency, per Feature 5's own strongest
 * degradation guarantee), the optional narrative, and the historical
 * sparkline in parallel via `Promise.all` — the three reads are independent
 * of each other. Mirrors `app/(dashboard)/budgeting/page.tsx`'s established
 * Server Component data-fetching shape.
 *
 * `getFinancialHealthScore`/`getFinancialHealthScoreHistory` are called
 * directly from this feature's own `server/service.ts`/`server/snapshot.ts`
 * — not via a `dashboard.service` pass-through — per that service file's own
 * documented reasoning: `dashboard.service.getFinancialHealthScoreCard` was
 * deliberately never implemented to avoid a circular import between
 * `dashboard/server/service.ts` and `financial-health-score/server/service.ts`
 * (see that file's top-of-file comment), so both this page and the Dashboard
 * page call this feature's own service directly, mirroring the Budget Health
 * Score's identical real, working precedent.
 */

const LABEL_STYLES: Record<string, string> = {
  // Accessibility fix (docs/testing/e2e/accessibility-run-report.md's
  // 2026-08-02 re-run, finding #1, axe `color-contrast`): emerald-600 on
  // white measured 3.65:1, below the 4.5:1 floor — emerald-700 clears it.
  // A third, separate copy of this same LABEL_STYLES pattern (this page's
  // own, distinct from FinancialHealthScoreBadge's and
  // BudgetHealthScoreBadge's) needed the identical fix.
  Good: "text-emerald-700 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  // Accessibility fix — see features/financial-health-score/components/
  // financial-health-score-badge.tsx's identical fix/comment.
  "Needs attention": "text-red-700 dark:text-red-400",
}

/** AC4's "clearly annotated ... why" requirement — a short, plain-language
 * hint per component naming what's missing, joined into one sentence when
 * more than one component is undefined. */
const MISSING_COMPONENT_HINTS: Record<FinancialHealthScoreComponentKey, string> = {
  debtToIncome: "income tracking",
  savingsRate: "3 months of income/expense history",
  budgetAdherence: "a budget allocation for this month",
  netWorthTrend: "3 months of net worth history",
}

export default async function FinancialHealthScorePage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const [breakdown, narrative, history] = await Promise.all([
    getFinancialHealthScore(user.id),
    getLatestNarrative(user.id),
    getFinancialHealthScoreHistory(user.id),
  ])

  const missingHints = breakdown.undefinedComponents.map(
    (key) => MISSING_COMPONENT_HINTS[key],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Financial Health Score
        </h1>
        <p className="text-sm text-muted-foreground">
          A single 0-100 view of your overall financial picture, built from
          your debt, savings, budgeting, and net worth.
        </p>
      </div>

      {breakdown.score === null || breakdown.label === null ? (
        // AC4/Edge Cases: zero computable components (a brand-new user) —
        // an explicit "not enough data yet" empty state, never a misleading
        // 0.
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-base font-medium text-foreground">
              Not enough data yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add some income, budget, debt, or account data to see your
              Financial Health Score.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <FinancialHealthScoreHeadlineCard
            score={breakdown.score}
            label={breakdown.label}
            labelClassName={LABEL_STYLES[breakdown.label]}
            missingHintsText={
              missingHints.length > 0
                ? `Score based on ${4 - missingHints.length} of 4 factors — add ${missingHints.join(", ")} for a more complete score.`
                : null
            }
          />

          <FinancialHealthScoreBreakdownGrid breakdown={breakdown} />
          <FinancialHealthScoreNarrativeCard narrative={narrative} />
        </>
      )}

      <FinancialHealthScoreHistoryChart data={history} />
    </div>
  )
}
