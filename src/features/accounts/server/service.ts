import type { Account as PrismaAccountRow } from "@prisma/client"

import { db } from "@/lib/db"

import type { Account, GetAccountsOptions } from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md: "List accounts | Server Component
// direct call to service.getAccounts(userId)") and by server/actions.ts. It
// must never be imported from a Client Component — there is no "use client"
// escape hatch here, and every exported function requires a pre-resolved
// `userId` from `getCurrentUser()` (see lib/auth.ts), never a client-supplied
// value, per folder-tree.md's note on scoping every query by the caller's id.

/**
 * Converts a Prisma `Account` row (whose `balance`/`interestRate` are
 * decimal.js `Decimal` instances) into the plain-number `Account` shape
 * defined in `../types.ts` that is safe to pass across the Server Component /
 * Client Component boundary and through Server Action responses.
 */
export function toAccount(row: PrismaAccountRow): Account {
  return {
    ...row,
    balance: row.balance.toNumber(),
    interestRate: row.interestRate === null ? null : row.interestRate.toNumber(),
  }
}

/**
 * Lists the caller's accounts. Defaults to the active (non-archived) list —
 * docs/product/accounts.md AC2. Pass `{ includeArchived: true }` to instead
 * fetch only archived accounts for the dedicated archived view (AC5); see
 * the JSDoc on `GetAccountsOptions` for why this is a toggle, not a union.
 *
 * Ordered by `createdAt` ascending so a user's first-added account (usually
 * their primary checking account) appears first, a reasonable default until
 * the UI offers explicit sorting.
 */
export async function getAccounts(
  userId: string,
  options: GetAccountsOptions = {},
): Promise<Account[]> {
  const { includeArchived = false } = options

  const rows = await db.account.findMany({
    where: {
      userId,
      archivedAt: includeArchived ? { not: null } : null,
    },
    orderBy: { createdAt: "asc" },
  })

  return rows.map(toAccount)
}

/**
 * Fetches a single account by id, scoped to the calling user. Returns null
 * for a missing id *or* an id owned by a different user — callers must not
 * be able to distinguish "doesn't exist" from "belongs to someone else"
 * (see folder-tree.md's note: "an account ID alone must never be trusted to
 * belong to the caller").
 */
export async function getAccountById(
  userId: string,
  id: string,
): Promise<Account | null> {
  const row = await db.account.findFirst({
    where: { id, userId },
  })

  return row ? toAccount(row) : null
}
