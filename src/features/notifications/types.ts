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
  | GoalAchievedNotification
  | LargePurchaseNotification
  | LowBalanceNotification
  | MonthlySummaryReadyNotification

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

// ---------------------------------------------------------------------------
// Phase 4b (Notifications v2) — four new trigger types, per
// docs/product/notifications-v2.md and docs/architecture/
// phase-4b-technical-design.md §6-§7. Each interface below carries exactly
// the fields its equivalent in-app card needs to render without a second
// fetch (the same "denormalize the joined display fields onto this type"
// convention as `BudgetOverNotification`/`BillNotificationBase` above), and
// — per the design doc §5's data-minimization rule — exactly the fields its
// equivalent email template is allowed to show, never more.
// ---------------------------------------------------------------------------

/** A `FinancialGoal` transitioned from active to Completed (notifications-v2.md's
 * Goal Achieved trigger, AC1-4). Links to that goal's detail view. */
export interface GoalAchievedNotification extends NotificationBase {
  type: "GOAL_ACHIEVED"
  financialGoalId: string
  goalName: string
}

/** A single expense transaction (or split line item) whose amount met or
 * exceeded the user's Large Purchase threshold at the moment it was recorded
 * or edited (notifications-v2.md's Large Purchase trigger, AC1-6). `amount`
 * is stored/shown as a positive magnitude (the trigger only ever evaluates
 * expense transactions, whose stored `Transaction.amount` is negative) so the
 * inbox/email can read "a $X purchase at Y" without the caller re-deriving
 * the sign. */
export interface LargePurchaseNotification extends NotificationBase {
  type: "LARGE_PURCHASE"
  transactionId: string
  merchant: string
  amount: number
  date: Date
}

/** An eligible (Checking/Savings/Cash) `Account`'s balance crossed below its
 * threshold (notifications-v2.md's Low Balance trigger, AC1-6). Unlike
 * `BudgetOverNotification.allocated` (a value fixed for the life of its
 * `BudgetCategory` row), neither the account's balance at the moment of
 * crossing nor the threshold that applied then has anywhere to be persisted
 * on `Notification` (prisma/schema.prisma's Phase 4b section adds no such
 * columns) — `accountName`/`balance` are therefore a live join through
 * `accountId` at read time, reflecting the account's *current* state, which
 * in practice still reads correctly for the common case (the notification
 * stays in the inbox while the account remains below threshold, per the
 * re-arm-on-recovery design) even though it is not a frozen historical
 * snapshot the way the budget fields above are. */
export interface LowBalanceNotification extends NotificationBase {
  type: "LOW_BALANCE"
  accountId: string
  accountName: string
  balance: number
}

// ---------------------------------------------------------------------------
// Phase 4b — notification preferences / threshold settings, per
// docs/architecture/api-contracts.md's Phase 4b section. Read/written by
// `server/preferences.ts` and `server/actions.ts`'s
// `updateNotificationPreference`/`updateNotificationThresholdSettings`.
// ---------------------------------------------------------------------------

/**
 * One trigger type's in-app/email preference — always exactly 6 of these
 * (one per `NotificationType`) come back from `getNotificationPreferences`,
 * row-absence-means-default already resolved (api-contracts.md's
 * `NotificationPreferenceView` shape).
 */
export interface NotificationPreferenceView {
  type: NotificationType
  inAppEnabled: boolean
  emailEnabled: boolean
}

/**
 * The two user-adjustable dollar thresholds Large Purchase/Low Balance
 * evaluate against — always resolved to a real number (row/column absence
 * already resolved to the system default), never `null`, per
 * `server/preferences.ts`'s `getNotificationThresholdSettings`.
 */
export interface NotificationThresholdSettingsView {
  largePurchaseThreshold: number
  lowBalanceThreshold: number
}

/** A `MonthlySummary` row's `narrative` became non-null for the first time —
 * fires once per calendar month, only ever for the most recently generated
 * month (notifications-v2.md's Monthly Summary trigger, AC1-4). `narrative`
 * is included verbatim (never paraphrased, per AC4) so the inbox card can
 * show the exact recap text alongside a link to the full Dashboard card. */
export interface MonthlySummaryReadyNotification extends NotificationBase {
  type: "MONTHLY_SUMMARY_READY"
  monthlySummaryId: string
  month: string
  narrative: string
}
