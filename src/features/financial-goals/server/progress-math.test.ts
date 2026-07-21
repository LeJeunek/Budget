import { describe, expect, it } from "vitest"

import {
  computeDebtPayoffPercent,
  computeNetWorthTargetProgress,
  computeRollingSavingsRateAverage,
  isDebtPayoffComplete,
  isSavingsRateTargetComplete,
  sumAccountSubsetBalances,
} from "./progress-math"

describe("computeDebtPayoffPercent", () => {
  it("matches a hand-computed percentage for a normal partial payoff", () => {
    // $1,000 starting balance, $600 remaining -> 40% paid off.
    expect(computeDebtPayoffPercent(1000, 600)).toBe(40)
  })

  it("clamps to 0% (never negative) when the balance increased since the goal began", () => {
    // Edge case (financial-goals.md): new charges pushed the balance above
    // its starting anchor — must read as 0%, not a negative percentage.
    expect(computeDebtPayoffPercent(1000, 1200)).toBe(0)
  })

  it("returns exactly 100% when the balance has reached $0", () => {
    expect(computeDebtPayoffPercent(1000, 0)).toBe(100)
  })

  it("clamps to 100% (never over) when the debt was overpaid past $0", () => {
    expect(computeDebtPayoffPercent(1000, -50)).toBe(100)
  })

  it("treats a non-positive startingBalance as already complete (defensive guard)", () => {
    expect(computeDebtPayoffPercent(0, 0)).toBe(100)
    expect(computeDebtPayoffPercent(-100, 50)).toBe(100)
  })
})

describe("isDebtPayoffComplete", () => {
  it("is true at exactly $0", () => {
    expect(isDebtPayoffComplete(0)).toBe(true)
  })

  it("is true when overpaid past $0", () => {
    expect(isDebtPayoffComplete(-25)).toBe(true)
  })

  it("is false for any remaining positive balance", () => {
    expect(isDebtPayoffComplete(0.01)).toBe(false)
  })
})

describe("computeNetWorthTargetProgress", () => {
  it("reports a positive distance and not-completed when under target", () => {
    expect(computeNetWorthTargetProgress(30_000, 50_000)).toEqual({
      distanceToTarget: 20_000,
      isCompleted: false,
    })
  })

  it("is completed at exactly the target (meets, not just exceeds)", () => {
    expect(computeNetWorthTargetProgress(50_000, 50_000)).toEqual({
      distanceToTarget: 0,
      isCompleted: true,
    })
  })

  it("is completed when the measured value exceeds the target", () => {
    expect(computeNetWorthTargetProgress(60_000, 50_000)).toEqual({
      distanceToTarget: -10_000,
      isCompleted: true,
    })
  })

  it("shows a deeply negative net worth plainly, never hidden or clamped", () => {
    // Edge case: a goal measured against deeply negative net worth.
    expect(computeNetWorthTargetProgress(-5_000, 10_000)).toEqual({
      distanceToTarget: 15_000,
      isCompleted: false,
    })
  })
})

describe("sumAccountSubsetBalances", () => {
  it("sums assets as-is and subtracts CREDIT_CARD liabilities, matching getNetWorth's convention", () => {
    const accounts = [
      { type: "CHECKING" as const, balance: 500 },
      { type: "SAVINGS" as const, balance: 1_000 },
      { type: "CREDIT_CARD" as const, balance: 200 },
    ]
    expect(sumAccountSubsetBalances(accounts)).toBe(1_300)
  })

  it("returns 0 for an empty subset", () => {
    expect(sumAccountSubsetBalances([])).toBe(0)
  })
})

describe("computeRollingSavingsRateAverage", () => {
  it("averages three qualifying months", () => {
    expect(computeRollingSavingsRateAverage([0.1, 0.2, 0.3])).toBeCloseTo(0.2)
  })

  it("excludes $0-income (null) months from the average rather than counting them as 0", () => {
    // If the excluded month counted as 0, the average would be 0.1667, not 0.25.
    expect(computeRollingSavingsRateAverage([null, 0.2, 0.3])).toBeCloseTo(0.25)
  })

  it("falls back to not-enough-data (null) when every month in the window is excluded", () => {
    expect(computeRollingSavingsRateAverage([null, null, null])).toBeNull()
  })

  it("falls back to not-enough-data (null) for an empty window", () => {
    expect(computeRollingSavingsRateAverage([])).toBeNull()
  })
})

describe("isSavingsRateTargetComplete", () => {
  it("is completed when the rolling average meets the target exactly", () => {
    expect(isSavingsRateTargetComplete(20, 20)).toBe(true)
  })

  it("is completed when the rolling average exceeds the target", () => {
    expect(isSavingsRateTargetComplete(25, 20)).toBe(true)
  })

  it("is not completed when the rolling average is below the target", () => {
    expect(isSavingsRateTargetComplete(19.99, 20)).toBe(false)
  })

  it("is never completed when there is not enough data (null)", () => {
    expect(isSavingsRateTargetComplete(null, 20)).toBe(false)
  })
})
