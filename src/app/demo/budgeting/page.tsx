import { BudgetSummaryCards } from "@/features/budgeting/components/budget-summary-cards"
import { BudgetHealthScoreBadge } from "@/features/budgeting/components/budget-health-score-badge"
import { DemoBudgetCategoryRow } from "@/features/demo/components/budgeting/demo-budget-category-row"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { relativeMonthStart } from "@/features/demo/fixtures/relative-date"
import { deriveBudgetMonth } from "@/features/demo/fixtures/derive/budget-month"
import { deriveBudgetHealthScore } from "@/features/demo/fixtures/derive/budget-health-score"
import { Card, CardContent } from "@/components/ui/card"

const FALLBACK_CATEGORY_COLOR = "#94a3b8"

/**
 * `/demo/budgeting` — the demo equivalent of `app/(dashboard)/budgeting/
 * page.tsx`, per docs/architecture/public-demo-technical-design.md §3.2's
 * Budgeting row.
 *
 * Always shows the current, in-progress month — the real page's `?month=`
 * navigation (`BudgetMonthNav`) is omitted rather than reused: the fixture
 * household's `budgetAllocations` (`features/demo/fixtures/budget.ts`) are a
 * single, un-dated `{ categoryId, amount }` list representing "this month's
 * plan," not a per-month history, so there is no second month's allocation
 * data for a "previous month" view to show correctly. `deriveBudgetMonth`
 * still computes real `spent` figures from `transactions.ts` for the current
 * month (never a second, independently-typed number), matching Capability 2
 * AC3's "shared computation, not independently authored" guarantee.
 *
 * `DemoBudgetCategoryRow` replaces the real `BudgetCategoryRow` (that file
 * imports `setCategoryAllocation` from `@/features/budgeting/server/actions`
 * in the same file as its display markup, per design doc §3.3) — Allocated
 * always renders as read-only text, never an editable input. The Budget
 * Advisor card (AI-generated) is omitted per §3.5.
 */
export default function DemoBudgetingPage() {
  const household = getDemoHousehold()
  const { transactions, categories, budgetAllocations, now } = household

  const currentMonthStart = relativeMonthStart(0, now)

  const budgetMonth = deriveBudgetMonth({
    transactions,
    allocations: budgetAllocations,
    categories,
    targetMonth: currentMonthStart,
    now,
  })
  const budgetHealthScore = deriveBudgetHealthScore(budgetMonth)

  const colorByCategoryId = new Map(
    categories.map((category) => [category.id, category.color]),
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Budgeting
        </h1>
        <p className="text-sm text-muted-foreground">
          This month&apos;s plan, allocated/spent/remaining, and the budget
          health score.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BudgetSummaryCards
          totals={budgetMonth.totals}
          uncategorizedSpent={budgetMonth.uncategorizedSpent}
          currency="USD"
        />
        <BudgetHealthScoreBadge score={budgetHealthScore} />
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col">
            {budgetMonth.categories.map((line) => (
              <DemoBudgetCategoryRow
                key={line.categoryId}
                line={line}
                color={colorByCategoryId.get(line.categoryId) ?? FALLBACK_CATEGORY_COLOR}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
