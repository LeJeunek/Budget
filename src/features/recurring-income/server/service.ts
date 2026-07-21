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
  ExpectedIncomePeriod,
  ExpectedUpcomingIncome,
  GetExpectedUpcomingIncomeOptions,
  GetIncomeStreamsOptions,
  IncomeOccurrence,
  IncomeStream,
  IncomeStreamDetail,
  IncomeStreamSummary,
  IrregularIncomeEvent,
} from "../types"
import {
  computeNextExpectedDate,
  computeOccurrenceStatus,
  toUtcMidnight,
  type ScheduledIncomeSchedule,
} from "./occurrence"

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
