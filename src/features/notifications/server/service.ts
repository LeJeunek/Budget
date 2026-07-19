import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db"
import { getOverBudgetCategories } from "@/features/budgeting/server/service"
import { getUpcomingOccurrences } from "@/features/bills/server/service"
import { toUtcMidnight } from "@/features/bills/server/occurrence"

import type { Notification } from "../types"

/**
 * `features/notifications`' server layer, per docs/architecture/
 * api-contracts.md's Notifications section and docs/product/
 * calendar-and-notifications.md's Notifications v1 spec.
 *
 * Module boundary (Architecture.md's Phase 2 module-boundary rules,
 * restated here since this is the one module that deliberately reads across
 * two other domains): this file reads from Budgeting's and Bills' own
 * `server/service.ts` exports only — never queries `Budget`, `BudgetCategory`,
 * `Bill`, or `BillOccurrence` directly — and writes only to its own
 * `Notification` table. Budgeting/Bills data is never mutated from here.
 *
 * Lazy materialization, not a background job: `ensureNotifications` is
 * called at the top of every read below (`getNotifications`,
 * `getUnreadCount`), per api-contracts.md's "triggered by polling the
 * notification inbox" design — there is no scheduler in this app to run it
 * any other way.
 */

// ---------------------------------------------------------------------------
// Materialization (writes — Notification table only)
// ---------------------------------------------------------------------------

// "Due soon" advance window (AC2: "a short, sensible advance window (e.g. a
// few days out)"). 3 days: long enough to give a user real runway to act
// before an occurrence becomes Late, short enough that "due soon" still
// reads as an actionable, near-term nudge rather than early-planning noise a
// user would tune out. Chosen as a Backend Engineer implementation default
// per api-contracts.md's explicit note that this specific number is not an
// architectural decision — documented here the same way
// `features/bills/server/service.ts`'s `DEFAULT_HORIZON_MONTHS` documents
// its own bounded-window choice.
const DUE_SOON_WINDOW_DAYS = 3

/** `"YYYY-MM"` for the current UTC calendar month — the only month
 * `ensureNotifications` ever checks for over-budget categories, matching
 * AC1's "for the current month" scope exactly (past months are read-only
 * history in Budgeting, and are not re-evaluated for new notifications). */
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
 * Upserts one `BUDGET_OVER` notification per currently over-allocation
 * category for the current month.
 *
 * Dedup relies entirely on the database's `@@unique([budgetCategoryId, type])`
 * constraint via `upsert` — never a "check if one exists, then insert"
 * sequence. This is what makes re-running `ensureNotifications` on every
 * poll safe and race-free: two concurrent polls upserting the same
 * `budgetCategoryId` + `BUDGET_OVER` pair both succeed, and Postgres
 * guarantees at most one row ever exists for that pair, with no
 * read-then-write race window for a duplicate to sneak through. The `update:
 * {}` branch is a deliberate no-op — an already-existing notification for
 * this category+type is left completely untouched (never "re-freshened"),
 * per the Edge Cases' "one active over-budget notification per category per
 * month is sufficient" and "dismissing does not get resurrected" rules.
 */
async function ensureBudgetOverNotifications(userId: string, month: string): Promise<void> {
  const overBudget = await getOverBudgetCategories(userId, month)

  await Promise.all(
    overBudget.map((category) =>
      db.notification.upsert({
        where: {
          budgetCategoryId_type: {
            budgetCategoryId: category.budgetCategoryId,
            type: "BUDGET_OVER",
          },
        },
        create: {
          userId,
          type: "BUDGET_OVER",
          budgetCategoryId: category.budgetCategoryId,
        },
        update: {},
      }),
    ),
  )
}

/**
 * Upserts `BILL_DUE_SOON`/`BILL_LATE` notifications from the caller's
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
 *     `getUpcomingOccurrences` entirely, so no further upserts touch it —
 *     already-fired rows are left as-is, never deleted or refreshed.
 *
 * Dedup, same as `ensureBudgetOverNotifications`: DB-enforced via `upsert`
 * against `@@unique([billOccurrenceId, type])`, not a check-then-insert.
 */
