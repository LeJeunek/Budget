"use server"

import type { Prisma } from "@prisma/client"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import { getAccounts } from "@/features/accounts/server/service"
import { getDebtById } from "@/features/debt/server/service"

import type { FinancialGoal } from "@/features/financial-goals/types"
import {
  CreateFinancialGoalSchema,
  UpdateFinancialGoalSchema,
  FinancialGoalIdSchema,
  type CreateFinancialGoalInput,
  type UpdateFinancialGoalInput,
} from "@/features/financial-goals/server/validation"
import {
  toFinancialGoal,
  assertDebtNotAlreadyLinkedToActiveGoal,
  DebtAlreadyLinkedError,
} from "@/features/financial-goals/server/service"

/**
 * Mutating Server Actions for the Financial Goals module. Per
 * docs/architecture/api-contracts.md's Financial Goals section and
 * docs/product/financial-goals.md's AC1/AC3/AC4: create, update,
 * archive/unarchive — and, deliberately, **nothing else**. There is no
 * contribution/manual-update action of any kind (AC6, this feature's single
 * defining structural difference from `features/goals` — Savings Goals):
 * every progress field is computed at read time in `server/service.ts` from
 * live source data, never written here.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls `getCurrentUser()` and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — a goal/debt/account id
 *      supplied by the client is never trusted on its own; every lookup
 *      filters by `{ id, userId: user.id }` so one user can never read or
 *      mutate another user's data by guessing/supplying its id
 *      (folder-tree.md's risk register item #4).
 *   3. Converts the Prisma row to its client-safe shape (`toFinancialGoal`)
 *      before returning it — Decimal fields aren't safely serializable
 *      as-is.
 *
 * None of these actions return the derived `FinancialGoalWithProgress`
 * shape (only the bare `FinancialGoal`), matching api-contracts.md's
 * declared `ApiResult<FinancialGoal>` output for each — a caller that needs
 * the recomputed progress after a mutation re-fetches via
 * `service.getFinancialGoals`/`getFinancialGoalById`, rather than this file
 * duplicating that computation.
 */

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a `DEBT_PAYOFF` goal (financial-goals.md's Type 1). Captures the
 * linked Debt's live `effectiveBalance` once, as the goal's fixed
 * `startingBalance` anchor (per the spec's "how much of the balance that
 * existed when I started this goal have I paid off").
 *
 * Validates, before ever opening a transaction:
 *   - the Debt exists and belongs to `userId` (`debt.service.getDebtById`
 *     already scopes by user and returns archived Debts too, per that
 *     function's own confirmed contract — checked explicitly below rather
 *     than relied upon implicitly, since a goal must not be *created*
 *     against an already-archived or already-Paid-Off Debt, financial-
 *     goals.md's own "existing, active ... not already Paid Off" wording).
 *
 * Then, inside a single `db.$transaction` (closing the check-then-create
 * race window per `assertDebtNotAlreadyLinkedToActiveGoal`'s own JSDoc):
 * re-verifies no other active `DEBT_PAYOFF` goal already targets this Debt,
 * then creates the row.
 */
async function createDebtPayoffGoal(
  userId: string,
  data: Extract<CreateFinancialGoalInput, { type: "DEBT_PAYOFF" }>,
): Promise<ApiResult<FinancialGoal>> {
  const debt = await getDebtById(userId, data.linkedDebtId)
  if (!debt) {
    return fail("Debt not found")
  }
  if (debt.archivedAt) {
    return fail("Cannot start a Debt Payoff goal for an archived debt")
  }
  if (debt.isPaidOff) {
    return fail("This debt is already paid off")
  }

  try {
    const created = await db.$transaction(async (tx) => {
      await assertDebtNotAlreadyLinkedToActiveGoal(tx, userId, data.linkedDebtId)

      return tx.financialGoal.create({
        data: {
          userId,
          name: data.name,
          type: "DEBT_PAYOFF",
          linkedDebtId: data.linkedDebtId,
          startingBalance: debt.effectiveBalance,
        },
      })
    })

    return ok(toFinancialGoal(created))
  } catch (error) {
    if (error instanceof DebtAlreadyLinkedError) {
      return fail(error.message)
    }
    throw error
  }
}

/**
 * Creates a `NET_WORTH_SAVINGS_TARGET` goal (financial-goals.md's Type 2).
 * For the `ACCOUNT_SUBSET` basis, every supplied `accountId` is verified to
 * belong to `userId` and be non-archived (`accounts.service.getAccounts`'s
 * own non-archived-by-default read) *before* the write — a plain read-then-
 * write, not wrapped in `$transaction`, since Account ownership cannot
 * change out from under a single authenticated user mid-request (the same
 * "single user, own session" concurrency assumption already applied
 * throughout this codebase, e.g. `features/goals/server/actions.ts`'s
 * `addContribution` ownership check).
 */
async function createNetWorthSavingsTargetGoal(
  userId: string,
  data: Extract<CreateFinancialGoalInput, { type: "NET_WORTH_SAVINGS_TARGET" }>,
): Promise<ApiResult<FinancialGoal>> {
  let validatedAccountIds: string[] = []

  if (data.measurementBasis === "ACCOUNT_SUBSET") {
    const requestedIds = data.accountIds ?? []
    const ownedAccounts = await getAccounts(userId)
    const ownedIds = new Set(ownedAccounts.map((account) => account.id))
    const unownedId = requestedIds.find((accountId) => !ownedIds.has(accountId))
    if (unownedId) {
      return fail("One or more selected accounts could not be found")
    }
    validatedAccountIds = requestedIds
  }

  const created = await db.$transaction(async (tx) => {
    const goal = await tx.financialGoal.create({
      data: {
        userId,
        name: data.name,
        type: "NET_WORTH_SAVINGS_TARGET",
        targetAmount: data.targetAmount,
        measurementBasis: data.measurementBasis,
      },
    })

    if (validatedAccountIds.length > 0) {
      await tx.financialGoalAccount.createMany({
        data: validatedAccountIds.map((accountId) => ({
          financialGoalId: goal.id,
          accountId,
        })),
      })
    }

    return goal
  })

  return ok(toFinancialGoal(created))
}

/** Creates a `SAVINGS_RATE_TARGET` goal (financial-goals.md's Type 3). No
 * cross-domain validation needed — `targetPercent`'s 0-100 bound is already
 * enforced by `CreateFinancialGoalSchema`, and `targetDate` is optional. */
async function createSavingsRateTargetGoal(
  userId: string,
  data: Extract<CreateFinancialGoalInput, { type: "SAVINGS_RATE_TARGET" }>,
): Promise<ApiResult<FinancialGoal>> {
  const created = await db.financialGoal.create({
    data: {
      userId,
      name: data.name,
      type: "SAVINGS_RATE_TARGET",
      targetPercent: data.targetPercent,
      targetDate: data.targetDate ?? null,
    },
  })

  return ok(toFinancialGoal(created))
}

/**
 * Creates a new Financial Goal of any of the three types (AC1). Dispatches
 * to one of the three type-specific helpers above based on the
 * already-validated, discriminated `type` field — each helper owns its own
 * type's validation/creation shape, keeping this entry point a thin router
 * rather than one large branching function.
 */
export async function createFinancialGoal(
  input: unknown,
): Promise<ApiResult<FinancialGoal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateFinancialGoalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid financial goal data")
  }

  switch (parsed.data.type) {
    case "DEBT_PAYOFF":
      return createDebtPayoffGoal(user.id, parsed.data)
    case "NET_WORTH_SAVINGS_TARGET":
      return createNetWorthSavingsTargetGoal(user.id, parsed.data)
    case "SAVINGS_RATE_TARGET":
      return createSavingsRateTargetGoal(user.id, parsed.data)
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Fields `UpdateFinancialGoalSchema` accepts that do not apply to a
 * `DEBT_PAYOFF` goal — per AC3, that type's only editable field is `name`
 * (its target is implicitly "$0 balance," not a stored amount/percentage to
 * edit).
 */
function hasNetWorthOrSavingsRateOnlyFields(
  data: UpdateFinancialGoalInput,
): boolean {
  return (
    data.targetAmount !== undefined ||
    data.measurementBasis !== undefined ||
    data.accountIds !== undefined ||
    data.targetPercent !== undefined ||
    data.targetDate !== undefined
  )
}

/**
 * Updates one or more fields on an existing Financial Goal (AC3): name,
 * target amount/percentage, and — for `NET_WORTH_SAVINGS_TARGET` — the
 * measurement basis (and its Account subset). Only fields actually present
 * in the parsed input are written, so a caller patching just one field
 * (e.g. renaming) can't accidentally clear the others.
 *
 * **Type-fixed editable-field enforcement (AC1/AC3):** the set of fields a
 * caller may supply is determined entirely by the existing goal's `type`,
 * looked up first. A caller supplying a field that doesn't apply to this
 * goal's type (e.g. `targetPercent` for a `DEBT_PAYOFF` goal) is rejected
 * outright rather than silently ignored — surfacing a stale-form client bug
 * immediately instead of masking it.
 *
 * **`NET_WORTH_SAVINGS_TARGET`'s Account-subset handling:** per the Edge
 * Cases' "editable at any time; recalculates live at the next read using
 * the newly selected subset, with no attempt to reconstruct what progress
 * 'would have been' under the old subset historically" — switching *to*
 * `ACCOUNT_SUBSET` (whether newly or already on it) requires a non-empty
 * `accountIds` (mirroring creation's own "select at least one account"
 * rule); switching *to* `TOTAL_NET_WORTH` clears any existing subset rows,
 * since they'd otherwise be silently orphaned, unreferenced data. Every
 * write to `financial_goal_account` happens inside the same `$transaction`
 * as the `FinancialGoal` row update itself, so the two can never
 * partially apply.
 */
export async function updateFinancialGoal(
  input: unknown,
): Promise<ApiResult<FinancialGoal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateFinancialGoalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid financial goal data")
  }
  const data = parsed.data

  const existing = await db.financialGoal.findFirst({
    where: { id: data.id, userId: user.id },
  })
  if (!existing) {
    return fail("Financial goal not found")
  }

  if (existing.type === "DEBT_PAYOFF" && hasNetWorthOrSavingsRateOnlyFields(data)) {
    return fail("Only the name can be edited on a Debt Payoff goal")
  }
  if (
    existing.type === "NET_WORTH_SAVINGS_TARGET" &&
    (data.targetPercent !== undefined || data.targetDate !== undefined)
  ) {
    return fail("Target percent/date do not apply to a Net Worth / Savings Target goal")
  }
  if (
    existing.type === "SAVINGS_RATE_TARGET" &&
    (data.targetAmount !== undefined ||
      data.measurementBasis !== undefined ||
      data.accountIds !== undefined)
  ) {
    return fail("Target amount/measurement basis do not apply to a Savings Rate Target goal")
  }

  // Resolved *after* the goal's own basis is known, whether or not this
  // update actually changes it — used below to decide how (and whether) to
  // touch the Account-subset join table.
  const resolvedMeasurementBasis = data.measurementBasis ?? existing.measurementBasis

  if (
    existing.type === "NET_WORTH_SAVINGS_TARGET" &&
    resolvedMeasurementBasis === "ACCOUNT_SUBSET" &&
    data.accountIds !== undefined
  ) {
    if (data.accountIds.length === 0) {
      return fail("Select at least one account for the account subset")
    }
    const ownedAccounts = await getAccounts(user.id)
    const ownedIds = new Set(ownedAccounts.map((account) => account.id))
    const unownedId = data.accountIds.find((accountId) => !ownedIds.has(accountId))
    if (unownedId) {
      return fail("One or more selected accounts could not be found")
    }
  }
  if (
    existing.type === "NET_WORTH_SAVINGS_TARGET" &&
    data.measurementBasis === "ACCOUNT_SUBSET" &&
    data.accountIds === undefined &&
    existing.measurementBasis !== "ACCOUNT_SUBSET"
  ) {
    // Switching to ACCOUNT_SUBSET for the first time with no subset supplied
    // at all — same "at least one account" requirement as creation.
    return fail("Select at least one account for the account subset")
  }

  const updated = await db.$transaction(async (tx) => {
    const updateData: Prisma.FinancialGoalUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name

    if (existing.type === "NET_WORTH_SAVINGS_TARGET") {
      if (data.targetAmount !== undefined) updateData.targetAmount = data.targetAmount
      if (data.measurementBasis !== undefined) {
        updateData.measurementBasis = data.measurementBasis
      }

      if (resolvedMeasurementBasis === "ACCOUNT_SUBSET" && data.accountIds !== undefined) {
        await tx.financialGoalAccount.deleteMany({ where: { financialGoalId: data.id } })
        await tx.financialGoalAccount.createMany({
          data: data.accountIds.map((accountId) => ({
            financialGoalId: data.id,
            accountId,
          })),
        })
      } else if (
        resolvedMeasurementBasis === "TOTAL_NET_WORTH" &&
        data.measurementBasis !== undefined
      ) {
        // Switching away from ACCOUNT_SUBSET — the prior subset selection is
        // no longer meaningful, so it's cleared rather than left as orphaned,
        // unreferenced rows.
        await tx.financialGoalAccount.deleteMany({ where: { financialGoalId: data.id } })
      }
    }

    if (existing.type === "SAVINGS_RATE_TARGET") {
      if (data.targetPercent !== undefined) updateData.targetPercent = data.targetPercent
      if (data.targetDate !== undefined) updateData.targetDate = data.targetDate
    }

    return tx.financialGoal.update({ where: { id: data.id }, data: updateData })
  })

  return ok(toFinancialGoal(updated))
}

// ---------------------------------------------------------------------------
// Archive / Unarchive
// ---------------------------------------------------------------------------

/**
 * Archives (soft-deletes) a Financial Goal (AC4). Allowed whether or not the
 * goal has already reached Completed (Edge Cases: "allowed, same as Savings
 * Goals' own precedent") — archiving is a pure visibility action, unrelated
 * to the read-time-computed Completed state. Idempotent: archiving an
 * already-archived goal just confirms the end state rather than erroring,
 * matching `archiveAccount`/`archiveGoal`/`archiveDebt`.
 */
export async function archiveFinancialGoal(
  input: unknown,
): Promise<ApiResult<FinancialGoal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = FinancialGoalIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid financial goal id")
  }
  const { id } = parsed.data

  const existing = await db.financialGoal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Financial goal not found")
  }
  if (existing.archivedAt) {
    return ok(toFinancialGoal(existing))
  }

  const archived = await db.financialGoal.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  return ok(toFinancialGoal(archived))
}

