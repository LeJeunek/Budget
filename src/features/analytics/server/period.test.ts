import { describe, expect, it } from "vitest"

import {
  enumerateMonthKeys,
  formatDateKey,
  formatMonthKey,
  resolveMonthKeyRange,
  resolveReportingPeriodRange,
} from "./period"

// Fixture-driven coverage of `period.ts`'s month/year-boundary math — the
// shared resolver docs/product/analytics.md's Definition of Done names
// explicitly ("Yearly Spending, Category Trends, Budget vs. Actual, Income
// Growth, Income Sources, and Savings Growth are all covered by tests
// verifying correct aggregation across month/year boundaries"). This module
// is already pure (no `@/lib/db` import, no `getCurrentUser()` call), so no
// extraction is needed — every exported function is tested directly against
// fixture `Date`s, matching `net-worth-history.test.ts`'s
// `resolveRangeStart` precedent for a shared, injectable-`now` boundary
// resolver.
//
// `now` is always pinned to a fixed UTC instant, never `new Date()`, so these
// tests are deterministic regardless of when they run (same convention as
// `payoff-math.test.ts`'s own `NOW` constant).

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

describe("resolveReportingPeriodRange", () => {
  const NOW = new Date(Date.UTC(2026, 6, 20)) // 2026-07-20

  it("THIS_YEAR resolves to the full current calendar year (Jan 1 - Dec 31), not clamped to today", () => {
    expect(resolveReportingPeriodRange("THIS_YEAR", NOW)).toEqual({
      start: utcDate(2026, 0, 1),
      end: utcDate(2026, 11, 31),
    })
  })

  it("YEAR_TO_DATE resolves to Jan 1 through today, clamped (unlike THIS_YEAR)", () => {
    expect(resolveReportingPeriodRange("YEAR_TO_DATE", NOW)).toEqual({
      start: utcDate(2026, 0, 1),
      end: utcDate(2026, 6, 20),
    })
  })

  it("LAST_12_MONTHS spans the 1st of the month 11 months back through today", () => {
    // 11 months before 2026-07 is 2025-08.
    expect(resolveReportingPeriodRange("LAST_12_MONTHS", NOW)).toEqual({
      start: utcDate(2025, 7, 1),
      end: utcDate(2026, 6, 20),
    })
  })

  it("LAST_12_MONTHS correctly crosses a year boundary when resolved in an early-year month", () => {
    // Resolved in February 2026: 11 months back is March 2025 (still crosses
    // the Dec 31 -> Jan 1 boundary since the window spans two calendar years).
    const earlyYearNow = utcDate(2026, 1, 15) // 2026-02-15
    expect(resolveReportingPeriodRange("LAST_12_MONTHS", earlyYearNow)).toEqual({
      start: utcDate(2025, 2, 1),
      end: utcDate(2026, 1, 15),
    })
  })

  it("LAST_12_MONTHS resolved exactly in January reaches back into the prior February", () => {
    // The sharpest year-boundary case: "now" is itself in January, so the
    // window's start month (11 months back) is February of the prior year —
    // relies on JS's `Date.UTC` month-rollover rather than hand-rolled
    // year-decrement arithmetic.
    const january = utcDate(2026, 0, 10) // 2026-01-10
    expect(resolveReportingPeriodRange("LAST_12_MONTHS", january)).toEqual({
      start: utcDate(2025, 1, 1),
      end: utcDate(2026, 0, 10),
    })
  })

  it("ALL_TIME returns an open-ended (null) start and today as end", () => {
    expect(resolveReportingPeriodRange("ALL_TIME", NOW)).toEqual({
      start: null,
      end: utcDate(2026, 6, 20),
    })
  })

  it("truncates a non-midnight 'now' to the UTC calendar date before resolving any period", () => {
    const midday = new Date(Date.UTC(2026, 6, 20, 18, 45, 0))
    expect(resolveReportingPeriodRange("YEAR_TO_DATE", midday)).toEqual(
      resolveReportingPeriodRange("YEAR_TO_DATE", NOW),
    )
  })

  it("throws for an unhandled period value (exhaustiveness guard)", () => {
    expect(() =>
      resolveReportingPeriodRange("NOT_A_REAL_PERIOD" as never, NOW),
    ).toThrow(/Unhandled reporting period/)
  })
})

