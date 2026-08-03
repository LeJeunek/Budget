import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getGoalById } from "@/features/goals/server/service"
import { GoalDetailActions } from "@/features/goals/components/goal-detail-actions"
import { ContributionForm } from "@/features/goals/components/contribution-form"
import { ContributionHistoryList } from "@/features/goals/components/contribution-history-list"
import { GoalDetailProgressCard } from "@/features/goals/components/goal-detail-progress-card"
import { getUserPreference } from "@/features/settings/server/service"
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
  const [goal, userPreference] = await Promise.all([
    getGoalById(user.id, goalId),
    // (Phase 4c release-gate fix, docs/release/phase-4c-notes.md Section 1):
    // this page's own currency figures below are formatted directly in this
    // Server Component, so it needs `currencyDisplay` resolved here rather
    // than via `useCurrencyDisplay()` (a Client-Component-only hook).
    getUserPreference(user.id),
  ])

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

      <GoalDetailProgressCard
        goal={goal}
        currencyDisplay={userPreference.currencyDisplay}
      />

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
