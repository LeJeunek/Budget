import { db } from "@/lib/db"
import { getCategories } from "@/features/categories/server/service"
import {
  getSpendingByCategoryForMonth,
  getUncategorizedSpendingForMonth,
} from "@/features/transactions/server/aggregations"

import type {
  BudgetCategoryLine,
  BudgetHealthScore,
  BudgetMonthSummary,
  BudgetMonthTotals,
  BudgetMonthView,
} from "../types"
import { currentMonthStart, isPastMonth, MonthSchema, parseMonthToDate } from "./validation"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Budgeting section: read paths are
// Server Component direct calls) and by `server/actions.ts`. Every exported
// function takes a pre-resolved `userId` from the caller's
// `getCurrentUser()` (see lib/auth.ts) and scopes every Prisma query by it —
// this module never calls `getCurrentUser()` itself and never trusts a
// client-supplied user id, matching `features/dashboard/server/service.ts`
// and `features/accounts/server/service.ts`.

// ---------------------------------------------------------------------------
// Category-line + carry-forward internals
// ---------------------------------------------------------------------------

// Namespaced sentinel prefix for a historical allocation line whose
// `Category` was hard-deleted (`BudgetCategory.categoryId` cascades to
// `null` via `onDelete: SetNull` — see prisma/schema.prisma). Prefixed with
// a colon (never present in a Prisma cuid) so this can never collide with a
// real `Category.id`, the same sentinel-id technique
// `features/dashboard/types.ts`'s `UNCATEGORIZED_CATEGORY_ID` already uses
// for its own "not a real category" case.
const DELETED_CATEGORY_ID_PREFIX = "deleted:"
const DELETED_CATEGORY_NAME = "Deleted category"

/**
 * Builds one `BudgetCategoryLine` from its raw inputs — the single place
 * Allocated/Spent/Remaining/percentUsed/isOverBudget are derived, so
 * `buildBudgetMonthView`'s two call sites (live categories, and preserved
 * deleted-category historical rows below) can never compute this
 * differently.
 *
 * `allocated === null` (AC2's "unset") short-circuits to the AC9 shape:
 * `spent` is still shown, everything else is `null`/`false` since there is
 * no plan to measure against.
 *
 * `allocated === 0` is deliberately *not* treated the same as `null` — a
 * $0 allocation is still a real, set plan (AC2) — so `percentUsed`/
 * `isOverBudget` are still populated. AC7's `spent / allocated` ratio has no
 * finite value at `allocated === 0`; `spent` is never negative (it's a sum
 * of expense magnitudes), so `allocated === 0 && spent === 0` unambiguously
 * means "nothing planned, nothing spent" (0%, matching the "zero
 * transactions all month" edge case), and `allocated === 0 && spent > 0` has
 * no ratio to report — `100` is used as a display floor for "fully used or
 * beyond" there, since `remaining` (negative) and `isOverBudget` already
 * carry the "how far over" signal (AC8), and returning a non-finite value
 * (`Infinity`/`NaN`) would risk breaking a naive percentage formatter
 * downstream.
 */
function buildCategoryLine(params: {
  categoryId: string
  categoryName: string
  isSystem: boolean
  allocated: number | null
  spent: number
}): BudgetCategoryLine {
  const { categoryId, categoryName, isSystem, allocated, spent } = params

  if (allocated === null) {
    return {
      categoryId,
      categoryName,
      isSystem,
      allocated: null,
      spent,
      remaining: null,
      percentUsed: null,
      isOverBudget: false,
    }
  }

  const remaining = allocated - spent
  const isOverBudget = spent > allocated
  const percentUsed =
    allocated === 0 ? (spent > 0 ? 100 : 0) : (spent / allocated) * 100

  return {
    categoryId,
    categoryName,
    isSystem,
    allocated,
    spent,
    remaining,
    percentUsed,
    isOverBudget,
  }
}

/** A single `BudgetCategory` row's raw allocation data, as read off either
 * the target month's own materialized `Budget` or (carry-forward) the
 * nearest prior month's. */
