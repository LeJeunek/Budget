import { redirect } from "next/navigation"
import { Target } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getGoals } from "@/features/goals/server/service"
import type { GoalWithProgress } from "@/features/goals/types"
import { GoalCard } from "@/features/goals/components/goal-card"
import { AddGoalButton } from "@/features/goals/components/goal-form"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Goals — replaces the Phase 0 placeholder now that the Goal model and its
 * Server Actions exist (docs/planning/roadmap.md Phase 2,
 * docs/product/savings-goals.md).
 *
 * Server Component: fetches both goal lists directly via
 * `service.getGoals`, per docs/architecture/api-contracts.md ("List goals |
 * Server Component direct call to service.getGoals(userId, ...)") rather
 * than going through `useGoals()` — that hook exists for the client-side
 * refetch case, not this initial-render fetch. Mutations
 * (create/edit/archive/unarchive/contribution add/delete) happen in the
 * Client Component pieces below and on the detail page, and call
 * `router.refresh()` afterward, which simply re-runs this Server Component
 * and its `getGoals` calls — same pattern as
 * app/(dashboard)/accounts/page.tsx.
 *
 * `getCurrentUser()` is called again here even though
 * app/(dashboard)/layout.tsx already redirects unauthenticated visitors
 * before this page renders — matches accounts/page.tsx's established
 * rationale exactly.
 */
export default async function GoalsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const [activeGoals, archivedGoals] = await Promise.all([
    getGoals(user.id),
    getGoals(user.id, { includeArchived: true }),
  ])

  const hasAnyGoals = activeGoals.length > 0 || archivedGoals.length > 0

  // AC8: Completed goals are visually distinguished from in-progress ones —
  // here, via a separate section within the active list (archived goals
  // aren't split further; their own tab already sets them apart).
  const inProgressGoals = activeGoals.filter((goal) => !goal.isCompleted)
  const completedGoals = activeGoals.filter((goal) => goal.isCompleted)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Goals
          </h1>
          <p className="text-sm text-muted-foreground">
            Track progress toward what you&apos;re saving for.
          </p>
        </div>
        {hasAnyGoals && <AddGoalButton />}
      </div>

      {!hasAnyGoals ? (
        <EmptyGoalsState />
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Active ({activeGoals.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived ({archivedGoals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 flex flex-col gap-6">
            {activeGoals.length > 0 ? (
              <>
                {inProgressGoals.length > 0 && (
                  <GoalGrid goals={inProgressGoals} />
                )}
                {completedGoals.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Completed
                    </h2>
                    <GoalGrid goals={completedGoals} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active goals. Unarchive one from the Archived tab, or add
                a new goal.
              </p>
            )}
          </TabsContent>

          <TabsContent value="archived" className="mt-4">
            {archivedGoals.length > 0 ? (
              <GoalGrid goals={archivedGoals} />
            ) : (
              <p className="text-sm text-muted-foreground">No archived goals.</p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function GoalGrid({ goals }: { goals: GoalWithProgress[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  )
}

/** Zero-goals state — mirrors accounts/page.tsx's EmptyAccountsState. */
function EmptyGoalsState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Target className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            No goals yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a savings goal to start tracking progress toward it — log
            contributions any time to see how close you are.
          </p>
        </div>
        <AddGoalButton label="Add your first goal" />
      </CardContent>
    </Card>
  )
}
