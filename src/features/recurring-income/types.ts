import type {
  IncomeStream as PrismaIncomeStream,
  IrregularIncomeEvent as PrismaIrregularIncomeEvent,
  IncomeType,
  IncomeSchedule,
} from "@prisma/client"

// Client-safe shapes for the Recurring Income module. Prisma's `Decimal`
// (expectedAmount, receivedAmount, amount) is a decimal.js class instance,
// not a plain serializable value — passing it as-is across the Server
// Component / Client Component boundary or through a Server Action's
// response is unsafe. `server/service.ts` always converts Decimal -> number
// before returning data, mirroring `features/bills/types.ts`'s `Bill`/
// `toBill()` pattern exactly.

// Re-export the Prisma-generated enums so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — mirrors `features/bills/types.ts`'s
// `BillSchedule` re-export.
export type { IncomeType, IncomeSchedule }

/**
 * Occurrence-level status, per docs/product/recurring-income.md AC7. Always
 * computed at read time (see `server/occurrence.ts`'s `computeStatus`), never
 * stored — mirrors `features/bills/types.ts`'s `OccurrenceStatus` exactly,
 * except for its vocabulary: deliberately `NOT_YET_RECEIVED`, never `LATE`
 * (naming-standards.md's `IncomeOccurrenceStatus` note — AC7's resolved
 * product decision that "Late" framing is wrong for a delayed paycheck or
 * dividend, which is not the user's fault or something urgent to fix).
 */
export type IncomeOccurrenceStatus =
  | "UPCOMING"
  | "EXPECTED_TODAY"
  | "NOT_YET_RECEIVED"
  | "RECEIVED"

/**
 * Client-safe representation of an IncomeStream. `expectedAmount` is
 * `number | null` (`null` only for `IRREGULAR` streams, per AC2 — required
 * for every other schedule). `anchorDate` is likewise `null` only for
 * `IRREGULAR` streams — see `server/validation.ts`'s `CreateIncomeStreamSchema`
 * JSDoc for why an anchor date is required input for every scheduled stream
 * even though api-contracts.md's field list doesn't spell it out explicitly
 * (a flagged gap, mirroring `Bill.dueDate`'s equivalent, required role).
 *
 * `anchorDate` remains present here (not stripped) for the same reason
 * `Bill.dueDate` remains on `Bill` — useful as "the originally configured
 * first occurrence" for display/audit, never a live "next expected date"
 * figure (that's `IncomeStreamSummary.nextExpectedDate`, computed at read
 * time from `IncomeOccurrence` rows).
 */
export type IncomeStream = Omit<PrismaIncomeStream, "expectedAmount"> & {
  expectedAmount: number | null
}

/**
 * Client-safe representation of a single Income occurrence.
 *
 * Per recurring-income.md AC8 and the schema's comment on
 * `IncomeOccurrence.transactionId`, a linked occurrence's received
 * amount/date are read live from its linked Transaction, never copied onto
 * stored columns. `receivedAmount`/`receivedDate` below are therefore the
 * *effective* values — sourced from the linked Transaction when
 * `transactionId` is set, or from the occurrence's own manual
 * `receivedAmount`/`receivedDate` columns otherwise — computed once in
 * `server/service.ts`'s `toIncomeOccurrence`, mirroring
 * `features/bills/types.ts`'s `BillOccurrence` exactly.
 */
