import { describe, expect, it } from "vitest"

import { detectSubscriptionCandidates } from "./subscription-detection"
import type { SubscriptionDetectionTransaction } from "./subscription-detection"

// Fixture-driven coverage of the pure algorithm, matching
// `features/debt/payoff-math.test.ts`'s "no database access" testability
// bar. Every scenario required by docs/product/analytics.md's Definition of
// Done is covered here: the 3-occurrence minimum, a price change treated as
// a continuation (not a new subscription), and the Active/Possibly
// Cancelled status transition — plus the two additional fixture cases this
// dispatch's task explicitly calls out (a wildly-inconsistent-amount
// merchant, and a 2-occurrence merchant).
//
// `now` is always pinned to a fixed UTC instant, never `new Date()`, so
// these tests are deterministic regardless of when they run (same
// convention as `payoff-math.test.ts`'s own `NOW` constant).
const NOW = new Date(Date.UTC(2026, 6, 20)) // 2026-07-20

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function txn(merchant: string, amount: number, date: Date): SubscriptionDetectionTransaction {
  return { merchant, amount, date }
}

describe("detectSubscriptionCandidates", () => {
  it("detects a genuine recurring subscription across 3+ months at a consistent amount", () => {
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("NETFLIX.COM", 15.49, utcDate(2026, 3, 20)),
      txn("Netflix", 15.49, utcDate(2026, 4, 20)),
      txn("Netflix", 15.49, utcDate(2026, 5, 20)),
      txn("Netflix", 15.49, utcDate(2026, 6, 20)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      normalizedMerchantName: "netflix",
      displayName: "Netflix",
      averageAmount: 15.49,
      detectedInterval: "MONTHLY",
      firstDetectedDate: "2026-04-20",
      mostRecentChargeDate: "2026-07-20",
      status: "ACTIVE",
    })
    // MONTHLY occurrencesPerYear = 12.
    expect(candidates[0].estimatedAnnualizedCost).toBeCloseTo(15.49 * 12, 2)
  })

  it("does NOT flag a merchant with only 2 occurrences (the 3-occurrence minimum)", () => {
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Spotify", 11.99, utcDate(2026, 5, 20)),
      txn("Spotify", 11.99, utcDate(2026, 6, 20)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates).toHaveLength(0)
  })

  it("does NOT flag a merchant with wildly inconsistent amounts at a coincidentally consistent cadence", () => {
    // Same-day-of-month cadence (a plausible "I happen to shop there around
    // payday" habit), but amounts vary far beyond the +/-10% tolerance band
    // pairwise and cannot be explained by a single price change — this must
    // not false-positive as a subscription (analytics.md's "a one-off repeat
    // purchase from the same store... must not falsely trigger detection").
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Corner Grocery", 22.14, utcDate(2026, 3, 20)),
      txn("Corner Grocery", 88.5, utcDate(2026, 4, 20)),
      txn("Corner Grocery", 34.02, utcDate(2026, 5, 20)),
      txn("Corner Grocery", 121.75, utcDate(2026, 6, 20)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates).toHaveLength(0)
  })

  it("treats a price increase that then stays consistent as one continuing subscription, not two", () => {
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Streamflix", 9.99, utcDate(2026, 1, 20)),
      txn("Streamflix", 9.99, utcDate(2026, 2, 20)),
      txn("Streamflix", 9.99, utcDate(2026, 3, 20)),
      txn("Streamflix", 12.99, utcDate(2026, 4, 20)),
      txn("Streamflix", 12.99, utcDate(2026, 5, 20)),
      txn("Streamflix", 12.99, utcDate(2026, 6, 20)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    // Exactly one candidate (not two), spanning the *entire* 6-charge run
    // (firstDetectedDate is the very first $9.99 charge), reported at its
    // current ($12.99) price.
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      normalizedMerchantName: "streamflix",
      averageAmount: 12.99,
      detectedInterval: "MONTHLY",
      firstDetectedDate: "2026-02-20",
      mostRecentChargeDate: "2026-07-20",
      status: "ACTIVE",
    })
  })

  it("classifies a subscription that stopped appearing recently as Possibly Cancelled", () => {
    // Monthly cadence, last charge 2026-04-20 — 91 days before `NOW`
    // (2026-07-20), well past MONTHLY's 1.5x-of-30-days (45 day) grace
    // window, with no charge since.
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Gym Membership", 40, utcDate(2026, 1, 20)),
      txn("Gym Membership", 40, utcDate(2026, 2, 20)),
      txn("Gym Membership", 40, utcDate(2026, 3, 20)),
      txn("Gym Membership", 40, utcDate(2026, 4, 20)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe("POSSIBLY_CANCELLED")
  })

  it("classifies an ongoing subscription (charge within the grace window) as Active", () => {
    // Last charge 2026-07-05 — 15 days before `NOW`, well inside MONTHLY's
    // 45-day grace window.
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Gym Membership", 40, utcDate(2026, 4, 5)),
      txn("Gym Membership", 40, utcDate(2026, 5, 5)),
      txn("Gym Membership", 40, utcDate(2026, 6, 5)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].status).toBe("ACTIVE")
  })

  it("returns an empty array (not an error) when given no transactions at all", () => {
    expect(detectSubscriptionCandidates([], NOW)).toEqual([])
  })

  it("detects independent subscriptions for two different merchants in the same batch", () => {
    const transactions: SubscriptionDetectionTransaction[] = [
      txn("Netflix", 15.49, utcDate(2026, 4, 1)),
      txn("Netflix", 15.49, utcDate(2026, 5, 1)),
      txn("Netflix", 15.49, utcDate(2026, 6, 1)),
      txn("Spotify", 11.99, utcDate(2026, 4, 10)),
      txn("Spotify", 11.99, utcDate(2026, 5, 10)),
      txn("Spotify", 11.99, utcDate(2026, 6, 10)),
    ]

    const candidates = detectSubscriptionCandidates(transactions, NOW)

    expect(candidates.map((c) => c.normalizedMerchantName).sort()).toEqual(["netflix", "spotify"])
  })
})
