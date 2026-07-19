"use server"

import type { Prisma, PrismaClient } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { Transaction } from "@/features/transactions/types"
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  TransactionIdSchema,
  SplitTransactionSchema,
} from "@/features/transactions/server/validation"
import {
  TRANSACTION_INCLUDE,
  toTransaction,
} from "@/features/transactions/server/service"

/**
 * Mutating Server Actions for the Transactions module. Per
 * docs/architecture/api-contracts.md's Transactions section: create, update,
 * delete, and split.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — an id supplied by the
 *      client (e.g. `input.id`, `input.accountId`, `input.categoryId`) is
 *      never trusted on its own; every lookup filters by
 *      `{ id, userId: user.id }` so one user can never read or mutate
 *      another user's data (folder-tree.md's risk register item #4).
 *   3. Converts the Prisma row to the client-safe `Transaction` shape via
 *      `toTransaction()` before returning it.
 */

// A Prisma transaction client (the `tx` argument inside `db.$transaction`)
// has the same query surface as `db` for the models used here. Typed
// explicitly so `resolveTagIds` can be called with either `db` or a `tx`
// client interchangeably.
type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Verifies an account exists, belongs to `userId`, and is not archived.
 * Shared by `createTransaction` and `updateTransaction` (when reassigning
 * `accountId`) so the "Attempting to log a new transaction against an
 * archived account: must be blocked" rule
 * (docs/product/accounts.md edge case, referenced by
 * docs/product/transactions.md AC12) lives in exactly one place.
 */
async function assertUsableAccount(
  userId: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
  })
  if (!account) {
    return { ok: false, error: "Account not found" }
  }
  if (account.archivedAt) {
    return {
      ok: false,
      error: "Cannot assign a transaction to an archived account",
    }
  }
  return { ok: true }
}

/**
 * Verifies a category exists and belongs to `userId`. Shared by every action
 * that accepts a `categoryId` — prevents a user from assigning a transaction
 * to another user's category by guessing/supplying its id.
 */
async function assertOwnedCategory(
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await db.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  })
  return category !== null
}

/**
 * Resolves a list of raw tag name strings to `Tag.id`s, creating any tag that
 * has no existing case-insensitive match for this user — the concrete
 * implementation of docs/product/transactions.md AC11 ("a tag typed for the
 * first time is created automatically"). Case handling: lookups are
 * case-insensitive (consistent with `features/categories/server/actions.ts`'s
 * duplicate-name convention) but a newly created tag preserves the caller's
 * original casing, since Tag has no canonical "display" vs. "match" casing
 * distinction to normalize to.
 *
 * Runs sequentially (not `Promise.all`) so two identical new tag names in the
 * same call (e.g. `["Coffee", "coffee"]`) resolve to one created row instead
 * of racing to create two — `Tag`'s `@@unique([userId, name])` would only
 * catch that at the DB level as a thrown error, not a graceful de-dupe.
 * Accepts either `db` or a `$transaction` client so it can run inside
 * `updateTransaction`'s atomic tag-replace transaction.
 */
async function resolveTagIds(
  client: DbClient,
  userId: string,
  tagNames: string[],
): Promise<string[]> {
  const uniqueNames = Array.from(
    new Set(tagNames.map((name) => name.trim()).filter((name) => name.length > 0)),
  )

  const ids: string[] = []
  for (const name of uniqueNames) {
    const existing = await client.tag.findFirst({
      where: { userId, name: { equals: name, mode: "insensitive" } },
    })
    if (existing) {
      ids.push(existing.id)
      continue
    }
    const created = await client.tag.create({ data: { userId, name } })
    ids.push(created.id)
  }
  return ids
}

/**
 * Creates a new transaction for the current user.
 *
 * Blocks creation against an archived account (AC12) and against a category
 * owned by another user (see `assertOwnedCategory`) — both are
 * cross-resource ownership/state checks Zod cannot express, so they happen
 * here rather than in `CreateTransactionSchema`.
 */
