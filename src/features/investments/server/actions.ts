"use server"

import { AccountType, type Prisma } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import { createAccount } from "@/features/accounts/server/actions"
import { setDerivedBalance } from "@/features/accounts/server/service"

import type { DividendEntry, Holding } from "@/features/investments/types"
import {
  CreateHoldingSchema,
  UpdateHoldingSchema,
  HoldingIdSchema,
  LogDividendSchema,
  validateSectorForAssetType,
} from "@/features/investments/server/validation"
import { toDividendEntry, toHolding } from "@/features/investments/server/service"

/**
 * Mutating Server Actions for the Investments module. Per
 * docs/architecture/api-contracts.md's Investments section and
 * docs/product/investments.md's AC1/AC4/AC5/AC8: create/update/close a
 * Holding, and log a dividend.
 *
 * There is intentionally NO hard-delete-holding action — AC5 is Closed-only
 * (this domain's own vocabulary for the archive/unarchive pattern already
 * established by Accounts/Goals/Bills/Debt), matching this schema's
 * "Holding/IncomeStream soft-delete" design note
 * (docs/database/er-diagram.md). There is also no `unclose`/"reopen" action:
 * neither investments.md nor api-contracts.md's Investments table lists one
 * (unlike Accounts/Goals/Bills, which all have an explicit unarchive row) —
 * flagged here rather than added unilaterally; request that artifact from
 * the Solution Architect/Product Owner if reopening a Closed holding turns
 * out to be a real product need.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — a holdingId/accountId
 *      supplied by the client is never trusted on its own; every lookup
 *      filters by `{ id, userId: user.id }` so one user can never read or
 *      mutate another user's holding or container (folder-tree.md's risk
 *      register item #4).
 *   3. Converts the Prisma row to its client-safe shape (`toHolding`/
 *      `toDividendEntry`) before returning it — Decimal fields aren't
 *      safely serializable as-is.
 */

/** Account types a Holding may be created under — mirrors
 * `server/service.ts`'s `CONTAINER_ACCOUNT_TYPES`, duplicated here (not
 * imported) since that constant is a read-side concern and this one guards
 * a write, and the two files' module boundary already keeps each self-
 * contained (both are inside the same `investments` feature, but
 * `server/service.ts` never imports from `server/actions.ts` or vice versa,
 * matching every other domain's service/actions split in this codebase). */
const CONTAINER_ACCOUNT_TYPES: readonly AccountType[] = [
  AccountType.INVESTMENT,
  AccountType.RETIREMENT,
  AccountType.CRYPTO,
]

/**
 * Recomputes and writes back a container Account's derived `balance` — the
 * sum of its currently-active (non-Closed) holdings' `currentValue` — inside
 * the SAME transaction as whatever Holding mutation triggered it.
 *
 * Per docs/database/er-diagram.md's Phase 3a design note #4 and
 * `accounts.server.setDerivedBalance`'s own JSDoc: this must always run
 * inside the `tx` shared with the holding create/update/close it follows, so
 * a holding write that succeeds with a failed balance write-back can never
 * happen. Called unconditionally after every holding mutation below (not
 * only when `currentValue` itself changed) — recomputing is a single cheap
 * indexed aggregate at this feature's expected per-container holding count
 * (docs/product/investments.md's own framing: a handful of holdings per
 * container, not a Transaction-scale table), and unconditional recomputation
 * keeps this one code path correct regardless of which fields a given
 * mutation touched, rather than each call site having to reason about
 * whether its particular edit could have changed the sum.
 */
async function recalculateContainerBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
): Promise<void> {
  const result = await tx.holding.aggregate({
    where: { userId, accountId, closedAt: null },
    _sum: { currentValue: true },
  })
  const balance = result._sum.currentValue?.toNumber() ?? 0

  await setDerivedBalance(tx, userId, accountId, balance)
}