interface AllocationRow {
  id: string
  categoryId: string | null
  amount: number
}

const ALLOCATION_ROW_SELECT = {
  id: true,
  categoryId: true,
  amount: true,
} as const

/**
 * Resolves the allocation rows to use for `monthDate`, implementing AC3/AC4's
 * carry-forward + past-month read-only rules exactly as specified in
 * docs/architecture/api-contracts.md's "Month materialization / carry-forward"
 * note — an explicit read-time rule, not a background job:
 *
 * - A materialized `Budget` row for `monthDate` (past, current, or future):
 *   read its own `BudgetCategory` rows directly.
 * - No row, and `monthDate` is in the past: return nothing — a pure,
 *   non-mutating read. `hasAnyBudgetData: false` is the caller's signal for
 *   the "no budget was set this month" empty state.
 * - No row, and `monthDate` is the current month or a future month: copy the
 *   nearest strictly-prior month's `Budget`'s allocations, **as a read-time
 *   view only** — nothing is written here. Materialization only happens the
 *   moment the user actually edits an allocation, in
 *   `server/actions.ts`'s `setCategoryAllocation`, so a month nobody ever
 *   opens/edits never gets an empty-but-present `Budget` row. If there is no
 *   prior month at all (brand-new user), the month starts fully unallocated.
 */
async function resolveAllocationRows(
  userId: string,
  monthDate: Date,
): Promise<{ rows: AllocationRow[]; hasAnyBudgetData: boolean }> {
  const existingBudget = await db.budget.findUnique({
    where: { userId_month: { userId, month: monthDate } },
    select: { categories: { select: ALLOCATION_ROW_SELECT } },
  })

  if (existingBudget) {
    return {
      rows: existingBudget.categories.map((row) => ({
        ...row,
        amount: row.amount.toNumber(),
      })),
      hasAnyBudgetData: true,
    }
  }

  if (isPastMonth(monthDate)) {
    return { rows: [], hasAnyBudgetData: false }
  }

  const priorBudget = await db.budget.findFirst({
    where: { userId, month: { lt: monthDate } },
    orderBy: { month: "desc" },
    select: { categories: { select: ALLOCATION_ROW_SELECT } },
  })

  const rows = (priorBudget?.categories ?? [])
    // A deleted category's historical row (categoryId: null) is never
    // carried forward — there is nothing to carry (see the module-level
    // note on DELETED_CATEGORY_ID_PREFIX below).
    .filter((row) => row.categoryId !== null)
    .map((row) => ({ ...row, amount: row.amount.toNumber() }))

  return { rows, hasAnyBudgetData: true }
}

/**
 * Core read shared by every public function below (`getBudgetMonth`,
 * `getBudgetHealthScore`, `getBudgetMonthSummary`) — the single place
 * `BudgetMonthView` is assembled, so AC6/AC9/AC10's Allocated/Spent/
 * Remaining/totals rules are implemented exactly once.
 */