/**
 * Restores an archived Financial Goal (AC4). Returns it to the active list;
 * has no effect on its stored configuration. Idempotent for the same reason
 * as `archiveFinancialGoal`.
 *
 * Deliberately does **not** re-check the Debt Payoff exclusivity guard: per
 * financial-goals.md's Type 1 wording, that rule only prevents a *second*
 * simultaneously-active goal from being *created* against an already-tracked
 * Debt — it says nothing about unarchiving. If a user archived goal A for a
 * Debt and then created goal B for the same Debt (which the guard correctly
 * allowed, since A was archived at that point), unarchiving A back to active
 * alongside B is an unusual but not explicitly forbidden state, and
 * re-litigating it here would silently add a restriction the spec never
 * asked for. This mirrors Bills/Recurring Income's own precedent of not
 * re-validating cross-table exclusivity on an unarchive path.
 */
export async function unarchiveFinancialGoal(
  input: unknown,
): Promise<ApiResult<FinancialGoal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = FinancialGoalIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid financial goal id")
  }
  const { id } = parsed.data

  const existing = await db.financialGoal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Financial goal not found")
  }
  if (!existing.archivedAt) {
    return ok(toFinancialGoal(existing))
  }

  const unarchived = await db.financialGoal.update({
    where: { id },
    data: { archivedAt: null },
  })

  return ok(toFinancialGoal(unarchived))
}
