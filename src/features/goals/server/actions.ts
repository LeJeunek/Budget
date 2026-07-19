"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"
import type { Goal, GoalContribution } from "@/features/goals/types"
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  GoalIdSchema,
  AddContributionSchema,
  ContributionIdSchema,
} from "@/features/goals/server/validation"
import { toGoal, toGoalContribution } from "@/features/goals/server/service"

/**
 * Mutating Server Actions for the Goals module. Per
 * docs/architecture/api-contracts.md's Savings Goals section and
 * docs/product/savings-goals.md's AC1/AC4/AC5/AC6: create, update,
 * archive/unarchive, and contribution add/delete.
 *
 * There is intentionally NO hard-delete-goal action — AC6 (resolved, CTO
 * 2026-07-19) is archive-only, matching Accounts and Bills. `archiveGoal` is
 * that action's real implementation.
 *
 * Every action below, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — a goalId/contributionId
 *      supplied by the client is never trusted on its own; every lookup
 *      filters by `{ id, userId: user.id }` so one user can never read or
 *      mutate another user's goal or contribution (folder-tree.md's risk
 *      register item #4).
 *   3. Converts the Prisma row to its client-safe shape (`toGoal`/
 *      `toGoalContribution`) before returning it — Decimal fields aren't
 *      safely serializable as-is.
 *
 * None of `createGoal`/`updateGoal`/`archiveGoal`/`unarchiveGoal` return the
 * derived `GoalWithProgress` shape (only the bare `Goal`), matching
 * api-contracts.md's declared `ApiResult<Goal>` output for each — a caller
 * that needs the recomputed progress after a mutation (e.g. after adding a
 * contribution) re-fetches via `service.getGoals`/`getGoalById` or this
 * module's hook, rather than this file duplicating that computation.
 */

/**
 * Creates a new savings goal for the current user (AC1). No duplicate-name
 * check — like Accounts (and unlike Categories), the spec has no uniqueness
 * rule for goal names (e.g. two goals both named "Vacation" is a legitimate
 * scenario).
 */
export async function createGoal(input: unknown): Promise<ApiResult<Goal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = CreateGoalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal data")
  }
  const { name, targetAmount, targetDate, plannedMonthlyContribution } =
    parsed.data

  const goal = await db.goal.create({
    data: {
      userId: user.id,
      name,
      targetAmount,
      targetDate: targetDate ?? null,
      plannedMonthlyContribution: plannedMonthlyContribution ?? null,
    },
  })

  return ok(toGoal(goal))
}

/**
 * Updates one or more fields on an existing goal — name, target amount,
 * target date, planned monthly contribution (AC4). Only fields actually
 * present in the parsed input are written, so a caller patching just one
 * field (e.g. renaming) can't accidentally clear the others; `targetDate`/
 * `plannedMonthlyContribution` accept an explicit `null` to clear a
 * previously-set value (see `UpdateGoalSchema`'s JSDoc).
 *
 * Per AC4, this never touches progress: `currentProgress` is derived
 * entirely from `GoalContribution` rows (see server/service.ts), which this
 * action never writes to. Changing `targetAmount` here is exactly what
 * naturally flips `isCompleted` Active<->Completed on the *next read* (the
 * "editing the target amount downward/upward on a Completed goal" edge
 * cases) — no extra logic is needed in this action to make that happen,
 * since `isCompleted` is never a stored column.
 */
export async function updateGoal(input: unknown): Promise<ApiResult<Goal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateGoalSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal data")
  }
  const { id, name, targetAmount, targetDate, plannedMonthlyContribution } =
    parsed.data

  const existing = await db.goal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Goal not found")
  }

  const updated = await db.goal.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(targetAmount !== undefined ? { targetAmount } : {}),
      ...(targetDate !== undefined ? { targetDate } : {}),
      ...(plannedMonthlyContribution !== undefined
        ? { plannedMonthlyContribution }
        : {}),
    },
  })

  return ok(toGoal(updated))
}

/**
 * Archives (soft-deletes) a goal — AC6. Removes it from the default active
 * goals list without deleting its contribution history or affecting its
 * completion status (both remain fully computable from `GoalContribution`
 * regardless of `archivedAt`). Works whether or not the goal has already
 * been Completed, per AC6's "whether or not it has been Completed."
 *
 * Idempotent by design, matching `archiveAccount`: archiving an
 * already-archived goal just confirms the end state rather than erroring.
 */
export async function archiveGoal(input: unknown): Promise<ApiResult<Goal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = GoalIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal id")
  }
  const { id } = parsed.data

  const existing = await db.goal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Goal not found")
  }

  if (existing.archivedAt) {
    return ok(toGoal(existing))
  }

  const archived = await db.goal.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  return ok(toGoal(archived))
}

/**
 * Restores an archived goal — AC6. Returns it to the active list; has no
 * effect on contribution history or completion status.
 *
 * Idempotent for the same reason as `archiveGoal`.
 */
export async function unarchiveGoal(
  input: unknown,
): Promise<ApiResult<Goal>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = GoalIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal id")
  }
  const { id } = parsed.data

  const existing = await db.goal.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Goal not found")
  }

  if (!existing.archivedAt) {
    return ok(toGoal(existing))
  }

  const unarchived = await db.goal.update({
    where: { id },
    data: { archivedAt: null },
  })

  return ok(toGoal(unarchived))
}

/**
 * Logs a contribution against a goal (AC3) — the only mechanism by which a
 * goal's current progress increases (resolved, CTO 2026-07-19: no Account
 * linkage). `goalId` is verified to belong to the current user before the
 * contribution is created, so one user can never log a contribution against
 * another user's goal by guessing/supplying its id.
 *
 * No overshoot cap: per the "contribution that overshoots the target"
 * edge case, an amount that pushes `currentProgress` past `targetAmount` is
 * accepted as-is (`AddContributionSchema` only requires `amount > 0`) — the
 * resulting overage is surfaced by `service.ts`'s `overageAmount` on the
 * next read, not capped or rejected here.
 */
export async function addContribution(
  input: unknown,
): Promise<ApiResult<GoalContribution>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = AddContributionSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid contribution data")
  }
  const { goalId, amount, date } = parsed.data

  const goal = await db.goal.findFirst({
    where: { id: goalId, userId: user.id },
    select: { id: true },
  })
  if (!goal) {
    return fail("Goal not found")
  }

  const contribution = await db.goalContribution.create({
    data: {
      goalId,
      userId: user.id,
      amount,
      date,
    },
  })

  return ok(toGoalContribution(contribution))
}

/**
 * Deletes a contribution logged in error (AC5). Progress recalculates for
 * free on the next read of the owning goal, since `currentProgress` is
 * always derived from whatever `GoalContribution` rows currently exist —
 * deleting a goal's only contribution correctly returns it to 0% (the
 * "deleting a goal's only contribution" edge case) with no special-casing
 * needed here.
 */
export async function deleteContribution(
  input: unknown,
): Promise<ApiResult<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = ContributionIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid contribution id")
  }
  const { id } = parsed.data

  const existing = await db.goalContribution.findFirst({
    where: { id, userId: user.id },
  })
  if (!existing) {
    return fail("Contribution not found")
  }

  await db.goalContribution.delete({ where: { id } })

  return ok({ id })
}
