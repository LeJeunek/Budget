import type { NotificationType } from "@prisma/client"

// Re-export the Prisma-generated enum so consumers (hooks, and later the UI
// Component Engineer's notification-bell component) never need to import
// from "@prisma/client" directly — mirrors `features/bills/types.ts`'s
// `BillSchedule` re-export.
export type { NotificationType }

/**
 * Client-safe representation of a `Notification` row, per
 * docs/architecture/api-contracts.md's Notifications section and
 * docs/product/calendar-and-notifications.md's AC3 ("a UI can render it
 * without a second fetch").
 *
 * The schema (`prisma/schema.prisma`) only stores the two nullable FKs
 * (`budgetCategoryId`, `billOccurrenceId`) plus `type` — it deliberately has
 * no denormalized display columns of its own (see that model's comment: no
 * new schema columns are this feature's to invent). `server/service.ts`'s
 * `toNotification` joins through `budgetCategory`/`billOccurrence` at read
 * time and shapes the result into this type, one variant per
 * `NotificationType`, so a caller never needs to know which FK is set or
 * issue a follow-up fetch to render a category/bill name.
 *
 * Modeled as a discriminated union on `type` (rather than one interface with
 * every field optional) so a UI component can `switch` on `type` and get
 * exhaustive, non-optional field access per branch — the same reasoning
 * `features/bills/server/occurrence.ts`'s exhaustive `computeNextDueDate`
 * switch uses for `BillSchedule`.
 */
export type Notification =
  | BudgetOverNotification
  | BillDueSoonNotification
  | BillLateNotification

interface NotificationBase {
  id: string
  createdAt: Date
  /** `null` = unread. Set by `markNotificationRead`/`markAllNotificationsRead`
   * (AC4) — never implies the underlying budget/bill state changed. */
  readAt: Date | null
  /** `null` = still active in the inbox. Set by `dismissNotification` (AC4).
   * `server/service.ts`'s `getNotifications` excludes dismissed rows by
   * default — dismissing is a permanent "remove from the inbox" action, not
   * a second unread/read toggle. */
  dismissedAt: Date | null
}

/** A budgeted category's Spent has exceeded its Allocated for the current
 * month (AC1). `allocated` is included (cheap — already on the joined row)
 * so the inbox can show "over your $X budget" without a second fetch;
 * `spent` is deliberately NOT included here — it is a live, derived figure
 * (never stored, per Budgeting's own data model) that would require a fresh
 * transaction aggregation on every notification-bell poll, which this
 * frequently-polled read path should not pay for on every row. A caller
 * that needs the live Spent figure follows `categoryId` to Budgeting's own
 * page, the same "link to source for full detail" pattern the Calendar v1
 * spec uses for its own entries. */
export interface BudgetOverNotification extends NotificationBase {
  type: "BUDGET_OVER"
  budgetCategoryId: string
  categoryId: string
  categoryName: string
  allocated: number
}

interface BillNotificationBase extends NotificationBase {
  billOccurrenceId: string
  billId: string
  billName: string
  dueDate: Date
  expectedAmount: number
}

/** A bill occurrence is due within the advance window (AC2's "few days
 * out"), and not yet paid. See `server/service.ts` for the exact window. */
export interface BillDueSoonNotification extends BillNotificationBase {
  type: "BILL_DUE_SOON"
}

/** A bill occurrence has passed its due date without being marked paid
 * (AC2's "again if it becomes Late") — fires independently of, and in
 * addition to, any `BILL_DUE_SOON` notification already fired for the same
 * occurrence (distinct `type`s, same `billOccurrenceId` — both unique
 * constraints on `Notification` allow this combination, see
 * prisma/schema.prisma). */
export interface BillLateNotification extends BillNotificationBase {
  type: "BILL_LATE"
}
