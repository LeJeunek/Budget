import { Prisma } from "@prisma/client"

import { db } from "@/lib/db"

import type { Notification } from "../types"

/**
 * Shared row-shaping + create-and-dedup helpers for every trigger evaluator
 * in `./triggers/*.ts` and for `service.ts`'s own reads, per
 * docs/architecture/phase-4b-technical-design.md §6-§7.
 *
 * Split out of `service.ts` (Phase 4b) specifically to break an import
 * cycle: `service.ts`'s `ensureNotifications` orchestrator calls every
 * `triggers/*.ts` evaluator, and every evaluator needs `NOTIFICATION_INCLUDE`/
 * `toNotification`/`createNotificationIfNew` to shape and persist the rows it
 * creates — `service.ts` importing the triggers while the triggers import
 * back from `service.ts` would be circular. This file has no dependency on
 * `service.ts` or on any `triggers/*.ts` file, so both can depend on it
 * one-directionally.
 */

// ---------------------------------------------------------------------------
// Row shape + join
// ---------------------------------------------------------------------------

/**
 * The Prisma `include` used by every read/write that needs to shape a
 * `Notification` row into its client-safe `Notification` union (`../types.ts`).
 * Joins through whichever one of the six nullable FKs `type` implies — see
 * prisma/schema.prisma's `Notification` model comment — narrowed to just the
 * fields each type's display shape actually needs (never the full related
 * row), the same "narrow, purpose-built `select`" discipline
 * `TRANSACTION_INCLUDE`/`ACCOUNT_SUBSET_INCLUDE` already establish elsewhere
 * in this codebase.
 */
export const NOTIFICATION_INCLUDE = {
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
  // ---- Phase 4b (Notifications v2) ----
  financialGoal: {
    select: { id: true, name: true },
  },
  transaction: {
    select: { id: true, merchant: true, amount: true, date: true },
  },
  account: {
    select: { id: true, name: true, balance: true },
  },
  monthlySummary: {
    select: { id: true, month: true, narrative: true },
  },
} satisfies Prisma.NotificationInclude

export type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE
}>

/** UTC `"yyyy-MM"` formatting, matching `features/dashboard/server/validation.ts`'s
 * `formatMonthKey` exactly — duplicated here rather than cross-imported, per
 * this codebase's established "features/<domain>/server modules don't reach
 * into another domain's internals, a small pure-formatting duplicate is the
 * accepted alternative" convention (see e.g. `features/goals/server/service.ts`'s
 * and `features/reports/server/period.ts`'s own identical duplicates). */
function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Shapes one joined `Notification` row into its client-safe, denormalized
 * `Notification` type (see `../types.ts`'s JSDoc for why the join happens
 * here rather than at write time). Exported so `server/actions.ts`/
 * `triggers/*.ts` can build the same shape after a mutation without
 * duplicating this mapping.
 *
 * Returns `null` for a row whose joined relation (or a required nested field
 * on it) is unexpectedly missing. This should not happen in practice — every
 * FK is `onDelete: Cascade` (prisma/schema.prisma), so a Notification never
 * outlives the row it refers to — but is handled defensively (skip, don't
 * throw) so one malformed row can never break the whole inbox read.
 */
export function toNotification(row: NotificationRow): Notification | null {
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

  if (row.type === "GOAL_ACHIEVED") {
    const financialGoal = row.financialGoal
    if (!financialGoal) {
      return null
    }
    return {
      ...base,
      type: "GOAL_ACHIEVED",
      financialGoalId: financialGoal.id,
      goalName: financialGoal.name,
    }
  }

  if (row.type === "LARGE_PURCHASE") {
    const transaction = row.transaction
    if (!transaction) {
      return null
    }
    return {
      ...base,
      type: "LARGE_PURCHASE",
      transactionId: transaction.id,
      merchant: transaction.merchant,
      // Stored as a negative (expense) amount — shown as a positive
      // magnitude per ../types.ts's `LargePurchaseNotification` JSDoc.
      amount: Math.abs(transaction.amount.toNumber()),
      date: transaction.date,
    }
  }

  if (row.type === "LOW_BALANCE") {
    const account = row.account
    if (!account) {
      return null
    }
    return {
      ...base,
      type: "LOW_BALANCE",
      accountId: account.id,
      accountName: account.name,
      balance: account.balance.toNumber(),
    }
  }

  if (row.type === "MONTHLY_SUMMARY_READY") {
    const monthlySummary = row.monthlySummary
    if (!monthlySummary || monthlySummary.narrative === null) {
      return null
    }
    return {
      ...base,
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: monthlySummary.id,
      month: formatMonthKey(monthlySummary.month),
      narrative: monthlySummary.narrative,
    }
  }

  // Exhaustiveness guard: if a new NotificationType enum member is ever
  // added to prisma/schema.prisma without updating this function, this
  // throws a loud, specific error instead of silently dropping the
  // notification from every inbox read.
  const exhaustiveCheck: never = row.type
  throw new Error(`Unsupported notification type: ${String(exhaustiveCheck)}`)
}

// ---------------------------------------------------------------------------
// Create-and-dedup (every trigger's write path)
// ---------------------------------------------------------------------------

/** `true` for a Prisma unique-constraint violation (`P2002`) — this
 * codebase's established way to distinguish "a concurrent/prior write
 * already claimed this exact key" from a genuine failure, mirrored from
 * `features/dashboard/server/monthly-summary.ts`'s `isDuplicateSummaryRowError`. */
function isDuplicateNotificationError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

/**
 * Creates one `Notification` row and returns its shaped, client-safe form —
 * or `null` if a row for this exact dedup key (`(budgetCategoryId, type)`,
 * `(billOccurrenceId, type)`, `(financialGoalId, type)`, `(transactionId,
 * type)`, or `(monthlySummaryId, type)` — prisma/schema.prisma's `Notification`
 * `@@unique` constraints) already exists.
 *
 * THE one place every trigger evaluator in `./triggers/*.ts` creates a
 * `Notification` row — per docs/architecture/phase-4b-technical-design.md
 * §6's atomicity note, dedup here is the database's own unique-constraint
 * rejection (attempt the `create`, catch-and-ignore `P2002`), never a
 * separate "check if one exists, then insert" read-then-write. This is
 * exactly the same "attempt, don't pre-check" discipline `ensureBudgetOverNotifications`/
 * `ensureBillNotifications` already established via `upsert` (below, now
 * `triggers/budget-bill-triggers.ts`) — restated here as `create`-plus-catch
 * (rather than `upsert`) specifically so the caller can tell whether a row
 * was newly created (and therefore needs `email-dispatch.ts` to run for it)
 * versus already existed (nothing new to notify or email about), which a
 * no-op `upsert` cannot distinguish on its own.
 *
 * Callers whose trigger ALSO has its own atomic latch column
 * (`FinancialGoal.completionNotifiedAt`, `Account.lowBalanceNotifiedAt`) must
 * win that latch claim FIRST and only call this function afterward — the
 * unique constraint here is a second, redundant guarantee for those two
 * triggers (per schema.prisma §7.2's own comment), not a substitute for the
 * latch, which is what prevents a needless failed-create attempt on every
 * one of a still-completed goal's/still-below-threshold account's later
 * evaluation passes.
 */
export async function createNotificationIfNew(
  data: Prisma.NotificationUncheckedCreateInput,
): Promise<Notification | null> {
  try {
    const row = await db.notification.create({ data, include: NOTIFICATION_INCLUDE })
    return toNotification(row)
  } catch (error) {
    if (isDuplicateNotificationError(error)) {
      return null
    }
    throw error
  }
}
