// Budgeting: an active Budget + BudgetCategory allocation set for the last
// three months (May, June, July 2026 — the same allocations carried forward
// each month, matching budgeting.md AC4's real carry-forward behavior, even
// though this static script simply writes each month's row directly rather
// than exercising the live carry-forward code path).
//
// Deliberately NOT a uniformly-under or uniformly-over budget (per the
// task's "realistic Budget Health Score mix" ask): every category comfortably
// clears its allocation in May; expense-transactions.ts's June Shopping and
// July Entertainment overrides each push exactly one category over its
// allocation in one of the other two months — a believable "mostly on
// track, one thing ran hot this month" pattern rather than either extreme.
import { prisma } from "./client"
import { MONTHS, utcDate } from "./config"

const ALLOCATIONS: Record<string, number> = {
  Housing: 1450.0,
  Utilities: 280.0,
  Transportation: 160.0,
  Food: 250.0,
  Entertainment: 70.0, // exceeded in July by expense-transactions.ts's concert-ticket override
  Shopping: 150.0, // exceeded in June by expense-transactions.ts's Best Buy override
  Healthcare: 75.0,
  Insurance: 110.0,
  Investments: 200.0,
  Savings: 300.0,
  Misc: 230.0,
}

const BUDGETED_MONTH_INDEXES = [3, 4, 5] // May, June, July — the last 3 of MONTHS

export async function createBudgets(userId: string, categoryMap: Record<string, string>): Promise<void> {
  for (const monthArrayIndex of BUDGETED_MONTH_INDEXES) {
    const month = MONTHS[monthArrayIndex]
    const monthDate = utcDate(month.year, month.monthIndex, 1)

    const budget = await prisma.budget.create({
      data: {
        userId,
        month: monthDate,
        createdAt: monthDate,
      },
    })

    await prisma.budgetCategory.createMany({
      data: Object.entries(ALLOCATIONS).map(([categoryName, amount]) => ({
        budgetId: budget.id,
        userId,
        categoryId: categoryMap[categoryName],
        amount,
        createdAt: monthDate,
      })),
    })
  }

  console.log(`  Budget: ${BUDGETED_MONTH_INDEXES.length} months x ${Object.keys(ALLOCATIONS).length} category allocations.`)
}
