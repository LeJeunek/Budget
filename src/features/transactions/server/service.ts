import type { Prisma } from "@prisma/client"

import { db } from "@/lib/db"

import type { Transaction, TransactionListResult } from "../types"
import { UNCATEGORIZED_CATEGORY_ID } from "../types"
import type { TransactionFilterInput } from "./validation"

// This module is imported by `server/actions.ts`, the `GET /api/transactions`
// Route Handler, and `server/import.ts` — never from a Client Component.
// Every exported function takes a pre-resolved `userId` from the caller's
// `getCurrentUser()` (see lib/auth.ts) and scopes every Prisma query by it,
// per folder-tree.md's note on risk-register.md item #4 (cross-user data leak
// prevention). This module never calls `getCurrentUser()` itself and never
// trusts a client-supplied user id — mirrors
// features/dashboard/server/service.ts and features/accounts/server/service.ts.

/**
 * The Prisma `include` shared by every read (and every mutation's response)
 * in this module, so the transaction table can render a full row —
 * merchant, category, account, tags — from a single query instead of N+1
 * client-side fetches. Exported so `server/actions.ts` can request the same
 * shape after a create/update/split, keeping `Transaction`'s joined fields
 * (see ../types.ts) populated consistently everywhere it's returned.
 */
export const TRANSACTION_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  account: { select: { id: true, name: true, color: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.TransactionInclude

type TransactionRow = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE
}>

/**
 * Converts a Prisma `Transaction` row (`amount` is a decimal.js `Decimal`
 * instance, `tags` is the raw `TransactionTag[]` join shape) into the
 * plain-number, flattened `Transaction` shape defined in `../types.ts` that
 * is safe to pass across the Server Component / Client Component boundary
 * and through Server Action / Route Handler responses — mirrors
 * `features/accounts/server/service.ts`'s `toAccount()`.
 */
export function toTransaction(row: TransactionRow): Transaction {
  return {
    ...row,
    amount: row.amount.toNumber(),
    category: row.category,
    account: row.account,
    tags: row.tags.map((transactionTag) => transactionTag.tag),
  }
}

/**
 * A Prisma `where` fragment that excludes split-parent transactions from any
 * list/sum, per docs/product/transactions.md AC14 ("the original transaction
 * is represented in the table as its individual split line items ... rather
 * than a single combined row"). This is the *identical* pattern used by
 * `features/dashboard/server/service.ts`'s `EXCLUDE_SPLIT_PARENTS` (see that
 * file's JSDoc for the full reasoning on why `splits: { none: {} }` is
 * correct for both ordinary and split-child transactions) — duplicated here
 * rather than imported since `dashboard/server/service.ts` does not export
 * it and features/<domain>/server modules are not meant to import each
 * other's internals across domains (folder-tree.md's module boundary). If
 * this predicate's semantics ever change, update both copies together.
 *
 * Exported (Phase 2) so `./aggregations.ts` — the one deliberate exception
 * to the "no cross-domain server imports" rule above, per
 * docs/architecture/api-contracts.md's Budgeting section — can reuse it
 * rather than holding a *third* copy. `aggregations.ts` lives inside this
 * same `transactions` module, so importing from it is an intra-module
 * import, not a cross-domain one; Dashboard and Budgeting then both import
 * `aggregations.ts` instead of reaching into this file directly.
 */
export const EXCLUDE_SPLIT_PARENTS: Prisma.TransactionWhereInput = {
  splits: { none: {} },
}

/**
 * Builds the shared `where` clause for `listTransactions`'s data query and
 * count query, so the two can never drift out of sync (a mismatch would
 * silently break pagination — e.g. `total` counting rows `items` excludes).
 */
function buildTransactionWhere(
  userId: string,
  filters: TransactionFilterInput,
): Prisma.TransactionWhereInput {
  const { accountId, categoryId, search, dateFrom, dateTo } = filters

  const categoryWhere: Prisma.TransactionWhereInput =
    categoryId === undefined
      ? {}
      : categoryId === UNCATEGORIZED_CATEGORY_ID
        ? { categoryId: null }
        : { categoryId }

  const searchWhere: Prisma.TransactionWhereInput = search
    ? {
        OR: [
          { merchant: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      }
    : {}

  const dateWhere: Prisma.TransactionWhereInput =
    dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}

  return {
    userId,
    ...EXCLUDE_SPLIT_PARENTS,
    ...(accountId ? { accountId } : {}),
    ...categoryWhere,
    ...searchWhere,
    ...dateWhere,
  }
}

/**
 * Builds the `orderBy` clause for `listTransactions` per AC2 ("sort the table
 * by date, amount, merchant, or category"). `category` sorts by the related
 * `Category.name` (Prisma orders `null` relations last regardless of
 * direction, which reads correctly here: "Uncategorized" sorting to one end
 * of the list rather than interleaving with named categories). Every branch
 * appends `createdAt desc` as a tiebreaker so same-value rows (e.g. two
 * transactions on the same date) still paginate in a stable order across
 * requests — matches the previous date-only default's tiebreaker.
 */
function buildTransactionOrderBy(
  sortBy: TransactionFilterInput["sortBy"],
  sortDir: TransactionFilterInput["sortDir"],
): Prisma.TransactionOrderByWithRelationInput[] {
  const tiebreaker: Prisma.TransactionOrderByWithRelationInput = {
    createdAt: "desc",
  }

  switch (sortBy) {
    case "amount":
      return [{ amount: sortDir }, tiebreaker]
    case "merchant":
      return [{ merchant: sortDir }, tiebreaker]
    case "category":
      return [{ category: { name: sortDir } }, tiebreaker]
    case "date":
    default:
      return [{ date: sortDir }, tiebreaker]
  }
}

/**
 * Lists the caller's transactions, paginated/filtered/searched/sorted per
 * docs/architecture/api-contracts.md's `GET /api/transactions` contract.
 *
 * - Excludes split-parent transactions (see `EXCLUDE_SPLIT_PARENTS`) so a
 *   split parent's line items, not the parent itself, are what display —
 *   AC14.
 * - `search` matches `merchant` OR `notes`, case-insensitive — AC4.
 * - Filters and search narrow the result set *together* (a single combined
 *   `where`), not independently — AC4's "combine that search with any of the
 *   filters above".
 * - Sortable by date, amount, merchant, or category (AC2), defaulting to
 *   date descending (most recent first, AC1) — see `buildTransactionOrderBy`.
 * - `total` is the full filtered/searched count (not just `items.length`),
 *   required by TanStack Table's server-side pagination mode.
 */
export async function listTransactions(
  userId: string,
  filters: TransactionFilterInput,
): Promise<TransactionListResult> {
  const { page, pageSize, sortBy, sortDir } = filters
  const where = buildTransactionWhere(userId, filters)

  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: buildTransactionOrderBy(sortBy, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.transaction.count({ where }),
  ])

  return { items: rows.map(toTransaction), total }
}

/**
 * Fetches a single transaction by id, scoped to the calling user. Returns
 * `null` for a missing id *or* an id owned by a different user — callers
 * must not be able to distinguish "doesn't exist" from "belongs to someone
 * else" (matches `features/accounts/server/service.ts`'s
 * `getAccountById` convention).
 *
 * Unlike `listTransactions`, this does *not* exclude split parents — a
 * direct by-id lookup is expected to be able to resolve any transaction the
 * user owns, including an already-split parent (e.g. for an audit/history
 * view), not just what the default table view displays.
 */
export async function getTransactionById(
  userId: string,
  id: string,
): Promise<Transaction | null> {
  const row = await db.transaction.findFirst({
    where: { id, userId },
    include: TRANSACTION_INCLUDE,
  })

  return row ? toTransaction(row) : null
}
