import { getRecentSummaries } from "@/features/dashboard/server/monthly-summary"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"

/**
 * (Phase 4b bug fix) Bounded evaluation window, in months (Phase 4b bug fix
 * — see docs/testing/bug-reports/
 * monthly-summary-notification-skips-months-after-evaluation-gap.md).
 * Mirrors Large Purchase's own `RECENCY_WINDOW_DAYS` precedent for the
 * identical tradeoff: wide enough that an ordinary evaluation gap (a cron
 * outage, or an inactive user's poll simply not firing) spanning more than
 * one newly-generated month never permanently drops the older month's
 * notification, but still bounded so a long-tenured user's very first-ever
 * evaluation can't fire a burst of stale "ready" notifications for their
 * entire history -- the concern this module originally (and still
 * correctly) wanted to avoid, just addressed with a bounded window instead
 * of an unconditional single-row check.
 */
const EVALUATION_WINDOW_MONTHS = 6

/**
 * `MONTHLY_SUMMARY_READY` trigger (notifications-v2.md's Monthly Summary
 * trigger, phase-4b-technical-design.md §6).
 *
 * **Zero new computation, zero `lib/ai/` call site** — reads
 * `dashboard.server/monthly-summary.getRecentSummaries(userId, ...)` ONLY
 * (never `getSummaryHistory`'s full, unbounded history), a plain,
 * already-persisted `MonthlySummary.narrative` field lookup. This trigger
 * never generates, paraphrases, or independently composes any narrative
 * text of its own — binding constraint 2's "verbatim reuse of
 * `MonthlySummary.narrative`, never independently composed" holds here by
 * construction, since this file has no code path that could produce
 * narrative text at all.
 *
 * **Why a bounded recent-months window, not the single most-recent row, and
 * not the full history** (phase-4b-technical-design.md §6's own explicit
 * anti-launch-flood decision, now closed against a second failure mode —
 * see this file's own bug fix history below): checking every past month's
 * `MonthlySummary` row on this trigger's first-ever evaluation for a
 * long-tenured user would fire a burst of stale "ready" notifications for
 * months the user has already seen on the Dashboard for a long time — the
 * exact same class of launch-day flood Large Purchase's own recency window
 * exists to prevent, applied here by extension. A user's full history
 * remains reachable via the unrelated `getSummaryHistory` view regardless
 * of which months ever produced a notification.
 *
 * That anti-flood reasoning only ever justified excluding a long-tenured
 * user's *old* history — it never justified checking only the single
 * *latest* row on every ongoing evaluation pass, which is what this file
 * originally did. That narrower behavior had its own bug: if evaluation
 * doesn't run at all for a user between two (or more) consecutive months'
 * `MonthlySummary` generations — a cron outage spanning a month boundary,
 * or an inactive user whose lazy poll doesn't fire for a stretch — the
 * single-most-recent-row check permanently skips every month except
 * whichever is newest at the moment evaluation resumes, with no backfill
 * path. `EVALUATION_WINDOW_MONTHS` closes that gap: every evaluation pass
 * (both the lazy per-user poll and the `evaluate-notifications` cron sweep)
 * now checks the last several months' rows, so a multi-month gap is safely
 * caught up on the next pass, while the window still bounds a first-ever
 * evaluation's blast radius the same way the original single-row check did.
 *
 * **Fires once per calendar month** (AC1), and **never re-fires on a manual
 * "regenerate this summary"** (Edge Cases) — both guaranteed by the
 * `Notification` `@@unique([monthlySummaryId, type])` constraint via
 * `createNotificationIfNew`: a regenerated summary reuses the same
 * `MonthlySummary` row id, so the unique constraint alone makes regeneration
 * a no-op for this trigger, with no separate "was this already notified"
 * check needed. That same dedup guarantee is also what makes broadening
 * this trigger's read from one row to several safe: re-checking a month
 * that already has a `MONTHLY_SUMMARY_READY` notification on every
 * subsequent evaluation pass is a guaranteed no-op, never a duplicate.
 *
 * **Never fires when `narrative` is still null** (AC1/AC3) — a row with a
 * null `narrative` (a brand-new user with no completed month yet, or a
 * month whose generation attempt failed) is filtered out below before any
 * `createNotificationIfNew` attempt, for every row in the window, not just
 * the latest one.
 */
export async function evaluateMonthlySummaryTriggers(userId: string): Promise<Notification[]> {
  const recentSummaries = await getRecentSummaries(userId, EVALUATION_WINDOW_MONTHS)

  const readyForNotification = recentSummaries.filter((summary) => summary.narrative !== null)

  const created = await Promise.all(
    readyForNotification.map((summary) =>
      createNotificationIfNew({
        userId,
        type: "MONTHLY_SUMMARY_READY",
        monthlySummaryId: summary.id,
      }),
    ),
  )

  return created.filter((notification): notification is Notification => notification !== null)
}
