import { db } from "@/lib/db"

import type { Notification } from "../types"
import { dispatchNotificationEmail } from "./email-dispatch"
import { NOTIFICATION_INCLUDE, toNotification } from "./notification-mapper"
import { getNotificationThresholdSettings } from "./preferences"
import { evaluateBudgetAndBillTriggers } from "./triggers/budget-bill-triggers"
import { evaluateGoalAchievedTriggers } from "./triggers/goal-achieved-trigger"
import { evaluateLargePurchaseTriggers } from "./triggers/large-purchase-trigger"
import { evaluateLowBalanceTriggers } from "./triggers/low-balance-trigger"
import { evaluateMonthlySummaryTriggers } from "./triggers/monthly-summary-trigger"

/**
 * `features/notifications`' server layer, per docs/architecture/
 * api-contracts.md's Notifications section, docs/product/
 * calendar-and-notifications.md's Notifications v1 spec, and — Phase 4b —
 * docs/product/notifications-v2.md / docs/architecture/
 * phase-4b-technical-design.md §6-§7.
 *
 * `ensureNotifications` is now a thin orchestrator (phase-4b-technical-design.md
 * §6's file layout): it calls each trigger evaluator in `./triggers/*.ts`,
 * collects every newly-created `Notification` row across all six trigger
 * types, then performs the ONE shared email-dispatch step
 * (`./email-dispatch.ts`) once per newly-created row — never duplicated six
 * times across six trigger files. All six triggers' own detection/dedup
 * logic lives in their own file under `./triggers/`; this file owns none of
 * it.
 *
 * **Two callers, one evaluation path** (§6): a user's own request (via
 * `getNotifications`/`getUnreadCount` below, called from `GET /api/notifications`)
 * and the `evaluate-notifications` cron sweep (`evaluateNotificationsForAllUsers`
 * below, called from `app/api/cron/evaluate-notifications/route.ts`) both
 * call this exact same function for a given `userId`. This is safe by
 * construction, not by convention — every dedup/latch write in every trigger
 * evaluator is a database-level unique constraint or an atomic conditional
 * update (§6's atomicity note), never a read-then-write, so the two callers
 * racing each other for the same user can never double-fire or double-send.
 *
 * Returns `{ notificationsCreated, emailsSent }` purely for
 * `evaluateNotificationsForAllUsers`'s own aggregate reporting — existing
 * callers (`getNotifications`/`getUnreadCount` below) simply `await` this
 * without reading the result, same as before this return value existed.
 */
export async function ensureNotifications(
  userId: string,
): Promise<{ notificationsCreated: number; emailsSent: number }> {
  // Resolved once and threaded into both Large Purchase and Low Balance
  // below, rather than each trigger independently calling
  // `getNotificationThresholdSettings` itself — both need the identical
  // single-row `NotificationThresholdSettings` lookup for the same `userId`
  // in the same evaluation pass, so fetching it once avoids querying that
  // row twice per poll/cron iteration, per
  // docs/performance/phase-4b-performance-review.md Finding 4.
  const thresholdSettings = await getNotificationThresholdSettings(userId)

  const createdByTrigger = await Promise.all([
    evaluateBudgetAndBillTriggers(userId),
    evaluateGoalAchievedTriggers(userId),
    evaluateLargePurchaseTriggers(userId, thresholdSettings),
    evaluateLowBalanceTriggers(userId, thresholdSettings),
    evaluateMonthlySummaryTriggers(userId),
  ])

  const newlyCreated = createdByTrigger.flat()

  // Sequential, not `Promise.all` — email-dispatch.ts's own outbound network
  // call (Resend) per row is exactly the kind of unbounded-fan-out risk this
  // codebase already avoids elsewhere (ai-features-design.md §6's "no
  // unbounded per-request fan-out" constraint, restated here for a
  // different third-party dependency); in practice a single evaluation pass
  // produces at most a handful of newly-created rows, so sequential
  // dispatch costs nothing meaningful in the common case.
  let emailsSent = 0
  for (const notification of newlyCreated) {
    const { sent } = await dispatchNotificationEmail(userId, notification)
    if (sent) {
      emailsSent += 1
    }
  }

  return { notificationsCreated: newlyCreated.length, emailsSent }
}

