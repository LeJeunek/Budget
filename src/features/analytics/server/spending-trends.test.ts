import { describe, expect, it, vi } from "vitest"

// `spending-trends.ts` imports `EXCLUDE_SPLIT_PARENTS` from
// `features/transactions/server/service.ts`, which transitively imports
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process — it is
// never exercised by anything in this file, since every test below only
// calls the two pure, database-free functions this file targets. Test-only
// isolation of an unrelated side-effecting dependency, not a change to
// production behavior (nothing here touches `lib/uploadthing.ts` itself).
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { buildCategoryTrends, buildYearlySpendingPoints } from "./spending-trends"
import type { CategoryTrendTransaction } from "./spending-trends"
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "@/features/dashboard/types"

// `buildYearlySpendingPoints` and `buildCategoryTrends` are the two
// calculation-only portions of Yearly Spending (analytics.md AC6) and
// Category Trends (AC7) that are pure functions of plain fixture data, per
// the "extract the pure calculation, unit-test it without a database"
// precedent already established by
// `features/investments/server/service.test.ts` and
// `features/dashboard/server/net-worth-history.test.ts`. `getYearlySpending`/
// `getCategoryTrends` themselves always query the database and are out of
// scope for these unit tests. Covers docs/product/analytics.md's Definition
// of Done: "Yearly Spending [and] Category Trends ... are ... covered by
// tests verifying correct aggregation across month/year boundaries."

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

describe("buildYearlySpendingPoints", () => {
  it("computes a positive total from a negative (expense-signed) raw sum", () => {
    const points = buildYearlySpendingPoints(2026, 2026, new Map([[2026, -1500]]))
    expect(points).toEqual([{ year: 2026, totalExpenses: 1500 }])
  })

  it("includes every year in range, even a year with no matching rows (true gap, not skipped)", () => {
    const points = buildYearlySpendingPoints(2024, 2026, new Map([[2025, -500]]))
    expect(points).toEqual([
      { year: 2024, totalExpenses: 0 },
      { year: 2025, totalExpenses: 500 },
      { year: 2026, totalExpenses: 0 },
    ])
  })

  it("treats a null raw sum (Prisma's _sum.amount for no matching rows) the same as a missing entry", () => {
    const points = buildYearlySpendingPoints(2026, 2026, new Map([[2026, null]]))
    expect(points).toEqual([{ year: 2026, totalExpenses: 0 }])
  })

  it("normalizes IEEE-754 negative zero to a plain 0", () => {
    const points = buildYearlySpendingPoints(2026, 2026, new Map([[2026, 0]]))
    expect(Object.is(points[0].totalExpenses, -0)).toBe(false)
    expect(points[0].totalExpenses).toBe(0)
  })

  it("returns a single-year array when startYear equals endYear", () => {
    const points = buildYearlySpendingPoints(2026, 2026, new Map())
    expect(points).toEqual([{ year: 2026, totalExpenses: 0 }])
  })

  it("spans a multi-year range crossing several year boundaries in chronological order", () => {
    const rawSums = new Map([
      [2023, -100],
      [2024, -200],
      [2025, -300],
      [2026, -400],
    ])
    const points = buildYearlySpendingPoints(2023, 2026, rawSums)
    expect(points.map((p) => p.year)).toEqual([2023, 2024, 2025, 2026])
    expect(points.map((p) => p.totalExpenses)).toEqual([100, 200, 300, 400])
  })
})

describe("buildCategoryTrends", () => {
  function txn(
    categoryId: string | null,
    amount: number,
    date: Date,
  ): CategoryTrendTransaction {
    return { categoryId, amount, date }
  }

  it("buckets a single category's spend into its correct month", () => {
    const transactions = [txn("cat-groceries", -50, utcDate(2026, 2, 15))]
    const result = buildCategoryTrends(
      transactions,
      ["2026-03"],
      new Map([["cat-groceries", "Groceries"]]),
    )

    expect(result).toEqual([
      { categoryId: "cat-groceries", categoryName: "Groceries", points: [{ month: "2026-03", amount: 50 }] },
    ])
  })

  it("sums multiple transactions in the same category and month", () => {
    const transactions = [
      txn("cat-groceries", -50, utcDate(2026, 2, 5)),
      txn("cat-groceries", -30, utcDate(2026, 2, 20)),
    ]
    const result = buildCategoryTrends(
      transactions,
      ["2026-03"],
      new Map([["cat-groceries", "Groceries"]]),
    )

    expect(result[0].points).toEqual([{ month: "2026-03", amount: 80 }])
  })

  it("includes every month in monthKeys for every category, even at $0 (true gap, not skipped)", () => {
    const transactions = [txn("cat-groceries", -50, utcDate(2026, 2, 15))]
    const result = buildCategoryTrends(
      transactions,
      ["2026-01", "2026-02", "2026-03"],
      new Map([["cat-groceries", "Groceries"]]),
    )

    expect(result[0].points).toEqual([
      { month: "2026-01", amount: 0 },
      { month: "2026-02", amount: 0 },
      { month: "2026-03", amount: 50 },
    ])
  })

  it("folds a null categoryId into the Uncategorized sentinel bucket", () => {
    const transactions = [txn(null, -75, utcDate(2026, 5, 10))]
    const result = buildCategoryTrends(transactions, ["2026-06"], new Map())

    expect(result).toEqual([
      {
        categoryId: UNCATEGORIZED_CATEGORY_ID,
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        points: [{ month: "2026-06", amount: 75 }],
      },
    ])
  })

  it("falls back to the raw category id when categoryNameById has no entry for it (defensive)", () => {
    const transactions = [txn("cat-missing", -20, utcDate(2026, 3, 1))]
    const result = buildCategoryTrends(transactions, ["2026-04"], new Map())

    expect(result[0].categoryName).toBe("cat-missing")
  })

  it("orders categories by total period spend descending", () => {
    const transactions = [
      txn("cat-small", -10, utcDate(2026, 0, 5)),
      txn("cat-large", -100, utcDate(2026, 0, 5)),
      txn("cat-medium", -50, utcDate(2026, 0, 5)),
    ]
    const result = buildCategoryTrends(
      transactions,
      ["2026-01"],
      new Map([
        ["cat-small", "Small"],
        ["cat-large", "Large"],
        ["cat-medium", "Medium"],
      ]),
    )

    expect(result.map((r) => r.categoryId)).toEqual(["cat-large", "cat-medium", "cat-small"])
  })

  it("correctly buckets transactions spanning a Dec 31 -> Jan 1 year boundary into distinct months", () => {
    const transactions = [
      txn("cat-groceries", -40, utcDate(2025, 11, 31)),
      txn("cat-groceries", -60, utcDate(2026, 0, 1)),
    ]
    const result = buildCategoryTrends(
      transactions,
      ["2025-12", "2026-01"],
      new Map([["cat-groceries", "Groceries"]]),
    )

    expect(result[0].points).toEqual([
      { month: "2025-12", amount: 40 },
      { month: "2026-01", amount: 60 },
    ])
  })

  it("returns an empty array for zero transactions", () => {
    expect(buildCategoryTrends([], ["2026-01"], new Map())).toEqual([])
  })

  it("does not leak the internal totalForSort sort key onto the returned rows", () => {
    const transactions = [txn("cat-a", -10, utcDate(2026, 0, 1))]
    const result = buildCategoryTrends(transactions, ["2026-01"], new Map([["cat-a", "A"]]))

    expect(Object.keys(result[0]).sort()).toEqual(["categoryId", "categoryName", "points"])
  })
})
