"use server"

import { IncomeSchedule, Prisma } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import {
  assertTransactionNotAlreadyLinked,
  TransactionAlreadyLinkedError,
} from "@/lib/transaction-link-guard"

import type { IncomeOccurrence, IncomeStream, IrregularIncomeEvent } from "@/features/recurring-income/types"
import {
  CreateIncomeStreamSchema,
  IncomeStreamIdSchema,
  LinkOccurrenceToTransactionSchema,
  LogIrregularIncomeEventSchema,
  MarkOccurrenceReceivedSchema,
  UnmarkOccurrenceReceivedSchema,
  UpdateIncomeStreamSchema,
  validateScheduleFields,
} from "@/features/recurring-income/server/validation"
import {
  OCCURRENCE_TRANSACTION_INCLUDE,
  toIncomeOccurrence,
  toIncomeStream,
  toIrregularIncomeEvent,
} from "@/features/recurring-income/server/service"
import {
  computeNextExpectedDate,
  toUtcMidnight,
  type ScheduledIncomeSchedule,
} from "@/features/recurring-income/server/occurrence"

/**
 * Mutating Server Actions for the Recurring Income module. Per
 * docs/architecture/api-contracts.md's Recurring Income section and
 * docs/product/recurring-income.md's acceptance criteria: stream CRUD
 * (create/update/archive/unarchive), occurrence receipt-tracking (mark
 * received manual + linked, unmark), and Irregular/One-off event logging.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — an id supplied by the
 *      client (e.g. `input.id`, `input.occurrenceId`, `input.transactionId`)
 *      is never trusted on its own; every lookup filters by
 *      `{ id, userId: user.id }` so one user can never read or mutate
 *      another user's data (folder-tree.md's risk register item #4).
 *   3. Converts the Prisma row to a client-safe shape (`toIncomeStream`/
 *      `toIncomeOccurrence`/`toIrregularIncomeEvent`) before returning it.
 *
 * `ensureOccurrencesGenerated` (server/service.ts) is intentionally never
 * called from here — it is a read-path concern only, mirroring Bills'
 * identical convention. Every action here mutates a specific,
 * already-existing row.
 */

// ---------------------------------------------------------------------------
// Income Stream CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new income stream for the current user (AC1/AC2). No
 * duplicate-name check — recurring-income.md's Edge Cases explicitly allow
 * two streams with the same name, same rationale as duplicate bill/account
 * names elsewhere in the product.
 *
 * `expectedAmount`/`anchorDate` are force-normalized to `null` when
 * `schedule` is `IRREGULAR`, regardless of what the parsed input happened to
 * contain — AC2's "no expected amount is required or shown" for Irregular
 * streams is read here as "never stored" too, not just "not required,"
 * since a stale planning figure for a stream with no fixed cadence would
 * have no meaning to compute anything from.
 *
 * Occurrence generation for this stream is intentionally NOT triggered
 * here — `ensureOccurrencesGenerated` runs lazily on the next read (AC3),
 * per api-contracts.md's lazy-generation design, identical to
 * `createBill`'s equivalent note.
 */
export async function createIncomeStream(input: unknown): Promise<ApiResult<IncomeStream>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateIncomeStreamSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid income stream data")
  }
  const { name, type, schedule, expectedAmount, anchorDate } = parsed.data
  const isIrregular = schedule === IncomeSchedule.IRREGULAR

  const stream = await db.incomeStream.create({
    data: {
      userId: user.id,
      name,
      type,
      schedule,
      expectedAmount: isIrregular ? null : (expectedAmount ?? null),
      anchorDate: isIrregular ? null : (anchorDate ?? null),
    },
  })

  return ok(toIncomeStream(stream))
}