/**
 * Creates a new holding (AC2), either under an existing container
 * (`accountId`) or, per AC1's inline-container-creation flow, a brand-new
 * one (`newContainer`) — `CreateHoldingSchema`'s `superRefine` already
 * guarantees exactly one of the two is present.
 *
 * The inline-container branch delegates to `accounts.actions.createAccount`
 * directly (not duplicated here), per api-contracts.md's explicit note that
 * this is "the same as if the user had created the Account separately." The
 * new Account's creation and the Holding's creation are two sequential
 * steps, not one atomic multi-model transaction — only the holding
 * write + derived-balance write-back (below) has the same-transaction
 * requirement, since a freshly-created container has no prior balance to
 * race against.
 *
 * When an existing `accountId` is supplied instead, it is verified to (a)
 * belong to the current user and (b) be an Investment/Retirement/Crypto
 * type — a Holding under any other account type would have no product
 * meaning and no derived-balance consumer.
 */
export async function createHolding(input: unknown): Promise<ApiResult<Holding>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateHoldingSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid holding data")
  }
  const { accountId, newContainer, name, assetType, sector, costBasis, currentValue } =
    parsed.data

  let resolvedAccountId: string

  if (newContainer) {
    const accountResult = await createAccount({
      name: newContainer.name,
      type: newContainer.type,
    })
    if (!accountResult.success) {
      return fail(accountResult.error)
    }
    resolvedAccountId = accountResult.data.id
  } else {
    const account = await db.account.findFirst({
      where: { id: accountId, userId: user.id },
    })
    if (!account) {
      return fail("Container account not found")
    }
    if (!CONTAINER_ACCOUNT_TYPES.includes(account.type)) {
      return fail(
        "Holdings can only be added to Investment, Retirement, or Crypto accounts",
      )
    }
    resolvedAccountId = account.id
  }

  const holding = await db.$transaction(async (tx) => {
    const created = await tx.holding.create({
      data: {
        userId: user.id,
        accountId: resolvedAccountId,
        name,
        assetType,
        sector: sector ?? null,
        costBasis,
        currentValue,
      },
    })

    await recalculateContainerBalance(tx, user.id, resolvedAccountId)

    return created
  })

  return ok(toHolding(holding))
}

/**
 * Updates one or more fields on an existing holding (AC4) — name, asset
 * type, sector, cost basis, current value. Only fields actually present in
 * the parsed input are written, so a caller patching just one field can't
 * accidentally clear the others.
 *
 * Sector/asset-type requirement (AC2) is checked against the *effective*
 * (merged existing + incoming) combination, since `UpdateHoldingSchema`
 * itself has no way to know the holding's current values — see
 * `validateSectorForAssetType`'s JSDoc.
 *
 * Every `currentValue` edit — including a re-save of the *same* value —
 * appends a `HoldingValueHistoryEntry` (AC4/Edge Cases: "a confirmed no
 * change" data point, not a gap in history). This is driven purely by
 * whether the caller's input included the `currentValue` field at all
 * (`!== undefined`), never by comparing the new value against the old one,
 * so the "re-saving the same value" edge case falls out for free without
 * any special-casing.
 *
 * Bug fix (Phase 3a Bug Hunter review, MEDIUM severity — "Closed holdings
 * remain fully editable, silently rewriting historical gain/loss"): rejects
 * the edit outright when the target holding's `closedAt` is not null. A
 * Closed holding is this domain's frozen historical record (AC5's
 * archive-only pattern, matching Accounts/Goals/Bills/Debt) — every field
 * remaining editable indefinitely after close let `currentValue`/`costBasis`
 * be silently rewritten post-close, appending a new
 * `HoldingValueHistoryEntry` and changing the Closed-holdings view's
 * gain/loss after the fact with no error surfaced anywhere. This is a
 * deliberate "closed means frozen" stance: there is intentionally no
 * "unclose"/reopen action in this file (see this file's own top-level JSDoc),
 * so a Closed holding has no legitimate path back to being editable at all
 * right now — if that ever becomes a real product need, it is a new,
 * explicit action to request from the Solution Architect/Product Owner, not
 * a side effect of relaxing this check.
 */
