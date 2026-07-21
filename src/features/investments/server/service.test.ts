import { Prisma } from "@prisma/client"
import type { Holding as PrismaHoldingRow } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { computeAllocationEntries, toHolding } from "./service"

// This file deliberately never imports `@/lib/db` (or anything that reaches
// it): `toHolding` and `computeAllocationEntries` are the two calculation-only
// portions of this feature's math (gain/loss, allocation percentages) that
// are pure functions of plain/Prisma-row data, per the Phase 3a gate-review
// follow-up requiring fixture-based coverage with no database access. Every
// other exported function in `service.ts` (`getContainers`,
// `getHoldingsForContainer`, `getPortfolioOverview`, `getAllocation`, etc.)
// always queries the database directly and is out of scope for these unit
// tests — see this feature's Bug Hunter/QA follow-up for integration-level
// coverage of those instead.

/** Builds a full, schema-shaped `Holding` Prisma row fixture, with just
 * `costBasis`/`currentValue` (and optionally `sector`) overridable per test —
 * every other field is a fixed, arbitrary-but-valid value `toHolding` never
 * inspects, so it doesn't need repeating in every test case. */
function buildHoldingRow(overrides: {
  costBasis: number
  currentValue: number
  sector?: PrismaHoldingRow["sector"]
}): PrismaHoldingRow {
  return {
    id: "holding-1",
    userId: "user-1",
    accountId: "account-1",
    name: "Test Holding",
    assetType: "STOCK",
    sector: overrides.sector ?? "TECHNOLOGY",
    costBasis: new Prisma.Decimal(overrides.costBasis),
    currentValue: new Prisma.Decimal(overrides.currentValue),
    closedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }
}

describe("toHolding", () => {
  it("computes a positive gain (currentValue > costBasis)", () => {
    const holding = toHolding(buildHoldingRow({ costBasis: 1000, currentValue: 1250 }))

    expect(holding.gainLossAmount).toBe(250)
    expect(holding.gainLossPercent).toBe(25)
  })

  it("computes a negative gain (a loss) when currentValue < costBasis", () => {
    const holding = toHolding(buildHoldingRow({ costBasis: 1000, currentValue: 800 }))

    expect(holding.gainLossAmount).toBe(-200)
    expect(holding.gainLossPercent).toBe(-20)
  })

  it("returns a $0 gain/loss and 0% when currentValue equals costBasis", () => {
    const holding = toHolding(buildHoldingRow({ costBasis: 500, currentValue: 500 }))

    expect(holding.gainLossAmount).toBe(0)
    expect(holding.gainLossPercent).toBe(0)
  })

  it("guards against divide-by-zero, returning null gainLossPercent when costBasis is 0", () => {
    // A $0-cost-basis holding (e.g. a gifted or airdropped asset) still has a
    // real, non-null gain amount — it simply has no meaningful percentage to
    // divide by, per this function's own JSDoc.
    const holding = toHolding(buildHoldingRow({ costBasis: 0, currentValue: 300 }))

    expect(holding.gainLossAmount).toBe(300)
    expect(holding.gainLossPercent).toBeNull()
  })

  it("converts Decimal costBasis/currentValue into plain numbers", () => {
    const holding = toHolding(buildHoldingRow({ costBasis: 123.45, currentValue: 678.9 }))

    expect(holding.costBasis).toBe(123.45)
    expect(holding.currentValue).toBe(678.9)
    expect(typeof holding.costBasis).toBe("number")
    expect(typeof holding.currentValue).toBe("number")
  })
})

describe("computeAllocationEntries", () => {
  it("returns an empty array for zero holdings (no division-by-zero)", () => {
    expect(computeAllocationEntries([], "assetType")).toEqual([])
  })

  it("returns an empty array when every holding's currentValue is 0", () => {
    // Total value is 0 even though the array is non-empty — same guard must
    // still apply, not just the "array literally empty" case.
    const holdings = [
      { assetType: "STOCK" as const, sector: "TECHNOLOGY" as const, currentValue: 0 },
    ]
    expect(computeAllocationEntries(holdings, "assetType")).toEqual([])
  })

  it("groups by asset type and computes percentages summing to 100", () => {
    const holdings = [
      { assetType: "STOCK" as const, sector: "TECHNOLOGY" as const, currentValue: 600 },
      { assetType: "BOND" as const, sector: null, currentValue: 400 },
    ]

    const entries = computeAllocationEntries(holdings, "assetType")

    expect(entries).toEqual(
      expect.arrayContaining([
        { label: "Stock", value: 600, percent: 60 },
        { label: "Bond", value: 400, percent: 40 },
      ]),
    )
    const totalPercent = entries.reduce((sum, entry) => sum + entry.percent, 0)
    expect(totalPercent).toBeCloseTo(100)
  })

  it("groups by sector and buckets null-sector holdings into 'Other / Not Applicable'", () => {
    const holdings = [
      { assetType: "STOCK" as const, sector: "TECHNOLOGY" as const, currentValue: 300 },
      // A Crypto holding, which never has a sector (per schema comment).
      { assetType: "CRYPTO" as const, sector: null, currentValue: 100 },
      // A Bond holding, likewise sector-less.
      { assetType: "BOND" as const, sector: null, currentValue: 100 },
    ]

    const entries = computeAllocationEntries(holdings, "sector")

    const notApplicableEntry = entries.find((e) => e.label === "Other / Not Applicable")
    expect(notApplicableEntry).toEqual({
      label: "Other / Not Applicable",
      value: 200,
      percent: 40,
    })
    const technologyEntry = entries.find((e) => e.label === "Technology")
    expect(technologyEntry).toEqual({ label: "Technology", value: 300, percent: 60 })
  })

  it("merges multiple holdings that share the same asset type into one entry", () => {
    const holdings = [
      { assetType: "STOCK" as const, sector: "TECHNOLOGY" as const, currentValue: 200 },
      { assetType: "STOCK" as const, sector: "FINANCIALS" as const, currentValue: 300 },
    ]

    const entries = computeAllocationEntries(holdings, "assetType")

    expect(entries).toEqual([{ label: "Stock", value: 500, percent: 100 }])
  })
})