/**
 * The `evaluate-notifications` cron entry point
 * (`app/api/cron/evaluate-notifications/route.ts`) — the "offline reach for
 * email" gap the lazy, poll-time-only path leaves (phase-4b-technical-design.md
 * §6: "a user who never opens the app never gets evaluated, which defeats
 * email's entire stated purpose"). Iterates every user **sequentially**,
 * never concurrently — mirrors `features/dashboard/server/snapshot.ts`'s
 * `captureAllUsersNetWorthSnapshots` and `features/dashboard/server/monthly-summary.ts`'s
 * `generateMonthlySummariesForAllUsers` sequential-loop precedent exactly,
 * calling the identical `ensureNotifications(userId)` a user's own request
 * would call — evaluation logic is written exactly once; it simply has two
 * callers now.
 *
 * One user's failure is caught and logged here rather than aborting the
 * whole run, the same "the rest keeps working" standard every other
 * all-users cron loop in this codebase already holds itself to.
 */
export async function evaluateNotificationsForAllUsers(): Promise<{
  processed: number
  emailsSent: number
}> {
  const users = await db.user.findMany({ select: { id: true } })

  let emailsSent = 0

  for (const user of users) {
    try {
      const result = await ensureNotifications(user.id)
      emailsSent += result.emailsSent
    } catch (error) {
      console.error(
        `[evaluate-notifications cron] Failed to process user ${user.id}:`,
        error,
      )
    }
  }

  return { processed: users.length, emailsSent }
}

// ---------------------------------------------------------------------------
// Reads (joins Notification -> BudgetCategory/Category, BillOccurrence/Bill,
// FinancialGoal, Transaction, Account, or MonthlySummary at read time — the
// schema stores only FKs, per prisma/schema.prisma's Notification model
// comment). Row shaping itself lives in `./notification-mapper.ts` — this
// file only orchestrates materialization + the two list/count reads below.
// ---------------------------------------------------------------------------

export interface GetNotificationsOptions {
  /** `true` = only rows with `readAt: null`. Default `false` (all active,
   * non-dismissed notifications, read or unread) — matches the inbox's
   * default "show everything still active" view; `unreadOnly` is for a
   * narrower view (e.g. a future "unread only" toggle), not the bell's
   * default poll. */
  unreadOnly?: boolean
}

/**
 * The caller's notification inbox, newest first. Always excludes dismissed
 * notifications (`dismissedAt: null`) — dismissing is a permanent
 * remove-from-inbox action (AC4), not a second read/unread state, so a
 * dismissed row never reappears here regardless of `unreadOnly`.
 *
 * Calls `ensureNotifications` first (materializing any newly-detected
 * triggers) so this always reflects the latest state before reading — per
 * api-contracts.md's "lazily materialized on poll" design.
 */
export async function getNotifications(
  userId: string,
  options: GetNotificationsOptions = {},
): Promise<Notification[]> {
  await ensureNotifications(userId)

  const { unreadOnly = false } = options

  const rows = await db.notification.findMany({
    where: {
      userId,
      dismissedAt: null,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: NOTIFICATION_INCLUDE,
  })

  return rows
    .map(toNotification)
    .filter((notification): notification is Notification => notification !== null)
}

/**
 * Count of active (non-dismissed), unread notifications — backs the
 * notification-bell badge. Also materializes first, for the same reason
 * `getNotifications` does, so the badge count is never stale relative to
 * what a poll would show in the inbox itself.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  await ensureNotifications(userId)

  return db.notification.count({
    where: { userId, dismissedAt: null, readAt: null },
  })
}

// Re-exported for `server/actions.ts` — same "share the read-shaping logic
// after a mutation" reasoning as `features/bills/server/service.ts`'s own
// exports. The actual implementation moved to `./notification-mapper.ts`
// (Phase 4b) to break an import cycle with `./triggers/*.ts` — see that
// file's own JSDoc.
export { NOTIFICATION_INCLUDE, toNotification }
