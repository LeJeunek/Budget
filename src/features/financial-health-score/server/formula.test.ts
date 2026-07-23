import { describe, expect, it } from "vitest"

import {
  aggregateFinancialHealthScore,
  computeDebtToIncomeScore,
  computeNetWorthTrendScore,
  computeSavingsRateScore,
  deriveFinancialHealthScoreLabel,
  linearInterpolateScore,
} from "./formula"
import type { FinancialHealthScoreComponents } from "../types"

describe("linearInterpolateScore", () => {
  it("returns 100 at the score-100 boundary", () => {
    expect(linearInterpolateScore(0.15, 0.5, 0.15)).toBe(100)
  })

  it("returns 0 at the score-0 boundary", () => {
    expect(linearInterpolateScore(0.5, 0.5, 0.15)).toBe(0)
  })

  it("interpolates linearly at the midpoint (decreasing direction)", () => {
    expect(linearInterpolateScore(0.325, 0.5, 0.15)).toBe(50)
  })

  it("interpolates linearly at the midpoint (increasing direction)", () => {
    expect(linearInterpolateScore(0.1, 0, 0.2)).toBe(50)
  })

  it("clamps to 100 beyond the score-100 boundary, never exceeding 100", () => {
    expect(linearInterpolateScore(0.05, 0.5, 0.15)).toBe(100)
  })

  it("clamps to 0 beyond the score-0 boundary, never going negative", () => {
    expect(linearInterpolateScore(0.9, 0.5, 0.15)).toBe(0)
  })
})

describe("deriveFinancialHealthScoreLabel", () => {
  it("is 'Good' at exactly 70", () => {
    expect(deriveFinancialHealthScoreLabel(70)).toBe("Good")
  })

  it("is 'Fair' at exactly 69 (just below the Good boundary)", () => {
    expect(deriveFinancialHealthScoreLabel(69)).toBe("Fair")
  })

  it("is 'Fair' at exactly 40", () => {
    expect(deriveFinancialHealthScoreLabel(40)).toBe("Fair")
  })

  it("is 'Needs attention' at exactly 39 (just below the Fair boundary)", () => {
    expect(deriveFinancialHealthScoreLabel(39)).toBe("Needs attention")
  })

  it("is 'Needs attention' at 0", () => {
    expect(deriveFinancialHealthScoreLabel(0)).toBe("Needs attention")
  })

  it("is 'Good' at 100", () => {
    expect(deriveFinancialHealthScoreLabel(100)).toBe("Good")
  })
})

describe("computeDebtToIncomeScore", () => {
  it("scores 100 for a user with zero active debts, regardless of income", () => {
    expect(computeDebtToIncomeScore(0, 5000)).toBe(100)
  })

  it("scores 100 for zero debts even when income is also zero (never null)", () => {
    expect(computeDebtToIncomeScore(0, 0)).toBe(100)
  })

  it("scores 100 at a ratio of exactly 15%", () => {
    expect(computeDebtToIncomeScore(750, 5000)).toBe(100) // 750/5000 = 0.15
  })

  it("scores 0 at a ratio of exactly 50%", () => {
    expect(computeDebtToIncomeScore(2500, 5000)).toBe(0) // 2500/5000 = 0.50
  })

  it("scores 50 at the ratio midpoint (32.5%)", () => {
    expect(computeDebtToIncomeScore(1625, 5000)).toBe(50) // 1625/5000 = 0.325
  })

  it("scores 0 (floored) for a ratio worse than 50%", () => {
    expect(computeDebtToIncomeScore(4000, 5000)).toBe(0) // 0.80 ratio
  })

  it("returns null (undefined) when there is debt but zero income to divide by", () => {
    expect(computeDebtToIncomeScore(500, 0)).toBeNull()
  })

  it("returns null (undefined) when income is negative (defensive)", () => {
    expect(computeDebtToIncomeScore(500, -100)).toBeNull()
  })
})

describe("computeSavingsRateScore", () => {
  it("scores 100 at a rolling average rate of exactly 20%", () => {
    expect(computeSavingsRateScore([0.2, 0.2, 0.2])).toBe(100)
  })

  it("scores 0 at a rolling average rate of exactly 0%", () => {
    expect(computeSavingsRateScore([0, 0, 0])).toBe(0)
  })

  it("scores 50 at the rolling average midpoint (10%)", () => {
    expect(computeSavingsRateScore([0, 0.1, 0.2])).toBe(50)
  })

  it("scores 0 (floored) for a negative rolling average", () => {
    expect(computeSavingsRateScore([-0.5, -0.5, -0.5])).toBe(0)
  })

  it("excludes $0-income (null) months from the average rather than counting them as 0%", () => {
    // Only 0.2 and 0.3 qualify; average = 0.25 -> clamped to 100 (>= 0.20).
    expect(computeSavingsRateScore([null, 0.2, 0.3])).toBe(100)
  })

  it("returns null (not enough data) when every month in the window is excluded", () => {
    expect(computeSavingsRateScore([null, null, null])).toBeNull()
  })

  it("returns null (not enough data) for an empty window", () => {
    expect(computeSavingsRateScore([])).toBeNull()
  })
})

