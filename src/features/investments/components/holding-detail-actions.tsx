"use client"

/**
 * HoldingDetailActions — the Edit/Close/Log dividend controls for the
 * holding detail view (app/(dashboard)/investments/[holdingId]/page.tsx). A
 * small Client Component composing already-built pieces (HoldingFormDialog,
 * DividendFormDialog, Button) rather than a new reusable UI primitive — same
 * category of composition as
 * `features/goals/components/goal-detail-actions.tsx`'s GoalDetailActions.
 *
 * Split out of page.tsx because the detail page itself must stay a Server
 * Component (it awaits `params` and calls `service.getHoldingById`/
 * `getGrowthHistory` directly, per docs/architecture/api-contracts.md) — it
 * can render this Client Component as a child, but can't hold the local
 * `open` state a dialog trigger needs itself.
 *
 * No "Unclose" button here, matching holding-row.tsx's identical omission —
 * see that file's JSDoc for the flagged backend gap.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { ContainerSummary, Holding } from "@/features/investments/types"
import { closeHolding } from "@/features/investments/server/actions"
import { HoldingFormDialog } from "./holding-form"
import { DividendFormDialog } from "./dividend-form"
import { Button } from "@/components/ui/button"

export interface HoldingDetailActionsProps {
  holding: Holding
  containers: ContainerSummary[]
}

export function HoldingDetailActions({
  holding,
  containers,
}: HoldingDetailActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [dividendOpen, setDividendOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const isClosed = holding.closedAt !== null

  async function handleClose() {
    setIsClosing(true)
    const result = await closeHolding({ id: holding.id })
    setIsClosing(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Holding closed")
    // Re-runs this Server Component page's getHoldingById() call — see
    // app/(dashboard)/investments/[holdingId]/page.tsx.
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button size="sm" onClick={() => setDividendOpen(true)}>
          Log dividend
        </Button>
        {!isClosed && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isClosing}
            onClick={handleClose}
          >
            Close
          </Button>
        )}
      </div>

      <HoldingFormDialog
        holding={holding}
        containers={containers}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DividendFormDialog
        holdingId={holding.id}
        holdingName={holding.name}
        open={dividendOpen}
        onOpenChange={setDividendOpen}
      />
    </>
  )
}