async function buildBudgetMonthView(
  userId: string,
  month: string,
): Promise<BudgetMonthView> {
  const parsedMonth = MonthSchema.safeParse(month)
  if (!parsedMonth.success) {
    throw new Error(`Invalid month "${month}" — expected "YYYY-MM"`)
  }

  const monthDate = parseMonthToDate(month)
  const isEditable = !isPastMonth(monthDate)

  const [{ rows: allocationRows, hasAnyBudgetData }, liveCategories, spending, uncategorizedSpent] =
    await Promise.all([
      resolveAllocationRows(userId, monthDate),
      getCategories(userId),
      getSpendingByCategoryForMonth(userId, monthDate),
      getUncategorizedSpendingForMonth(userId, monthDate),
    ])

  const allocationByCategoryId = new Map<string, number>()
  const deletedAllocationRows: { id: string; amount: number }[] = []
  for (const row of allocationRows) {
    if (row.categoryId) {
      allocationByCategoryId.set(row.categoryId, row.amount)
    } else {
      deletedAllocationRows.push({ id: row.id, amount: row.amount })
    }
  }

  const spentByCategoryId = new Map(spending.map((s) => [s.categoryId, s.amount]))

  // AC1: every one of the user's current categories appears, allocated or
  // not — this is the live category list, independent of whether an
  // allocation row exists for it this month.
  const categories: BudgetCategoryLine[] = liveCategories.map((category) =>
    buildCategoryLine({
      categoryId: category.id,
      categoryName: category.name,
      isSystem: category.isSystem,
      allocated: allocationByCategoryId.get(category.id) ?? null,
      spent: spentByCategoryId.get(category.id) ?? 0,
    }),
  )

  // Edge Case ("Category deleted mid-month"): a past month's historical
  // BudgetCategory row for a since-hard-deleted category survives
  // (onDelete: SetNull) and its Allocated amount must keep counting toward
  // that month's totals ("past-month totals don't silently change") even
  // though the category itself — and its name — no longer exist. Spent
  // cannot be re-attributed either: the transactions that funded it lost
  // their own categoryId in the same delete cascade (they now count toward
  // uncategorizedSpent instead), so this line's spent is always 0. Only
  // ever populated for materialized *past* months — current/future months'
  // rows are hard-deleted outright (not left to cascade to null) by
  // `removeCategoryFromCurrentAndFutureBudgets` below, before the Category
  // row itself is ever deleted.
  for (const row of deletedAllocationRows) {
    categories.push(
      buildCategoryLine({
        categoryId: `${DELETED_CATEGORY_ID_PREFIX}${row.id}`,
        categoryName: DELETED_CATEGORY_NAME,
        isSystem: false,
        allocated: row.amount,
        spent: 0,
      }),
    )
  }

  // AC10: totals only ever sum categories with an allocation *set* —
  // unbudgeted categories' spend (still visible per-line above) and
  // uncategorizedSpent are deliberately excluded.
  const totals = categories.reduce<BudgetMonthTotals>(
    (acc, line) => {
      if (line.allocated === null) {
        return acc
      }
      return {
        totalAllocated: acc.totalAllocated + line.allocated,
        totalSpent: acc.totalSpent + line.spent,
        totalRemaining: acc.totalRemaining + (line.remaining ?? 0),
      }
    },
    { totalAllocated: 0, totalSpent: 0, totalRemaining: 0 },
  )

  return {
    month,
    isEditable,
    hasAnyBudgetData,
    categories,
    totals,
    uncategorizedSpent,
  }
}

// ---------------------------------------------------------------------------
// Public service functions (docs/architecture/api-contracts.md — Budgeting)
// ---------------------------------------------------------------------------

/**
 * A month's full budget planner view — AC1/AC2/AC6/AC9/AC10, plus AC3/AC4's
 * carry-forward and past-month read-only rules (see `resolveAllocationRows`
 * and `buildBudgetMonthView` above for the full implementation notes).
 */
export async function getBudgetMonth(
  userId: string,
  month: string,
): Promise<BudgetMonthView> {
  return buildBudgetMonthView(userId, month)
}

/**
 * Budget Health Score — AC12's exact formula:
 *   - Category score = (budgeted categories not over allocation ÷ budgeted
 *     categories) × 100.
 *   - Overall score = 100 if Total Spent ≤ Total Allocated; otherwise
 *     `max(0, 100 − (Total Spent ÷ Total Allocated − 1) × 100)`.
 *   - Final score = round(0.6 × Category score + 0.4 × Overall score).
 *   - Label: 70–100 "Good", 40–69 "Fair", 0–39 "Needs attention".
 *
 * Returns `null` — the "undefined" state AC12 requires — when zero
 * categories have an allocation set for the month, so the Dashboard shows
 * its "no budget set" placeholder instead of a misleading 0 or 100.
 *
 * `totalAllocated === 0` is a real, reachable state distinct from "zero
 * categories budgeted" (e.g. exactly one category deliberately allocated
 * $0) — Total Spent ÷ 0 has no finite ratio, so that case is handled
 * explicitly: 100 if nothing was spent either (perfectly on a $0 plan), 0
 * otherwise (any spend at all against a $0 total plan is "as over as it
 * gets"), consistent with the formula's own floor-at-0 intent.
 */