describe("computeNetWorthTrendScore", () => {
  it("returns null (undefined) when fewer than 3 months of snapshot history exist (priorNetWorth is null)", () => {
    expect(
      computeNetWorthTrendScore({
        priorNetWorth: null,
        currentNetWorth: 10_000,
        trailingIncome: 12_000,
      }),
    ).toBeNull()
  })

  it("returns null (undefined) when trailing income is zero (cannot normalize)", () => {
    expect(
      computeNetWorthTrendScore({ priorNetWorth: 10_000, currentNetWorth: 11_000, trailingIncome: 0 }),
    ).toBeNull()
  })

  it("scores 100 at +15% of trailing income or better", () => {
    expect(
      computeNetWorthTrendScore({
        priorNetWorth: 10_000,
        currentNetWorth: 11_800, // +1,800 change
        trailingIncome: 12_000, // 1,800 / 12,000 = 0.15
      }),
    ).toBe(100)
  })

  it("scores 0 at -15% of trailing income or worse", () => {
    expect(
      computeNetWorthTrendScore({
        priorNetWorth: 10_000,
        currentNetWorth: 8_200, // -1,800 change
        trailingIncome: 12_000, // -1,800 / 12,000 = -0.15
      }),
    ).toBe(0)
  })

  it("scores exactly 50 at 0% change", () => {
    expect(
      computeNetWorthTrendScore({ priorNetWorth: 10_000, currentNetWorth: 10_000, trailingIncome: 12_000 }),
    ).toBe(50)
  })

  it("interpolates linearly between the boundaries (half of +15% -> 75)", () => {
    expect(
      computeNetWorthTrendScore({
        priorNetWorth: 10_000,
        currentNetWorth: 10_900, // +900 change; 900 / 12,000 = 0.075 (half of 0.15)
        trailingIncome: 12_000,
      }),
    ).toBe(75)
  })

  it("interpolates linearly between the boundaries (half of -15% -> 25)", () => {
    expect(
      computeNetWorthTrendScore({
        priorNetWorth: 10_000,
        currentNetWorth: 9_100, // -900 change
        trailingIncome: 12_000,
      }),
    ).toBe(25)
  })

  // Regression tests for the CTO-caught sign-inversion bug (ai-features.md
  // "Resolved (CTO, 2026-07-22)"): scoring against the STARTING NET WORTH
  // balance breaks when it's zero/negative. These fixtures replicate the
  // exact bug scenario from that section using the CORRECTED (income-
  // normalized) formula, and assert the result is no longer backwards.
  it("scores an improvement from a deeply negative net worth as an IMPROVEMENT, not a decline (sign-inversion regression)", () => {
    // -50,000 -> -40,000 is a genuine +10,000 improvement.
    const score = computeNetWorthTrendScore({
      priorNetWorth: -50_000,
      currentNetWorth: -40_000,
      trailingIncome: 40_000, // 10,000 / 40,000 = 0.25 -> clamped to 100
    })
    expect(score).toBe(100)
  })

  it("scores a decline from a deeply negative net worth as a DECLINE, not an improvement (sign-inversion regression)", () => {
    // -50,000 -> -60,000 is a genuine -10,000 decline.
    const score = computeNetWorthTrendScore({
      priorNetWorth: -50_000,
      currentNetWorth: -60_000,
      trailingIncome: 40_000, // -10,000 / 40,000 = -0.25 -> clamped to 0
    })
    expect(score).toBe(0)
  })
})

describe("aggregateFinancialHealthScore", () => {
  const allDefined: FinancialHealthScoreComponents = {
    debtToIncome: 100,
    savingsRate: 80,
    budgetAdherence: 60,
    netWorthTrend: 40,
  }

  it("averages all four components and derives the correct label when every component is defined", () => {
    const result = aggregateFinancialHealthScore(allDefined)
    expect(result.score).toBe(70) // (100+80+60+40)/4 = 70
    expect(result.label).toBe("Good")
    expect(result.undefinedComponents).toEqual([])
  })

  it("rounds the final average to the nearest integer", () => {
    const result = aggregateFinancialHealthScore({
      debtToIncome: 100,
      savingsRate: 100,
      budgetAdherence: 100,
      netWorthTrend: 99,
    })
    expect(result.score).toBe(100) // 399/4 = 99.75 -> rounds to 100
  })

  it("averages only the defined components when one is undefined, and names it", () => {
    const result = aggregateFinancialHealthScore({
      ...allDefined,
      netWorthTrend: null,
    })
    expect(result.score).toBe(80) // (100+80+60)/3 = 80
    expect(result.undefinedComponents).toEqual(["netWorthTrend"])
  })

  it("averages only the defined components across every combination of multiple undefined components", () => {
    const result = aggregateFinancialHealthScore({
      debtToIncome: 100,
      savingsRate: null,
      budgetAdherence: null,
      netWorthTrend: 50,
    })
    expect(result.score).toBe(75) // (100+50)/2 = 75
    expect(result.undefinedComponents).toEqual(["savingsRate", "budgetAdherence"])
  })

  it("returns null score AND null label -- never a misleading 0 -- when zero components are computable", () => {
    const result = aggregateFinancialHealthScore({
      debtToIncome: null,
      savingsRate: null,
      budgetAdherence: null,
      netWorthTrend: null,
    })
    expect(result.score).toBeNull()
    expect(result.label).toBeNull()
    expect(result.undefinedComponents).toEqual([
      "debtToIncome",
      "savingsRate",
      "budgetAdherence",
      "netWorthTrend",
    ])
  })
})
