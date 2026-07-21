"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { Account } from "@/features/accounts/types"
import {
  CreateAccountSchema,
  UpdateAccountSchema,
  AccountIdSchema,
} from "@/features/accounts/server/validation"
import { hasActiveHoldings, toAccount } from "@/features/accounts/server/service"
import { unlinkDebtOnAccountArchive } from "@/features/debt/server/service"

/**
 * Mutating Server Actions for the Accounts module. Per
 * docs/architecture/api-contracts.md's Accounts section and
 * docs/product/accounts.md AC4/AC5: create, update, and archive/unarchive.
 *
 * There is intentionally NO hard-delete action. docs/product/accounts.md AC4
 * and its "Deleting the only account a user has" edge case are explicit that
 * removing an account is always the soft-delete represented by `archivedAt`
 * — a real DB row delete would cascade-orphan the account's transaction
 * history, which the spec requires to remain "fully intact and reachable."
 * `archiveAccount` is that action's real implementation.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — an id supplied by the
 *      client (e.g. `input.id`) is never trusted on its own; every lookup
 *      filters by `{ id, userId: user.id }` so one user can never read or
 *      mutate another user's account (folder-tree.md's risk register item
 *      #4 / "an account ID alone must never be trusted to belong to the
 *      caller", also called out in server/service.ts).
 *   3. Converts the Prisma row to the client-safe `Account` shape via
 *      `toAccount()` before returning it (see service.ts for why: Decimal
 *      fields aren't safely serializable as-is).
 */

/**
 * Creates a new account for the current user.
 *
 * No duplicate-name check: docs/product/accounts.md's edge cases explicitly
 * allow duplicate account names (e.g. two accounts both named "Checking" at
 * different institutions) — unlike Categories, there is no uniqueness rule
 * to enforce here.
 */
export async function createAccount(
  input: unknown
): Promise<ApiResult<Account>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid account data")
  }
  const { name, type, institution, balance, interestRate, color } = parsed.data

  const account = await db.account.create({
    data: {
      userId: user.id,
      name,
      type,
      institution,
      balance,
      interestRate,
      color,
    },
  })

  return ok(toAccount(account))
}

/**
 * Updates one or more fields on an existing account.
 *
 * Per docs/product/accounts.md AC3 and its "Editing an account that has
 * existing transactions" edge case, every field — including `type` — may be
 * changed post-creation without restriction; changing the type does not
 * retroactively alter transactions that already reference the account.
 *
 * Only fields actually present in the parsed input are written: `undefined`
 * fields (the ones the caller omitted) are excluded from `data` so an
 * "update just the color" call can't accidentally null out other columns.
 * `interestRate: null` is the one deliberate exception — `!== undefined`
 * still includes it, which is required so a caller can explicitly clear a
 * previously-set rate (see the JSDoc on `UpdateAccountSchema`).
 *
 * Bug fix (Phase 3a Bug Hunter review, HIGH severity — "Accounts'
 * updateAccount can directly overwrite Investments' derived balance,
 * corrupting Net Worth"): an incoming `balance` field is now rejected when
 * the target account has one or more active Holdings, per
 * docs/product/investments.md's "no second, independently-maintained balance
 * number for the same container" hard constraint — such an account's balance
 * is derived and exclusively written by Investments'
 * `setDerivedBalance`/`recalculateContainerBalance` write-back path (see
 * `features/accounts/server/service.ts`'s `hasActiveHoldings`); accepting a
 * manual balance here would silently violate that invariant until the next
 * Holding mutation overwrote it again with no explanation ever surfaced to
 * the user. A container with zero active holdings (never had any, or every
 * holding has since been Closed) has no derived value to protect, so its
 * balance still edits normally, same as any non-container account.
 */
export async function updateAccount(
  input: unknown
): Promise<ApiResult<Account>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid account data")
  }
  const { id, name, type, institution, balance, interestRate, color } =
    parsed.data

  const existing = await db.account.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Account not found")
  }

  if (balance !== undefined && (await hasActiveHoldings(user.id, id))) {
    return fail(
      "This account's balance is calculated from its holdings — edit a holding instead"
    )
  }

  const updated = await db.account.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(institution !== undefined ? { institution } : {}),
      ...(balance !== undefined ? { balance } : {}),
      ...(interestRate !== undefined ? { interestRate } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  })

  return ok(toAccount(updated))
}

/**
 * Archives (soft-deletes) an account — docs/product/accounts.md AC4.
 * Removes it from default account lists and dashboard aggregates going
 * forward, and (enforced by the Transactions module, not here) blocks new
 * transactions from being logged against it. Transaction history is
 * untouched: this only ever sets `archivedAt`, never deletes rows.
 *
 * Idempotent by design: archiving an already-archived account is not an
 * error, it just confirms the (already-satisfied) end state — a client
 * double-submitting the action, or two tabs racing, shouldn't surface a
 * confusing failure for a request that got what it wanted either way.
 *
 * Bug fix (Phase 3a Bug Hunter review, HIGH severity — "Net Worth liability
 * vanishes when a linked Credit Card Account is archived while its Debt
 * stays active"): archiving now also unlinks any still-active Debt linked to
 * this Account (snapshotting the Account's current balance onto the Debt's
 * own `balance` column first), inside the same transaction as the archive
 * write itself. See `features/debt/server/service.ts`'s
 * `unlinkDebtOnAccountArchive` for the full reasoning on why auto-unlink was
 * chosen over rejecting the archive outright. This is a no-op for the
 * overwhelming majority of accounts (no linked Debt at all), so the extra
 * query this adds is cheap and only ever does real work in the one case it
 * exists for.
 */
export async function archiveAccount(
  input: unknown
): Promise<ApiResult<Account>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = AccountIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid account id")
  }
  const { id } = parsed.data

  const existing = await db.account.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Account not found")
  }

  if (existing.archivedAt) {
    return ok(toAccount(existing))
  }

  const archived = await db.$transaction(async (tx) => {
    const updated = await tx.account.update({
      where: { id },
      data: { archivedAt: new Date() },
    })

    await unlinkDebtOnAccountArchive(tx, user.id, id, existing.balance)

    return updated
  })

  return ok(toAccount(archived))
}

/**
 * Restores an archived account — docs/product/accounts.md AC5. Returns it to
 * the active list and re-includes it in dashboard aggregates going forward.
 *
 * Idempotent for the same reason as `archiveAccount`: unarchiving an
 * already-active account confirms the end state instead of erroring.
 */
export async function unarchiveAccount(
  input: unknown
): Promise<ApiResult<Account>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = AccountIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid account id")
  }
  const { id } = parsed.data

  const existing = await db.account.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Account not found")
  }

  if (!existing.archivedAt) {
    return ok(toAccount(existing))
  }

  const unarchived = await db.account.update({
    where: { id },
    data: { archivedAt: null },
  })

  return ok(toAccount(unarchived))
}
