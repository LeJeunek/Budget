import { describe, expect, it, vi } from "vitest"

// `income-analytics.ts` imports `EXCLUDE_SPLIT_PARENTS` from
// `features/transactions/server/service.ts`, which transitively imports
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process — it is
// never exercised by anything in this file, since every test below only
// calls pure, database-free functions. Test-only isolation of an unrelated
// side-effecting dependency, not a change to production behavior.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { buildIncomeGrowthPoint, deriveIncomeSourcesFromGrowth } from "./income-analytics"
import type { IncomeGrowthPoint, IncomeSourceType } from "../types"

// `buildIncomeGrowthPoint` and `deriveIncomeSourcesFromGrowth` are the
// two calculation-only portions of Income Growth (analytics.md AC13) and
// Income Sources (AC14) that are pure functions of plain fixture data — the
// latter was already extracted/pure prior to this test file; the former is
// extracted here per the "extract the pure calculation, unit-test it without
// a database" precedent established by
// `features/investments/server/service.test.ts` and
// `features/dashboard/server/net-worth-history.test.ts`. `getIncomeGrowth`/
// `getIncomeSources` themselves always query the database and are out of
// scope for these unit tests. Covers docs/product/analytics.md's Definition
// of Done: "Income Growth [and] Income Sources ... are ... covered by tests
// verifying correct aggregation across month/year boundaries."

describe("buildIncomeGrowthPoint", () => {
  it("echoes month and total through unchanged", () => {
    const point = buildIncomeGrowthPoint("2026-03", 1000, new Map())
    expect(point.month).toBe("2026-03")
    expect(point.total).toBe(1000)
  })

  it("reports each tracked type's sum in bySource, with no untracked entry when tracked exactly matches total", () => {
    const trackedByType = new Map<IncomeSourceType, number>([
      ["SALARY", 800],
      ["DIVIDEND", 200],
    ])
    const point = buildIncomeGrowthPoint("2026-03", 1000, trackedByType)

    expect(point.bySource).toEqual(
      expect.arrayContaining([
        { type: "SALARY", amount: 800 },
        { type: "DIVIDEND", amount: 200 },
      ]),
    )
    expect(point.bySource.find((s) => s.type === "UNTRACKED")).toBeUndefined()
  })

  it("adds an UNTRACKED bucket for the positive residual (total - trackedSum) when tracked is less than total", () => {
    const trackedByType = new Map<IncomeSourceType, number>([["SALARY", 700]])
    const point = buildIncomeGrowthPoint("2026-03", 1000, trackedByType)

    expect(point.bySource).toEqual(
      expect.arrayContaining([
        { type: "SALARY", amount: 700 },
        { type: "UNTRACKED", amount: 300 },
      ]),
    )
  })

  it("clamps the UNTRACKED residual to 0 (never negative) when tracked sum exceeds total", () => {
    // Edge case this file's own JSDoc documents: a manually-marked-received
    // recurring-income record with no linked Transaction can push
    // trackedSum above the Transaction-derived total.
    const trackedByType = new Map<IncomeSourceType, number>([["SALARY", 1200]])
    const point = buildIncomeGrowthPoint("2026-03", 1000, trackedByType)

    expect(point.bySource.find((s) => s.type === "UNTRACKED")).toBeUndefined()
    expect(point.bySource).toEqual([{ type: "SALARY", amount: 1200 }])
  })

  it("produces no bySource entries at all for a $0 month with no tracked income", () => {
    const point = buildIncomeGrowthPoint("2026-03", 0, new Map())
    expect(point.bySource).toEqual([])
  })

  it("reports the full total as UNTRACKED when nothing is tracked at all", () => {
    const point = buildIncomeGrowthPoint("2026-03", 500, new Map())
    expect(point.bySource).toEqual([{ type: "UNTRACKED", amount: 500 }])
  })
})

describe("deriveIncomeSourcesFromGrowth", () => {
  function point(month: string, bySource: IncomeGrowthPoint["bySource"]): IncomeGrowthPoint {
    const total = bySource.reduce((sum, s) => sum + s.amount, 0)
    return { month, total, bySource }
  }

  it("sums a single type across multiple months into one entry", () => {
    const growth = [
      point("2026-01", [{ type: "SALARY", amount: 1000 }]),
      point("2026-02", [{ type: "SALARY", amount: 1000 }]),
    ]

    const sources = deriveIncomeSourcesFromGrowth(growth)
    expect(sources).toEqual([{ type: "SALARY", amount: 2000, percent: 100 }])
  })

  it("computes percentages across multiple types summing to 100 (barring rounding), sorted by amount descending", () => {
    const growth = [
      point("2026-01", [
        { type: "SALARY", amount: 750 },
        { type: "RENTAL", amount: 250 },
      ]),
    ]

    const sources = deriveIncomeSourcesFromGrowth(growth)
    expect(sources).toEqual([
      { type: "SALARY", amount: 750, percent: 75 },
      { type: "RENTAL", amount: 250, percent: 25 },
    ])
  })

  it("crosses a Dec 31 -> Jan 1 year boundary, still summing correctly across both months", () => {
    const growth = [
      point("2025-12", [{ type: "SALARY", amount: 400 }]),
      point("2026-01", [{ type: "SALARY", amount: 600 }]),
    ]

    const sources = deriveIncomeSourcesFromGrowth(growth)
    expect(sources).toEqual([{ type: "SALARY", amount: 1000, percent: 100 }])
  })

  it("returns an empty array (not a divide-by-zero) for a period with $0 total income across every month", () => {
    const growth = [point("2026-01", []), point("2026-02", [])]
    expect(deriveIncomeSourcesFromGrowth(growth)).toEqual([])
  })

  it("returns an empty array for an empty growth array", () => {
    expect(deriveIncomeSourcesFromGrowth([])).toEqual([])
  })

  it("includes the UNTRACKED bucket as its own proportion entry, same as any named type", () => {
    const growth = [
      point("2026-01", [
        { type: "SALARY", amount: 600 },
        { type: "UNTRACKED", amount: 400 },
      ]),
    ]

    const sources = deriveIncomeSourcesFromGrowth(growth)
    expect(sources).toEqual([
      { type: "SALARY", amount: 600, percent: 60 },
      { type: "UNTRACKED", amount: 400, percent: 40 },
    ])
  })
})