export async function getBudgetHealthScore(
  userId: string,
  month: string,
): Promise<BudgetHealthScore | null> {
  const view = await buildBudgetMonthView(userId, month)
  const budgetedCategories = view.categories.filter((c) => c.allocated !== null)

  if (budgetedCategories.length === 0) {
    return null
  }

  const categoryScore =
    (budgetedCategories.filter((c) => !c.isOverBudget).length /
      budgetedCategories.length) *
    100

  const { totalAllocated, totalSpent } = view.totals
  let overallScore: number
  if (totalAllocated === 0) {
    overallScore = totalSpent <= 0 ? 100 : 0
  } else if (totalSpent <= totalAllocated) {
    overallScore = 100
  } else {
    overallScore = Math.max(0, 100 - (totalSpent / totalAllocated - 1) * 100)
  }

  const score = Math.round(0.6 * categoryScore + 0.4 * overallScore)
  const label = score >= 70 ? "Good" : score >= 40 ? "Fair" : "Needs attention"

  return { score, label }
}

/**
 * Lighter read for Dashboard's "Remaining Budget" stat card (AC11) — just
 * the month's totals, without the full per-category breakdown
 * `BudgetMonthView` carries. Returns `null` under the same "zero
 * allocations set this month" condition `getBudgetHealthScore` does, which
 * is exactly AC11's placeholder-state signal.
 *
 * Implemented on top of `buildBudgetMonthView` rather than a separate
 * lighter-weight query: correctness (one implementation of "what counts as
 * budgeted, and what the totals are") is prioritized over the extra query
 * cost here, consistent with this module having no stated performance
 * budget in docs/architecture — see the Backend Engineer's report for the
 * explicit call-out that Dashboard invoking both this and
 * `getBudgetHealthScore` on the same page load means this logic runs twice
 * per request.
 */
export async function getBudgetMonthSummary(
  userId: string,
  month: string,
): Promise<BudgetMonthSummary | null> {
  const view = await buildBudgetMonthView(userId, month)
  const hasAnyAllocation = view.categories.some((c) => c.allocated !== null)

  if (!hasAnyAllocation) {
    return null
  }

  return { ...view.totals }
}

/** One category that is currently over its allocation for a given month —
 * the trigger data source for `features/notifications`' `BUDGET_OVER` type
 * (docs/architecture/api-contracts.md's Notifications section: "Calls
 * `budgeting.service.getOverBudgetCategories(userId, currentMonth)`").
 *
 * `budgetCategoryId` is the real `BudgetCategory` row id — deliberately not
 * part of `BudgetCategoryLine` (that read model is a client-safe view for
 * the planner UI, and never exposes internal row ids). Notifications needs
 * this specific id because `Notification.budgetCategoryId`'s dedup
 * constraint (`@@unique([budgetCategoryId, type])`, prisma/schema.prisma) is
 * keyed off it, not off `Category.id`.
 */
export interface OverBudgetCategory {
  budgetCategoryId: string
  categoryId: string
  categoryName: string
}

/**
 * Currently over-allocation categories for `month` (spent > allocated),
 * scoped to categories whose `BudgetCategory` row is **already materialized**
 * for that month — i.e. a real `Budget` row exists (see
 * `resolveAllocationRows` above for the materialized-vs-carry-forward
 * distinction).
 *
 * This is a deliberate, narrower scope than `getBudgetMonth`'s own
 * `isOverBudget` flag, which also reports categories that are over budget
 * only via the read-time carry-forward view (no `Budget` row persisted yet
 * for `month`). A carry-forward-only category has no persisted
 * `BudgetCategory.id` to hand back — there is nothing yet for a Notification
 * row to stably reference — and this module's own carry-forward design is
 * explicit that materialization must only ever happen as a side effect of an
 * edit (`server/actions.ts`'s `setCategoryAllocation`), never of a read (see
 * `resolveAllocationRows`'s JSDoc); this function is a read and must not
 * violate that rule itself.
 *
 * Practical consequence, flagged for the Solution Architect/Product Owner
 * rather than silently decided: a category that only ever goes over budget
 * via carry-forward (the user never touches that month's budget planner at
 * all this month) will not surface a BUDGET_OVER notification until the
 * month is materialized by some edit — even an edit to a *different*
 * category, since `setCategoryAllocation` materializes the full
 * carried-forward row set for the month, not just the row being edited. This
 * is the smallest change that satisfies the Notification schema's dedup
 * constraint without altering Budgeting's existing "materialize on edit
 * only" invariant; revisit if this delay proves unacceptable in practice.
 */
