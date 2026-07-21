"use server"

import { AccountType, DebtType } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import type { Debt } from "@/features/debt/types"
import {
  CreateDebtSchema,
  UpdateDebtSchema,
  DebtIdSchema,
  LinkDebtToAccountSchema,
  UnlinkDebtFromAccountSchema,
} from "@/features/debt/server/validation"
import { toDebt } from "@/features/debt/server/service"

/**
 * Mutating Server Actions for the Debt Tracker module. Per
 * docs/architecture/api-contracts.md's Debt Tracker section and
 * docs/product/debt-tracker.md's AC1/AC3/AC10 and the Account-linkage
 * section: create/update/archive/unarchive a Debt, plus link/unlink it to an
 * existing Credit Card Account.
 *
 * There is intentionally NO hard-delete action — archive/unarchive
 * (`archivedAt`) is the only removal mechanism, matching the exact
 * archive/unarchive shape already established by Accounts/Goals/Bills/
 * Holdings (per prisma/schema.prisma's `Debt.archivedAt` comment: "Explicitly
 * allowed even with a nonzero balance").
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — a debtId/accountId
 *      supplied by the client is never trusted on its own; every lookup
 *      filters by `{ id, userId: user.id }` so one user can never read or
 *      mutate another user's debt or account (folder-tree.md's risk
 *      register item #4).
 *   3. Converts the Prisma row to its client-safe shape (`toDebt`) before
 *      returning it — Decimal fields aren't safely serializable as-is.
 *
 * Note: these actions return the plain `Debt` shape (raw `balance` column),
 * not `DebtWithProjection` — matching `createAccount`/`updateAccount`'s own
 * precedent of returning the mutated row itself, not a read-time-enriched
 * view. Callers needing the enriched projection after a mutation (e.g. a
 * form that immediately re-renders a projection) re-fetch via
 * `service.getDebtById`/`getDebts`, the same as every other domain in this
 * codebase.
 */

/**
 * Creates a new debt for the current user (AC1). Deliberately has no
 * `accountId` parameter — linking to an existing Credit Card Account is
 * always a separate, explicit follow-up action (`linkDebtToAccount`), never
 * bundled into creation (see `CreateDebtSchema`'s JSDoc for the full
 * rationale).
 */
export async function createDebt(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateDebtSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid debt data")
  }
  const { name, type, balance, interestRate, minimumPayment } = parsed.data

  const debt = await db.debt.create({
    data: {
      userId: user.id,
      name,
      type,
      balance,
      interestRate,
      minimumPayment,
    },
  })

  return ok(toDebt(debt))
}

/**
 * Updates one or more fields on an existing debt (AC3). Only fields
 * actually present in the parsed input are written, so a caller patching
 * just one field can't accidentally clear the others. Editing balance,
 * interest rate, or minimum payment recalculates that debt's payoff
 * projections at the *next read* only — this action never touches any
 * projection field because none is ever stored (AC3: "it does not
 * retroactively change any past month's recorded history").
 *
 * No `type` field is accepted here — see `UpdateDebtSchema`'s JSDoc for why
 * a debt's type is immutable post-creation in this contract.
 */
export async function updateDebt(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateDebtSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid debt data")
  }
  const { id, name, balance, interestRate, minimumPayment } = parsed.data

  const existing = await db.debt.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Debt not found")
  }

  const updated = await db.debt.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(balance !== undefined ? { balance } : {}),
      ...(interestRate !== undefined ? { interestRate } : {}),
      ...(minimumPayment !== undefined ? { minimumPayment } : {}),
    },
  })

  return ok(toDebt(updated))
}

/**
 * Archives (soft-deletes) a debt (AC10). Removes it from the default debt
 * list and from the snowball/avalanche comparison and Net Worth going
 * forward, without deleting its history. Explicitly allowed even with a
 * nonzero balance (AC10/Edge Cases: "archiving is a visibility action only,
 * distinct from Paid Off").
 *
 * Idempotent by design, matching `archiveAccount`/`closeHolding`: archiving
 * an already-archived debt just confirms the end state rather than erroring.
 */
export async function archiveDebt(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = DebtIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid debt id")
  }
  const { id } = parsed.data

  const existing = await db.debt.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Debt not found")
  }

  if (existing.archivedAt) {
    return ok(toDebt(existing))
  }

  const archived = await db.debt.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  return ok(toDebt(archived))
}

/**
 * Restores an archived debt (AC10). Returns it to the active list and
 * re-includes it in the snowball/avalanche comparison and Net Worth going
 * forward.
 *
 * Idempotent for the same reason as `archiveDebt`.
 */
