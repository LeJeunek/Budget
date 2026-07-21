/**
 * FinancialGoalList — the grid of `FinancialGoalCard`s for one tab (active or
 * archived) of app/(dashboard)/financial-goals/page.tsx. Not a Client
 * Component itself (no state of its own) — kept as a thin, server-renderable
 * wrapper so the page doesn't need to inline the grid markup twice
 * (active/archived tabs), matching `features/debt/components/debt-list.tsx`'s
 * identical role for Debt Tracker.
 */

import type { Account } from "@/features/accounts/types"
import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"
import { FinancialGoalCard } from "@/features/financial-goals/components/financial-goal-card"

export interface FinancialGoalListProps {
  goals: FinancialGoalWithProgress[]
  /** Non-archived accounts, passed through to every card for
   * `NET_WORTH_SAVINGS_TARGET`'s edit-mode Account-subset picker. */
  accounts: Account[]
  /** `Debt.id` -> display name, for every `DEBT_PAYOFF` goal's edit dialog
   * (see `financial-goal-card.tsx`'s `linkedDebtName` prop JSDoc). Covers
   * archived debts too, since a goal's linked debt may itself be archived
   * (financial-goals.md's "linked debt was archived" edge case) while the
   * goal itself is still active. */
  debtNameById: Map<string, string>
}

export function FinancialGoalList({ goals, accounts, debtNameById }: FinancialGoalListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {goals.map((goal) => (
        <FinancialGoalCard
          key={goal.id}
          goal={goal}
          accounts={accounts}
          linkedDebtName={
            goal.linkedDebtId ? debtNameById.get(goal.linkedDebtId) : undefined
          }
        />
      ))}
    </div>
  )
}