/**
 * Updates one or more fields on an existing income stream (AC5). Only
 * fields actually present in the parsed input are written for
 * `name`/`type`/`schedule` — same "undefined fields excluded from `data`"
 * convention as `features/bills/server/actions.ts`'s `updateBill`.
 *
 * `expectedAmount`/`anchorDate` are handled differently: because AC2's
 * conditional requirement ("required unless IRREGULAR") depends on the
 * stream's *effective* schedule — which may be changing in this same call —
 * this action computes the effective schedule/expectedAmount/anchorDate
 * (incoming value if present, else the existing row's) and re-validates via
 * `validateScheduleFields` before writing, the same merged-effective-value
 * pattern `features/investments/server/actions.ts`'s `updateHolding`
 * establishes for `validateSectorForAssetType`.
 *
 * **Judgment call, flagged here**: recurring-income.md/api-contracts.md do
 * not explicitly say what happens when `schedule` is changed to/from
 * `IRREGULAR` on an existing stream. This implementation allows it (AC5:
 * "a user can edit ... schedule ... at any time," unqualified) and
 * force-normalizes `expectedAmount`/`anchorDate` to `null` the moment the
 * effective schedule becomes `IRREGULAR` (mirroring `createIncomeStream`'s
 * same normalization). Note that `service.getStreamById` branches its
 * receipt-history response on the *current* schedule value (`occurrences`
 * vs. `events`) — switching a stream's schedule away from its original kind
 * does not delete the other kind's previously-generated rows (they remain
 * in the database, matching this schema's "archiving/switching never
 * deletes history" convention elsewhere), but they will not be surfaced by
 * `getStreamById` while the stream's schedule points at the other branch.
 * This is a genuine, narrow product-behavior gap this implementation does
 * not attempt to silently resolve further than the spec itself does.
 *
 * Per AC5, changing `expectedAmount`/`schedule` here never retroactively
 * changes an already-generated `IncomeOccurrence` row — this action only
 * ever touches the `IncomeStream` row itself; `server/service.ts`'s lazy
 * generator is what makes the "future occurrences only" guarantee hold, by
 * always reading the *current* `IncomeStream.expectedAmount`/`schedule` at
 * generation time.
 */
export async function updateIncomeStream(input: unknown): Promise<ApiResult<IncomeStream>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateIncomeStreamSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid income stream data")
  }
  const { id, name, type, schedule, expectedAmount, anchorDate } = parsed.data

  const existing = await db.incomeStream.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Income stream not found")
  }

  const effectiveSchedule = schedule ?? existing.schedule
  const isIrregular = effectiveSchedule === IncomeSchedule.IRREGULAR

  const effectiveExpectedAmount = isIrregular
    ? null
    : expectedAmount !== undefined
      ? expectedAmount
      : (existing.expectedAmount?.toNumber() ?? null)

  const effectiveAnchorDate = isIrregular
    ? null
    : anchorDate !== undefined
      ? anchorDate
      : existing.anchorDate

  const scheduleErrors = validateScheduleFields(
    effectiveSchedule,
    effectiveExpectedAmount,
    effectiveAnchorDate,
  )
  if (scheduleErrors?.expectedAmount) {
    return fail(scheduleErrors.expectedAmount)
  }
  if (scheduleErrors?.anchorDate) {
    return fail(scheduleErrors.anchorDate)
  }

  const updated = await db.incomeStream.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(schedule !== undefined ? { schedule } : {}),
      expectedAmount: effectiveExpectedAmount,
      anchorDate: effectiveAnchorDate,
    },
  })

  return ok(toIncomeStream(updated))
}

/**
 * Archives (soft-deletes) an income stream — AC6. Stops future occurrence
 * generation (`ensureOccurrencesGenerated`'s archived no-op) without
 * deleting receipt history; existing `IncomeOccurrence`/
 * `IrregularIncomeEvent` rows are untouched.
 *
 * Idempotent by design — same rationale as
 * `features/bills/server/actions.ts`'s `archiveBill`.
 */
export async function archiveIncomeStream(input: unknown): Promise<ApiResult<IncomeStream>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = IncomeStreamIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid income stream id")
  }
  const { id } = parsed.data

  const existing = await db.incomeStream.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Income stream not found")
  }

  if (existing.archivedAt) {
    return ok(toIncomeStream(existing))
  }

  const archived = await db.incomeStream.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  return ok(toIncomeStream(archived))
}

/**
 * Restores an archived income stream — AC6. Resumes generating occurrences
 * "from that point forward," explicitly WITHOUT backfilling the gap that
 * accumulated while archived — mirrors `features/bills/server/actions.ts`'s
 * `unarchiveBill` exactly (see that function's JSDoc for the full
 * gap-skip rationale, identical here). `IRREGULAR` streams (or a stream
 * with no `anchorDate` — defensive, should not occur for a non-`IRREGULAR`
 * stream per `validateScheduleFields`) skip the occurrence catch-up step
 * entirely, since they have no occurrences to catch up at all.
 *
 * Idempotent for the same reason as `archiveIncomeStream`/`unarchiveBill`.
 */
