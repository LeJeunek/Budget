import { getMostRecentSummary } from "@/features/dashboard/server/monthly-summary"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"

/**
 * `MONTHLY_SUMMARY_READY` trigger (notifications-v2.md's Monthly Summary
 * trigger, phase-4b-technical-design.md §6).
 *
 * **Zero new computation, zero `lib/ai/` call site** — reads
 * `dashboard.server/monthly-summary.getMostRecentSummary(userId)` ONLY (never
 * `getSummaryHistory`'s full history), a plain, already-persisted
 * `MonthlySummary.narrative` field lookup. This trigger never generates,
 * paraphrases, or independently composes any narrative text of its own —
 * binding constraint 2's "verbatim reuse of `MonthlySummary.narrative`,
 * never independently composed" holds here by construction, since this file
 * has no code path that could produce narrative text at all.
 *
 * **Why only the single most-recent row, never the full history**
 * (phase-4b-technical-design.md §6's own explicit anti-launch-flood
 * decision): checking every past month's `MonthlySummary` row on this
 * trigger's first-ever evaluation for a long-tenured user would fire a burst
 * of stale "ready" notifications for months the user has already seen on the
 * Dashboard for a long time — the exact same class of launch-day flood Large
 * Purchase's own recency window exists to prevent, applied here by
 * extension. A user's full history remains reachable via the unrelated
 * `getSummaryHistory` view regardless of which months ever produced a
 * notification.
 *
 * **Fires once per calendar month** (AC1), and **never re-fires on a manual
 * "regenerate this summary"** (Edge Cases) — both guaranteed by the
 * `Notification` `@@unique([monthlySummaryId, type])` constraint via
 * `createNotificationIfNew`: a regenerated summary reuses the same
 * `MonthlySummary` row id, so the unique constraint alone makes regeneration
 * a no-op for this trigger, with no separate "was this already notified"
 * check needed.
 *
 * **Never fires when `narrative` is still null** (AC1/AC3) — `getMostRecentSummary`
 * returns `null` for a brand-new user with no completed month yet, and (per
 * that function's own JSDoc) collapses "no row exists yet" and "a row exists
 * but its narrative is null" into the same `narrative: null` result, which
 * this trigger treats identically: nothing to notify about either way.
 */
export async function evaluateMonthlySummaryTriggers(userId: string): Promise<Notification[]> {
  const mostRecent = await getMostRecentSummary(userId)

  if (!mostRecent || mostRecent.narrative === null) {
    return []
  }

  const created = await createNotificationIfNew({
    userId,
    type: "MONTHLY_SUMMARY_READY",
    monthlySummaryId: mostRecent.id,
  })

  return created ? [created] : []
}
