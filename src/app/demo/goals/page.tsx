import { DemoGoalCard } from "@/features/demo/components/goals/demo-goal-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * `/demo/goals` — the demo equivalent of `app/(dashboard)/goals/page.tsx`
 * (Savings Goals), per docs/architecture/public-demo-technical-design.md
 * §3.2's Savings Goals row.
 *
 * `DemoGoalCard` replaces the real `GoalCard` — that file imports
 * `archiveGoal`/`unarchiveGoal` from `@/features/goals/server/actions` in
 * the same file as its display markup (design doc §3.3). Mirrors the real
 * page's in-progress/Completed split (AC8); the fixture household has no
 * archived goals, so the Archived tab is always an accurate, empty state.
 */
export default function DemoGoalsPage() {
  const household = getDemoHousehold()
  const { savingsGoals } = household
  const archivedGoals = savingsGoals.filter((goal) => goal.archivedAt !== null)
  const activeGoals = savingsGoals.filter((goal) => goal.archivedAt === null)
  const inProgressGoals = activeGoals.filter((goal) => !goal.isCompleted)
  const completedGoals = activeGoals.filter((goal) => goal.isCompleted)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Goals
        </h1>
        <p className="text-sm text-muted-foreground">
          Progress toward what this fictional household is saving for.
        </p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({activeGoals.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedGoals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 flex flex-col gap-6">
          {inProgressGoals.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {inProgressGoals.map((goal) => (
                <DemoGoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          )}
          {completedGoals.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Completed
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completedGoals.map((goal) => (
                  <DemoGoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <p className="text-sm text-muted-foreground">No archived goals.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
