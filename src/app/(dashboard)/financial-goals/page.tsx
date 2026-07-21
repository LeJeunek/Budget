import { redirect } from "next/navigation"
import { Flag } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getFinancialGoals } from "@/features/financial-goals/server/service"
import { getDebts } from "@/features/debt/server/service"
import type { DebtWithProjection } from "@/features/debt/types"
import { getAccounts } from "@/features/accounts/server/service"
import type { Account } from "@/features/accounts/types"
import { FinancialGoalList } from "@/features/financial-goals/components/financial-goal-list"
import { AddDebtPayoffGoalButton } from "@/features/financial-goals/components/debt-payoff-goal-form"
import { AddNetWorthSavingsGoalButton } from "@/features/financial-goals/components/net-worth-savings-goal-form"
import { AddSavingsRateGoalButton } from "@/features/financial-goals/components/savings-rate-goal-form"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Financial Goals — the last piece of Phase 3b's v1 arc
 * (docs/product/financial-goals.md, docs/architecture/api-contracts.md's
 * Financial Goals section, docs/architecture/folder-tree.md's Phase 3b
 * route: `app/(dashboard)/financial-goals/page.tsx`, "list (active +
 * Completed + archived toggle), mirrors goals/page.tsx's existing shape").
 *
 * Server Component: fetches every list this page needs directly via each
 * domain's own `service.ts` — `getFinancialGoals` per api-contracts.md's
 * "Server Component direct call" row, plus `getDebts`/`getAccounts` for two
 * purely page-level joins neither belongs inside
 * `features/financial-goals/server` (that module is a deliberate "leaf" with
 * zero new cross-domain functions, per Architecture.md's module-boundary
 * section — this page-level join is exactly the kind of composition
 * `app/(dashboard)/debt/page.tsx` already does for its own `eligibleAccounts`):
 *
 *   1. `eligibleDebtsForNewGoal` — which of the user's active, not-already-
 *      Paid-Off debts can start a *new* Debt Payoff goal (financial-goals.md's
 *      Type 1 exclusivity rule: a debt already tracked by an active goal is
 *      excluded, mirroring `debt/page.tsx`'s own eligible-Account computation
 *      for its Link dialog).
 *   2. `debtNameById` — every debt's display name (active *and* archived, so
 *      a Debt Payoff goal whose linked debt was since archived can still show
 *      which debt it's tracking, per the Edge Cases' "linked debt was
 *      archived" frozen state) — `FinancialGoalWithProgress` itself carries
 *      only `linkedDebtId`, never a name.
 *
 * Mutations (create/edit/archive/unarchive) happen in the Client Component
 * pieces rendered below and call `router.refresh()` afterward, which simply
 * re-runs this Server Component and its fetches — same pattern as
 * `app/(dashboard)/goals/page.tsx` and `app/(dashboard)/debt/page.tsx`.
 */
export default async function FinancialGoalsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const [activeGoals, archivedGoals, activeDebts, archivedDebts, accounts] = await Promise.all([
    getFinancialGoals(user.id),
    getFinancialGoals(user.id, { includeArchived: true }),
    getDebts(user.id),
    getDebts(user.id, { includeArchived: true }),
    getAccounts(user.id),
  ])

  const hasAnyGoals = activeGoals.length > 0 || archivedGoals.length > 0

  const debtNameById = new Map(
    [...activeDebts, ...archivedDebts].map((debt) => [debt.id, debt.name]),
  )

  const activelyTrackedDebtIds = new Set(
    activeGoals
      .filter((goal) => goal.type === "DEBT_PAYOFF" && goal.linkedDebtId)
      .map((goal) => goal.linkedDebtId as string),
  )
  const eligibleDebtsForNewGoal = activeDebts.filter(
    (debt) => !debt.isPaidOff && !activelyTrackedDebtIds.has(debt.id),
  )

  // AC5: Completed goals are visually distinguished from in-progress ones —
  // a separate section within the active list, same convention
  // app/(dashboard)/goals/page.tsx already established for Savings Goals.
  const inProgressGoals = activeGoals.filter((goal) => !goal.isCompleted)
  const completedGoals = activeGoals.filter((goal) => goal.isCompleted)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Financial Goals
          </h1>
          <p className="text-sm text-muted-foreground">
            Milestones the app tracks automatically from data it already
            knows — nothing to log manually.
          </p>
        </div>
        {hasAnyGoals && (
          <div className="flex flex-wrap items-center gap-2">
            <AddDebtPayoffGoalButton eligibleDebts={eligibleDebtsForNewGoal} label="Debt payoff" />
            <AddNetWorthSavingsGoalButton accounts={accounts} label="Net worth / savings" />
            <AddSavingsRateGoalButton label="Savings rate" />
          </div>
        )}
      </div>

      {!hasAnyGoals ? (
        <EmptyFinancialGoalsState
          eligibleDebts={eligibleDebtsForNewGoal}
          accounts={accounts}
        />
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
                  <FinancialGoalList
                    goals={inProgressGoals}
                    accounts={accounts}
                    debtNameById={debtNameById}
                  />
                )}
                {completedGoals.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Completed
                    </h2>
                    <FinancialGoalList
                      goals={completedGoals}
                      accounts={accounts}
                      debtNameById={debtNameById}
                    />
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
              <FinancialGoalList
                goals={archivedGoals}
                accounts={accounts}
                debtNameById={debtNameById}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No archived goals.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/** Zero-goals state — financial-goals.md's own Edge Case: "a clear empty
 * state prompting the user to create their first one, distinguishing this
 * list from the separate Savings Goals list so the two features don't read
 * as duplicates of each other even when both are empty." Offers all three
 * goal types explicitly (rather than one ambiguous "Add goal" button) so a
 * first-time user immediately sees this is three distinct kinds of milestone,
 * not one form with hidden options. */
function EmptyFinancialGoalsState({
  eligibleDebts,
  accounts,
}: {
  eligibleDebts: DebtWithProjection[]
  accounts: Account[]
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Flag className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            No financial goals yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Unlike Savings Goals, nothing here is manually logged — pick a
            milestone and the app watches your existing debt, net worth, or
            savings rate data for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <AddDebtPayoffGoalButton eligibleDebts={eligibleDebts} />
          <AddNetWorthSavingsGoalButton accounts={accounts} />
          <AddSavingsRateGoalButton />
        </div>
      </CardContent>
    </Card>
  )
}
