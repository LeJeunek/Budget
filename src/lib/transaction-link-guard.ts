import type { Prisma } from "@prisma/client"

/**
 * Enforces "a Transaction backs at most one recurring-item occurrence across
 * the whole product" — the cross-table invariant that individually-unique
 * `transactionId` columns on `BillOccurrence`, `IncomeOccurrence`, and
 * `IrregularIncomeEvent` each enforce *within their own table*, but cannot
 * enforce *across* each other (Postgres has no cross-table unique index
 * without a trigger or a shared polymorphic link table — see
 * docs/database/er-diagram.md's Phase 3a design note #5 for the two stronger
 * designs considered and explicitly rejected for this phase).
 *
 * This is the one narrow, documented exception to "no cross-domain Prisma
 * reach-through" (folder-tree.md's module-boundary rule): both `bills` and
 * `recurring-income`'s link actions call this shared utility instead of
 * either domain importing the other's `server/service.ts` directly, which
 * would otherwise create a circular feature-level dependency (Bills would
 * need to know about Income occurrences/events, and vice versa) — see
 * docs/architecture/folder-tree.md's Phase 3a rationale notes.
 *
 * Read-only: this file only ever calls `findFirst` against the three tables
 * above. It has no knowledge of, and does not perform, the actual link
 * write — that stays in each domain's own `server/actions.ts`, which is what
 * keeps this file narrow and free of any Bills- or Income-specific business
 * logic (create/update semantics, status computation, etc.).
 *
 * **Race-window closure (Database Architect's explicit note, er-diagram.md
 * design note #5):** the realistic race is a single user clicking "link" on
 * the same Transaction in two different domains within milliseconds of each
 * other. The per-table `@unique transactionId` constraints already prevent
 * the more likely *same-domain* double-link; this function closes the
 * narrower *cross-domain* race by requiring callers to run the check and the
 * subsequent write inside one Prisma `$transaction` — hence this function
 * accepts a `Prisma.TransactionClient` (or, for call sites that only need a
 * one-off availability check with no write to follow, a plain `db` instance
 * — a `PrismaClient` is structurally assignable to `Prisma.TransactionClient`
 * since it exposes a superset of the same model delegates), never assuming
 * `@/lib/db`'s singleton itself. See `features/bills/server/actions.ts`'s
 * `linkOccurrenceToTransactionInternal` and
 * `features/recurring-income/server/actions.ts`'s equivalent for the
 * required call shape: `db.$transaction(async (tx) => { await
 * assertTransactionNotAlreadyLinked(tx, ...); return tx.<model>.update(...) })`.
 */

/**
 * Identifies the occurrence/event a caller is currently linking (or
 * re-linking) `transactionId` to, so that operation is never rejected as
 * "already linked" against *itself*. Exactly one field is meaningful per
 * call site — Bills' link action passes `billOccurrenceId`, Recurring
 * Income's occurrence link action passes `incomeOccurrenceId`, and its
 * irregular-event log/link action passes `irregularIncomeEventId`.
 */
export interface TransactionLinkExclusion {
  billOccurrenceId?: string
  incomeOccurrenceId?: string
  irregularIncomeEventId?: string
}

/**
 * Thrown when `transactionId` is already linked to a different occurrence/
 * event than the one identified by `options.excluding`. Callers catch this
 * specifically (via `instanceof`) and surface `error.message` as an
 * `ApiResult` failure — never a raw Prisma error — the same "friendly error,
 * not a raw constraint violation" requirement already established for
 * Bills' own `@unique transactionId` P2002 handling
 * (`docs/architecture/api-contracts.md`'s Bills section).
 */
export class TransactionAlreadyLinkedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransactionAlreadyLinkedError"
  }
}

/**
 * Rejects (by throwing `TransactionAlreadyLinkedError`) if `transactionId`
 * already backs a `BillOccurrence`, `IncomeOccurrence`, or
 * `IrregularIncomeEvent` other than the one named in `options.excluding`.
 * Resolves with no return value when the transaction is free to link (either
 * genuinely unlinked everywhere, or only linked to the caller's own
 * in-progress target — re-linking the same transaction to the same
 * occurrence/event it's already linked to is a harmless no-op, matching
 * Bills' pre-existing precedent for the same-domain case).
 *
 * Scoped by `userId` on every one of the three lookups — defense in depth
 * matching this codebase's "every query scoped by the caller's id" rule
 * (folder-tree.md), even though `transactionId` alone already implies
 * ownership transitively (a Transaction's own `userId` must match the
 * caller's for it to have reached this check at all).
 */
export async function assertTransactionNotAlreadyLinked(
  client: Prisma.TransactionClient,
  userId: string,
  transactionId: string,
  options: { excluding?: TransactionLinkExclusion } = {},
): Promise<void> {
  const excluding = options.excluding ?? {}

  const [existingBillOccurrence, existingIncomeOccurrence, existingIrregularEvent] =
    await Promise.all([
      client.billOccurrence.findFirst({
        where: { transactionId, userId },
        select: { id: true },
      }),
      client.incomeOccurrence.findFirst({
        where: { transactionId, userId },
        select: { id: true },
      }),
      client.irregularIncomeEvent.findFirst({
        where: { transactionId, userId },
        select: { id: true },
      }),
    ])

  if (existingBillOccurrence && existingBillOccurrence.id !== excluding.billOccurrenceId) {
    throw new TransactionAlreadyLinkedError(
      "This transaction is already linked to a different bill occurrence",
    )
  }
  if (existingIncomeOccurrence && existingIncomeOccurrence.id !== excluding.incomeOccurrenceId) {
    throw new TransactionAlreadyLinkedError(
      "This transaction is already linked to a different income occurrence",
    )
  }
  if (existingIrregularEvent && existingIrregularEvent.id !== excluding.irregularIncomeEventId) {
    throw new TransactionAlreadyLinkedError(
      "This transaction is already linked to a different income event",
    )
  }
}
