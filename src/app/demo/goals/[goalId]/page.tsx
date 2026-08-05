import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { DemoGoalCard } from "@/features/demo/components/goals/demo-goal-card"
import { DemoContributionHistoryList } from "@/features/demo/components/goals/demo-contribution-history-list"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * `/demo/goals/[goalId]` — the demo equivalent of `app/(dashboard)/goals/
 * [goalId]/page.tsx`, per docs/architecture/public-demo-technical-design.md
 * §7's lookup-plus-`notFound()` shape.
 *
 * A plain, synchronous lookup against `getDemoHousehold()`'s own
 * `savingsGoals` array — never a query.
 *
 * **Not** built from the real page's `GoalDetailProgressCard`
 * (`features/goals/components/goal-detail-progress-card.tsx`) despite the
 * design doc's own §3.2 table naming it as "reused directly" for this row —
 * verified by direct read, that component imports `EstimatedCompletionLine`
 * from `features/goals/components/goal-card.tsx`, which itself imports
 * `archiveGoal`/`unarchiveGoal` from `@/features/goals/server/actions` at
 * module scope (one of the exact ~30 tangled files the design doc's own
 * §3.3 names). Reusing `GoalDetailProgressCard` here would transitively pull
 * a Server Action into `/demo`'s bundle — public-demo.md Capability 3 AC2's
 * "directly or transitively" bar exists precisely to catch this shape of
 * mistake. `DemoGoalCard` already reimplements the identical progress-ring/
 * figures/estimated-completion display locally with zero tangled imports
 * (confirmed by direct read), so it is reused here instead — a real gap in
 * the technical design's own component-reuse table, flagged rather than
 * silently worked around.
 */
export default async function DemoGoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>
}) {
  const { goalId } = await params
  const household = getDemoHousehold()
  const goal = household.savingsGoals.find((candidate) => candidate.id === goalId)

  if (!goal) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/demo/goals"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Goals
      </Link>

      <div className="max-w-md">
        <DemoGoalCard goal={goal} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contributions</CardTitle>
        </CardHeader>
        <CardContent>
          <DemoContributionHistoryList contributions={goal.contributions} />
        </CardContent>
      </Card>
    </div>
  )
}
