"use client"

/**
 * FinancialHealthScoreBreakdownGrid — the four labeled component values
 * behind the Financial Health Score (docs/product/ai-features.md Feature 5
 * AC2: "the score's four individual component values are displayed alongside
 * the total, each clearly labeled ... so the score is self-explanatory from
 * its breakdown alone even with no AI narrative present").
 *
 * Composed entirely from existing `components/ui` primitives (`Card`) — no
 * new reusable primitive.
 *
 * AC3's naming-adjacency requirement ("the 'Budget Adherence' component is
 * visually and textually tied back to the existing Budget Health Score") is
 * satisfied directly in `COMPONENT_LABELS` below, not by re-deriving or
 * cross-importing Budgeting's own score — `service.ts`'s
 * `gatherBudgetAdherenceComponent` already reuses that value verbatim
 * server-side; this component only needs to *label* it correctly.
 *
 * Purely presentational, no data-fetching of its own — reused by
 * `app/(dashboard)/financial-health-score/page.tsx`.
 *
 * **Phase 5b addition (Number Counters):** gained its own "use client"
 * directive here — it was a Server Component before this phase. Wiring
 * `AnimatedNumber` (`@/components/shared/motion`, a Client Component) in
 * requires it, for the identical reason `financial-health-score-badge.tsx`'s
 * own JSDoc explains in full: a Server Component's JSX cannot pass a
 * function prop directly to a Client Component. Costs nothing
 * architecturally — `breakdown` still arrives as an already-resolved prop
 * from its Server Component page, unchanged.
 */

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  FinancialHealthScoreBreakdown,
  FinancialHealthScoreComponentKey,
} from "@/features/financial-health-score/types"

export interface FinancialHealthScoreBreakdownGridProps {
  breakdown: FinancialHealthScoreBreakdown
}

const COMPONENT_LABELS: Record<FinancialHealthScoreComponentKey, string> = {
  debtToIncome: "Debt-to-Income",
  savingsRate: "Savings Rate",
  // AC3: explicit tie-back to the existing, already-shipped Budget Health
  // Score, satisfying the naming-adjacency requirement in the product spec's
  // Reasoning point 6.
  budgetAdherence: "Budget Adherence (same as your Budget Health Score)",
  netWorthTrend: "Net Worth Trend",
}

const COMPONENT_ORDER: FinancialHealthScoreComponentKey[] = [
  "debtToIncome",
  "savingsRate",
  "budgetAdherence",
  "netWorthTrend",
]

export function FinancialHealthScoreBreakdownGrid({
  breakdown,
}: FinancialHealthScoreBreakdownGridProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score breakdown</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COMPONENT_ORDER.map((key) => {
          const value = breakdown.components[key]
          const isUndefined = breakdown.undefinedComponents.includes(key)
          return (
            <div
              key={key}
              className="flex flex-col gap-1 rounded-md border border-border p-3"
            >
              <span className="text-sm text-muted-foreground">
                {COMPONENT_LABELS[key]}
              </span>
              <span
                className={cn(
                  "font-heading text-xl font-semibold",
                  isUndefined ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {value === null ? (
                  "Not enough data"
                ) : (
                  <AnimatedNumber
                    value={value}
                    format={(n) => Math.round(n).toString()}
                  />
                )}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