export async function createTransaction(
  input: unknown,
): Promise<ApiResult<Transaction>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid transaction data")
  }
  const { date, merchant, amount, accountId, categoryId, notes } = parsed.data

  const accountCheck = await assertUsableAccount(user.id, accountId)
  if (!accountCheck.ok) {
    return fail(accountCheck.error)
  }

  if (categoryId) {
    const categoryOwned = await assertOwnedCategory(user.id, categoryId)
    if (!categoryOwned) {
      return fail("Category not found")
    }
  }

  const created = await db.transaction.create({
    data: {
      userId: user.id,
      accountId,
      categoryId: categoryId ?? null,
      merchant,
      amount,
      date,
      notes: notes ?? null,
    },
    include: TRANSACTION_INCLUDE,
  })

  return ok(toTransaction(created))
}

/**
 * Updates one or more fields on an existing transaction, including
 * re-categorizing (AC9), notes, and the full tag set (AC11).
 *
 * Only fields actually present in the parsed input are written — the same
 * "undefined fields excluded from `data`" convention as
 * `features/accounts/server/actions.ts`'s `updateAccount`. `categoryId`/
 * `notes` accept an explicit `null` (see `validation.ts`'s
 * `categoryIdSchema`/`notesSchema`) to support clearing them, distinct from
 * `undefined` (field omitted, meaning "leave unchanged").
 *
 * Reassigning `accountId` is subject to the same archived-account check as
 * `createTransaction` (AC12's "or as a reassignment target"). Per
 * docs/product/transactions.md's "Archiving an account that has
 * transactions" edge case, a transaction *already* sitting in a now-archived
 * account remains fully editable for every other field — the archived check
 * only applies when `accountId` is present in this update (i.e. actually
 * being reassigned), never as a blanket block on editing the transaction.
 */
export async function updateTransaction(
  input: unknown,
): Promise<ApiResult<Transaction>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid transaction data")
  }
  const { id, date, merchant, amount, accountId, categoryId, notes, tags } =
    parsed.data

  const existing = await db.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Transaction not found")
  }

  if (accountId !== undefined) {
    const accountCheck = await assertUsableAccount(user.id, accountId)
    if (!accountCheck.ok) {
      return fail(accountCheck.error)
    }
  }

  if (categoryId) {
    const categoryOwned = await assertOwnedCategory(user.id, categoryId)
    if (!categoryOwned) {
      return fail("Category not found")
    }
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id },
      data: {
        ...(date !== undefined ? { date } : {}),
        ...(merchant !== undefined ? { merchant } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(accountId !== undefined ? { accountId } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    })

    if (tags !== undefined) {
      const tagIds = await resolveTagIds(tx, user.id, tags)
      // Full-replace semantics (see UpdateTransactionSchema's JSDoc on
      // `tags`): clear existing links, then recreate exactly the requested
      // set. Both statements run inside this same `$transaction` so a
      // failure partway through never leaves the tag set half-updated.
      await tx.transactionTag.deleteMany({ where: { transactionId: id } })
      if (tagIds.length > 0) {
        await tx.transactionTag.createMany({
          data: tagIds.map((tagId) => ({ transactionId: id, tagId })),
        })
      }
    }

    return tx.transaction.findUniqueOrThrow({
      where: { id },
      include: TRANSACTION_INCLUDE,
    })
  })

  return ok(toTransaction(updated))
}

/**
 * Deletes a transaction. If the transaction is a split parent, its split
 * line items are cascade-deleted by the database — `parentTransactionId`'s
 * `onDelete: Cascade` in prisma/schema.prisma (verified against the current
 * schema, not assumed) means deleting the parent row automatically deletes
 * every child row pointing at it via that foreign key, and (by the same
 * cascade rule applied transitively) each child's own `TransactionTag` rows.
 * No explicit cascade logic is implemented here — docs/product/transactions.md
 * AC10's "user is warned about this before confirming" is a Frontend Lead
 * concern (a confirmation dialog before calling this action), not something
 * this action needs to re-implement.
 */
