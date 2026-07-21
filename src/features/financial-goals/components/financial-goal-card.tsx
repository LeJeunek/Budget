"use client"

/**
 * FinancialGoalCard — presents a single Financial Goal of any of the three
 * types, per financial-goals.md AC2/AC5 (name, type badge, target, computed
 * status/progress, Completed/"not enough data"/frozen-state indicators) plus
 * an actions menu for Edit and Archive/Unarchive. Structurally mirrors
 * `features/debt/components/debt-card.tsx`/`features/goals/components/
 * goal-card.tsx` (Card + DropdownMenu actions + a controlled edit dialog) —
 * the one deliberate difference from both is that there is **no** contribution
 * button anywhere on this card (AC6), and the per-type body below is a
 * `switch` over `goal.type` rather than one shared layout, since the three
 * types display fundamentally different figures (financial-goals.md's own
 * Boundary section).
 *
 * Per folder-tree.md's own note on this file: renders a `Progress` fill bar
 * (`components/ui/progress.tsx`) for `DEBT_PAYOFF`/`NET_WORTH_SAVINGS_TARGET`,
 * and a plain "current% -> target%" two-figure display for
 * `SAVINGS_RATE_TARGET` — deliberately not a fill bar for that last type, per
 * the spec's own "a rate that temporarily moves backward is represented
 * honestly rather than as a shrinking progress bar" decision. The linear
 * `Progress` bar (not `ProgressRing`) is a deliberate visual choice too: Goals
 * (Savings Goals) already owns the ring, and this feature's own Boundary
 * section is explicit that a Financial Goal must never *read* as the same
 * interaction model as a Savings Goal — a different shape is one more honest
 * cue of that, on top of the very different actions menu (no "log
 * contribution" here at all).
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
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
import { NetWorthTrendSparkline } from "@/features/financial-goals/components/net-worth-trend-sparkline"
import {
  FINANCIAL_GOAL_TYPE_LABELS,
  MEASUREMENT_BASIS_LABELS,
  clampPercent,
} from "@/features/financial-goals/components/financial-goal-shared"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"

export interface FinancialGoalCardProps {
  goal: FinancialGoalWithProgress
  /** Non-archived accounts — passed through to the edit dialog for
   * `NET_WORTH_SAVINGS_TARGET`'s Account-subset picker; ignored for the
   * other two types. */
  accounts: Account[]
  /** Display-only name of the linked Debt for `DEBT_PAYOFF` goals (see
   * `debt-payoff-goal-form.tsx`'s JSDoc for why this is resolved by the
   * caller rather than carried on `FinancialGoalWithProgress` itself).
   * Ignored for the other two types. */
  linkedDebtName?: string
}

/** Whether to show the "not enough data yet" state instead of any figure —
 * financial-goals.md's Type 3: `currentRollingAverageRate === null`. */
function isSavingsRateDataInsufficient(goal: FinancialGoalWithProgress): boolean {
  return goal.type === "SAVINGS_RATE_TARGET" && goal.currentRollingAverageRate === null
}

