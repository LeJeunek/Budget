// FinanceOS — one-time backfill for `FinancialGoal.completionNotifiedAt` on
// SAVINGS_RATE_TARGET goals. Run via `npm run backfill:savings-rate-completion`.
//
// Why this exists (docs/release/phase-4b-notes.md Section 1, the gate-
// blocking finding this script closes): the Phase 4b schema migration
// (`prisma/migrations/20260728082118_phase_4b_reports_notifications_v2/
// migration.sql`) backfilled `completionNotifiedAt` for DEBT_PAYOFF and
// NET_WORTH_SAVINGS_TARGET goals that were already Completed before the
// GOAL_ACHIEVED notification trigger shipped, so the trigger's first
// evaluation pass wouldn't see them as newly transitioning and fire a burst
// of stale "you achieved this months ago" notifications
// (notifications-v2.md's explicit "no retroactive fire" edge case). That
// migration deliberately skipped SAVINGS_RATE_TARGET goals — at the time it
// was written, no rolling-savings-rate formula existed anywhere in this
// codebase to replicate in raw SQL, and the migration's own comment
// (lines ~95-111) flagged this explicitly rather than silently deciding it:
// "Before goal-achieved-trigger.ts ships, re-run an equivalent backfill
// UPDATE for this type using that formula once it exists, or explicitly
// accept this gap." Neither happened before `goal-achieved-trigger.ts`
// shipped, so any user with an already-complete SAVINGS_RATE_TARGET goal at
// deploy time is due exactly one incorrect retroactive notification the
// next time triggers evaluate for them.
//
// That formula now genuinely exists —
// `computeCurrentRollingSavingsRatePercent`
// (src/features/financial-goals/server/service.ts), already reused by
// `getFinancialGoalCompletionStatus` (the same function
// `goal-achieved-trigger.ts` itself calls) to determine `isCompleted` for
// this goal type. This script deliberately does NOT re-derive that formula
// in raw SQL a second time — the original migration comment was right that
// doing so would be fragile (two independently-maintained copies of the
// same rolling-average math that could silently drift apart). Instead it
// calls the exact same TypeScript function this trigger already trusts, so
// the backfill and the live trigger can never disagree about what "already
// complete" means for this goal type.
//
// Idempotent: the initial query only ever selects rows with
// `completionNotifiedAt: null`, and each write is an atomic conditional
// `updateMany` re-checking that same condition (the identical
// TOCTOU-race-prevention pattern `goal-achieved-trigger.ts` and
// `lib/ai/rate-limit.ts` already use) — running this script twice in a row
// is a no-op the second time, and running it concurrently with the live
// GOAL_ACHIEVED trigger's own evaluation can never double-claim the same
// goal.
//
// This is an operational deployment step, not something that runs
// automatically — it must be run once against production before/during the
// Phase 4b deploy (see docs/planning/risk-register.md's entry for this gap,
// and docs/release/phase-4b-checklist.md).
import { db } from "@/lib/db"
import { getFinancialGoalCompletionStatus } from "@/features/financial-goals/server/service"

import { selectGoalIdsToBackfill } from "./backfill-savings-rate-goal-notifications-logic"

/** One row's worth of what the initial query needs — just enough to group by
 * user and know which goal ids belong to this backfill's target set. */
interface TargetGoalRow {
  id: string
  userId: string
}

async function backfillSavingsRateGoalNotifications(): Promise<void> {
  const now = new Date()

  const targetGoals: TargetGoalRow[] = await db.financialGoal.findMany({
    where: {
      type: "SAVINGS_RATE_TARGET",
      archivedAt: null,
      completionNotifiedAt: null,
    },
    select: { id: true, userId: true },
  })

  console.log(
    `[backfill:savings-rate-completion] Found ${targetGoals.length} non-archived SAVINGS_RATE_TARGET goal(s) with completionNotifiedAt: null to check.`,
  )

  // Group by user so `getFinancialGoalCompletionStatus` (a per-user read
  // that gathers every active goal's live source data) is called at most
  // once per distinct user, regardless of how many qualifying goals that
  // user has — mirrors `buildProgressContext`'s own "once per read, not once
  // per goal" reasoning inside that function.
  const goalIdsByUser = new Map<string, Set<string>>()
  for (const goal of targetGoals) {
    const existing = goalIdsByUser.get(goal.userId)
    if (existing) {
      existing.add(goal.id)
    } else {
      goalIdsByUser.set(goal.userId, new Set([goal.id]))
    }
  }

  let checkedCount = 0
  let backfilledCount = 0

  // Sequential per user, matching this codebase's standing "sequential
  // per-user iteration" convention for user-scoped batch work (per
  // docs/planning/risk-register.md #21's description of the notification
  // cron sweep) — this is a one-time operational script, not a latency-
  // sensitive request path, so simplicity and legible, ordered logging win
  // over parallelizing across users.
  for (const [userId, targetGoalIds] of goalIdsByUser) {
    checkedCount += targetGoalIds.size

    const completionStatuses = await getFinancialGoalCompletionStatus(userId)
    const idsToBackfill = selectGoalIdsToBackfill(targetGoalIds, completionStatuses)

    for (const goalId of idsToBackfill) {
      // Atomic conditional claim, re-checking completionNotifiedAt: null at
      // write time — never a separate read-then-write. Prevents a double
      // backfill if this script is re-run concurrently with itself or with
      // the live GOAL_ACHIEVED trigger's own evaluation for this user, the
      // same TOCTOU-race-prevention pattern `goal-achieved-trigger.ts` and
      // `lib/ai/rate-limit.ts` already use.
      const claim = await db.financialGoal.updateMany({
        where: { id: goalId, userId, completionNotifiedAt: null },
        data: { completionNotifiedAt: now },
      })

      if (claim.count === 1) {
        backfilledCount += 1
        console.log(
          `[backfill:savings-rate-completion] Backfilled completionNotifiedAt for goal ${goalId} (user ${userId}).`,
        )
      } else {
        console.log(
          `[backfill:savings-rate-completion] Skipped goal ${goalId} (user ${userId}) — already claimed (completionNotifiedAt no longer null).`,
        )
      }
    }
  }

  console.log(
    `[backfill:savings-rate-completion] Done. Checked ${checkedCount} goal(s) across ${goalIdsByUser.size} user(s); backfilled ${backfilledCount}.`,
  )
}

backfillSavingsRateGoalNotifications()
  .catch((error: unknown) => {
    console.error("[backfill:savings-rate-completion] Failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