async function ensureBillNotifications(userId: string): Promise<void> {
  const upcoming = await getUpcomingOccurrences(userId)
  const today = new Date()

  const dueSoonWrites = upcoming
    .filter((occurrence) => occurrence.status !== "LATE" && isDueSoon(occurrence.dueDate, today))
    .map((occurrence) =>
      db.notification.upsert({
        where: {
          billOccurrenceId_type: {
            billOccurrenceId: occurrence.occurrenceId,
            type: "BILL_DUE_SOON",
          },
        },
        create: {
          userId,
          type: "BILL_DUE_SOON",
          billOccurrenceId: occurrence.occurrenceId,
        },
        update: {},
      }),
    )

  const lateWrites = upcoming
    .filter((occurrence) => occurrence.status === "LATE")
    .map((occurrence) =>
      db.notification.upsert({
        where: {
          billOccurrenceId_type: {
            billOccurrenceId: occurrence.occurrenceId,
            type: "BILL_LATE",
          },
        },
        create: {
          userId,
          type: "BILL_LATE",
          billOccurrenceId: occurrence.occurrenceId,
        },
        update: {},
      }),
    )

  await Promise.all([...dueSoonWrites, ...lateWrites])
}

/**
 * Materializes any newly-detected `BUDGET_OVER`/`BILL_DUE_SOON`/`BILL_LATE`
 * triggers into `Notification` rows for `userId`. Idempotent and safe to
 * call on every poll (see the two helpers above for the upsert-based dedup
 * guarantee) — this is the only place this module writes to the database.
 *
 * Per api-contracts.md: called at the top of every read below, not from a
 * background job (none exists in this app).
 */
export async function ensureNotifications(userId: string): Promise<void> {
  await Promise.all([
    ensureBudgetOverNotifications(userId, currentMonthString()),
    ensureBillNotifications(userId),
  ])
}

// ---------------------------------------------------------------------------
// Reads (joins Notification -> BudgetCategory/Category or
// BillOccurrence/Bill at read time — the schema stores only FKs, per
// prisma/schema.prisma's Notification model comment)
// ---------------------------------------------------------------------------

const NOTIFICATION_INCLUDE = {
  budgetCategory: {
    select: {
      id: true,
      categoryId: true,
      amount: true,
      category: { select: { name: true } },
    },
  },
  billOccurrence: {
    select: {
      id: true,
      billId: true,
      dueDate: true,
      bill: { select: { name: true, expectedAmount: true } },
    },
  },
} satisfies Prisma.NotificationInclude

type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof NOTIFICATION_INCLUDE }>

/**
 * Shapes one joined `Notification` row into its client-safe, denormalized
 * `Notification` type (see `../types.ts`'s JSDoc for why the join happens
 * here rather than at write time). Exported so `server/actions.ts` can build
 * the same shape after a mutation without duplicating this mapping — mirrors
 * `features/bills/server/service.ts`'s `toBillOccurrence` export for the
 * exact same reason.
 *
 * Returns `null` for a row whose joined `budgetCategory`/`billOccurrence`
 * (or, for the budget case, its `categoryId`/`category`) is unexpectedly
 * missing. This should not happen in practice — both FKs are `onDelete:
 * Cascade` (prisma/schema.prisma), so a Notification never outlives the row
 * it refers to — but is handled defensively (skip, don't throw) so one
 * malformed row can never break the whole inbox read.
 */
function toNotification(row: NotificationRow): Notification | null {
  const base = {
    id: row.id,
    createdAt: row.createdAt,
    readAt: row.readAt,
    dismissedAt: row.dismissedAt,
  }

  if (row.type === "BUDGET_OVER") {
    const budgetCategory = row.budgetCategory
    if (!budgetCategory || !budgetCategory.categoryId || !budgetCategory.category) {
      return null
    }
    return {
      ...base,
      type: "BUDGET_OVER",
      budgetCategoryId: budgetCategory.id,
      categoryId: budgetCategory.categoryId,
      categoryName: budgetCategory.category.name,
      allocated: budgetCategory.amount.toNumber(),
    }
  }

  if (row.type === "BILL_DUE_SOON" || row.type === "BILL_LATE") {
    const billOccurrence = row.billOccurrence
    if (!billOccurrence || !billOccurrence.bill) {
      return null
    }
    return {
      ...base,
      type: row.type,
      billOccurrenceId: billOccurrence.id,
      billId: billOccurrence.billId,
      billName: billOccurrence.bill.name,
      dueDate: billOccurrence.dueDate,
      expectedAmount: billOccurrence.bill.expectedAmount.toNumber(),
    }
  }

  // Exhaustiveness guard: if a new NotificationType enum member is ever
  // added to prisma/schema.prisma without updating this function, this
  // throws a loud, specific error instead of silently dropping the
  // notification from every inbox read.
  const exhaustiveCheck: never = row.type
  throw new Error(`Unsupported notification type: ${String(exhaustiveCheck)}`)
}

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
 * triggers) so this always reflects the latest Budgeting/Bills state before
 * reading — per api-contracts.md's "lazily materialized on poll" design.
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

// Exported for `server/actions.ts` — same "share the read-shaping logic
// after a mutation" reasoning as `features/bills/server/service.ts`'s own
// exports.
export { NOTIFICATION_INCLUDE, toNotification }
