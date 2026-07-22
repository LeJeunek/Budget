import { describe, expect, it, vi } from "vitest"

// `budget-comparison.ts` imports `EXCLUDE_SPLIT_PARENTS` from
// `features/transactions/server/service.ts`, which transitively imports
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process — it is
// never exercised by anything in this file, since every test below only
// calls `reshapeBudgetMonthView`, a pure, database-free function. Test-only
// isolation of an unrelated side-effecting dependency, not a change to
// production behavior.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { reshapeBudgetMonthView } from "./budget-comparison"
import type { BudgetMonthView } from "@/features/budgeting/types"
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "@/features/dashboard/types"

// `reshapeBudgetMonthView` is the calculation-only portion of Budget vs.
// Actual (analytics.md AC9) that is a pure function of
// an already-fetched `BudgetMonthView`, per the "extract the pure
// calculation, unit-test it without a database" precedent established by
// `features/investments/server/service.test.ts` and
// `features/dashboard/server/net-worth-history.test.ts`. `getBudgetVsActual`
// itself always calls `getBudgetMonth` (a database read owned by the
// Budgeting domain) and is out of scope for these unit tests. Covers
// docs/product/analytics.md's Definition of Done: "Budget vs. Actual ... [is]
// covered by tests verifying correct aggregation across month/year
// boundaries."

/** Builds a minimal fixture `BudgetMonthView` — every test below only cares
 * about `categories`/`uncategorizedSpent` (`reshapeBudgetMonthView`'s own
 * inputs), so `isEditable`/`hasAnyBudgetData`/`totals` are fixed at
 * valid-but-unused defaults. */
function buildView(overrides: {
  categories?: BudgetMonthView["categories"]
  uncategorizedSpent?: number
}): BudgetMonthView {
  return {
    month: "2026-03",
    isEditable: true,
    hasAnyBudgetData: true,
    categories: overrides.categories ?? [],
    totals: { totalAllocated: 0, totalSpent: 0, totalRemaining: 0 },
    uncategorizedSpent: overrides.uncategorizedSpent ?? 0,
  }
}

describe("reshapeBudgetMonthView", () => {
  it("echoes the requested monthKey onto the result", () => {
    const result = reshapeBudgetMonthView("2026-03", buildView({}))
    expect(result.month).toBe("2026-03")
  })

  it("maps each BudgetCategoryLine into a BudgetVsActualCategoryLine (allocated/actual renamed from allocated/spent)", () => {
    const view = buildView({
      categories: [
        {
          categoryId: "cat-groceries",
          categoryName: "Groceries",
          isSystem: false,
          allocated: 500,
          spent: 350,
          remaining: 150,
          percentUsed: 70,
          isOverBudget: false,
        },
      ],
    })

    const result = reshapeBudgetMonthView("2026-03", view)

    expect(result.categories).toEqual([
      { categoryId: "cat-groceries", categoryName: "Groceries", allocated: 500, actual: 350 },
    ])
  })

  it("preserves a null allocated (unset this month), never conflating it with an intentional $0", () => {
    const view = buildView({
      categories: [
        {
          categoryId: "cat-dining",
          categoryName: "Dining",
          isSystem: false,
          allocated: null,
          spent: 120,
          remaining: null,
          percentUsed: null,
          isOverBudget: false,
        },
      ],
    })

    const result = reshapeBudgetMonthView("2026-03", view)
    expect(result.categories[0].allocated).toBeNull()
    expect(result.categories[0].actual).toBe(120)
  })

  it("appends an Uncategorized line with allocated: null when uncategorizedSpent is nonzero", () => {
    const result = reshapeBudgetMonthView("2026-03", buildView({ uncategorizedSpent: 75 }))

    expect(result.categories).toEqual([
      {
        categoryId: UNCATEGORIZED_CATEGORY_ID,
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        allocated: null,
        actual: 75,
      },
    ])
  })

  it("does NOT append an Uncategorized line when uncategorizedSpent is exactly 0", () => {
    const result = reshapeBudgetMonthView("2026-03", buildView({ uncategorizedSpent: 0 }))
    expect(result.categories).toEqual([])
  })

  it("appends the Uncategorized line after real category lines, preserving their order", () => {
    const view = buildView({
      categories: [
        {
          categoryId: "cat-groceries",
          categoryName: "Groceries",
          isSystem: false,
          allocated: 500,
          spent: 350,
          remaining: 150,
          percentUsed: 70,
          isOverBudget: false,
        },
      ],
      uncategorizedSpent: 25,
    })

    const result = reshapeBudgetMonthView("2026-03", view)

    expect(result.categories.map((c) => c.categoryId)).toEqual([
      "cat-groceries",
      UNCATEGORIZED_CATEGORY_ID,
    ])
  })

  it("returns an empty categories array for a month with no budget data and no uncategorized spend", () => {
    const result = reshapeBudgetMonthView("2026-03", buildView({}))
    expect(result.categories).toEqual([])
  })
})