export async function unarchiveIncomeStream(input: unknown): Promise<ApiResult<IncomeStream>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = IncomeStreamIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid income stream id")
  }
  const { id } = parsed.data

  const existing = await db.incomeStream.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Income stream not found")
  }

  if (!existing.archivedAt) {
    return ok(toIncomeStream(existing))
  }

  const today = toUtcMidnight(new Date())

  const unarchived = await db.$transaction(async (tx) => {
    const stream = await tx.incomeStream.update({
      where: { id },
      data: { archivedAt: null },
    })

    if (stream.schedule !== IncomeSchedule.IRREGULAR && stream.anchorDate) {
      const latestOccurrence = await tx.incomeOccurrence.findFirst({
        where: { streamId: id },
        orderBy: { expectedDate: "desc" },
        select: { expectedDate: true },
      })

      if (latestOccurrence && latestOccurrence.expectedDate.getTime() < today.getTime()) {
        let cursor = latestOccurrence.expectedDate
        while (cursor.getTime() < today.getTime()) {
          cursor = computeNextExpectedDate(cursor, stream.schedule as ScheduledIncomeSchedule)
        }
        await tx.incomeOccurrence.upsert({
          where: { streamId_expectedDate: { streamId: id, expectedDate: cursor } },
          create: { streamId: id, userId: user.id, expectedDate: cursor },
          update: {},
        })
      }
    }

    return stream
  })

  return ok(toIncomeStream(unarchived))
}

// ---------------------------------------------------------------------------
// Occurrence receipt-tracking (AC7/AC8/AC9)
// ---------------------------------------------------------------------------

/**
 * Marks an income occurrence as received via the manual amount+date path —
 * AC8's first path. The linked path is the separate
 * `linkOccurrenceToTransaction` action below, matching api-contracts.md's
 * literal two-separate-actions contract for Recurring Income (unlike Bills'
 * single `markOccurrencePaid` union — see `server/validation.ts`'s
 * `MarkOccurrenceReceivedSchema` JSDoc for why).
 *
 * Allowed even when `receivedDate` is after `expectedDate` (recurring-income.md
 * Edge Cases: "received late relative to expected date" is recorded as such,
 * not blocked or silently reclassified) — `toIncomeOccurrence`'s
 * `wasReceivedLate` surfaces this distinction automatically from the values
 * written here. Clears any prior link (`transactionId: null`) so switching
 * from "linked" to "manual" for the same occurrence leaves it in a single,
 * unambiguous state, mirroring `markOccurrencePaid`'s manual branch.
 */
export async function markOccurrenceReceived(
  input: unknown,
): Promise<ApiResult<IncomeOccurrence>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = MarkOccurrenceReceivedSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid mark-received data")
  }
  const { occurrenceId, receivedAmount, receivedDate } = parsed.data

  const occurrence = await db.incomeOccurrence.findFirst({
    where: { id: occurrenceId, userId: user.id },
  })
  if (!occurrence) {
    return fail("Income occurrence not found")
  }

  const updated = await db.incomeOccurrence.update({
    where: { id: occurrenceId },
    data: { receivedAmount, receivedDate, transactionId: null },
    include: OCCURRENCE_TRANSACTION_INCLUDE,
  })

  return ok(toIncomeOccurrence(updated, new Date()))
}

/**
 * Links an income occurrence to an existing Transaction — AC8's second
 * path. Per docs/architecture/api-contracts.md's "(Phase 3a)" note for this
 * action, calls `@/lib/transaction-link-guard.ts`'s
 * `assertTransactionNotAlreadyLinked` before creating the link, rejecting
 * with a friendly error if the Transaction already backs a Bill occurrence,
 * a different Income occurrence, or an Irregular Income event.
 *
 * (Phase 3a) The guard check and the write run inside one `db.$transaction`,
 * per docs/database/er-diagram.md's Phase 3a design note #5 — closes the
 * narrow cross-domain race window between "not already linked" and the
 * write. `IncomeOccurrence.transactionId`'s own `@unique` constraint remains
 * the backstop for the same-table case; the `catch` below still translates
 * a raw P2002 into the same friendly message.
 */
export async function linkOccurrenceToTransaction(
  input: unknown,
): Promise<ApiResult<IncomeOccurrence>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = LinkOccurrenceToTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid link data")
  }
  const { occurrenceId, transactionId } = parsed.data

  const occurrence = await db.incomeOccurrence.findFirst({
    where: { id: occurrenceId, userId: user.id },
  })
  if (!occurrence) {
    return fail("Income occurrence not found")
  }

  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, userId: user.id },
  })
  if (!transaction) {
    return fail("Transaction not found")
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      await assertTransactionNotAlreadyLinked(tx, user.id, transactionId, {
        excluding: { incomeOccurrenceId: occurrenceId },
      })

      return tx.incomeOccurrence.update({
        where: { id: occurrenceId },
        data: { transactionId, receivedAmount: null, receivedDate: null },
        include: OCCURRENCE_TRANSACTION_INCLUDE,
      })
    })
    return ok(toIncomeOccurrence(updated, new Date()))
  } catch (error) {
    if (error instanceof TransactionAlreadyLinkedError) {
      return fail(error.message)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("This transaction is already linked to a different income occurrence")
    }
    throw error
  }
}

