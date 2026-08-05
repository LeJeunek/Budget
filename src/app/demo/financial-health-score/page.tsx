import { FinancialHealthScoreBreakdownGrid } from "@/features/financial-health-score/components/financial-health-score-breakdown"
import { FinancialHealthScoreNarrativeCard } from "@/features/financial-health-score/components/financial-health-score-narrative"
import { FinancialHealthScoreHistoryChart } from "@/features/financial-health-score/components/financial-health-score-history-chart"
import { FinancialHealthScoreHeadlineCard } from "@/features/financial-health-score/components/financial-health-score-headline-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import {
  deriveFinancialHealthScore,
  deriveFinancialHealthScoreHistory,
} from "@/features/demo/fixtures/derive/financial-health-score"
import { deriveBudgetMonth } from "@/features/demo/fixtures/derive/budget-month"
import { deriveBudgetHealthScore } from "@/features/demo/fixtures/derive/budget-health-score"
import { relativeMonthStart } from "@/features/demo/fixtures/relative-date"
import { Card, CardContent } from "@/components/ui/card"

import type { FinancialHealthScoreComponentKey } from "@/features/financial-health-score/types"

// Byte-for-byte copy of the real page's own module-level constants
// (`app/(dashboard)/financial-health-score/page.tsx`) — page-level display
// data, not shared business logic, so duplicating it here costs nothing and
// pulls in nothing unsafe (no import needed from that route's own file).
const LABEL_STYLES: Record<string, string> = {
  Good: "text-emerald-700 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  "Needs attention": "text-red-700 dark:text-red-400",
}

const MISSING_COMPONENT_HINTS: Record<FinancialHealthScoreComponentKey, string> = {
  debtToIncome: "income tracking",
  savingsRate: "3 months of income/expense history",
  budgetAdherence: "a budget allocation for this month",
  netWorthTrend: "3 months of net worth history",
}

/**
 * `/demo/financial-health-score` — the demo equivalent of
 * `app/(dashboard)/financial-health-score/page.tsx`, per
 * docs/architecture/public-demo-technical-design.md §3.2's Financial Health
 * Score row ("all 5 components... — (already fully AI-independent)").
 *
 * `narrative` is passed as `{ status: "unavailable" }` — a plain object
 * literal, not an import from `@/lib/ai/types` (blocked by this route's own
 * `no-restricted-imports` rule; TypeScript checks the literal structurally
 * against `FinancialHealthScoreNarrativeCard`'s prop type without needing
 * that import). `FinancialHealthScoreNarrativeCard` already renders its own
 * built-in "Explanation isn't available right now" state for this status —
 * the same real, reviewed degradation path a live AI outage would produce,
 * never a fabricated narrative string (design doc §3.5's "AI-generated
 * widgets are deliberately omitted... never faked," applied here to the one
 * AI-generated component this page's own row is not listed as omitting: this
 * card is reused, but always in its already-correct "unavailable" state).
 */
export default function DemoFinancialHealthScorePage() {
  const household = getDemoHousehold()
  const { accounts, debts, transactions, categories, budgetAllocations, now } = household

  const currentMonthStart = relativeMonthStart(0, now)
  const budgetMonth = deriveBudgetMonth({
    transactions,
    allocations: budgetAllocations,
    categories,
    targetMonth: currentMonthStart,
    now,
  })
  const budgetHealthScore = deriveBudgetHealthScore(budgetMonth)

  const breakdown = deriveFinancialHealthScore({
    now,
    accounts,
    debts,
    transactions,
    budgetHealthScore,
  })
  const history = deriveFinancialHealthScoreHistory(breakdown, now)

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
          A single 0-100 view of this fictional household&apos;s overall
          financial picture, built from its debt, savings, budgeting, and net
          worth.
        </p>
      </div>

      {breakdown.score === null || breakdown.label === null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-base font-medium text-foreground">
              Not enough data yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This demo household doesn&apos;t have enough data to compute a
              score yet.
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
          <FinancialHealthScoreNarrativeCard narrative={{ status: "unavailable" }} />
        </>
      )}

      <FinancialHealthScoreHistoryChart data={history} />
    </div>
  )
}
