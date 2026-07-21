import { describe, expect, it } from "vitest"

import { compareSnowballAndAvalanche, computeAmortization } from "./payoff-math"
import type { PayoffDebtInput } from "./types"

// Every date-bearing assertion below pins `now` to a fixed UTC instant
// (2026-01-01) rather than letting `computeAmortization`/
// `compareSnowballAndAvalanche` default to `new Date()`, so these tests are
// deterministic regardless of when they run (matching `utils.test.ts`'s own
// "no hidden clock dependency" convention for `formatDate`).
const NOW = new Date(Date.UTC(2026, 0, 1))

describe("computeAmortization", () => {
  it("matches a hand-computed month-by-month projection for a normal amortizing debt", () => {
    // $1,200 balance, 12% APR (1%/month), $200/month minimum payment.
    // Hand-computed schedule (verified against the implementation):
    //   m1: interest 12.00      -> remaining 1012.00
    //   m2: interest 10.12      -> remaining  822.12
    //   m3: interest  8.2212    -> remaining  630.3412
    //   m4: interest  6.303412  -> remaining  436.644612
    //   m5: interest  4.36644612 -> remaining 241.01105812
    //   m6: interest  2.4101105812 -> remaining 43.4211687012
    //   m7: interest  0.434211687012 -> final payment 43.855380388212, remaining 0
    // Total interest = 43.855380388212, rounded to whole cents = 43.86.
    const result = computeAmortization(
      { id: "d1", balance: 1200, interestRate: 12, minimumPayment: 200 },
      NOW,
    )

    expect(result).toEqual({
      payoffDate: "2026-08",
      totalInterestRemaining: 43.86,
      monthsToPayoff: 7,
      isNegativeAmortization: false,
    })
  })

  it("amortizes correctly at a 0% interest rate (balance reduces by the payment alone)", () => {
    // No interest accrues at all, so $1,000 / $100 per month = exactly 10
    // months with $0 total interest — this exercises the "multiply by 0
    // rather than divide" 0%-rate path with no special-casing.
    const result = computeAmortization(
      { id: "d2", balance: 1000, interestRate: 0, minimumPayment: 100 },
      NOW,
    )

    expect(result).toEqual({
      payoffDate: "2026-11",
      totalInterestRemaining: 0,
      monthsToPayoff: 10,
      isNegativeAmortization: false,
    })
  })

  it("detects negative amortization when the minimum payment doesn't cover the first month's interest", () => {
    // $1,000 at 24% APR accrues $20.00 interest in month one; a $15 minimum
    // payment can never cover that (or any subsequent month's interest,
    // which only grows from here), so this must be flagged up front rather
    // than simulated.
    const result = computeAmortization(
      { id: "d3", balance: 1000, interestRate: 24, minimumPayment: 15 },
      NOW,
    )

    expect(result).toEqual({
      payoffDate: null,
      totalInterestRemaining: null,
      monthsToPayoff: null,
      isNegativeAmortization: true,
    })
  })

  it("treats a minimum payment exactly equal to the first month's interest as negative amortization", () => {
    // Boundary case for the `minimumPayment <= firstMonthInterest + EPSILON`
    // check: $1,000 at 24% APR accrues exactly $20.00 in month one, and a
    // $20 minimum payment leaves the balance unchanged forever.
    const result = computeAmortization(
      { id: "d4", balance: 1000, interestRate: 24, minimumPayment: 20 },
      NOW,
    )

    expect(result.isNegativeAmortization).toBe(true)
    expect(result.payoffDate).toBeNull()
  })

  it("amortizes (slowly) once the minimum payment clears the negative-amortization boundary", () => {
    // Just $0.01 above the previous test's exact-breakeven boundary — this
    // must NOT be flagged as negative amortization, confirming the boundary
    // check is a strict "<=", not an over-eager ">=".
    const result = computeAmortization(
      { id: "d5", balance: 1000, interestRate: 24, minimumPayment: 20.01 },
      NOW,
    )

    expect(result.isNegativeAmortization).toBe(false)
    expect(result.monthsToPayoff).toBeGreaterThan(0)
    expect(result.payoffDate).not.toBeNull()
  })

  it("returns a zero-month, zero-interest projection for an already-paid-off debt", () => {
    const result = computeAmortization(
      { id: "d6", balance: 0, interestRate: 10, minimumPayment: 50 },
      NOW,
    )

    expect(result).toEqual({
      payoffDate: "2026-01",
      totalInterestRemaining: 0,
      monthsToPayoff: 0,
      isNegativeAmortization: false,
    })
  })

  it("treats a negative balance the same as an already-paid-off debt", () => {
    // Defensive edge case — a balance that has overshot below $0 should
    // never be mistaken for an active debt in negative amortization.
    const result = computeAmortization(
      { id: "d7", balance: -5, interestRate: 10, minimumPayment: 50 },
      NOW,
    )

    expect(result.isNegativeAmortization).toBe(false)
    expect(result.monthsToPayoff).toBe(0)
  })
})

