import type {
  IncomeStream as PrismaIncomeStream,
  IncomeOccurrence as PrismaIncomeOccurrence,
  IrregularIncomeEvent as PrismaIrregularIncomeEvent,
  Prisma,
} from "@prisma/client"
import { IncomeSchedule } from "@prisma/client"

import { db } from "@/lib/db"
import { addUtcMonths } from "@/lib/recurrence"

import type {
  ActualReceivedIncomeRecord,
  ExpectedIncomePeriod,
  ExpectedUpcomingIncome,
  GetActualReceivedIncomeOptions,
  GetExpectedUpcomingIncomeOptions,
  GetIncomeStreamsOptions,
  IncomeOccurrence,
  IncomeStream,
  IncomeStreamDetail,
  IncomeStreamSummary,
  IrregularIncomeEvent,
  PaydayCalendarDay,
  PaydayCalendarEntry,
} from "../types"
import {
  computeNextExpectedDate,
  computeOccurrenceStatus,
  toUtcMidnight,
  type ScheduledIncomeSchedule,
} from "./occurrence"
import { MonthSchema } from "./validation"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Recurring Income section) and by
// `server/actions.ts`. It must never be imported from a Client Component —
// every exported function takes a pre-resolved `userId` from
// `getCurrentUser()` (see lib/auth.ts), never a client-supplied value, per
// folder-tree.md's note on scoping every query by the caller's id.

// ---------------------------------------------------------------------------
// Bounded lazy-generation horizon
// ---------------------------------------------------------------------------

// Identical value/rationale to `features/bills/server/service.ts`'s
// `DEFAULT_HORIZON_MONTHS`: three months comfortably covers even the
// sparsest supported schedule (QUARTERLY still gets at least one future
// occurrence materialized) while keeping the per-read row count small for
// the densest schedule (WEEKLY).
const DEFAULT_HORIZON_MONTHS = 3

// ---------------------------------------------------------------------------
// Prisma row -> client-safe shape conversions
// ---------------------------------------------------------------------------

/**
 * Converts a Prisma `IncomeStream` row (whose `expectedAmount` is a
 * decimal.js `Decimal` instance, or `null`) into the plain-number
 * `IncomeStream` shape safe to pass across the Server Component / Client
 * Component boundary — mirrors `features/bills/server/service.ts`'s
 * `toBill`.
 */
export function toIncomeStream(row: PrismaIncomeStream): IncomeStream {
  return {
    ...row,
    expectedAmount: row.expectedAmount === null ? null : row.expectedAmount.toNumber(),
  }
}

type OccurrenceWithTransaction = PrismaIncomeOccurrence & {
  transaction: { amount: Prisma.Decimal; date: Date } | null
}

/**
 * Converts a Prisma `IncomeOccurrence` row (joined with its linked
 * Transaction, if any) into the client-safe `IncomeOccurrence` shape,
 * resolving the "effective" received amount/date live from the linked
 * Transaction per recurring-income.md AC8 (see the JSDoc on `../types.ts`'s
 * `IncomeOccurrence`) rather than ever trusting the row's own
 * `receivedAmount`/`receivedDate` columns when `transactionId` is set.
 * Mirrors `features/bills/server/service.ts`'s `toBillOccurrence` exactly.
 */
