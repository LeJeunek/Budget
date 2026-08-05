"use client"

/**
 * DemoGoalCard — read-only presentational twin of
 * `features/goals/components/goal-card.tsx`, built for the public `/demo`
 * route (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * Mirrors GoalCard's display fields (Completed / target-date-passed badges,
 * `ProgressRing`, current/target amounts, remaining-or-overage line,
 * estimated-completion caption) but omits the entire actions menu and Edit
 * dialog — `goal-card.tsx` itself imports `archiveGoal`/`unarchiveGoal` from
 * `@/features/goals/server/actions`, which nothing under `/demo` may ever
 * reach, even transitively (public-demo.md Capability 3 AC2). The detail
 * link points at `/demo/goals/[id]`, never the real authenticated
 * `/goals/[id]` route (Capability 5 AC4).
 *
 * `EstimatedCompletionLine`'s branching is reproduced locally rather than
 * imported (the real file exports it, but importing that file at all would
 * pull in its actions menu/Edit dialog too).
 *
 * Usage:
 * ```tsx
 * <DemoGoalCard goal={DEMO_HOUSEHOLD.savingsGoals[0]} />
 * ```
 */

import Link from "next/link"

import { cn, formatCurrency } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { ProgressRing } from "@/components/shared/progress-ring"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { GoalWithProgress } from "@/features/goals/types"

/** `"yyyy-MM"` -> `"August 2026"` — mirrors `goal-card.tsx`'s own
 * `formatMonthLabel` (duplicated, same cross-domain-import boundary as
 * every other demo twin in this module). */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

/** Mirrors `goal-card.tsx`'s exported `EstimatedCompletionLine` — reproduced
 * here rather than imported since that file also carries the actions menu/
 * Edit dialog this twin must never pull in. */
function EstimatedCompletionLine({ goal }: { goal: GoalWithProgress }) {
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

export interface DemoGoalCardProps {
  goal: GoalWithProgress
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoGoalCard({ goal, currency = "USD" }: DemoGoalCardProps) {
  const isArchived = goal.archivedAt !== null

  return (
    <Card className={cn(isArchived && "opacity-75")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link href={`/demo/goals/${goal.id}`} className="hover:underline">
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
      </CardHeader>

      <CardContent className="flex items-center gap-4">
        <ProgressRing
          value={goal.percentComplete}
          size={72}
          strokeWidth={6}
          label={
            <AnimatedNumber
              value={goal.percentComplete}
              format={(n) => `${Math.round(n)}%`}
              className="text-xs font-medium"
            />
          }
          aria-label={`${goal.name} progress`}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-heading text-lg font-semibold text-foreground">
            <AnimatedNumber
              value={goal.currentProgress}
              format={(amount) => formatCurrency(amount, currency)}
            />{" "}
            <span className="text-sm font-normal text-muted-foreground">
              of{" "}
              <AnimatedNumber
                value={goal.targetAmount}
                format={(amount) => formatCurrency(amount, currency)}
              />
            </span>
          </span>
          {goal.overageAmount > 0 ? (
            <span className="text-xs text-muted-foreground">
              <AnimatedNumber
                value={goal.overageAmount}
                format={(amount) => formatCurrency(amount, currency)}
              />{" "}
              over your{" "}
              <AnimatedNumber
                value={goal.targetAmount}
                format={(amount) => formatCurrency(amount, currency)}
              />{" "}
              target
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              <AnimatedNumber
                value={goal.remainingAmount}
                format={(amount) => formatCurrency(amount, currency)}
              />{" "}
              remaining
            </span>
          )}
          <EstimatedCompletionLine goal={goal} />
        </div>
      </CardContent>
    </Card>
  )
}
