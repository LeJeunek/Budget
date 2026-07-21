import type { Account as PrismaAccountRow, Prisma } from "@prisma/client"

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

/**
 * Bug fix (Phase 3a Bug Hunter review, HIGH severity — "Accounts'
 * updateAccount can directly overwrite Investments' derived balance,
 * corrupting Net Worth"): does this account have at least one active
 * (non-Closed) Holding? `features/accounts/server/actions.ts`'s
 * `updateAccount` calls this to decide whether an incoming `balance` field
 * must be rejected — per docs/product/investments.md's explicit "no second,
 * independently-maintained balance number for the same container" hard
 * constraint, a container with active holdings has its `balance` derived and
 * written back exclusively by `setDerivedBalance` above (Investments' own
 * write path); `updateAccount` accepting a client-supplied `balance` for such
 * an account would silently violate that invariant until the next Holding
 * mutation overwrote it again with no explanation surfaced to the user.
 *
 * Implemented as a direct `db.holding` query here — rather than importing
 * anything from `features/investments` — to preserve the one-directional
 * dependency documented in `features/investments/server/service.ts`
 * ("Investments -> Accounts, never the reverse"): Accounts must stay
 * ignorant of Investments' module internals, but checking "does at least one
 * row in the shared `holding` table reference this account and have
 * `closedAt: null`" is a plain fact about this Account's own row, not a piece
 * of Investments' domain logic (gain/loss math, allocation, etc.) — the same
 * distinction that already lets this file's `setDerivedBalance` accept a
 * pre-computed sum without knowing how it was derived.
 */
export async function hasActiveHoldings(
  userId: string,
  accountId: string,
): Promise<boolean> {
  const activeHolding = await db.holding.findFirst({
    where: { userId, accountId, closedAt: null },
    select: { id: true },
  })

  return activeHolding !== null
}

/**
 * Writes the derived, holdings-sum `balance` onto an Investment/Retirement/
 * Crypto container Account.
 *
 * **(Phase 3a) narrow, internal function — not a client-facing action.** Per
 * docs/architecture/api-contracts.md's "(Phase 3a) `setDerivedBalance`" note
 * and docs/database/er-diagram.md's Phase 3a design note #4 ("Investments'
 * derived balance write-back: accepted as a deliberate exception"), this
 * function's only legitimate caller is
 * `features/investments/server/actions.ts`, and only from inside the exact
 * same `$transaction` as whatever Holding mutation (create/update/close)
 * changed the sum. Accepting a Prisma transaction client (`tx`) rather than
 * reaching for the top-level `db` singleton is what makes that atomicity
 * guarantee real: a holding write that succeeds with a failed balance
 * write-back can never happen, because both live in one transaction that
 * commits or rolls back together.
 *
 * Deliberately does not compute the sum itself — the caller already knows
 * it (having just aggregated its own holdings) — keeping this function's
 * only responsibility the write itself. This is what keeps Accounts
 * ignorant of Investments' domain rules (what counts as "active," how the
 * sum is derived): Accounts is never given a forward dependency on
 * Investments, it simply persists whatever number it's told, exactly as the
 * architecture note requires.
 *
 * `where: { id: accountId, userId }` combines the unique `id` field with a
 * non-unique ownership filter — Prisma's extended-where-unique input
 * supports this (a uniquely-identifying field plus additional filters ANDed
 * in), so a mismatched `userId` fails closed with Prisma's standard
 * "record not found" error (P2025) instead of silently updating another
 * user's row.
 */
export async function setDerivedBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
  balance: number,
): Promise<Account> {
  const row = await tx.account.update({
    where: { id: accountId, userId },
    data: { balance },
  })

  return toAccount(row)
}
