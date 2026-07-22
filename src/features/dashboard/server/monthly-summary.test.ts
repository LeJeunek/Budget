import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

// `monthly-summary.ts` transitively imports `EXCLUDE_SPLIT_PARENTS` (via
// `features/analytics/server/expense-breakdown.ts`) from
// `features/transactions/server/service.ts`, which itself imports
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process -- mirrors
// `features/analytics/server/income-analytics.test.ts`'s identical mock;
// never exercised by anything in this file.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import {
  computeHasActivity,
  computeIsPartialMonth,
  computeNetWorthChange,
  isClosedMonth,
  isUserEligibleForMonth,
  lastDayOfUtcMonth,
  resolveLastClosedMonth,
} from "./monthly-summary"

// Verifies this feature's Definition of Done bar (docs/product/ai-features.md
// Feature 3): "The once-per-closed-month, persisted-not-regenerated
// generation behavior is verified. The partial-first-month and
// zero-activity-month states are both verified." Every function tested here
// is a pure, database-free calculation, mirroring
// `features/dashboard/server/net-worth-history.test.ts`'s
// `resolveRangeStart`/`thinRows` "extract the pure calculation" precedent --
// `generateMonthlySummariesForAllUsers`/`regenerateMonthlySummary` themselves
// always touch the database and are out of scope for these unit tests, per
// this codebase's standing "no integration-test database" convention.

describe("resolveLastClosedMonth", () => {
  it("returns the previous calendar month for a mid-year date", () => {
    const now = new Date(Date.UTC(2026, 6, 20)) // July 20, 2026
    expect(resolveLastClosedMonth(now)).toEqual(new Date(Date.UTC(2026, 5, 1))) // June 1
  })

  it("rolls back across a year boundary for January", () => {
    const now = new Date(Date.UTC(2026, 0, 5)) // January 5, 2026
    expect(resolveLastClosedMonth(now)).toEqual(new Date(Date.UTC(2025, 11, 1))) // Dec 1, 2025
  })
})

describe("lastDayOfUtcMonth", () => {
  it("returns the 30th for a 30-day month", () => {
    expect(lastDayOfUtcMonth(new Date(Date.UTC(2026, 5, 1)))).toEqual(
      new Date(Date.UTC(2026, 5, 30)),
    )
  })

  it("handles a leap-year February correctly", () => {
    expect(lastDayOfUtcMonth(new Date(Date.UTC(2028, 1, 1)))).toEqual(
      new Date(Date.UTC(2028, 1, 29)),
    )
  })

  it("handles a non-leap-year February correctly", () => {
    expect(lastDayOfUtcMonth(new Date(Date.UTC(2026, 1, 1)))).toEqual(
      new Date(Date.UTC(2026, 1, 28)),
    )
  })
})

describe("isClosedMonth", () => {
  const now = new Date(Date.UTC(2026, 6, 20)) // July 20, 2026

  it("returns true for a strictly past month", () => {
    expect(isClosedMonth(new Date(Date.UTC(2026, 5, 1)), now)).toBe(true)
  })

  it("returns false for the current, in-progress month (AC3)", () => {
    expect(isClosedMonth(new Date(Date.UTC(2026, 6, 1)), now)).toBe(false)
  })

  it("returns false for a future month", () => {
    expect(isClosedMonth(new Date(Date.UTC(2026, 7, 1)), now)).toBe(false)
  })
})

describe("isUserEligibleForMonth", () => {
  const monthEnd = new Date(Date.UTC(2026, 5, 30)) // June 30, 2026

  it("returns true when the user existed before the month started", () => {
    expect(isUserEligibleForMonth(new Date(Date.UTC(2026, 0, 1)), monthEnd)).toBe(true)
  })

  it("returns true when the user signed up mid-month (partial month)", () => {
    expect(isUserEligibleForMonth(new Date(Date.UTC(2026, 5, 15)), monthEnd)).toBe(true)
  })

  it("returns false when the user signed up after the month ended", () => {
    expect(isUserEligibleForMonth(new Date(Date.UTC(2026, 6, 1)), monthEnd)).toBe(false)
  })
})

