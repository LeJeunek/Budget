import { describe, expect, it } from "vitest"

import {
  resolveFlexibleReportPeriod,
  resolveMonthlyReportPeriod,
  resolveReportPeriod,
  resolveYearlyReportPeriod,
  toReportPeriodView,
} from "./period"

// Fixture-driven coverage of Reports' own period resolution — mirrors
// `features/analytics/server/period.test.ts`'s "pin `now`, test the pure
// boundary math directly" precedent. Covers reports.md's own edge cases:
// month-to-date/year-to-date labeling, a future period being rejected
// outright rather than silently generating an empty report, and the custom
// date-range extension.

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

const NOW = utcDate(2026, 6, 20) // 2026-07-20

describe("resolveMonthlyReportPeriod", () => {
  it("resolves a fully past month to its real first/last day, not partial", () => {
    const result = resolveMonthlyReportPeriod("2026-05", NOW)
    expect(result).toEqual({
      status: "ok",
      period: {
        start: utcDate(2026, 4, 1),
        end: utcDate(2026, 4, 31),
        label: "May 2026",
        isPartial: false,
      },
    })
  })

  it("labels the current month as partial and clamps its end to today", () => {
    const result = resolveMonthlyReportPeriod("2026-07", NOW)
    expect(result).toEqual({
      status: "ok",
      period: {
        start: utcDate(2026, 6, 1),
        end: NOW,
        label: "July 2026",
        isPartial: true,
      },
    })
  })

  it("rejects a future month as not-yet-started, per reports.md's edge case", () => {
    expect(resolveMonthlyReportPeriod("2026-08", NOW)).toEqual({ status: "future" })
  })
})

describe("resolveYearlyReportPeriod", () => {
  it("resolves a fully past year to Jan 1 - Dec 31, not partial", () => {
    const result = resolveYearlyReportPeriod(2025, NOW)
    expect(result).toEqual({
      status: "ok",
      period: {
        start: utcDate(2025, 0, 1),
        end: utcDate(2025, 11, 31),
        label: "2025",
        isPartial: false,
      },
    })
  })

  it("labels the current year as partial (year to date), clamped to today", () => {
    const result = resolveYearlyReportPeriod(2026, NOW)
    expect(result).toEqual({
      status: "ok",
      period: { start: utcDate(2026, 0, 1), end: NOW, label: "2026", isPartial: true },
    })
  })

  it("rejects a future year as not-yet-started", () => {
    expect(resolveYearlyReportPeriod(2027, NOW)).toEqual({ status: "future" })
  })
})

describe("resolveFlexibleReportPeriod", () => {
  it("resolves a preset by delegating to Analytics' resolveReportingPeriodRange verbatim", () => {
    const result = resolveFlexibleReportPeriod({ kind: "PRESET", preset: "THIS_YEAR" }, NOW)
    expect(result).toEqual({
      status: "ok",
      period: {
        start: utcDate(2026, 0, 1),
        end: utcDate(2026, 11, 31),
        label: "This Year",
        isPartial: false,
      },
    })
  })

  it("marks YEAR_TO_DATE as partial, unlike every other preset", () => {
    const result = resolveFlexibleReportPeriod({ kind: "PRESET", preset: "YEAR_TO_DATE" }, NOW)
    expect(result.status).toBe("ok")
    expect(result.status === "ok" && result.period.isPartial).toBe(true)
  })

  it("resolves a custom range with both bounds in the past", () => {
    const result = resolveFlexibleReportPeriod(
      { kind: "CUSTOM", start: utcDate(2026, 0, 15), end: utcDate(2026, 2, 20) },
      NOW,
    )
    expect(result).toEqual({
      status: "ok",
      period: {
        start: utcDate(2026, 0, 15),
        end: utcDate(2026, 2, 20),
        label: "Jan 15, 2026 – Mar 20, 2026",
        isPartial: false,
      },
    })
  })

  it("clamps a custom range's end to today when it extends into the future", () => {
    const result = resolveFlexibleReportPeriod(
      { kind: "CUSTOM", start: utcDate(2026, 6, 1), end: utcDate(2026, 11, 31) },
      NOW,
    )
    expect(result.status).toBe("ok")
    expect(result.status === "ok" && result.period.end).toEqual(NOW)
  })

  it("rejects a custom range that hasn't started yet", () => {
    const result = resolveFlexibleReportPeriod(
      { kind: "CUSTOM", start: utcDate(2026, 7, 1), end: utcDate(2026, 8, 1) },
      NOW,
    )
    expect(result).toEqual({ status: "future" })
  })
})

describe("resolveReportPeriod (dispatch)", () => {
  it("dispatches MONTHLY to resolveMonthlyReportPeriod", () => {
    expect(resolveReportPeriod({ type: "MONTHLY", month: "2026-05" }, NOW)).toEqual(
      resolveMonthlyReportPeriod("2026-05", NOW),
    )
  })

  it("dispatches YEARLY and TAX_SUMMARY to the identical yearly resolver", () => {
    expect(resolveReportPeriod({ type: "YEARLY", year: 2025 }, NOW)).toEqual(
      resolveYearlyReportPeriod(2025, NOW),
    )
    expect(resolveReportPeriod({ type: "TAX_SUMMARY", year: 2025 }, NOW)).toEqual(
      resolveYearlyReportPeriod(2025, NOW),
    )
  })

  it("dispatches INCOME/EXPENSE/CASH_FLOW to the flexible resolver", () => {
    const period = { kind: "PRESET" as const, preset: "ALL_TIME" as const }
    expect(resolveReportPeriod({ type: "INCOME", period }, NOW)).toEqual(
      resolveFlexibleReportPeriod(period, NOW),
    )
  })
})

describe("toReportPeriodView", () => {
  it("formats a concrete start/end as yyyy-MM-dd strings", () => {
    expect(
      toReportPeriodView({
        start: utcDate(2026, 0, 1),
        end: utcDate(2026, 11, 31),
        label: "2026",
        isPartial: false,
      }),
    ).toEqual({ start: "2026-01-01", end: "2026-12-31", label: "2026", isPartial: false })
  })

  it("represents an open-ended (All Time, no activity yet) start as null", () => {
    expect(
      toReportPeriodView({ start: null, end: NOW, label: "All Time", isPartial: false }),
    ).toEqual({ start: null, end: "2026-07-20", label: "All Time", isPartial: false })
  })
})