export async function unarchiveDebt(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = DebtIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid debt id")
  }
  const { id } = parsed.data

  const existing = await db.debt.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Debt not found")
  }

  if (!existing.archivedAt) {
    return ok(toDebt(existing))
  }

  const unarchived = await db.debt.update({
    where: { id },
    data: { archivedAt: null },
  })

  return ok(toDebt(unarchived))
}

/**
 * Links a Debt to an existing Credit Card Account (debt-tracker.md's
 * Account-linkage section, Option C). Once linked, the Debt's
 * `effectiveBalance` (see `server/service.ts`'s `toDebtWithProjection`) is
 * read live from the Account, never independently re-entered or copied.
 *
 * Rejects, per api-contracts.md's exact contract for this action, if:
 *   - the Debt isn't the current user's, or doesn't exist,
 *   - the Debt's `type` isn't `CREDIT_CARD` (the other five debt types have
 *     no Account counterpart at all — prisma/schema.prisma's `Debt.type`
 *     comment and debt-tracker.md's Account-linkage section are both
 *     explicit that this is a hard product constraint, not a detail left to
 *     implementation),
 *   - the Debt is already linked to a different Account (unlink first —
 *     see this file's JSDoc note on why re-linking isn't offered as an
 *     implicit "switch" operation),
 *   - the Account isn't the current user's, isn't `CREDIT_CARD` type, or
 *   - the Account is already linked to a different Debt (`Debt.accountId`'s
 *     `@unique` constraint enforces this at the database level regardless;
 *     this check exists only to fail with a clear, friendly message instead
 *     of a raw Prisma unique-constraint error).
 *
 * **Judgment call, flagged here**: api-contracts.md's contract for this
 * action does not explicitly say what happens if the *Debt* itself is
 * already linked to some Account when `linkDebtToAccount` is called again.
 * This implementation requires an explicit `unlinkDebtFromAccount` first
 * rather than silently treating a second `linkDebtToAccount` call as an
 * implicit "switch to a different account" — consistent with how this
 * feature treats linking as a deliberate, single action, and avoids the
 * ambiguity of which balance (the old linked Account's, or the Debt's stale
 * manual column) should seed anything, since `unlinkDebtFromAccount`
 * already owns that exact "what balance does the Debt fall back to"
 * decision.
 */
export async function linkDebtToAccount(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = LinkDebtToAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid link request")
  }
  const { debtId, accountId } = parsed.data

  const debt = await db.debt.findFirst({ where: { id: debtId, userId: user.id } })
  if (!debt) {
    return fail("Debt not found")
  }
  if (debt.type !== DebtType.CREDIT_CARD) {
    return fail("Only Credit Card debts can be linked to an account")
  }
  if (debt.accountId) {
    return fail("This debt is already linked to an account — unlink it first")
  }

  const account = await db.account.findFirst({ where: { id: accountId, userId: user.id } })
  if (!account) {
    return fail("Account not found")
  }
  if (account.type !== AccountType.CREDIT_CARD) {
    return fail("Only Credit Card accounts can be linked to a debt")
  }

  const alreadyLinkedDebt = await db.debt.findFirst({ where: { accountId } })
  if (alreadyLinkedDebt) {
    return fail("This account is already linked to a different debt")
  }

  const updated = await db.debt.update({
    where: { id: debtId },
    data: { accountId },
  })

  return ok(toDebt(updated))
}

/**
 * Unlinks a Debt from its Account (debt-tracker.md's Account-linkage
 * section). Reverts the Debt to a manually-maintained balance, seeded from
 * the linked Account's last-known balance at the moment of unlinking — a
 * one-time copy, not a live link from then on (per api-contracts.md's exact
 * contract for this action and prisma/schema.prisma's `Debt.balance`
 * comment, which is why `Debt.balance` stays a real, non-nullable column
 * rather than becoming nullable while linked: the moment a user unlinks, the
 * Debt needs an immediate, sensible fallback value with zero migration/
 * backfill step).
 *
 * Idempotent: a Debt with no `accountId` already is simply returned as-is.
 */
export async function unlinkDebtFromAccount(input: unknown): Promise<ApiResult<Debt>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UnlinkDebtFromAccountSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid unlink request")
  }
  const { debtId } = parsed.data

  const debt = await db.debt.findFirst({
    where: { id: debtId, userId: user.id },
    include: { account: { select: { balance: true } } },
  })
  if (!debt) {
    return fail("Debt not found")
  }

  if (!debt.accountId || !debt.account) {
    return ok(toDebt(debt))
  }

  const updated = await db.debt.update({
    where: { id: debtId },
    data: {
      accountId: null,
      balance: debt.account.balance,
    },
  })

  return ok(toDebt(updated))
}
