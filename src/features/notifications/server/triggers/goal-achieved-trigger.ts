import { db } from "@/lib/db"
import { getFinancialGoalCompletionStatus } from "@/features/financial-goals/server/service"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"

/**
 * `GOAL_ACHIEVED` trigger (docs/product/notifications-v2.md's Goal Achieved
 * trigger, docs/architecture/phase-4b-technical-design.md §6/§7.3).
 *
 * Reads `financial-goals.service.getFinancialGoalCompletionStatus(userId)` —
 * a narrower, completion-only counterpart to `getFinancialGoals`'s default
 * non-archived list, returning just `isCompleted`/`completionNotifiedAt` per
 * goal instead of the full progress-view shape (`currentMeasuredValue`,
 * `trend`, `currentRollingAverageRate`, etc. — none of which this trigger
 * ever reads). `isCompleted` is still exactly the same read-time computation
 * per goal type (Debt Payoff, Net Worth/Savings Target, Savings Rate Target
 * — `financial-goals/server/progress-math.ts`) that `getFinancialGoals`
 * itself uses internally; this trigger introduces no new completion
 * computation of its own, per the design doc's "no new computation, no
 * independently-maintained 'achieved' flag" framing. Switched from
 * `getFinancialGoals` per docs/performance/phase-4b-performance-review.md
 * Finding 5 — this trigger runs on every 60-second bell poll and every cron
 * sweep iteration, so the mini trend-line read `getFinancialGoals` builds
 * for the goals list page (and this trigger never looked at) was real,
 * repeated, avoidable per-poll cost for any user with a `TOTAL_NET_WORTH`-
 * basis goal.
 *
 * **Fires exactly once, ever, per goal (AC1).** Guarded by TWO independent
 * mechanisms, per schema.prisma §7.2/§7.3's own comments:
 *   1. `FinancialGoal.completionNotifiedAt` — the primary guard. Claimed via
 *      a single atomic conditional `updateMany({ where: { id, userId,
 *      completionNotifiedAt: null }, data: { completionNotifiedAt: now() } })`
 *      and checking `count === 1` — never a separate read-then-write, per
 *      `ai-features-design.md` Finding 6b's TOCTOU-race-prevention pattern
 *      (mirrors `lib/ai/rate-limit.ts`'s per-key cooldown claims, applied here
 *      to a different table). This is what makes two near-simultaneous
 *      callers (a user's own poll and the `evaluate-notifications` cron
 *      racing each other for the same user) unable to both win the claim.
 *   2. The `Notification` `@@unique([financialGoalId, type])` constraint —
 *      a second, redundant guarantee via `createNotificationIfNew`, in case
 *      a future code path ever bypassed the latch above.
 *
 * **Never fires for a goal already Completed before this feature shipped**
 * — the one-time data migration required by schema.prisma §7.3 backfills
 * `completionNotifiedAt` for every already-Completed goal at deploy time, so
 * by the time this trigger ever runs, only a genuinely NEW transition to
 * Completed has `completionNotifiedAt: null`. This trigger performs no
 * backfill/retroactive-detection logic of its own — that is entirely the
 * migration's job, per the design doc's explicit "not something the
 * trigger evaluator does" framing.
 *
 * **Never fires for an archived goal** —
 * `getFinancialGoalCompletionStatus`'s `archivedAt: null` filter (always
 * on, unconditionally — see that function's own JSDoc) excludes archived
 * goals from this read entirely, which is exactly AC4's "a goal archived
 * before ever reaching its completion criterion never fires this trigger"
 * (there is nothing to evaluate for it) and the Edge Cases' "unarchived
 * after being archived while still short of target, later reaches
 * completion: fires normally" (once unarchived, it reappears in this same
 * list and is evaluated like any other active goal).
 */
export async function evaluateGoalAchievedTriggers(userId: string): Promise<Notification[]> {
  const goals = await getFinancialGoalCompletionStatus(userId)
  const now = new Date()

  const newlyCompleted = goals.filter(
    (goal) => goal.isCompleted === true && goal.completionNotifiedAt === null,
  )

  const created = await Promise.all(
    newlyCompleted.map(async (goal) => {
      const claim = await db.financialGoal.updateMany({
        where: { id: goal.id, userId, completionNotifiedAt: null },
        data: { completionNotifiedAt: now },
      })
      if (claim.count !== 1) {
        // Lost the race (or was already claimed between this read and this
        // write) — another concurrent evaluation already owns this goal's
        // one-and-only notification.
        return null
      }

      return createNotificationIfNew({
        userId,
        type: "GOAL_ACHIEVED",
        financialGoalId: goal.id,
      })
    }),
  )

  return created.filter((notification): notification is Notification => notification !== null)
}
