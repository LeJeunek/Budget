"use client"

/**
 * GoalDetailProgressCard — the goal detail page's (`app/(dashboard)/goals/
 * [goalId]/page.tsx`) progress-ring-plus-figures card, extracted into its
 * own Client Component so its headline currency/percentage figures can use
 * `AnimatedNumber` (Number Counters, Phase 5b) — the same treatment
 * `goal-card.tsx`'s list-view card and `financial-goal-card.tsx` already
 * have (docs/testing/bug-reports/savings-goal-detail-page-missing-animated-
 * number.md: this route was named explicitly in Number Counters AC6's
 * "both detail routes" but never wired, since it's rendered directly by a
 * Server Component page that fetches `getGoalById`/`getUserPreference`
 * itself and can't become a Client Component wholesale).
 *
 * Receives only plain, already-fetched, serializable data (the full `goal`
 * object plus a `currencyDisplay` string) — no function props cross the
 * Server/Client boundary, avoiding the "Server Components can't pass
 * closures to Client Components" crash `dashboard-animated-stat-value.tsx`
 * exists to work around for Dashboard's own card-group builder.
 *
 * Mirrors `goal-card.tsx`'s exact ProgressRing/AnimatedNumber composition
 * (custom `label` overriding the ring's own default, since the true,
 * uncapped percentage must stay legible for an overshot goal per AC7).
 */

import type { GoalDetail } from "@/features/goals/types"
import { formatCurrency as formatCurrencyWithDisplay, formatDate } from "@/lib/utils"
import { ProgressRing } from "@/components/shared/progress-ring"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent } from "@/components/ui/card"
import { EstimatedCompletionLine } from "@/features/goals/components/goal-card"

export interface GoalDetailProgressCardProps {
  goal: GoalDetail
  currencyDisplay: string
}

export function GoalDetailProgressCard({
  goal,
  currencyDisplay,
}: GoalDetailProgressCardProps) {
  const formatCurrency = (amount: number) =>
    formatCurrencyWithDisplay(amount, currencyDisplay)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-center">
        <ProgressRing
          value={goal.percentComplete}
          size={120}
          strokeWidth={10}
          label={
            <AnimatedNumber
              value={goal.percentComplete}
              format={(n) => `${Math.round(n)}%`}
              className="text-lg font-semibold"
            />
          }
          aria-label={`${goal.name} progress`}
        />

        <div className="flex flex-1 flex-col gap-1 text-center sm:text-left">
          <span className="font-heading text-2xl font-semibold text-foreground">
            <AnimatedNumber value={goal.currentProgress} format={formatCurrency} />{" "}
            <span className="text-base font-normal text-muted-foreground">
              of <AnimatedNumber value={goal.targetAmount} format={formatCurrency} />
            </span>
          </span>
          {goal.overageAmount > 0 ? (
            <span className="text-sm text-muted-foreground">
              <AnimatedNumber value={goal.overageAmount} format={formatCurrency} /> over
              your {formatCurrency(goal.targetAmount)} target
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              <AnimatedNumber value={goal.remainingAmount} format={formatCurrency} />{" "}
              remaining
            </span>
          )}
          {goal.targetDate && (
            <span className="text-sm text-muted-foreground">
              Target date: {formatDate(goal.targetDate)}
            </span>
          )}
          {goal.plannedMonthlyContribution !== null && (
            <span className="text-sm text-muted-foreground">
              Planned monthly contribution:{" "}
              <AnimatedNumber
                value={goal.plannedMonthlyContribution}
                format={formatCurrency}
              />
            </span>
          )}
          <EstimatedCompletionLine goal={goal} />
        </div>
      </CardContent>
    </Card>
  )
}