describe("compareSnowballAndAvalanche", () => {
  const threeDebts: PayoffDebtInput[] = [
    { id: "A", balance: 500, interestRate: 5, minimumPayment: 25 },
    { id: "B", balance: 2000, interestRate: 20, minimumPayment: 50 },
    { id: "C", balance: 1000, interestRate: 10, minimumPayment: 30 },
  ]

  it("produces byte-for-byte identical snowball and avalanche results at $0 extra payment", () => {
    const result = compareSnowballAndAvalanche(threeDebts, 0)

    expect(result.isIdentical).toBe(true)
    expect(result.snowball).toEqual(result.avalanche)
    // Each debt is independently amortized at its own minimum-payment pace,
    // so the actual chronological finish order (smallest balance/highest
    // rate happens to also finish first here) is the same for both.
    expect(result.snowball.payoffOrder).toEqual(["A", "C", "B"])
  })

  it("defaults to $0 extra payment when none is supplied", () => {
    const withDefault = compareSnowballAndAvalanche(threeDebts)
    const explicitZero = compareSnowballAndAvalanche(threeDebts, 0)

    expect(withDefault).toEqual(explicitZero)
  })

  it("diverges with a nonzero extra payment, with avalanche's total interest never exceeding snowball's", () => {
    const result = compareSnowballAndAvalanche(threeDebts, 200)

    expect(result.isIdentical).toBe(false)
    // Hand-verified via the actual simulation (both strategies reach $0
    // in the same 13 months here, but avalanche accrues less interest along
    // the way by targeting the highest-rate debt first):
    expect(result.snowball).toEqual({
      monthsToDebtFree: 13,
      totalInterestPaid: 362.49,
      payoffOrder: ["A", "C", "B"],
    })
    expect(result.avalanche).toEqual({
      monthsToDebtFree: 13,
      totalInterestPaid: 263.18,
      payoffOrder: ["B", "C", "A"],
    })
    expect(result.avalanche.totalInterestPaid).toBeLessThanOrEqual(
      result.snowball.totalInterestPaid,
    )
  })

  it("orders snowball by smallest current balance first", () => {
    // With a nonzero extra payment, the front-of-order debt is the one
    // targeted first — snowball's is the smallest balance ($500, debt A).
    const result = compareSnowballAndAvalanche(threeDebts, 200)
    expect(result.snowball.payoffOrder[0]).toBe("A")
  })

  it("orders avalanche by highest interest rate first", () => {
    // Avalanche's front-of-order debt is the highest rate (20%, debt B).
    const result = compareSnowballAndAvalanche(threeDebts, 200)
    expect(result.avalanche.payoffOrder[0]).toBe("B")
  })

  it("treats a negative extra payment as $0 (normalized, never subtracted)", () => {
    const negative = compareSnowballAndAvalanche(threeDebts, -50)
    const zero = compareSnowballAndAvalanche(threeDebts, 0)

    expect(negative).toEqual(zero)
  })

  it("is identical with only one active debt regardless of extra payment", () => {
    const oneDebt: PayoffDebtInput[] = [
      { id: "solo", balance: 1000, interestRate: 15, minimumPayment: 40 },
    ]
    const result = compareSnowballAndAvalanche(oneDebt, 300)

    expect(result.isIdentical).toBe(true)
    expect(result.snowball).toEqual(result.avalanche)
  })

  it("is identical with zero active debts", () => {
    const result = compareSnowballAndAvalanche([], 300)

    expect(result.isIdentical).toBe(true)
    expect(result.snowball).toEqual({
      monthsToDebtFree: 0,
      totalInterestPaid: 0,
      payoffOrder: [],
    })
    expect(result.avalanche).toEqual(result.snowball)
  })

  it("excludes already-paid-off debts (balance <= 0) from the comparison", () => {
    const withPaidOff: PayoffDebtInput[] = [
      ...threeDebts,
      { id: "paid-off", balance: 0, interestRate: 9, minimumPayment: 10 },
    ]

    const withPaidOffResult = compareSnowballAndAvalanche(withPaidOff, 200)
    const withoutPaidOffResult = compareSnowballAndAvalanche(threeDebts, 200)

    expect(withPaidOffResult).toEqual(withoutPaidOffResult)
  })
})
