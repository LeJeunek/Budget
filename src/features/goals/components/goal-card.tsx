"use client"

/**
 * GoalCard — presents a single goal (docs/product/savings-goals.md AC2:
 * name/target/progress/remaining/visualization) plus an actions menu for
 * Edit and Archive/Unarchive. Mirrors
 * features/accounts/components/account-card.tsx's structure (Card +
 * DropdownMenu actions + a controlled edit dialog) exactly.
 *
 * "use client": the actions menu and the Edit dialog it opens both need
 * local state and call Server Actions directly, so this whole card is a
 * Client Component even though it's rendered from a Server Component page
 * (app/(dashboard)/goals/page.tsx) — Server Components can render Client
 * Components as children, they just can't *be* one themselves.
 *
 * Reuses components/shared/progress-ring.tsx exactly as the architecture
 * doc requires ("do not fork it") — the ring's own `value` clamp keeps the
 * fill capped at 100% for an overshot goal, while this component supplies a
 * custom `label` so the *true* (uncapped) percentage is still legible as
 * text, per AC7's "overshoot is shown plainly" edge case.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { GoalWithProgress } from "@/features/goals/types"
import { archiveGoal, unarchiveGoal } from "@/features/goals/server/actions"
import { GoalFormDialog } from "@/features/goals/components/goal-form"
import { formatCurrency } from "@/lib/utils"
import { ProgressRing } from "@/components/shared/progress-ring"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** `"yyyy-MM"` -> `"August 2026"`, for `estimatedCompletion`'s `month` field
 * (AC7: "expressed as a month/year"). Built from UTC parts, matching the key
 * `server/service.ts`'s `formatMonthKey` produces. */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

/** Renders AC7's estimated-completion line, branching on the
 * `EstimatedCompletion` discriminant (see types.ts's JSDoc) — the three
 * cases the product spec calls out by name. Exported so
 * app/(dashboard)/goals/[goalId]/page.tsx's detail view can reuse this exact
 * rendering instead of duplicating the basis/status branching. */
export function EstimatedCompletionLine({
  goal,
}: {
  goal: GoalWithProgress
}) {
  if (goal.isCompleted) {
    return null
  }

  const { estimatedCompletion } = goal
  if ("status" in estimatedCompletion) {
    return (
      <p className="text-xs text-muted-foreground">
        Log a contribution to estimate when you&apos;ll reach this goal.
      </p>
    )
  }

  const monthLabel = formatMonthLabel(estimatedCompletion.month)
  const captionByBasis: Record<typeof estimatedCompletion.basis, string> = {
    planned: "at your planned rate",
    "average-rate": "based on your recent pace",
  }

  return (
    <p className="text-xs text-muted-foreground">
      On track for {monthLabel} ({captionByBasis[estimatedCompletion.basis]})
    </p>
  )
}

export interface GoalCardProps {
  goal: GoalWithProgress
}

export function GoalCard({ goal }: GoalCardProps) {
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
    // Re-runs the Server Component page's getGoals() calls so both the
    // active and archived lists reflect the new state — see
    // app/(dashboard)/goals/page.tsx.
    router.refresh()
  }

  return (
    <>
      <Card className={isArchived ? "opacity-75" : undefined}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">
              <Link href={`/goals/${goal.id}`} className="hover:underline">
                {goal.name}
              </Link>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {goal.isCompleted && <Badge>Completed</Badge>}
              {goal.isTargetDatePassed && (
                <Badge variant="outline">Target date passed</Badge>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${goal.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant={isArchived ? "default" : "destructive"}
                disabled={isTogglingArchive}
                onSelect={handleArchiveToggle}
              >
                {isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="flex items-center gap-4">
          <ProgressRing
            value={goal.percentComplete}
            size={72}
            strokeWidth={6}
            label={
              <span className="text-xs font-medium">
                {Math.round(goal.percentComplete)}%
              </span>
            }
            aria-label={`${goal.name} progress`}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-heading text-lg font-semibold text-foreground">
              {formatCurrency(goal.currentProgress)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of {formatCurrency(goal.targetAmount)}
              </span>
            </span>
            {goal.overageAmount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {formatCurrency(goal.overageAmount)} over your{" "}
                {formatCurrency(goal.targetAmount)} target
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {formatCurrency(goal.remainingAmount)} remaining
              </span>
            )}
            <EstimatedCompletionLine goal={goal} />
          </div>
        </CardContent>
      </Card>

      <GoalFormDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