function toIncomeOccurrence(row: OccurrenceWithTransaction, today: Date): IncomeOccurrence {
  const manualReceivedAmount = row.receivedAmount?.toNumber() ?? null
  const manualReceivedDate = row.receivedDate ?? null

  const effectiveReceivedAmount = row.transaction
    ? row.transaction.amount.toNumber()
    : manualReceivedAmount
  const effectiveReceivedDate = row.transaction ? row.transaction.date : manualReceivedDate

  const status = computeOccurrenceStatus(
    {
      expectedDate: row.expectedDate,
      receivedAmount: manualReceivedAmount,
      receivedDate: manualReceivedDate,
      transactionId: row.transactionId,
    },
    today,
  )

  const wasReceivedLate =
    status === "RECEIVED" && effectiveReceivedDate !== null
      ? toUtcMidnight(effectiveReceivedDate).getTime() > toUtcMidnight(row.expectedDate).getTime()
      : null

  return {
    id: row.id,
    streamId: row.streamId,
    userId: row.userId,
    expectedDate: row.expectedDate,
    transactionId: row.transactionId,
    receivedAmount: effectiveReceivedAmount,
    receivedDate: effectiveReceivedDate,
    status,
    wasReceivedLate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Converts a Prisma `IrregularIncomeEvent` row into the client-safe shape.
 * Per `../types.ts`'s `IrregularIncomeEvent` JSDoc, `amount`/`date` are
 * always this row's own authoritative values (no live join to a linked
 * Transaction, unlike `toIncomeOccurrence` above) — a deliberate, flagged
 * judgment call, not an oversight.
 */
function toIrregularIncomeEvent(row: PrismaIrregularIncomeEvent): IrregularIncomeEvent {
  return {
    ...row,
    amount: row.amount.toNumber(),
  }
}

const OCCURRENCE_TRANSACTION_INCLUDE = {
  transaction: { select: { amount: true, date: true } },
} satisfies Prisma.IncomeOccurrenceInclude

// ---------------------------------------------------------------------------
// Lazy occurrence generation (internal — never call from a Route Handler or
// Server Action directly; see api-contracts.md's Recurring Income section)
// ---------------------------------------------------------------------------

type StreamGenerationSource = Pick<
  PrismaIncomeStream,
  "id" | "userId" | "schedule" | "anchorDate" | "archivedAt"
>

/**
 * Generates any missing `IncomeOccurrence` rows for `stream`, from its
 * latest already-generated occurrence (or its own `anchorDate` if none exist
 * yet) up to a bounded forward horizon, then persists them via
 * `createMany({ skipDuplicates: true })`. Mirrors
 * `features/bills/server/service.ts`'s `ensureOccurrencesGenerated`
 * function-for-function, per this feature's explicit mandate to reuse
 * Bills' exact proven pattern.
 *
 * Idempotency: `@@unique([streamId, expectedDate])` (prisma/schema.prisma)
 * is what makes `skipDuplicates` safe to rely on instead of an existence
 * check before every insert — two concurrent reads racing to generate the
 * same occurrence both succeed, at most one row is ever created for a given
 * (streamId, expectedDate) pair.
 *
 * **`IRREGULAR` streams are a deliberate no-op here** (AC11: "Irregular/
 * One-off streams never generate expected occurrences") — they have no
 * cadence at all to compute a next date from, and their receipt history
 * lives entirely in `IrregularIncomeEvent` rows instead (see
 * `getStreamById` below). Archived streams (AC6) are likewise a no-op —
 * matches Bills' `ensureOccurrencesGenerated`'s own archived-bill handling
 * exactly; resuming generation forward from "today" on unarchive (without
 * backfilling the archived gap) is `server/actions.ts`'s
 * `unarchiveIncomeStream`'s responsibility, not this function's, for the
 * identical reason `unarchiveBill` owns that behavior instead of Bills'
 * general-purpose generator.
 *
 * `minThroughDate`, when supplied, extends the horizon to at least that date
 * — used by `getExpectedUpcomingIncome` so a requested period beyond the
 * default 3-month horizon still sees materialized occurrences for that
 * period, the same purpose `getCalendarMonth` uses it for in Bills.
 */
async function ensureOccurrencesGenerated(
  stream: StreamGenerationSource,
  minThroughDate?: Date,
): Promise<void> {
  if (stream.archivedAt) {
    return
  }
  if (stream.schedule === IncomeSchedule.IRREGULAR || stream.anchorDate === null) {
    return
  }

  const schedule = stream.schedule as ScheduledIncomeSchedule
  const anchorDate = stream.anchorDate

  const defaultHorizon = addUtcMonths(toUtcMidnight(new Date()), DEFAULT_HORIZON_MONTHS)
  const horizon =
    minThroughDate && minThroughDate.getTime() > defaultHorizon.getTime()
      ? minThroughDate
      : defaultHorizon

  const latestOccurrence = await db.incomeOccurrence.findFirst({
    where: { streamId: stream.id },
    orderBy: { expectedDate: "desc" },
    select: { expectedDate: true },
  })

  const toCreate: { streamId: string; userId: string; expectedDate: Date }[] = []

  if (!latestOccurrence) {
    // First-ever generation for this stream: its own `anchorDate` (AC3's
    // "generates its next expected occurrence automatically") must itself
    // be materialized, not just dates after it.
    if (anchorDate.getTime() <= horizon.getTime()) {
      toCreate.push({ streamId: stream.id, userId: stream.userId, expectedDate: anchorDate })
    }
  }

  let cursor = latestOccurrence?.expectedDate ?? anchorDate
  while (true) {
    const next = computeNextExpectedDate(cursor, schedule)
    if (next.getTime() > horizon.getTime()) {
      break
    }
    toCreate.push({ streamId: stream.id, userId: stream.userId, expectedDate: next })
    cursor = next
  }

  if (toCreate.length > 0) {
    await db.incomeOccurrence.createMany({ data: toCreate, skipDuplicates: true })
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Lists the caller's income streams, per recurring-income.md AC4. Defaults
 * to the active (non-archived) list; pass `{ includeArchived: true }` for
 * the archived view — same toggle semantics as
 * `features/bills/server/service.ts`'s `getBills`.
 *
 * Each stream's `nextExpectedDate` is its earliest *un-received* occurrence's
 * `expectedDate` (never `"RECEIVED"` by construction), resolved with a
 * single `findMany` across every listed stream's occurrences rather than one
 * query per stream, avoiding an N+1 query pattern for a user with many
 * streams. `IRREGULAR` streams simply never have a match (they generate no
 * occurrences at all) and correctly surface `nextExpectedDate: null`.
 */
export async function getIncomeStreams(
  userId: string,
  options: GetIncomeStreamsOptions = {},
): Promise<IncomeStreamSummary[]> {
  const { includeArchived = false } = options

  const streams = await db.incomeStream.findMany({
    where: { userId, archivedAt: includeArchived ? { not: null } : null },
    orderBy: { createdAt: "asc" },
  })

  await Promise.all(streams.map((stream) => ensureOccurrencesGenerated(stream)))

  const streamIds = streams.map((stream) => stream.id)
  const unreceivedOccurrences = streamIds.length
    ? await db.incomeOccurrence.findMany({
        where: { streamId: { in: streamIds }, transactionId: null, receivedAmount: null },
        orderBy: { expectedDate: "asc" },
      })
    : []

  const nextExpectedDateByStreamId = new Map<string, Date>()
  for (const occurrence of unreceivedOccurrences) {
    if (!nextExpectedDateByStreamId.has(occurrence.streamId)) {
      nextExpectedDateByStreamId.set(occurrence.streamId, occurrence.expectedDate)
    }
  }

  return streams.map((stream) => ({
    ...toIncomeStream(stream),
    nextExpectedDate: nextExpectedDateByStreamId.get(stream.id) ?? null,
  }))
}

/**
 * Fetches a single income stream by id, scoped to the calling user, with its
 * full receipt history — AC12. Returns `null` for a missing id *or* an id
 * owned by a different user, same "don't leak existence" rule as
 * `features/bills/server/service.ts`'s `getBillById`.
 *
 * Branches on `schedule` per `../types.ts`'s `IncomeStreamDetail` union:
 * `IRREGULAR` streams return their logged `events` (most-recent-first, never
 * calling `ensureOccurrencesGenerated` — AC11); every other schedule returns
 * generated `occurrences` (most-recent-first), triggering lazy generation
 * first exactly like `getBillById`.
 */
export async function getStreamById(
  userId: string,
  id: string,
): Promise<IncomeStreamDetail | null> {
  const stream = await db.incomeStream.findFirst({ where: { id, userId } })
  if (!stream) {
    return null
  }

  if (stream.schedule === IncomeSchedule.IRREGULAR) {
    const events = await db.irregularIncomeEvent.findMany({
      where: { streamId: stream.id },
      orderBy: { date: "desc" },
    })

    return {
      ...toIncomeStream(stream),
      events: events.map(toIrregularIncomeEvent),
    }
  }

  await ensureOccurrencesGenerated(stream)

  const occurrenceRows = await db.incomeOccurrence.findMany({
    where: { streamId: stream.id },
    orderBy: { expectedDate: "desc" },
    include: OCCURRENCE_TRANSACTION_INCLUDE,
  })

  const today = toUtcMidnight(new Date())

  return {
    ...toIncomeStream(stream),
    occurrences: occurrenceRows.map((row) => toIncomeOccurrence(row, today)),
  }
}

// ---------------------------------------------------------------------------
// Expected upcoming income (AC10) — a distinct, estimate-labeled surface,
// never merged with Dashboard's actual-transaction-based Monthly Income.
// ---------------------------------------------------------------------------

/** Resolves the `[start, end]` UTC-midnight bounds for a given
 * `ExpectedIncomePeriod`. Only `"this-month"` is defined by
 * recurring-income.md AC10 today (see `../types.ts`'s `ExpectedIncomePeriod`
 * JSDoc) — mirrors `features/bills/server/service.ts`'s `resolveMonthBounds`
 * convention (UTC-only, never the host process's local timezone). */
function resolvePeriodBounds(period: ExpectedIncomePeriod): { start: Date; end: Date } {
  switch (period) {
    case "this-month": {
      const today = toUtcMidnight(new Date())
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
      return { start, end }
    }
    default: {
      const exhaustiveCheck: never = period
      throw new Error(`Unsupported expected-upcoming-income period: ${String(exhaustiveCheck)}`)
    }
  }
}

/**
 * The sum of each active, scheduled (non-`IRREGULAR`) stream's next
 * un-received occurrence amount, for occurrences whose `expectedDate` falls
 * within `period` — recurring-income.md AC10's "expected upcoming income"
 * total. Clearly an estimate (each stream contributes its planning
 * `expectedAmount`, never an already-received actual amount) and computed
 * entirely independently of `dashboard.service.getMonthlySummary` — no
 * shared code path, per api-contracts.md's explicit requirement.
 *
 * `IRREGULAR` streams never contribute (AC11: they have no "next occurrence
 * amount" to estimate — a one-off event has no forward-looking expectation
 * by definition). Archived streams are excluded entirely, matching
 * `getUpcomingOccurrences`'s equivalent Bills precedent.
 */
export async function getExpectedUpcomingIncome(
  userId: string,
  options: GetExpectedUpcomingIncomeOptions,
): Promise<ExpectedUpcomingIncome> {
  const { period } = options
  const { start, end } = resolvePeriodBounds(period)

  const streams = await db.incomeStream.findMany({
    where: { userId, archivedAt: null, schedule: { not: IncomeSchedule.IRREGULAR } },
  })

  await Promise.all(streams.map((stream) => ensureOccurrencesGenerated(stream, end)))

  const streamIds = streams.map((stream) => stream.id)
  const unreceivedOccurrences = streamIds.length
    ? await db.incomeOccurrence.findMany({
        where: { streamId: { in: streamIds }, transactionId: null, receivedAmount: null },
        orderBy: { expectedDate: "asc" },
      })
    : []

  const nextExpectedDateByStreamId = new Map<string, Date>()
  for (const occurrence of unreceivedOccurrences) {
    if (!nextExpectedDateByStreamId.has(occurrence.streamId)) {
      nextExpectedDateByStreamId.set(occurrence.streamId, occurrence.expectedDate)
    }
  }

  const byStream: ExpectedUpcomingIncome["byStream"] = []
  let total = 0

  for (const stream of streams) {
    const nextExpectedDate = nextExpectedDateByStreamId.get(stream.id)
    if (!nextExpectedDate) {
      continue
    }
    if (nextExpectedDate.getTime() < start.getTime() || nextExpectedDate.getTime() > end.getTime()) {
      continue
    }

    const nextOccurrenceAmount = stream.expectedAmount?.toNumber() ?? 0
    total += nextOccurrenceAmount
    byStream.push({ streamId: stream.id, streamName: stream.name, nextOccurrenceAmount })
  }

  return { total, byStream }
}

// ---------------------------------------------------------------------------
// Actual-received income by source (Phase 3b — Analytics' Income Growth/
// Income Sources metrics, analytics.md AC13/AC14)
// ---------------------------------------------------------------------------

/** Builds the shared `[gte, lte]`/`[gte, undefined]` date-range fragment for
 * `getActualReceivedIncomeBySource`'s three queries below, so "All Time"
 * (`start: null`) is resolved identically across all three rather than
 * risking one query's range drifting out of sync with the others. */
function actualReceivedDateWhere(options: GetActualReceivedIncomeOptions) {
  return options.start
    ? { gte: options.start, lte: options.end }
    : { lte: options.end }
}

/**
 * The one cross-domain read this feature exposes to Analytics, per
 * docs/architecture/api-contracts.md's Recurring Income section: "expose it
 * as `recurring-income.service`'s own function... rather than Analytics
 * reaching into `IncomeOccurrence`/`IrregularIncomeEvent` via direct Prisma
 * access." Returns every actual-received income record within `options`'s
 * range, tagged with its parent stream's `type` — a flat list (not
 * pre-bucketed), so `features/analytics/server/income-analytics.ts` can
 * derive both its per-month (Income Growth) and whole-period (Income
 * Sources) views from one query.
 *
 * **Never the forward-looking `expectedAmount`/`expectedDate` figures**
 * (analytics.md AC13's own explicit requirement) — this function reads three
 * disjoint, already-actually-received sources, matching
 * `toIncomeOccurrence`'s established "effective received amount/date" rule
 * exactly rather than re-deriving a fourth, parallel definition of "actual":
 *
 * 1. **Linked occurrences** (`transactionId` set): the effective amount/date
 *    is the linked `Transaction`'s own `amount`/`date`, never this row's own
 *    (unused-when-linked) `receivedAmount`/`receivedDate` columns — the same
 *    rule `toIncomeOccurrence` applies for the single-stream detail view.
 * 2. **Manually-received occurrences** (`transactionId` null,
 *    `receivedAmount` set): this row's own `receivedAmount`/`receivedDate`
 *    columns are authoritative (AC8's "manual" receipt path).
 * 3. **Irregular/One-off events**: `amount`/`date` are always this row's own
 *    columns (never a live Transaction join), per `../types.ts`'s
 *    `IrregularIncomeEvent` JSDoc — unchanged by this function.
 *
 * Every stream is included regardless of `archivedAt` — historical income
 * actually received under a since-archived stream is still real, already-
 * happened income and must not vanish from a past month's trend just
 * because the user archived the stream later.
 */
export async function getActualReceivedIncomeBySource(
  userId: string,
  options: GetActualReceivedIncomeOptions,
): Promise<ActualReceivedIncomeRecord[]> {
  const dateWhere = actualReceivedDateWhere(options)

  const [linkedOccurrences, manualOccurrences, irregularEvents] = await Promise.all([
    db.incomeOccurrence.findMany({
      where: { userId, transactionId: { not: null }, transaction: { date: dateWhere } },
      select: {
        transaction: { select: { amount: true, date: true } },
        stream: { select: { type: true } },
      },
    }),
    db.incomeOccurrence.findMany({
      where: {
        userId,
        transactionId: null,
        receivedAmount: { not: null },
        receivedDate: dateWhere,
      },
      select: {
        receivedAmount: true,
        receivedDate: true,
        stream: { select: { type: true } },
      },
    }),
    db.irregularIncomeEvent.findMany({
      where: { userId, date: dateWhere },
      select: {
        amount: true,
        date: true,
        stream: { select: { type: true } },
      },
    }),
  ])

  const records: ActualReceivedIncomeRecord[] = []

  for (const occurrence of linkedOccurrences) {
    // Defensive only: the `transactionId: { not: null }` filter above
    // guarantees a linked row always has a joined `transaction`, since
    // `onDelete: SetNull` clears `transactionId` itself the moment the
    // linked Transaction is deleted — this can't actually be null in
    // practice, guarded anyway rather than trusting that invariant silently.
    if (!occurrence.transaction) continue
    records.push({
      type: occurrence.stream.type,
      amount: occurrence.transaction.amount.toNumber(),
      date: occurrence.transaction.date,
    })
  }

  for (const occurrence of manualOccurrences) {
    if (!occurrence.receivedAmount || !occurrence.receivedDate) continue
    records.push({
      type: occurrence.stream.type,
      amount: occurrence.receivedAmount.toNumber(),
      date: occurrence.receivedDate,
    })
  }

  for (const event of irregularEvents) {
    records.push({ type: event.stream.type, amount: event.amount.toNumber(), date: event.date })
  }

  return records
}

// ---------------------------------------------------------------------------
// Calendar v2 (Phase 4c) — `getIncomeCalendarMonth`, the one new, narrow read
// function required on this module by
// docs/architecture/phase-4c-technical-design.md §2.3. The structural
// sibling of `features/bills/server/service.ts`'s own `getCalendarMonth`:
// same lazy-generation-then-range-query shape, same "one entry per calendar
// day, even zero-payday days" contract, so `features/calendar/server/
// service.ts` can zip this module's per-day output against Bills' by `day`
// key with no gaps on either side. This is Calendar v2's *only* new read —
// it introduces no new business logic of its own (every occurrence's status
// is still computed exclusively by this file's own `computeOccurrenceStatus`
// import, never reimplemented for the calendar's benefit).
// ---------------------------------------------------------------------------

/** Builds the `[start, end]` UTC-midnight bounds for a `"YYYY-MM"` month
 * string — duplicated from `features/bills/server/service.ts`'s
 * `resolveMonthBounds`, per folder-tree.md's module boundary rule
 * (features/<domain>/server is not a shared import target across domains). */
function resolveMonthBounds(month: string): { start: Date; end: Date; daysInMonth: number } {
  const [yearStr, monthStr] = month.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1

  const start = new Date(Date.UTC(year, monthIndex, 1))
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const end = new Date(Date.UTC(year, monthIndex, daysInMonth))

  return { start, end, daysInMonth }
}

/** `"YYYY-MM-DD"` key for a UTC date — duplicated from
 * `features/bills/server/service.ts`'s `formatDateOnlyKey`, same module
 * boundary reason as `resolveMonthBounds` above. */
function formatDateOnlyKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function pushEntry(
  byDay: Map<string, PaydayCalendarEntry[]>,
  dayKey: string,
  entry: PaydayCalendarEntry,
): void {
  const existing = byDay.get(dayKey)
  if (existing) {
    existing.push(entry)
  } else {
    byDay.set(dayKey, [entry])
  }
}

/**
 * All paydays due/logged within `month` (`"YYYY-MM"`), grouped by day —
 * backs Calendar v2's payday source (calendar-v2.md AC4/AC7). Returns one
 * entry for every calendar day in the month, in order, even days with zero
 * paydays (`paydays: []`), mirroring
 * `features/bills/server/service.ts`'s `getCalendarMonth` exactly, so
 * `features/calendar/server/service.ts` can zip both domains' arrays by
 * `day` key without a caller having to backfill missing days itself.
 *
 * Two disjoint sources are combined, per §2.3's exact algorithm:
 *
 * 1. **Scheduled (non-`IRREGULAR`) streams**: lazily generates any missing
 *    `IncomeOccurrence` rows through the month's end (reusing this file's
 *    own `ensureOccurrencesGenerated`, the identical mechanism
 *    `getExpectedUpcomingIncome` already calls), then queries occurrences
 *    due within the month and computes each one's status via the existing,
 *    unchanged `computeOccurrenceStatus` — never reimplemented. Not
 *    restricted to active streams for the *query* (only generation is
 *    restricted to active streams) — an archived stream's already-generated
 *    past occurrences still show on the calendar if they fall in the
 *    requested month, the same archived-bill precedent
 *    `bills.service.getCalendarMonth`'s own JSDoc documents.
 * 2. **Irregular/One-off events**: queried directly against
 *    `IrregularIncomeEvent`, with no generation step at all (AC7 — "an
 *    irregular event only ever appears on the calendar once actually
 *    logged, never projected"). Also not restricted to active streams,
 *    mirroring `getActualReceivedIncomeBySource`'s identical "a since-
 *    archived stream's already-happened income must not vanish from a past
 *    month" reasoning. These entries carry no `status` (see
 *    `PaydayCalendarEntry`'s JSDoc).
 */
export async function getIncomeCalendarMonth(
  userId: string,
  month: string,
): Promise<PaydayCalendarDay[]> {
  const parsedMonth = MonthSchema.parse(month)
  const { start, end, daysInMonth } = resolveMonthBounds(parsedMonth)

  const activeScheduledStreams = await db.incomeStream.findMany({
    where: { userId, archivedAt: null, schedule: { not: IncomeSchedule.IRREGULAR } },
  })
  await Promise.all(
    activeScheduledStreams.map((stream) => ensureOccurrencesGenerated(stream, end)),
  )

  const [occurrences, irregularEvents] = await Promise.all([
    db.incomeOccurrence.findMany({
      where: { userId, expectedDate: { gte: start, lte: end } },
      orderBy: { expectedDate: "asc" },
      include: { stream: { select: { name: true, expectedAmount: true } } },
    }),
    db.irregularIncomeEvent.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      include: { stream: { select: { name: true } } },
    }),
  ])

  const today = toUtcMidnight(new Date())
  const paydaysByDay = new Map<string, PaydayCalendarEntry[]>()

  for (const occurrence of occurrences) {
    const status = computeOccurrenceStatus(
      {
        expectedDate: occurrence.expectedDate,
        receivedAmount: occurrence.receivedAmount?.toNumber() ?? null,
        receivedDate: occurrence.receivedDate,
        transactionId: occurrence.transactionId,
      },
      today,
    )

    pushEntry(paydaysByDay, formatDateOnlyKey(occurrence.expectedDate), {
      streamId: occurrence.streamId,
      streamName: occurrence.stream.name,
      // The stream's current planning estimate, never the occurrence's
      // actual received amount — see `PaydayCalendarEntry.amount`'s JSDoc.
      amount: occurrence.stream.expectedAmount?.toNumber() ?? 0,
      status,
    })
  }

  for (const event of irregularEvents) {
    pushEntry(paydaysByDay, formatDateOnlyKey(event.date), {
      streamId: event.streamId,
      streamName: event.stream.name,
      amount: event.amount.toNumber(),
      // No `status` — a logged Irregular event has no Upcoming/Received
      // distinction left to compute (AC7, `PaydayCalendarEntry`'s JSDoc).
    })
  }

  const days: PaydayCalendarDay[] = []
  const [yearStr, monthStr] = parsedMonth.split("-")
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1

  for (let day = 1; day <= daysInMonth; day++) {
    const dayKey = formatDateOnlyKey(new Date(Date.UTC(year, monthIndex, day)))
    days.push({ day: dayKey, paydays: paydaysByDay.get(dayKey) ?? [] })
  }

  return days
}

// Exported so `server/actions.ts` can build the same client-safe
// `IncomeOccurrence`/`IrregularIncomeEvent` shapes (with the
// transaction-joined "effective received amount/date" resolution for
// occurrences) after a mutation, without duplicating this conversion logic.
// `ensureOccurrencesGenerated` itself is deliberately NOT exported — per
// api-contracts.md's Recurring Income section, it is purely a read-path
// concern invoked at the top of this file's own read functions; Server
// Actions mutate specific rows directly and never need to trigger
// generation, mirroring Bills' identical convention exactly.
export { OCCURRENCE_TRANSACTION_INCLUDE, toIncomeOccurrence, toIrregularIncomeEvent }
