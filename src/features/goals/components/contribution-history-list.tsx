"use client"

/**
 * ContributionHistoryList — a goal's full contribution history (AC9: date,
 * amount) with a per-row delete action (AC5), rendered in the goal detail
 * view (app/(dashboard)/goals/[goalId]/page.tsx).
 *
 * Uses the shared `Table` primitive (components/ui/table.tsx) rather than
 * components/shared/data-table — that wrapper is built for the
 * paginated/sortable/filterable Transactions table; a goal's contribution
 * list has none of those needs (it's already ordered most-recent-first by
 * server/service.ts's getGoalById), so the plain table primitive is the
 * right-sized tool here.
 *
 * Delete confirmation is an inline "Confirm delete" row (not a modal) —
 * mirrors features/transactions/components/category-manager-dialog.tsx's
 * CategoryRow pattern exactly, since this codebase has no AlertDialog
 * primitive yet.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { GoalContribution } from "@/features/goals/types"
import { deleteContribution } from "@/features/goals/server/actions"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function ContributionRow({ contribution }: { contribution: GoalContribution }) {
  const router = useRouter()
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    const result = await deleteContribution({ id: contribution.id })
    setIsDeleting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Contribution deleted")
    // Re-runs the Server Component detail page's getGoalById() call so
    // currentProgress/percentComplete/estimatedCompletion all recompute
    // from the remaining contributions — see server/service.ts's
    // computeGoalProgress, which derives everything from whatever
    // GoalContribution rows currently exist.
    router.refresh()
  }

  if (isConfirmingDelete) {
    return (
      <TableRow>
        <TableCell colSpan={3}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
            <span>Delete this contribution?</span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setIsConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="xs"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Confirm delete"}
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell>{formatDate(contribution.date)}</TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(contribution.amount)}
      </TableCell>
      <TableCell className="w-10 text-right">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete contribution of ${formatCurrency(contribution.amount)} on ${formatDate(contribution.date)}`}
          onClick={() => setIsConfirmingDelete(true)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

export interface ContributionHistoryListProps {
  contributions: GoalContribution[]
}

export function ContributionHistoryList({
  contributions,
}: ContributionHistoryListProps) {
  if (contributions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No contributions logged yet.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {contributions.map((contribution) => (
          <ContributionRow key={contribution.id} contribution={contribution} />
        ))}
      </TableBody>
    </Table>
  )
}
