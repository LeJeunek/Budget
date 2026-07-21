import { describe, expect, it } from "vitest"

import { resolveRangeStart, thinRows } from "./net-worth-history"
import type { SnapshotRow } from "./net-worth-history"

// This file deliberately never imports `@/lib/db` (or anything that reaches
// it): `resolveRangeStart` and `thinRows` are the two calculation-only
// portions of this module (date-range boundary math, legibility thinning)
// that are pure functions of plain inputs, per the same "extract the pure
// calculation, unit-test it without a database" precedent already
// established by `features/investments/server/service.test.ts` and
// `features/debt/payoff-math.test.ts`. `getNetWorthHistory`/
// `resolveDefaultRange` themselves always query the database and are out of
// scope for these unit tests, per that same precedent.
//
// Covers docs/product/net-worth-history.md's Definition of Done: "Date-range
// boundary calculations (30/90/365-day windows, computed in UTC ...) are
// covered by tests, not just eyeballed."

// Pinned "now" so every boundary assertion below is deterministic regardless
// of when this suite runs, matching `payoff-math.test.ts`'s own convention.
const NOW = new Date(Date.UTC(2026, 6, 21)) // 2026-07-21T00:00:00.000Z

describe("resolveRangeStart", () => {
  it("returns null for 'all' — no lower bound", () => {
    expect(resolveRangeStart("all", NOW)).toBeNull()
  })

  it("resolves '30d' to a 30-calendar-day window inclusive of today", () => {
    const start = resolveRangeStart("30d", NOW)
    // 2026-07-21 minus 29 days = 2026-06-22 (30 days total, inclusive).
    expect(start).toEqual(new Date(Date.UTC(2026, 5, 22)))
  })

  it("resolves '90d' to a 90-calendar-day window inclusive of today", () => {
    const start = resolveRangeStart("90d", NOW)
    // 2026-07-21 minus 89 days = 2026-04-23.
    expect(start).toEqual(new Date(Date.UTC(2026, 3, 23)))
  })

  it("resolves '1y' to a 365-calendar-day window inclusive of today", () => {
    const start = resolveRangeStart("1y", NOW)
    // 2026-07-21 minus 364 days = 2025-07-22.
    expect(start).toEqual(new Date(Date.UTC(2025, 6, 22)))
  })

  it("truncates a non-midnight 'now' to the UTC calendar date before subtracting", () => {
    const midday = new Date(Date.UTC(2026, 6, 21, 15, 30, 0))
    expect(resolveRangeStart("30d", midday)).toEqual(
      resolveRangeStart("30d", NOW),
    )
  })

  it("correctly crosses a year boundary (e.g. '90d' resolved in early January)", () => {
    const earlyJanuary = new Date(Date.UTC(2026, 0, 15)) // 2026-01-15
    const start = resolveRangeStart("90d", earlyJanuary)
    // 2026-01-15 minus 89 days = 2025-10-18.
    expect(start).toEqual(new Date(Date.UTC(2025, 9, 18)))
  })
})

/** Builds a minimal fixture `SnapshotRow` — every test below only cares
 * about `capturedDate` (thinning's own bucketing input) and a distinguishing
 * `totalNetWorth` value, so the other two Decimal-like fields are fixed at a
 * valid-but-unused $0. */
function buildRow(capturedDate: Date, netWorth: number): SnapshotRow {
  return {
    capturedDate,
    totalAccountBalance: { toNumber: () => 0 },
    totalUnlinkedDebtLiability: { toNumber: () => 0 },
    totalNetWorth: { toNumber: () => netWorth },
  }
}

function daysFrom(start: Date, offset: number): Date {
  return new Date(start.getTime() + offset * 24 * 60 * 60 * 1000)
}

describe("thinRows", () => {
  const start = new Date(Date.UTC(2026, 0, 1))

  it("returns rows unchanged when at or under the legibility threshold", () => {
    const rows = Array.from({ length: 120 }, (_, i) => buildRow(daysFrom(start, i), i))
    expect(thinRows(rows)).toEqual(rows)
  })

  it("thins to at most 120 points when the threshold is exceeded", () => {
    const rows = Array.from({ length: 365 }, (_, i) => buildRow(daysFrom(start, i), i))
    const thinned = thinRows(rows)

    expect(thinned.length).toBeLessThanOrEqual(120)
    expect(thinned.length).toBeGreaterThan(0)
  })

  it("keeps the last (most recent) row within each bucket, never a synthetic point", () => {
    const rows = Array.from({ length: 365 }, (_, i) => buildRow(daysFrom(start, i), i))
    const thinned = thinRows(rows)

    // Every surviving row must be one of the exact fixture rows (same
    // object identity), never an average/interpolation — and the very last
    // input row (the most recent snapshot) must always survive, since it is
    // the last row processed and always wins its own bucket.
    for (const row of thinned) {
      expect(rows).toContain(row)
    }
    expect(thinned[thinned.length - 1]).toBe(rows[rows.length - 1])
  })

  it("preserves ascending date order after thinning", () => {
    const rows = Array.from({ length: 400 }, (_, i) => buildRow(daysFrom(start, i), i))
    const thinned = thinRows(rows)

    for (let i = 1; i < thinned.length; i++) {
      expect(thinned[i].capturedDate.getTime()).toBeGreaterThan(
        thinned[i - 1].capturedDate.getTime(),
      )
    }
  })

  it("handles a single row (no thinning needed)", () => {
    const rows = [buildRow(start, 100)]
    expect(thinRows(rows)).toEqual(rows)
  })
})