export async function deleteTransaction(
  input: unknown,
): Promise<ApiResult<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = TransactionIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid transaction id")
  }
  const { id } = parsed.data

  const existing = await db.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Transaction not found")
  }

  await db.transaction.delete({ where: { id } })

  return ok({ id })
}

/** Formats an integer cents value as a `"$X.XX"` string for error messages
 * below — kept local and minimal rather than importing `lib/utils.ts`'s
 * `formatCurrency` (an `Intl.NumberFormat`-based display helper), since this
 * is a plain validation-error string, not UI presentation. */
function formatCentsAsDollars(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

/**
 * Splits a transaction into two or more category allocations.
 *
 * Critical validation, per docs/product/transactions.md AC13 and its
 * "Split remainder/rounding" edge case: the split amounts MUST sum EXACTLY
 * to the original transaction's amount. This is done in integer cents, never
 * floating point — `splits[].amount` was already validated by
 * `SplitTransactionSchema` to have at most 2 decimal places, so
 * `Math.round(amount * 100)` for each split is an exact, safe conversion
 * (the same technique `features/accounts/server/validation.ts` uses for
 * precision checks), and summing integers has no floating-point drift. The
 * original amount's cents are derived from the Prisma `Decimal` directly via
 * `.mul(100)` (decimal.js exact arithmetic) rather than
 * `existing.amount.toNumber() * 100`, avoiding a float round-trip on the
 * comparison target too.
 *
 * Single-level splitting only, per AC15 ("a transaction that has already
 * been split cannot itself be split again"): rejected if `existing` is
 * itself a split child (`parentTransactionId !== null`) or is already a
 * split parent (has existing rows pointing at it via `parentTransactionId`).
 *
 * On success, creates N new child transactions — same `date`/`merchant`/
 * `accountId` as the parent, per-split `categoryId`/`amount` — each
 * referencing the parent via `parentTransactionId`, per the schema comment
 * on that field and AC14. The parent row itself is left untouched (its own
 * `amount` becomes purely informational once split children exist; see the
 * schema comment) — `listTransactions`'s `EXCLUDE_SPLIT_PARENTS` is what
 * keeps it out of the default table view once this returns.
 */
export async function splitTransaction(
  input: unknown,
): Promise<ApiResult<Transaction[]>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = SplitTransactionSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid split data")
  }
  const { id, splits } = parsed.data

  const existing = await db.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Transaction not found")
  }

  if (existing.parentTransactionId !== null) {
    return fail("A split line item cannot itself be split")
  }

  const alreadySplitCount = await db.transaction.count({
    where: { parentTransactionId: id },
  })
  if (alreadySplitCount > 0) {
    return fail("This transaction has already been split")
  }

  const categoryIds = Array.from(new Set(splits.map((split) => split.categoryId)))
  const ownedCategories = await db.category.findMany({
    where: { id: { in: categoryIds }, userId: user.id },
    select: { id: true },
  })
  if (ownedCategories.length !== categoryIds.length) {
    return fail("One or more categories were not found")
  }

  const originalCents = Math.round(existing.amount.mul(100).toNumber())
  const splitCentsList = splits.map((split) => Math.round(split.amount * 100))
  const sumCents = splitCentsList.reduce((sum, cents) => sum + cents, 0)

  if (sumCents !== originalCents) {
    return fail(
      `Split amounts must sum exactly to ${formatCentsAsDollars(originalCents)} (got ${formatCentsAsDollars(sumCents)})`,
    )
  }

  const created = await db.$transaction((tx) =>
    Promise.all(
      splits.map((split) =>
        tx.transaction.create({
          data: {
            userId: user.id,
            accountId: existing.accountId,
            categoryId: split.categoryId,
            merchant: existing.merchant,
            amount: split.amount,
            date: existing.date,
            parentTransactionId: existing.id,
          },
          include: TRANSACTION_INCLUDE,
        }),
      ),
    ),
  )

  return ok(created.map(toTransaction))
}
