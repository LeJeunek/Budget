import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import { getBudgetMonth } from "@/features/budgeting/server/service"
import {
  UNCATEGORIZED_CATEGORY_ID,
  UNCATEGORIZED_CATEGORY_NAME,
} from "@/features/dashboard/types"

import type { BudgetVsActualMonth, ReportingPeriodRange } from "../types"
import { enumerateMonthKeys } from "./period"

// Kept in its own file, per docs/architecture/Architecture.md's "Analytics
// module structure" section: unlike every other Pass 1 metric (which reads
// only Transaction/Category directly), this one is a cross-domain read into
// `features/budgeting/server/service.ts` — isolating the one Pass-1 metric
// with an outbound cross-domain dependency keeps the module graph easy to
// audit (nothing else in `spending-trends.ts`/`expense-breakdown.ts`/
// `spending-heatmap.ts` imports another feature's server code).

/** The "All Time" floor for `getBudgetVsActual` — the earliest month with
 * any transaction activity at all (not expense-only, unlike
 * `spending-trends.ts`'s equivalent helper: Budget vs. Actual's per-month
 * table is meaningful even for a month with only income transactions,
 * since a budgeted category with $0 actual spend is still a real, useful
 * row). Returns `null` when the user has no transaction history yet. */
async function resolveEarliestActivityDate(userId: string): Promise<Date | null> {
  const result = await db.transaction.aggregate({
    where: { userId, ...EXCLUDE_SPLIT_PARENTS },
    _min: { date: true },
  })
  return result._min.date ?? null
}

/**
 * Budget vs. Actual (analytics.md AC9): for each month in the selected
 * period, each category's allocated amount against its actual spend —
 * Budgeting's own one-month-at-a-time planner view (`getBudgetMonth`),
 * called once per month and reshaped into a multi-month table, per
 * api-contracts.md's Phase 3b Budgeting note ("the same bounded-loop shape
 * `dashboard.service.getMonthlyTrends` already uses... past months' lazy
 * materialization... makes this safe to call repeatedly with no side
 * effects").
 *
 * Deliberately reuses `getBudgetMonth` rather than re-deriving
 * allocated/spent independently: Budgeting already owns the full carry-
 * forward, past-month-read-only, and deleted-category-history rules (AC3/
 * AC4 and the "category deleted mid-month" edge case) — duplicating that
 * logic here would risk this metric silently disagreeing with the
 * Budgeting page's own numbers for the same month, which analytics.md's
 * Success Metrics explicitly calls out as a zero-tolerance failure mode.
 *
 * `uncategorizedSpent` (excluded from `getBudgetMonth`'s own `categories`
 * array, since Uncategorized is never a real, budgetable category) is
 * appended as its own line here with `allocated: null` — Budget vs. Actual's
 * whole purpose is showing *actual* spend per category across months, and
 * silently dropping uncategorized spend would make a month's total actual
 * spend look smaller than it really was, contradicting analytics.md's Edge
 * Cases ("shown under the same Uncategorized treatment... rather than
 * silently dropping those...months' data").
 */
export async function getBudgetVsActual(
  userId: string,
  period: ReportingPeriodRange,
): Promise<BudgetVsActualMonth[]> {
  const start = period.start ?? (await resolveEarliestActivityDate(userId))
  if (!start) {
    return []
  }

  const monthKeys = enumerateMonthKeys(start, period.end)

  return Promise.all(
    monthKeys.map(async (monthKey) => {
      const view = await getBudgetMonth(userId, monthKey)

      const categories: BudgetVsActualMonth["categories"] = view.categories.map((line) => ({
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        allocated: line.allocated,
        actual: line.spent,
      }))

      if (view.uncategorizedSpent !== 0) {
        categories.push({
          categoryId: UNCATEGORIZED_CATEGORY_ID,
          categoryName: UNCATEGORIZED_CATEGORY_NAME,
          allocated: null,
          actual: view.uncategorizedSpent,
        })
      }

      return { month: monthKey, categories }
    }),
  )
}