export function FinancialGoalCard({ goal, accounts, linkedDebtName }: FinancialGoalCardProps) {
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
    // Re-runs the Server Component page's getFinancialGoals() calls so both
    // the active and archived lists reflect the new state — see
    // app/(dashboard)/financial-goals/page.tsx.
    router.refresh()
  }

  return (
    <>
      <Card className={isArchived ? "opacity-75" : undefined}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate">
              <Link href={`/financial-goals/${goal.id}`} className="hover:underline">
                {goal.name}
              </Link>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{FINANCIAL_GOAL_TYPE_LABELS[goal.type]}</Badge>
              {goal.isCompleted && <Badge>Completed</Badge>}
              {goal.type === "DEBT_PAYOFF" && goal.linkedDebtArchived && (
                <Badge variant="destructive">Linked debt archived</Badge>
              )}
              {isSavingsRateDataInsufficient(goal) && (
                <Badge variant="outline">Not enough data yet</Badge>
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

        <CardContent>
          <FinancialGoalProgressBody goal={goal} />
        </CardContent>
      </Card>

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

/**
 * The per-type progress display — exported so
 * app/(dashboard)/financial-goals/[goalId]/page.tsx's detail view can reuse
 * this exact rendering (same "shared between card and detail" precedent as
 * `goal-card.tsx`'s own `EstimatedCompletionLine`), just inside a larger
 * `CardContent`, instead of duplicating the per-type branching there.
 */
export function FinancialGoalProgressBody({ goal }: { goal: FinancialGoalWithProgress }) {
  if (goal.type === "DEBT_PAYOFF") {
    return <DebtPayoffProgress goal={goal} />
  }
  if (goal.type === "NET_WORTH_SAVINGS_TARGET") {
    return <NetWorthSavingsProgress goal={goal} />
  }
  return <SavingsRateProgress goal={goal} />
}

function DebtPayoffProgress({ goal }: { goal: FinancialGoalWithProgress }) {
  const startingBalance = goal.startingBalance ?? 0
  const currentEffectiveBalance = goal.currentEffectiveBalance ?? 0
  const percentPaidOff = goal.percentPaidOff ?? 0
  // financial-goals.md's Edge Case: a linked Debt's balance increased since
  // the goal began shows as 0% progress plus this plain note, never a
  // negative percentage — `percentPaidOff` is already clamped to 0 by
  // `progress-math.ts`, so this comparison just decides whether to show the
  // note, it doesn't re-derive the clamp itself.
  const balanceIncreasedSinceStart =
    percentPaidOff === 0 && currentEffectiveBalance > startingBalance

  return (
    <div className="flex flex-col gap-2">
      <Progress value={clampPercent(percentPaidOff)} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">
          {formatCurrency(currentEffectiveBalance)} remaining of{" "}
          {formatCurrency(startingBalance)} starting balance
        </span>
        <span className="text-xs text-muted-foreground">
          {Math.round(percentPaidOff)}% paid off
        </span>
        {balanceIncreasedSinceStart && (
          <span className="text-xs text-muted-foreground">
            Balance has increased since this goal began.
          </span>
        )}
        {goal.linkedDebtArchived && !goal.isCompleted && (
          <span className="text-xs text-muted-foreground">
            The linked debt was archived — progress is frozen at its last
            known value.
          </span>
        )}
      </div>
    </div>
  )
}

function NetWorthSavingsProgress({ goal }: { goal: FinancialGoalWithProgress }) {
  const targetAmount = goal.targetAmount ?? 0
  const currentMeasuredValue = goal.currentMeasuredValue ?? 0
  const distanceToTarget = goal.distanceToTarget ?? targetAmount - currentMeasuredValue
  const displayPercent = targetAmount > 0 ? clampPercent((currentMeasuredValue / targetAmount) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <Progress value={displayPercent} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">
          {formatCurrency(currentMeasuredValue)}{" "}
          <span className="text-muted-foreground">
            of {formatCurrency(targetAmount)} target
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {goal.measurementBasis ? MEASUREMENT_BASIS_LABELS[goal.measurementBasis] : ""}
          {" · "}
          {distanceToTarget > 0
            ? `${formatCurrency(distanceToTarget)} to go`
            : `${formatCurrency(Math.abs(distanceToTarget))} over target`}
        </span>
      </div>
      {goal.trend && goal.trend.length > 0 && (
        <NetWorthTrendSparkline points={goal.trend} targetAmount={targetAmount} />
      )}
    </div>
  )
}

function SavingsRateProgress({ goal }: { goal: FinancialGoalWithProgress }) {
  const targetPercent = goal.targetPercent ?? 0

  if (goal.currentRollingAverageRate === null || goal.currentRollingAverageRate === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough data yet — check back after a few months of income/expense
        activity.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-lg font-semibold text-foreground">
        {goal.currentRollingAverageRate.toFixed(1)}%{" "}
        <span className="text-sm font-normal text-muted-foreground">
          &rarr; target {targetPercent}%
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        Rolling 3-month average savings rate.
      </span>
    </div>
  )
}
