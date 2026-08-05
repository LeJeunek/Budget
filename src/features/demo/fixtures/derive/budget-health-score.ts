import type { BudgetHealthScore, BudgetMonthView } from "@/features/budgeting/types"

/**
 * Mirrors `features/budgeting/server/service.ts`'s `getBudgetHealthScore`
 * formula exactly (that file lives under `features/budgeting/server/`,
 * blocked by public-demo-technical-design.md §4.1's `no-restricted-imports`
 * rule, hence this reimplementation — flagged per §2.2):
 *   - Category score = (budgeted categories not over allocation ÷ budgeted
 *     categories) × 100.
 *   - Overall score = 100 if Total Spent ≤ Total Allocated; otherwise
 *     `max(0, 100 − (Total Spent ÷ Total Allocated − 1) × 100)`.
 *   - Final score = round(0.6 × Category score + 0.4 × Overall score).
 *   - Label: 70–100 "Good", 40–69 "Fair", 0–39 "Needs attention".
 *
 * Takes an already-built `BudgetMonthView` (`derive/budget-month.ts`'s own
 * output) rather than recomputing it — the same "one shared computation,
 * never two independently-derived copies" discipline every derive module in
 * this fixture set follows. Returns `null` when zero categories have an
 * allocation set for the month, matching the real function's "undefined"
 * state (never a misleading 0 or 100).
 */
export function deriveBudgetHealthScore(budgetMonth: BudgetMonthView): BudgetHealthScore | null {
  const budgetedCategories = budgetMonth.categories.filter((c) => c.allocated !== null)

  if (budgetedCategories.length === 0) {
    return null
  }

  const categoryScore =
    (budgetedCategories.filter((c) => !c.isOverBudget).length / budgetedCategories.length) * 100

  const { totalAllocated, totalSpent } = budgetMonth.totals
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
