import { getOverBudgetCategories } from "@/features/budgeting/server/service"
import { getUpcomingOccurrences } from "@/features/bills/server/service"
import { toUtcMidnight } from "@/features/bills/server/occurrence"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"

/**
 * Notifications v1's `BUDGET_OVER`/`BILL_DUE_SOON`/`BILL_LATE` trigger logic
 * (docs/product/calendar-and-notifications.md), extracted as-is (unchanged
 * detection behavior) out of `service.ts` into its own file, per
 * docs/architecture/phase-4b-technical-design.md §6's file layout — the same
 * file-size/SRP reason every other multi-concern module in this codebase has
 * already been split this way (Analytics' per-metric-family files).
 *
 * **One adaptation, not a behavior change:** the original implementation used
 * `db.notification.upsert(..., update: {})` directly — correct for dedup, but
 * an `upsert`'s return value cannot tell a caller whether the row was newly
 * created or already existed. Notifications v2 needs exactly that
 * distinction (a newly-created row is a candidate for `email-dispatch.ts`; an
 * already-existing one is not), so both helpers below now go through
 * `../notification-mapper.ts`'s `createNotificationIfNew` (an attempted
 * `create`, catching the identical unique-constraint violation an `upsert`'s
 * conflict branch would have silently absorbed) instead of `upsert`. The
 * observable dedup guarantee — at most one notification per `(budgetCategoryId,
 * type)`/`(billOccurrenceId, type)` — is identical either way; only the
 * mechanism used to express "already exists, do nothing" changed.
 */

// "Due soon" advance window (AC2: "a short, sensible advance window (e.g. a
// few days out)"). 3 days: long enough to give a user real runway to act
// before an occurrence becomes Late, short enough that "due soon" still
// reads as an actionable, near-term nudge rather than early-planning noise a
// user would tune out. Chosen as a Backend Engineer implementation default
// per api-contracts.md's explicit note that this specific number is not an
// architectural decision — unchanged from the original implementation.
const DUE_SOON_WINDOW_DAYS = 3

/** `"YYYY-MM"` for the current UTC calendar month — the only month this
 * module ever checks for over-budget categories, matching AC1's "for the
 * current month" scope exactly (past months are read-only history in
 * Budgeting, and are not re-evaluated for new notifications). */
function currentMonthString(now: Date = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/** `true` when `dueDate` falls within `[today, today + DUE_SOON_WINDOW_DAYS]`
 * inclusive — "due today" counts as due-soon (0 days out), matching AC2's
 * "due within" wording. Dates are UTC-midnight-normalized via
 * `toUtcMidnight` (reused from `features/bills/server/occurrence.ts`, the
 * same helper Bills' own status computation uses) so this never
 * misclassifies a due date because of a stray time-of-day component. */
function isDueSoon(dueDate: Date, today: Date): boolean {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const diffDays =
    (toUtcMidnight(dueDate).getTime() - toUtcMidnight(today).getTime()) / MS_PER_DAY
  return diffDays >= 0 && diffDays <= DUE_SOON_WINDOW_DAYS
}

/**
 * Attempts one `BUDGET_OVER` notification per currently over-allocation
 * category for the current month, returning only the newly-created ones
 * (already-existing rows return `null` from `createNotificationIfNew` and
 * are filtered out) — `service.ts`'s `ensureNotifications` needs exactly the
 * newly-created subset to know which rows are candidates for
 * `email-dispatch.ts`.
 */
async function evaluateBudgetOverTriggers(
  userId: string,
  month: string,
): Promise<Notification[]> {
  const overBudget = await getOverBudgetCategories(userId, month)

  const created = await Promise.all(
    overBudget.map((category) =>
      createNotificationIfNew({
        userId,
        type: "BUDGET_OVER",
        budgetCategoryId: category.budgetCategoryId,
      }),
    ),
  )

  return created.filter((notification): notification is Notification => notification !== null)
}

/**
 * Attempts `BILL_DUE_SOON`/`BILL_LATE` notifications from the caller's
 * upcoming-occurrences list (`bills.service.getUpcomingOccurrences`, already
 * scoped to each active bill's next *unpaid* occurrence only — see that
 * function's own JSDoc). This single list correctly covers every Edge Case
 * this module needs:
 *   - An occurrence already Late the first time this ever runs still
 *     surfaces a `BILL_LATE` notification (no "predates the feature" skip —
 *     `getUpcomingOccurrences` reports Late occurrences exactly like any
 *     other unpaid one).
 *   - The same occurrence can accumulate both a `BILL_DUE_SOON` row (from an
 *     earlier poll, while `status` was Upcoming/DueToday and within the
 *     window) and a later `BILL_LATE` row (once `status` becomes Late,
 *     still unpaid) — different `type`s, same `billOccurrenceId`, both
 *     unique constraints permit this combination (see
 *     prisma/schema.prisma's `Notification` model comment).
 *   - Once paid, the occurrence stops appearing in
 *     `getUpcomingOccurrences` entirely, so no further attempts touch it —
 *     already-fired rows are left as-is, never deleted or refreshed.
 */
async function evaluateBillTriggers(userId: string): Promise<Notification[]> {
  const upcoming = await getUpcomingOccurrences(userId)
  const today = new Date()

  const dueSoonWrites = upcoming
    .filter((occurrence) => occurrence.status !== "LATE" && isDueSoon(occurrence.dueDate, today))
    .map((occurrence) =>
      createNotificationIfNew({
        userId,
        type: "BILL_DUE_SOON",
        billOccurrenceId: occurrence.occurrenceId,
      }),
    )

  const lateWrites = upcoming
    .filter((occurrence) => occurrence.status === "LATE")
    .map((occurrence) =>
      createNotificationIfNew({
        userId,
        type: "BILL_LATE",
        billOccurrenceId: occurrence.occurrenceId,
      }),
    )

  const created = await Promise.all([...dueSoonWrites, ...lateWrites])

  return created.filter((notification): notification is Notification => notification !== null)
}

/**
 * Materializes any newly-detected `BUDGET_OVER`/`BILL_DUE_SOON`/`BILL_LATE`
 * triggers into `Notification` rows for `userId`, returning the
 * newly-created ones only. Idempotent and safe to call on every poll (see
 * the two helpers above for the dedup guarantee) — called by both
 * `service.ts`'s lazy, poll-time `ensureNotifications` and the
 * `evaluate-notifications` cron sweep.
 */
export async function evaluateBudgetAndBillTriggers(userId: string): Promise<Notification[]> {
  const [budgetOver, bills] = await Promise.all([
    evaluateBudgetOverTriggers(userId, currentMonthString()),
    evaluateBillTriggers(userId),
  ])

  return [...budgetOver, ...bills]
}
