import { describe, expect, it, vi } from "vitest"

// `savings-growth.ts` imports `EXCLUDE_SPLIT_PARENTS` from
// `features/transactions/server/service.ts`, which transitively imports
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process — it is
// never exercised by anything in this file, since every test below only
// calls `computeSavingsGrowthPoint`, a pure, database-free function.
// Test-only isolation of an unrelated side-effecting dependency, not a
// change to production behavior.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { computeSavingsGrowthPoint } from "./savings-growth"

// `computeSavingsGrowthPoint` is the
// calculation-only portion of Savings Growth (analytics.md AC15) that is a
// pure function of an already-fetched month's income/expenses/gain-loss, per
// the "extract the pure calculation, unit-test it without a database"
// precedent established by `features/investments/server/service.test.ts` and
// `features/dashboard/server/net-worth-history.test.ts`. `getSavingsGrowth`
// itself always queries the database (via cross-domain calls into Dashboard
// and Investments) and is out of scope for these unit tests.
//
// Covers docs/product/analytics.md's Definition of Done, which calls this
// metric's gain/loss-adjustment math out by name: "Savings Growth's
// investment-gain-adjustment math is verified against fixture data including
// a $0-holdings user and a user with both gains and losses in the same
// period."

describe("computeSavingsGrowthPoint", () => {
  it("computes (income - expenses) - gainLoss for a normal month with a gain", () => {
    // $5,000 income, $3,000 expenses, $200 investment gain: the gain must be
    // subtracted out so it's never mistaken for "saved more."
    const point = computeSavingsGrowthPoint("2026-03", 5000, 3000, 200)
    expect(point).toEqual({ month: "2026-03", actualSavings: 1800 })
  })

  it("adds back a loss (subtracting a negative gainLoss increases actualSavings)", () => {
    // A $300 investment loss should not be mistaken for reduced savings
    // behavior — the user's actual cash-flow savings are unaffected by it.
    const point = computeSavingsGrowthPoint("2026-03", 5000, 3000, -300)
    expect(point).toEqual({ month: "2026-03", actualSavings: 2300 })
  })

  it("matches plain income-minus-expenses for a $0-holdings user (gainLoss defaults to 0)", () => {
    // Edge case (analytics.md): "Investments' gain/loss data unavailable for
    // a given period ... Savings Growth simply uses $0 as the gain/loss
    // adjustment ... functionally identical to plain income-minus-expenses."
    const point = computeSavingsGrowthPoint("2026-03", 4000, 2500, 0)
    expect(point).toEqual({ month: "2026-03", actualSavings: 1500 })
  })

  it("returns actualSavings: null for a $0-income month, never a divide-by-zero or misleading 0", () => {
    const point = computeSavingsGrowthPoint("2026-03", 0, 500, 100)
    expect(point).toEqual({ month: "2026-03", actualSavings: null })
  })

  it("returns null for a $0-income month even when expenses and gainLoss are also both 0", () => {
    const point = computeSavingsGrowthPoint("2026-03", 0, 0, 0)
    expect(point).toEqual({ month: "2026-03", actualSavings: null })
  })

  it("can report negative actualSavings (spent more than earned, before any investment adjustment)", () => {
    const point = computeSavingsGrowthPoint("2026-03", 2000, 2500, 0)
    expect(point).toEqual({ month: "2026-03", actualSavings: -500 })
  })

  it("can flip an otherwise-positive cash-flow month negative once a large investment gain is netted out", () => {
    // $1,000 cash-flow savings, but a $1,500 investment gain that must be
    // subtracted out — actualSavings correctly goes negative rather than
    // being floored at $0, since this is a real "you didn't actually save,
    // your portfolio just went up" signal.
    const point = computeSavingsGrowthPoint("2026-03", 5000, 4000, 1500)
    expect(point).toEqual({ month: "2026-03", actualSavings: -500 })
  })

  it("echoes the requested monthKey through unchanged in both the null and non-null branches", () => {
    expect(computeSavingsGrowthPoint("2025-12", 0, 0, 0).month).toBe("2025-12")
    expect(computeSavingsGrowthPoint("2026-01", 100, 50, 0).month).toBe("2026-01")
  })
})