export async function updateHolding(input: unknown): Promise<ApiResult<Holding>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateHoldingSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid holding data")
  }
  const { id, name, assetType, sector, costBasis, currentValue } = parsed.data

  const existing = await db.holding.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Holding not found")
  }

  if (existing.closedAt) {
    return fail("This holding is closed and can no longer be edited")
  }

  const effectiveAssetType = assetType ?? existing.assetType
  const effectiveSector = sector !== undefined ? sector : existing.sector
  const sectorError = validateSectorForAssetType(effectiveAssetType, effectiveSector)
  if (sectorError) {
    return fail(sectorError)
  }

  const isCurrentValueEdit = currentValue !== undefined
  const previousValue = existing.currentValue

  const holding = await db.$transaction(async (tx) => {
    const updated = await tx.holding.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(assetType !== undefined ? { assetType } : {}),
        ...(sector !== undefined ? { sector } : {}),
        ...(costBasis !== undefined ? { costBasis } : {}),
        ...(currentValue !== undefined ? { currentValue } : {}),
      },
    })

    if (isCurrentValueEdit) {
      await tx.holdingValueHistoryEntry.create({
        data: {
          holdingId: id,
          userId: user.id,
          previousValue,
          newValue: currentValue,
        },
      })
    }

    await recalculateContainerBalance(tx, user.id, existing.accountId)

    return updated
  })

  return ok(toHolding(holding))
}

/**
 * Marks a holding Closed (AC5) — this domain's own term for the
 * archive-only soft-delete pattern already established by Accounts/Goals/
 * Bills/Debt. Drops it out of the active list/allocation/overview, but its
 * value-history and dividend history remain intact and reachable via
 * `service.getHoldingById`/`getHoldingsForContainer({ includeClosed: true })`.
 *
 * Idempotent by design, matching `archiveAccount`: closing an
 * already-Closed holding just confirms the end state rather than erroring
 * (the idempotent branch below skips the transaction entirely, since
 * nothing changed). The non-idempotent path below always recalculates the
 * container balance — a holding leaving the active set changes what the
 * container's derived balance sums over, exactly the kind of mutation the
 * derived-balance write-back exists for.
 */
export async function closeHolding(input: unknown): Promise<ApiResult<Holding>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = HoldingIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid holding id")
  }
  const { id } = parsed.data

  const existing = await db.holding.findFirst({ where: { id, userId: user.id } })
  if (!existing) {
    return fail("Holding not found")
  }

  if (existing.closedAt) {
    return ok(toHolding(existing))
  }

  const holding = await db.$transaction(async (tx) => {
    const closed = await tx.holding.update({
      where: { id },
      data: { closedAt: new Date() },
    })

    await recalculateContainerBalance(tx, user.id, existing.accountId)

    return closed
  })

  return ok(toHolding(holding))
}

/**
 * Logs a dividend against a holding (AC8). Allowed even on a Closed holding
 * (Edge Cases: "a dividend logged on a Closed holding ... allowed — it
 * still counts toward that holding's and the portfolio's total dividend
 * income") — there is deliberately no `closedAt` check anywhere in this
 * function, only ownership. Dividends never affect a holding's
 * `currentValue` (AC6: gain/loss and dividend income are two distinct,
 * never-mixed figures), so no derived-balance write-back is needed here.
 */
export async function logDividend(input: unknown): Promise<ApiResult<DividendEntry>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = LogDividendSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid dividend data")
  }
  const { holdingId, amount, date } = parsed.data

  const holding = await db.holding.findFirst({
    where: { id: holdingId, userId: user.id },
    select: { id: true },
  })
  if (!holding) {
    return fail("Holding not found")
  }

  const dividend = await db.dividendEntry.create({
    data: { holdingId, userId: user.id, amount, date },
  })

  return ok(toDividendEntry(dividend))
}
