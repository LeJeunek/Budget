import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getGoalById } from "@/features/goals/server/service"
import { EstimatedCompletionLine } from "@/features/goals/components/goal-card"
import { GoalDetailActions } from "@/features/goals/components/goal-detail-actions"
import { ContributionForm } from "@/features/goals/components/contribution-form"
import { ContributionHistoryList } from "@/features/goals/components/contribution-history-list"
import { formatCurrency, formatDate } from "@/lib/utils"
import { ProgressRing } from "@/components/shared/progress-ring"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Goal detail — full goal info, contribution logging, and contribution
 * history (docs/product/savings-goals.md AC9), per
 * docs/architecture/folder-tree.md's Phase 2 route list ("goal detail:
 * progress, edit, contribution history").
 *
 * Server Component: fetches the goal directly via `service.getGoalById`,
 * per docs/architecture/api-contracts.md, and re-runs on every
 * `router.refresh()` triggered by a mutation in one of its Client Component
 * children (GoalDetailActions, ContributionForm, ContributionHistoryList) —
 * same pattern as app/(dashboard)/goals/page.tsx and accounts/page.tsx.
 *
 * Next.js 15's App Router passes dynamic route params as a Promise (see
 * Next.js 15.5's "Async Request APIs" migration), hence `params:
 * Promise<{ goalId: string }>` + `await params` below, rather than a plain
 * object.
 */
export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { goalId } = await params
  const goal = await getGoalById(user.id, goalId)

  if (!goal) {
    return <GoalNotFound />
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/goals"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Goals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {goal.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {goal.isCompleted && <Badge>Completed</Badge>}
            {goal.isTargetDatePassed && (
              <Badge variant="outline">Target date passed</Badge>
            )}
          </div>
        </div>
        <GoalDetailActions goal={goal} />
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-center">
          <ProgressRing
            value={goal.percentComplete}
            size={120}
            strokeWidth={10}
            label={
              <span className="text-lg font-semibold">
                {Math.round(goal.percentComplete)}%
              </span>
            }
            aria-label={`${goal.name} progress`}
          />

          <div className="flex flex-1 flex-col gap-1 text-center sm:text-left">
            <span className="font-heading text-2xl font-semibold text-foreground">
              {formatCurrency(goal.currentProgress)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                of {formatCurrency(goal.targetAmount)}
              </span>
            </span>
            {goal.overageAmount > 0 ? (
              <span className="text-sm text-muted-foreground">
                {formatCurrency(goal.overageAmount)} over your{" "}
                {formatCurrency(goal.targetAmount)} target
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {formatCurrency(goal.remainingAmount)} remaining
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
                {formatCurrency(goal.plannedMonthlyContribution)}
              </span>
            )}
            <EstimatedCompletionLine goal={goal} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Contributions</CardTitle>
          <ContributionForm
            goalId={goal.id}
            triggerLabel={
              goal.contributions.length === 0
                ? "Log your first contribution"
                : "Log contribution"
            }
          />
        </CardHeader>
        <CardContent>
          <ContributionHistoryList contributions={goal.contributions} />
        </CardContent>
      </Card>
    </div>
  )
}

/** Rendered when `goalId` doesn't exist or belongs to another user —
 * `getGoalById` returns `null` for both cases indistinguishably (see its
 * JSDoc), so this can't leak which one occurred. Mirrors
 * goals/page.tsx's EmptyGoalsState card styling. */
function GoalNotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-base font-medium text-foreground">
          Goal not found
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This goal doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/goals"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to Goals
        </Link>
      </CardContent>
    </Card>
  )
}
