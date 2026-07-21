"use client"

/**
 * FinancialGoalDetailActions — the Edit/Archive controls for the goal detail
 * view (app/(dashboard)/financial-goals/[goalId]/page.tsx). Mirrors
 * `features/goals/components/goal-detail-actions.tsx`'s role exactly: a small
 * Client Component composing already-built pieces (the three type-specific
 * form dialogs, `Button`) so the detail page itself can stay a Server
 * Component (it awaits `params` and calls `service.getFinancialGoalById`
 * directly, per docs/architecture/api-contracts.md) while still rendering
 * dialog-triggering controls, which need local `open` state a Server
 * Component can't hold itself.
 *
 * Dispatches to the one type-specific edit dialog matching `goal.type` — the
 * same "type is fixed, only one form shape ever applies to a given goal"
 * switch `financial-goal-card.tsx` uses for its own Edit action.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { Account } from "@/features/accounts/types"
import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"
import {
  archiveFinancialGoal,
  unarchiveFinancialGoal,
} from "@/features/financial-goals/server/actions"
import { DebtPayoffGoalFormDialog } from "@/features/financial-goals/components/debt-payoff-goal-form"
import { NetWorthSavingsGoalFormDialog } from "@/features/financial-goals/components/net-worth-savings-goal-form"
import { SavingsRateGoalFormDialog } from "@/features/financial-goals/components/savings-rate-goal-form"
import { Button } from "@/components/ui/button"

export interface FinancialGoalDetailActionsProps {
  goal: FinancialGoalWithProgress
  accounts: Account[]
  linkedDebtName?: string
}

export function FinancialGoalDetailActions({
  goal,
  accounts,
  linkedDebtName,
}: FinancialGoalDetailActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = goal.archivedAt !== null

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveFinancialGoal : archiveFinancialGoal
    const result = await action({ id: goal.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Goal restored" : "Goal archived")
    // Re-runs this Server Component page's getFinancialGoalById() call — see
    // app/(dashboard)/financial-goals/[goalId]/page.tsx.
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button
          variant={isArchived ? "default" : "destructive"}
          size="sm"
          disabled={isTogglingArchive}
          onClick={handleArchiveToggle}
        >
          {isArchived ? "Unarchive" : "Archive"}
        </Button>
      </div>

      {goal.type === "DEBT_PAYOFF" && (
        <DebtPayoffGoalFormDialog
          goal={goal}
          linkedDebtName={linkedDebtName}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {goal.type === "NET_WORTH_SAVINGS_TARGET" && (
        <NetWorthSavingsGoalFormDialog
          goal={goal}
          accounts={accounts}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {goal.type === "SAVINGS_RATE_TARGET" && (
        <SavingsRateGoalFormDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  )
}