/**
 * Un-marks a previously-received occurrence (AC9) — clears both the manual
 * `receivedAmount`/`receivedDate` fields and any Transaction link
 * (`transactionId`), unconditionally reverting it to its computed
 * Upcoming/Expected Today/Not Yet Received status. The underlying
 * Transaction itself (if any was linked) is left completely untouched —
 * only the link is removed, mirroring `unmarkOccurrencePaid` exactly.
 *
 * Not conditioned on the occurrence currently being received: calling this
 * on an already-un-received occurrence is a harmless no-op that still
 * returns success, consistent with this module's other idempotent actions.
 */
export async function unmarkOccurrenceReceived(
  input: unknown,
): Promise<ApiResult<IncomeOccurrence>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UnmarkOccurrenceReceivedSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid occurrence id")
  }

  const occurrence = await db.incomeOccurrence.findFirst({
    where: { id: parsed.data.occurrenceId, userId: user.id },
  })
  if (!occurrence) {
    return fail("Income occurrence not found")
  }

  const updated = await db.incomeOccurrence.update({
    where: { id: parsed.data.occurrenceId },
    data: { receivedAmount: null, receivedDate: null, transactionId: null },
    include: OCCURRENCE_TRANSACTION_INCLUDE,
  })

  return ok(toIncomeOccurrence(updated, new Date()))
}

// ---------------------------------------------------------------------------
// Irregular/One-off income events (AC11)
// ---------------------------------------------------------------------------

/**
 * Logs a one-off income event against an `IRREGULAR` stream — AC11. Rejects
 * if `streamId` doesn't belong to the caller, or belongs to a stream whose
 * schedule is not `IRREGULAR` (this model exists specifically for streams
 * with no generated-occurrence concept — logging an ad hoc event against a
 * scheduled stream would bypass its own occurrence-based receipt tracking
 * entirely, which is not what any acceptance criterion asks for).
 *
 * The optional `transactionId` link goes through the same
 * `@/lib/transaction-link-guard.ts` check (and same `$transaction`-wrapped
 * check-then-write race-window closure) as `linkOccurrenceToTransaction`
 * above — see that function's JSDoc for the shared rationale. There is no
 * exclusion target here (unlike the occurrence-link case): this always
 * creates a brand-new `IrregularIncomeEvent` row, so there is no
 * "already-linked-to-itself" case to exempt.
 *
 * Per `../types.ts`'s `IrregularIncomeEvent` JSDoc, `amount`/`date` are
 * written exactly as supplied — this action does not attempt to derive them
 * from the linked Transaction even when `transactionId` is present (a
 * flagged judgment call; see that JSDoc for the full reasoning).
 */
export async function logIrregularIncomeEvent(
  input: unknown,
): Promise<ApiResult<IrregularIncomeEvent>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = LogIrregularIncomeEventSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid income event data")
  }
  const { streamId, amount, date, transactionId } = parsed.data

  const stream = await db.incomeStream.findFirst({ where: { id: streamId, userId: user.id } })
  if (!stream) {
    return fail("Income stream not found")
  }
  if (stream.schedule !== IncomeSchedule.IRREGULAR) {
    return fail("Only Irregular/One-off streams can log individual income events")
  }

  if (!transactionId) {
    const created = await db.irregularIncomeEvent.create({
      data: { userId: user.id, streamId, amount, date },
    })
    return ok(toIrregularIncomeEvent(created))
  }

  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, userId: user.id },
  })
  if (!transaction) {
    return fail("Transaction not found")
  }

  try {
    const created = await db.$transaction(async (tx) => {
      await assertTransactionNotAlreadyLinked(tx, user.id, transactionId)

      return tx.irregularIncomeEvent.create({
        data: { userId: user.id, streamId, amount, date, transactionId },
      })
    })
    return ok(toIrregularIncomeEvent(created))
  } catch (error) {
    if (error instanceof TransactionAlreadyLinkedError) {
      return fail(error.message)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("This transaction is already linked to a different income event")
    }
    throw error
  }
}