export type IncomeOccurrence = {
  id: string
  streamId: string
  userId: string
  expectedDate: Date
  /** Set only when this occurrence is linked to a Transaction (AC8's second
   * received path). Present alongside the effective `receivedAmount`/
   * `receivedDate` above so a caller can tell "received via link" apart from
   * "received manually" without re-deriving it. */
  transactionId: string | null
  receivedAmount: number | null
  receivedDate: Date | null
  status: IncomeOccurrenceStatus
  /**
   * `null` when `status !== "RECEIVED"` — there is nothing to classify yet.
   * `true`/`false` once received, per AC12's "received on time, received
   * late relative to its expected date, or is still outstanding" history
   * requirement — computed by comparing the effective `receivedDate`
   * against `expectedDate`, UTC-normalized the same way
   * `computeStatus` compares `expectedDate` against "today". Deliberately
   * named `wasReceivedLate`, not `wasReceivedNotYet` or similar — this is a
   * neutral timing fact about *already-received* income, not a repeat of
   * AC7's "Not Yet Received" status wording.
   */
  wasReceivedLate: boolean | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Client-safe representation of a single Irregular/One-off logged income
 * event (AC11).
 *
 * **Judgment call, flagged here**: unlike `IncomeOccurrence`/
 * `BillOccurrence`, `IrregularIncomeEvent.amount`/`date` are non-nullable,
 * required columns on the Prisma model (prisma/schema.prisma) — there is no
 * parallel "manual fallback vs. linked-live" pair of columns the way
 * `IncomeOccurrence.receivedAmount`/`receivedDate` provide. This module
 * therefore treats `amount`/`date` as the authoritative, always-set values
 * captured at logging time (`logIrregularIncomeEvent`'s required input,
 * whether or not a link is also supplied), NOT as a live join to the linked
 * Transaction the way `IncomeOccurrence`'s effective fields work. This
 * matches AC11's own framing ("the user simply logs individual amounts as
 * they're received") and the schema's deliberate choice to keep these two
 * columns required rather than nullable-until-received. The optional
 * `transactionId` link still participates in the cross-feature exclusivity
 * guard (`@/lib/transaction-link-guard.ts`) — it is a cross-reference for
 * "this event is backed by that transaction," not a live-value source.
 */
export type IrregularIncomeEvent = Omit<PrismaIrregularIncomeEvent, "amount"> & {
  amount: number
}

/** Options for `service.getIncomeStreams` — mirrors
 * `features/bills/types.ts`'s `GetBillsOptions` toggle semantics exactly
 * (false/omitted = active only, true = archived only, never a union of
 * both). */
export interface GetIncomeStreamsOptions {
  includeArchived?: boolean
}

/**
 * `service.getIncomeStreams`'s per-stream return shape (recurring-income.md
 * AC4: "name, type, schedule, expected amount (where applicable), and next
 * expected date (where applicable)"). `nextExpectedDate` is `null` for an
 * `IRREGULAR` stream (no generated occurrences exist at all, AC11) or for a
 * scheduled stream whose lazily-generated horizon has, unusually, produced
 * no un-received occurrence yet (defensive; should not normally happen,
 * mirroring `BillWithNextOccurrence`'s equivalent defensive note).
 */
export interface IncomeStreamSummary extends IncomeStream {
  nextExpectedDate: Date | null
}

/**
 * `service.getStreamById`'s return shape, per api-contracts.md's Recurring
 * Income section: a stream's full receipt history, shaped differently
 * depending on whether it's a scheduled stream (`occurrences`) or an
 * `IRREGULAR` one (`events`) — mirrors the schema's own modeling decision
 * that Irregular streams never generate `IncomeOccurrence` rows at all
 * (AC11). Callers must narrow on `stream.schedule === "IRREGULAR"` to know
 * which branch is present, matching the Prisma model split itself.
 */
export type IncomeStreamDetail =
  | (IncomeStream & { occurrences: IncomeOccurrence[] })
  | (IncomeStream & { events: IrregularIncomeEvent[] })

/** The only period value defined by recurring-income.md AC10 so far ("this
 * month"). Modeled as a union (not a bare string) so
 * `service.getExpectedUpcomingIncome` fails loudly at the type level if a
 * caller ever needs a not-yet-supported period, rather than silently
 * accepting an arbitrary string. */
export type ExpectedIncomePeriod = "this-month"

/** Options for `service.getExpectedUpcomingIncome`, per api-contracts.md's
 * exact signature: `getExpectedUpcomingIncome(userId, { period })`. */
export interface GetExpectedUpcomingIncomeOptions {
  period: ExpectedIncomePeriod
}

/**
 * `service.getExpectedUpcomingIncome`'s return shape, per api-contracts.md's
 * Recurring Income section — the sum of each active stream's next
 * occurrence amount within `period`, clearly an estimate, never merged with
 * Dashboard's actual-transaction-based Monthly Income figure (AC10).
 * `IRREGULAR` streams never contribute here (they have no "next occurrence
 * amount" to estimate — AC11).
 */
export interface ExpectedUpcomingIncome {
  total: number
  byStream: {
    streamId: string
    streamName: string
    nextOccurrenceAmount: number
  }[]
}

/**
 * Options for `service.getActualReceivedIncomeBySource` — **(Phase 3b)**,
 * per docs/architecture/api-contracts.md's Recurring Income section (the
 * cross-domain read this feature exposes for Analytics' Income Growth/
 * Income Sources metrics, analytics.md AC13/AC14). `start: null` means "All
 * Time, open-ended" — mirrors
 * `features/analytics/server/types.ts`'s `ReportingPeriodRange` exactly,
 * since every caller of this function already has one of those in hand and
 * shouldn't need to resolve a separate concrete floor just to call it.
 */
export interface GetActualReceivedIncomeOptions {
  start: Date | null
  end: Date
}

/**
 * One actual-received income record, per
 * `service.getActualReceivedIncomeBySource`'s return shape — a flat,
 * ungrouped list rather than pre-bucketed-by-month or pre-summed, so this
 * one query can back both Income Growth (bucketed by month) and Income
 * Sources (summed across the whole period) without two near-duplicate
 * queries. `amount`/`date` are always the *effective* received figures
 * (never `IncomeOccurrence`'s "expected" figures, per recurring-income.md's
 * own already-established live-join convention) — see
 * `server/service.ts`'s JSDoc on this function for exactly how each source
 * row (`IncomeOccurrence` vs. `IrregularIncomeEvent`) resolves its
 * `amount`/`date`.
 */
export interface ActualReceivedIncomeRecord {
  type: IncomeType
  amount: number
  date: Date
}

/**
 * One payday entry within a `PaydayCalendarDay` — Calendar v2's (Phase 4c)
 * "Recurring Income's own vocabulary" shape, per
 * `docs/architecture/phase-4c-technical-design.md` §2.3. Mirrors
 * `features/bills/types.ts`'s `CalendarOccurrence` exactly in spirit: `amount`
 * is always the stream's current `expectedAmount` (the planning estimate),
 * never the occurrence's actual received amount — the identical "a calendar
 * is a due/expected-date view, not a payment-detail view" rule
 * `CalendarOccurrence.amount`'s own JSDoc already establishes for Bills,
 * extended here so Calendar v2 doesn't silently invent a second convention
 * for the same kind of figure.
 *
 * `status` is present for every scheduled-stream occurrence (`UPCOMING` |
 * `EXPECTED_TODAY` | `NOT_YET_RECEIVED` | `RECEIVED`, computed by the
 * existing, unchanged `server/occurrence.ts`'s `computeOccurrenceStatus` —
 * never reimplemented here) and deliberately `undefined` for an Irregular/
 * One-off logged event (calendar-v2.md AC7): a logged event is already a
 * completed fact by the time it exists at all, so there is no Upcoming/
 * Received distinction left to compute for it. Callers distinguish "a logged
 * Irregular event" from "a scheduled occurrence" by checking whether `status`
 * is present, rather than a separate boolean flag this type doesn't need.
 */
export interface PaydayCalendarEntry {
  streamId: string
  streamName: string
  amount: number
  status?: IncomeOccurrenceStatus
}

/**
 * One calendar day, per
 * `docs/architecture/phase-4c-technical-design.md` §2.3 — the structural
 * sibling of `features/bills/types.ts`'s `CalendarDay`.
 * `service.getIncomeCalendarMonth` returns one entry for every day of the
 * requested month (even days with zero paydays, `paydays: []`), mirroring
 * Bills' own "every day of the month, even zero-occurrence days" contract
 * exactly, so `features/calendar/server/service.ts` can zip both domains'
 * per-day arrays together by `day` key without either one having gaps.
 */
export interface PaydayCalendarDay {
  /** `"YYYY-MM-DD"`, UTC calendar date. */
  day: string
  paydays: PaydayCalendarEntry[]
}