export async function getOverBudgetCategories(
  userId: string,
  month: string,
): Promise<OverBudgetCategory[]> {
  const parsedMonth = MonthSchema.safeParse(month)
  if (!parsedMonth.success) {
    throw new Error(`Invalid month "${month}" — expected "YYYY-MM"`)
  }
  const monthDate = parseMonthToDate(month)

  const budget = await db.budget.findUnique({
    where: { userId_month: { userId, month: monthDate } },
    select: {
      categories: {
        where: { categoryId: { not: null } },
        select: {
          id: true,
          categoryId: true,
          amount: true,
          category: { select: { name: true } },
        },
      },
    },
  })

  if (!budget) {
    return []
  }

  const spending = await getSpendingByCategoryForMonth(userId, monthDate)
  const spentByCategoryId = new Map(spending.map((s) => [s.categoryId, s.amount]))

  const overBudget: OverBudgetCategory[] = []
  for (const row of budget.categories) {
    if (!row.categoryId || !row.category) {
      // Defensive only: filtered out at the query level above already; a
      // deleted category's row (onDelete: SetNull) would only ever reach
      // here in a narrow concurrent-delete race, and is simply skipped
      // rather than surfaced as a notification trigger.
      continue
    }

    const spent = spentByCategoryId.get(row.categoryId) ?? 0
    const allocated = row.amount.toNumber()

    // Same over-budget rule as `buildCategoryLine` above (`spent > allocated`)
    // — re-stated as a single comparison rather than imported, since
    // `buildCategoryLine` returns a full `BudgetCategoryLine` that discards
    // the row id this function exists specifically to preserve.
    if (spent > allocated) {
      overBudget.push({
        budgetCategoryId: row.id,
        categoryId: row.categoryId,
        categoryName: row.category.name,
      })
    }
  }

  return overBudget
}

/**
 * Removes a deleted category's allocation from the *current and future*
 * months only — past months' historical `BudgetCategory` rows are left
 * untouched (they instead cascade to `categoryId: null` at the DB level via
 * `onDelete: SetNull` once the `Category` row itself is deleted, and are
 * rendered as the "Deleted category" historical line above).
 *
 * Per docs/architecture/api-contracts.md's Categories section ("Phase 2
 * update"): `features/categories/server/actions.ts`'s `deleteCategory`
 * calls this explicit cross-domain export *before* hard-deleting the
 * `Category` row, rather than Categories reaching into Budgeting's tables
 * directly (module boundary rule). Hard-deleting these rows outright
 * (instead of leaving them for the FK cascade) is deliberate: an
 * unmaterialized future month must not gain a lingering
 * categoryId-will-become-null row it never actually had, and a materialized
 * current/future month's total must drop the removed category's allocation
 * immediately, matching the Edge Case's "its allocation for the current and
 * future months is removed along with it."
 *
 * NOTE for the calling team: `features/categories/server/actions.ts`'s
 * `deleteCategory` has not been updated to call this yet — that file is
 * outside this task's assigned scope (`src/features/budgeting/` only,
 * per the Backend Engineer's task brief). See the final report.
 */
export async function removeCategoryFromCurrentAndFutureBudgets(
  userId: string,
  categoryId: string,
): Promise<void> {
  const monthFloor = currentMonthStart()

  await db.budgetCategory.deleteMany({
    where: {
      userId,
      categoryId,
      budget: { month: { gte: monthFloor } },
    },
  })
}
