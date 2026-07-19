import type { Bill as PrismaBill, BillSchedule } from "@prisma/client"

// Re-export the Prisma-generated enum so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — mirrors
// `features/accounts/types.ts`'s `AccountType` re-export.
export type { BillSchedule }

/**
 * Occurrence-level status, per docs/product/bills.md AC6. Always computed at
 * read time (see `server/occurrence.ts`'s `computeOccurrenceStatus`), never
 * stored — `prisma/schema.prisma`'s `BillOccurrence` model comment is
 * explicit that persisting this would reintroduce the exact stored/derived
 * drift bug this app avoids everywhere else in Phase 2 (Budget Health Score,
 * Goal progress).
 *
 * Deliberately only these four values (not e.g. a fifth "PAID_LATE" member):
 * the paid-on-time-vs-paid-late distinction required by AC10's payment
 * history is a separate, orthogonal fact (see `BillOccurrence.wasPaidLate`
 * below) — folding it into this enum would make "PAID" and "PAID_LATE"
 * mutually exclusive statuses when they're really the same status plus one
 * extra boolean fact about *how* it became paid.
 */
export type OccurrenceStatus = "UPCOMING" | "DUE_TODAY" | "LATE" | "PAID"

/**
 * Client-safe representation of a Bill. `expectedAmount` is converted from
 * Prisma's `Decimal` to `number` — same reasoning as
 * `features/accounts/types.ts`'s `Account.balance`.
 *
 * `dueDate` is intentionally still present here (not stripped) even though
 * `prisma/schema.prisma`'s comment on `Bill.dueDate` says it is "NOT a live
 * 'next due date' figure" — it remains useful as "the originally configured
 * first occurrence" for display/audit purposes. Callers that want the live
 * next due date must use `BillWithNextOccurrence.nextOccurrence` (from
 * `service.getBills`) or a specific occurrence from `getBillById`, never this
 * field, for anything status-sensitive.
 */
export type Bill = Omit<PrismaBill, "expectedAmount"> & {
  expectedAmount: number
}

/**
 * Client-safe representation of a single Bill occurrence.
 *
 * Per bills.md AC7 and the schema's comment on `BillOccurrence.transactionId`,
 * a linked occurrence's paid amount/date are read live from its linked
 * Transaction, never copied onto stored columns. `paidAmount`/`paidDate`
 * below are therefore the *effective* values — sourced from the linked
 * Transaction when `transactionId` is set, or from the occurrence's own
 * manual `paidAmount`/`paidDate` columns otherwise — computed once in
 * `server/service.ts`'s `toBillOccurrence` so every consumer of this type
 * gets one unambiguous "what was actually paid, and when" pair regardless of
 * which of the two paid-tracking paths (AC7) produced it.
 */
export type BillOccurrence = {
  id: string
  billId: string
  userId: string
  dueDate: Date
  /** Set only when this occurrence is linked to a Transaction (AC7's second
   * paid path). Present alongside the effective `paidAmount`/`paidDate`
   * above so a caller (e.g. `mark-paid-dialog.tsx`, owned by the Frontend
   * Lead) can tell "paid via link" apart from "paid manually" without
   * re-deriving it. */
  transactionId: string | null
  paidAmount: number | null
  paidDate: Date | null
  status: OccurrenceStatus
  /**
   * `null` when `status !== "PAID"` — there is nothing to classify yet.
   * `true`/`false` once paid, per bills.md's edge case ("paid late" tracked
   * distinctly from "paid on time" in history, AC10) — computed by comparing
   * the effective `paidDate` against `dueDate`, UTC-normalized the same way
   * `computeOccurrenceStatus` compares `dueDate` against "today".
   */
  wasPaidLate: boolean | null
  createdAt: Date
  updatedAt: Date
}

/** Options for `service.getBills` — mirrors
 * `features/accounts/types.ts`'s `GetAccountsOptions` toggle semantics
 * exactly (false/omitted = active only, true = archived only, never a union
 * of both). */
export interface GetBillsOptions {
  includeArchived?: boolean
}

/**
 * `service.getBills`'s per-bill return shape (bills.md AC3: "a list of all
 * active bills, each showing name, expected amount, next due date, and
 * recurring schedule"). `nextOccurrence` is that bill's next *unpaid*
 * occurrence (never `"PAID"` by construction — see `service.ts`) or `null`
 * for a bill whose lazily-generated horizon has, unusually, produced no
 * unpaid occurrence yet (defensive; should not normally happen since
 * `ensureOccurrencesGenerated` always materializes at least one occurrence
 * on/after the bill's own `dueDate`).
 */
export interface BillWithNextOccurrence extends Bill {
  nextOccurrence: {
    id: string
    dueDate: Date
    status: OccurrenceStatus
  } | null
}

/**
 * One row of `service.getUpcomingOccurrences`'s result — matches
 * docs/architecture/api-contracts.md's Bills section "Upcoming list" output
 * shape exactly: `{ billId; billName; occurrenceId; dueDate; expectedAmount;
 * status }[]`, one entry per active bill's next unpaid occurrence (AC9),
 * sorted by `dueDate` ascending.
 */
export interface UpcomingOccurrence {
  billId: string
  billName: string
  occurrenceId: string
  dueDate: Date
  expectedAmount: number
  status: OccurrenceStatus
}

/** One occurrence entry within a `CalendarDay`, per
 * docs/architecture/api-contracts.md's Calendar v1 section. `amount` is the
 * bill's `expectedAmount` — Calendar v1 is a due-date view over Bills, not a
 * payment-detail view, so it deliberately shows what's *due*, not what was
 * actually paid (that lives on `BillOccurrence.paidAmount`, reachable via a
 * bill's own detail page). */
export interface CalendarOccurrence {
  billId: string
  billOccurrenceId: string
  billName: string
  amount: number
  status: OccurrenceStatus
}

/** One calendar day, per docs/architecture/api-contracts.md's Calendar v1
 * "Get a month's calendar" output shape. `service.getCalendarMonth` returns
 * one entry for every day of the requested month (even days with zero
 * occurrences, `occurrences: []`) so a calendar grid can render every cell
 * without the caller having to backfill missing days itself. */
export interface CalendarDay {
  /** `"YYYY-MM-DD"`, UTC calendar date. */
  day: string
  occurrences: CalendarOccurrence[]
}
