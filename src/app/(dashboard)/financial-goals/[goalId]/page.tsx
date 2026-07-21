import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getFinancialGoalById } from "@/features/financial-goals/server/service"
import { getDebtById } from "@/features/debt/server/service"
import { getAccounts } from "@/features/accounts/server/service"
import { FinancialGoalProgressBody } from "@/features/financial-goals/components/financial-goal-card"
import { FinancialGoalDetailActions } from "@/features/financial-goals/components/financial-goal-detail-actions"
import {
  FINANCIAL_GOAL_TYPE_LABELS,
} from "@/features/financial-goals/components/financial-goal-shared"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Financial Goal detail — full goal info plus its per-type computed progress
 * (docs/architecture/folder-tree.md's Phase 3b route list: "goal detail:
 * edit, progress (per-type view), archive"). Deliberately has no
 * contribution log/history section anywhere on this page (AC6) — that is
 * this feature's entire, defining difference from
 * `app/(dashboard)/goals/[goalId]/page.tsx`'s Savings Goal detail view, which
 * this page otherwise mirrors structurally (back link, header + badges +
 * actions, a `Card` with the progress body).
 *
 * Server Component: fetches the goal directly via
 * `service.getFinancialGoalById`, per docs/architecture/api-contracts.md, and
 * re-runs on every `router.refresh()` triggered by a mutation in its Client
 * Component children (`FinancialGoalDetailActions`) — same pattern as
 * `app/(dashboard)/goals/[goalId]/page.tsx` and `app/(dashboard)/debt/page.tsx`.
 *
 * Two small page-level reads exist purely to resolve display-only data
 * `FinancialGoalWithProgress` itself doesn't carry (see
 * `app/(dashboard)/financial-goals/page.tsx`'s own JSDoc for why these live
 * here, not inside `features/financial-goals/server`, which stays a
 * zero-new-cross-domain-function leaf module):
 *   - `getDebtById` (only for a `DEBT_PAYOFF` goal) — the linked debt's name,
 *     for the Edit dialog's read-only "Tracking: <name>" line.
 *   - `getAccounts` (only actually used by a `NET_WORTH_SAVINGS_TARGET` goal's
 *     Edit dialog) — fetched unconditionally since it's a single cheap,
 *     already-established read (matches `debt/page.tsx`'s own
 *     always-fetch-accounts pattern for its Link dialog).
 */
export default async function FinancialGoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { goalId } = await params
  const goal = await getFinancialGoalById(user.id, goalId)

  if (!goal) {
    return <FinancialGoalNotFound />
  }

  const [linkedDebt, accounts] = await Promise.all([
    goal.type === "DEBT_PAYOFF" && goal.linkedDebtId
      ? getDebtById(user.id, goal.linkedDebtId)
      : Promise.resolve(null),
    getAccounts(user.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/financial-goals"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Financial Goals
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {goal.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{FINANCIAL_GOAL_TYPE_LABELS[goal.type]}</Badge>
            {goal.isCompleted && <Badge>Completed</Badge>}
            {goal.type === "DEBT_PAYOFF" && goal.linkedDebtArchived && (
              <Badge variant="destructive">Linked debt archived</Badge>
            )}
          </div>
        </div>
        <FinancialGoalDetailActions
          goal={goal}
          accounts={accounts}
          linkedDebtName={linkedDebt?.name}
        />
      </div>

      <Card>
        <CardContent className="py-6">
          <FinancialGoalProgressBody goal={goal} />
        </CardContent>
      </Card>
    </div>
  )
}

/** Rendered when `goalId` doesn't exist or belongs to another user —
 * `getFinancialGoalById` returns `null` for both cases indistinguishably
 * (see its JSDoc), so this can't leak which one occurred. Mirrors
 * `app/(dashboard)/goals/[goalId]/page.tsx`'s `GoalNotFound` styling. */
function FinancialGoalNotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-base font-medium text-foreground">
          Goal not found
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This goal doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/financial-goals"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to Financial Goals
        </Link>
      </CardContent>
    </Card>
  )
}