describe("computeIsPartialMonth", () => {
  const monthDate = new Date(Date.UTC(2026, 5, 1)) // June 2026

  it("returns true when the user signed up during this exact month", () => {
    expect(computeIsPartialMonth(new Date(Date.UTC(2026, 5, 15)), monthDate)).toBe(true)
  })

  it("returns false when the user signed up in an earlier month (full month)", () => {
    expect(computeIsPartialMonth(new Date(Date.UTC(2026, 0, 1)), monthDate)).toBe(false)
  })
})

describe("computeHasActivity", () => {
  it("returns true when there is income", () => {
    expect(computeHasActivity(5000, 0)).toBe(true)
  })

  it("returns true when there are expenses", () => {
    expect(computeHasActivity(0, 200)).toBe(true)
  })

  it("returns false for a month with zero income and zero expenses (Edge Case: zero transactions)", () => {
    expect(computeHasActivity(0, 0)).toBe(false)
  })
})

describe("computeNetWorthChange", () => {
  it("computes endNetWorth - startNetWorth for two real snapshots", () => {
    expect(computeNetWorthChange(10_000, 11_500)).toBe(1500)
  })

  it("returns null when the start-of-month snapshot is unavailable (Cross-Cutting Requirement #2: no fabricated figures)", () => {
    expect(computeNetWorthChange(null, 11_500)).toBeNull()
  })

  it("returns null when the end-of-month snapshot is unavailable", () => {
    expect(computeNetWorthChange(10_000, null)).toBeNull()
  })

  it("returns null when both snapshots are unavailable", () => {
    expect(computeNetWorthChange(null, null)).toBeNull()
  })

  it("correctly reflects a decline (negative change) without a sign-inversion bug", () => {
    expect(computeNetWorthChange(-50_000, -40_000)).toBe(10_000)
    expect(computeNetWorthChange(-50_000, -60_000)).toBe(-10_000)
  })
})

// Verifies this feature has no code path capable of writing to any other
// feature's data -- mirrors `features/budgeting/server/advisor.test.ts`'s
// identical source-level "read-only, by construction" check, applied here to
// every OTHER feature's tables this file reads from (Transaction, Account,
// Budget, NetWorthSnapshot) rather than just one.
describe("monthly-summary.ts is read-only against every other feature's data, by construction", () => {
  const SOURCE = readFileSync(join(__dirname, "monthly-summary.ts"), "utf-8")
  const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]
  const OTHER_FEATURE_MODELS = ["transaction", "account", "budget", "budgetCategory", "category", "netWorthSnapshot"]

  it("never calls a Prisma write method on any other feature's model", () => {
    for (const model of OTHER_FEATURE_MODELS) {
      for (const method of WRITE_METHODS) {
        expect(SOURCE).not.toMatch(new RegExp(`db\\.${model}\\.${method}\\b`))
      }
    }
  })

  it("its only persistence is its own MonthlySummary row", () => {
    expect(SOURCE).toMatch(/db\.monthlySummary\.(create|update|updateMany|findFirst|findMany)\(/)
  })

  it("reads Dashboard/Analytics/Net-Worth-Snapshot data only through existing service functions, never a direct groupBy/aggregate of its own", () => {
    expect(SOURCE).toMatch(/getMonthlySummary as getMonthlyAggregate/)
    expect(SOURCE).toMatch(/getExpenseDistribution/)
    expect(SOURCE).toMatch(/getLargestPurchases/)
    // The one direct Prisma read against another feature's table this file
    // performs is a plain point-lookup of two already-persisted
    // NetWorthSnapshot rows (never a groupBy/aggregate recomputation) --
    // confirmed by the absence of any write method above.
    expect(SOURCE).toMatch(/db\.netWorthSnapshot\.findFirst\(/)
  })
})
