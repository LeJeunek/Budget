"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import type { BudgetCategoryLine } from "../types"
import { getBudgetMonth } from "./service"
import { SetAllocationSchema, isPastMonth, parseMonthToDate } from "./validation"

/**
 * Mutating Server Actions for the Budgeting module. Per
 * docs/architecture/api-contracts.md's Budgeting section, `setCategoryAllocation`
 * is the module's only mutation — every read (`getBudgetMonth`,
 * `getBudgetHealthScore`, `getBudgetMonthSummary`) is a direct Server
 * Component call to `server/service.ts`.
 *
 * Follows folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — the client-supplied
 *      `categoryId` is never trusted on its own; it's looked up as
 *      `{ id, userId: user.id }` before use, same as
 *      features/accounts/server/actions.ts's convention.
 */

/**
 * Creates-or-updates a category's allocation for a month (AC2's "set to
 * zero" vs. "unset" distinction: every call here creates-or-updates a real
 * `BudgetCategory` row, which is exactly how "set to zero" becomes
 * observably different from "no row" / unset).
 *
 * Rejects a past month outright (AC3 — read-only history) before touching
 * the database.
 *
 * If this is the first edit to `month` (no `Budget` row exists yet), this
 * action materializes one — and, per AC4 ("the previous month's
 * allocations, carried forward automatically as an editable starting
 * point"), snapshots *every other* category's carried-forward allocation
 * from the nearest prior month at that same moment, not just the one
 * category being edited. This is the only place a `Budget`/`BudgetCategory`
 * row is ever written for carry-forward purposes — `service.ts`'s
 * `getBudgetMonth` computes the identical carried-forward view for reads
 * without writing anything, so a month nobody ever edits never accumulates
 * an empty-but-present `Budget` row (see `service.ts`'s
 * `resolveAllocationRows` for the read-side half of this rule).
 */
export async function setCategoryAllocation(
  input: unknown,
): Promise<ApiResult<BudgetCategoryLine>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = SetAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid allocation data")
  }
  const { month, categoryId, amount } = parsed.data
  const monthDate = parseMonthToDate(month)

  if (isPastMonth(monthDate)) {
    return fail("Past months are read-only and cannot be edited")
  }

  const category = await db.category.findFirst({
    where: { id: categoryId, userId: user.id },
  })
  if (!category) {
    return fail("Category not found")
  }

  await db.$transaction(async (tx) => {
    let budget = await tx.budget.findUnique({
      where: { userId_month: { userId: user.id, month: monthDate } },
    })

    if (!budget) {
      budget = await tx.budget.create({
        data: { userId: user.id, month: monthDate },
      })

      const priorBudget = await tx.budget.findFirst({
        where: { userId: user.id, month: { lt: monthDate } },
        orderBy: { month: "desc" },
        select: {
          categories: { select: { categoryId: true, amount: true } },
        },
      })

      const carryForwardRows = (priorBudget?.categories ?? [])
        .filter((row) => row.categoryId !== null)
        .map((row) => ({ categoryId: row.categoryId as string, amount: row.amount }))

      if (carryForwardRows.length > 0) {
        await tx.budgetCategory.createMany({
          data: carryForwardRows.map((row) => ({
            budgetId: budget!.id,
            userId: user.id,
            categoryId: row.categoryId,
            amount: row.amount,
          })),
        })
      }
    }

    // Upsert (not a plain update) so this same code path handles both "first
    // allocation ever for this category+month" and "editing an existing
    // one" — Edge Cases: "Editing an allocation partway through the month,
    // after spend has already occurred: allowed at any time." Also
    // overwrites any row `createMany` above just carried forward for this
    // specific category, which is correct: the value being set now wins.
    await tx.budgetCategory.upsert({
      where: { budgetId_categoryId: { budgetId: budget.id, categoryId } },
      create: { budgetId: budget.id, userId: user.id, categoryId, amount },
      update: { amount },
    })
  })

  // Re-read via the same view getBudgetMonth builds, rather than hand-
  // assembling the response here, so Spent/Remaining/percentUsed on the
  // returned line are computed identically to every other read path (single
  // source of truth — see service.ts's buildCategoryLine).
  const view = await getBudgetMonth(user.id, month)
  const line = view.categories.find((c) => c.categoryId === categoryId)

  if (!line) {
    // Defensive only: `categoryId` was just validated to belong to this
    // user and was just written via the upsert above, so this should be
    // unreachable in practice — guards against silently returning a
    // mismatched ApiResult instead of a clear error if it ever happens.
    return fail("Allocation saved but could not be read back")
  }

  return ok(line)
}
