"use client"

/**
 * GoalDetailActions — the Edit/Archive controls for the goal detail view
 * (app/(dashboard)/goals/[goalId]/page.tsx). A small Client Component
 * composing already-built pieces (GoalFormDialog, Button) rather than a new
 * reusable UI primitive — the same category of composition as
 * goal-card.tsx's own actions menu, just laid out as page-header buttons
 * instead of a dropdown since there's more horizontal room on the detail
 * view.
 *
 * Split out of page.tsx because the detail page itself must stay a Server
 * Component (it awaits `params` and calls `service.getGoalById` directly,
 * per docs/architecture/api-contracts.md) — it can render this Client
 * Component as a child, but can't hold the local `open` state a dialog
 * trigger needs itself.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { Goal } from "@/features/goals/types"
import { archiveGoal, unarchiveGoal } from "@/features/goals/server/actions"
import { GoalFormDialog } from "@/features/goals/components/goal-form"
import { Button } from "@/components/ui/button"

export interface GoalDetailActionsProps {
  goal: Goal
}

export function GoalDetailActions({ goal }: GoalDetailActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = goal.archivedAt !== null

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveGoal : archiveGoal
    const result = await action({ id: goal.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Goal restored" : "Goal archived")
    // Re-runs this Server Component page's getGoalById() call — see
    // app/(dashboard)/goals/[goalId]/page.tsx.
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

      <GoalFormDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