describe("formatMonthKey", () => {
  it("formats a mid-year month with zero-padding", () => {
    expect(formatMonthKey(utcDate(2026, 2, 15))).toBe("2026-03")
  })

  it("zero-pads a January month key (the one single-digit-month case)", () => {
    expect(formatMonthKey(utcDate(2026, 0, 1))).toBe("2026-01")
  })

  it("formats December without rolling into the next year", () => {
    expect(formatMonthKey(utcDate(2025, 11, 31))).toBe("2025-12")
  })
})

describe("formatDateKey", () => {
  it("formats a UTC date as yyyy-MM-dd with zero-padding", () => {
    expect(formatDateKey(utcDate(2026, 0, 5))).toBe("2026-01-05")
  })

  it("formats the last day of the year correctly", () => {
    expect(formatDateKey(utcDate(2025, 11, 31))).toBe("2025-12-31")
  })
})

describe("enumerateMonthKeys", () => {
  it("returns a single key when start and end fall in the same month", () => {
    expect(enumerateMonthKeys(utcDate(2026, 2, 1), utcDate(2026, 2, 28))).toEqual(["2026-03"])
  })

  it("enumerates every month within a single calendar year, inclusive of both ends", () => {
    expect(enumerateMonthKeys(utcDate(2026, 0, 1), utcDate(2026, 3, 30))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ])
  })

  it("crosses a Dec 31 -> Jan 1 year boundary correctly, in chronological order", () => {
    expect(enumerateMonthKeys(utcDate(2025, 10, 1), utcDate(2026, 1, 28))).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })

  it("only looks at the month component of start/end, ignoring the day-of-month", () => {
    // start is the 15th, end is the 3rd — both mid-month, still enumerates
    // the full month range unaffected by the specific day.
    expect(enumerateMonthKeys(utcDate(2026, 4, 15), utcDate(2026, 5, 3))).toEqual([
      "2026-05",
      "2026-06",
    ])
  })

  it("returns a single-element array when start and end are the exact same day", () => {
    expect(enumerateMonthKeys(utcDate(2026, 6, 20), utcDate(2026, 6, 20))).toEqual(["2026-07"])
  })
})

describe("resolveMonthKeyRange", () => {
  const NOW = new Date(Date.UTC(2026, 6, 20)) // 2026-07-20

  it("resolves a fully past month to its real first/last day", () => {
    expect(resolveMonthKeyRange("2026-05", NOW)).toEqual({
      start: utcDate(2026, 4, 1),
      end: utcDate(2026, 4, 31),
    })
  })

  it("clamps the current, still-in-progress month's end to 'now' rather than the month's real last day", () => {
    expect(resolveMonthKeyRange("2026-07", NOW)).toEqual({
      start: utcDate(2026, 6, 1),
      end: utcDate(2026, 6, 20),
    })
  })

  it("correctly resolves February in a leap year (29 days)", () => {
    expect(resolveMonthKeyRange("2024-02", NOW)).toEqual({
      start: utcDate(2024, 1, 1),
      end: utcDate(2024, 1, 29),
    })
  })

  it("correctly resolves February in a non-leap year (28 days)", () => {
    expect(resolveMonthKeyRange("2026-02", NOW)).toEqual({
      start: utcDate(2026, 1, 1),
      end: utcDate(2026, 1, 28),
    })
  })

  it("resolves a December month key without rolling its last day into the next January", () => {
    expect(resolveMonthKeyRange("2025-12", NOW)).toEqual({
      start: utcDate(2025, 11, 1),
      end: utcDate(2025, 11, 31),
    })
  })

  it("never clamps a future month's end (would only happen for a month that hasn't started, matching the caller's own bounded-loop contract)", () => {
    // Defensive fixture only: real callers never enumerate a future month,
    // but the function itself is not the one that enforces that boundary —
    // it simply picks the earlier of the month's real last day and `now`.
    expect(resolveMonthKeyRange("2026-08", NOW)).toEqual({
      start: utcDate(2026, 7, 1),
      end: NOW,
    })
  })
})
