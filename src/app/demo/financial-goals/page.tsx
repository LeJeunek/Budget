import { DemoFinancialGoalCard } from "@/features/demo/components/financial-goals/demo-financial-goal-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * `/demo/financial-goals` — the demo equivalent of `app/(dashboard)/
 * financial-goals/page.tsx`, per docs/architecture/
 * public-demo-technical-design.md §3.2's Financial Goals row.
 *
 * `DemoFinancialGoalCard` replaces the real `FinancialGoalCard` — that file
 * imports `archiveFinancialGoal`/`unarchiveFinancialGoal` from
 * `@/features/financial-goals/server/actions` in the same file as its
 * display markup (design doc §3.3), and already reimplements every
 * per-type progress body locally. Mirrors the real page's in-progress/
 * Completed split (AC5); the fixture household has no archived financial
 * goals, so the Archived tab is always an accurate, empty state.
 */
export default function DemoFinancialGoalsPage() {
  const household = getDemoHousehold()
  const { financialGoals } = household
  const archivedGoals = financialGoals.filter((goal) => goal.archivedAt !== null)
  const activeGoals = financialGoals.filter((goal) => goal.archivedAt === null)
  const inProgressGoals = activeGoals.filter((goal) => !goal.isCompleted)
  const completedGoals = activeGoals.filter((goal) => goal.isCompleted)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Financial Goals
        </h1>
        <p className="text-sm text-muted-foreground">
          Milestones computed automatically from this fictional household&apos;s
          own debt, net worth, and savings data.
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
                <DemoFinancialGoalCard key={goal.id} goal={goal} />
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
                  <DemoFinancialGoalCard key={goal.id} goal={goal} />
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
