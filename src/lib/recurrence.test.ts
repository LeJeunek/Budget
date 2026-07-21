import { describe, expect, it } from "vitest"

import {
  addUtcDays,
  addUtcMonths,
  computeNextRecurrenceDate,
  toUtcMidnight,
} from "./recurrence"

/** `"YYYY-MM-DD"` for a UTC `Date`, used purely to make assertions below
 * readable — mirrors the app's own established UTC-calendar-date-string
 * convention (see `recurrence.ts`'s and `investments/server/service.ts`'s
 * `toIsoDateString` helpers) without needing to import either module's
 * private, unexported version of it. */
function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

describe("toUtcMidnight", () => {
  it("strips the time-of-day component, keeping the UTC calendar date", () => {
    const result = toUtcMidnight(new Date(Date.UTC(2026, 5, 15, 13, 45, 30)))
    expect(result.toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })
})

describe("addUtcDays", () => {
  it("adds a positive day count, rolling over a month boundary", () => {
    expect(iso(addUtcDays(new Date(Date.UTC(2026, 0, 30)), 3))).toBe("2026-02-02")
  })

  it("supports a negative day count", () => {
    expect(iso(addUtcDays(new Date(Date.UTC(2026, 0, 5)), -10))).toBe("2025-12-26")
  })
})

describe("addUtcMonths", () => {
  it("clamps Jan 31 into Feb 28 in a non-leap year", () => {
    expect(iso(addUtcMonths(new Date(Date.UTC(2026, 0, 31)), 1))).toBe("2026-02-28")
  })

  it("clamps Jan 31 into Feb 29 in a leap year", () => {
    expect(iso(addUtcMonths(new Date(Date.UTC(2028, 0, 31)), 1))).toBe("2028-02-29")
  })

  it("rolls over into the next year", () => {
    expect(iso(addUtcMonths(new Date(Date.UTC(2026, 11, 15)), 1))).toBe("2027-01-15")
  })

  it("does not clamp when the target month has enough days", () => {
    // May (31 days) -> August (31 days): no overflow, day is preserved as-is.
    expect(iso(addUtcMonths(new Date(Date.UTC(2026, 4, 31)), 3))).toBe("2026-08-31")
  })
})

describe("computeNextRecurrenceDate", () => {
  const anchor = new Date(Date.UTC(2026, 0, 1)) // 2026-01-01 (Thursday)

  it("WEEKLY adds exactly 7 days", () => {
    expect(iso(computeNextRecurrenceDate(anchor, "WEEKLY"))).toBe("2026-01-08")
  })

  it("BIWEEKLY adds exactly 14 days", () => {
    expect(iso(computeNextRecurrenceDate(anchor, "BIWEEKLY"))).toBe("2026-01-15")
  })

  it("MONTHLY adds one calendar month", () => {
    expect(iso(computeNextRecurrenceDate(anchor, "MONTHLY"))).toBe("2026-02-01")
  })

  it("MONTHLY anchored on the 31st clamps into a 28-day February", () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31))
    expect(iso(computeNextRecurrenceDate(jan31, "MONTHLY"))).toBe("2026-02-28")
  })

  it("MONTHLY anchored on the 31st clamps into a 29-day (leap-year) February", () => {
    const jan31LeapYear = new Date(Date.UTC(2028, 0, 31))
    expect(iso(computeNextRecurrenceDate(jan31LeapYear, "MONTHLY"))).toBe("2028-02-29")
  })

  it("QUARTERLY adds three calendar months, clamping a 30-day anchor into a shorter month", () => {
    // Nov 30 (30-day month) + 3 months lands in February, which has fewer
    // days than 30 in either a leap or non-leap year — this must clamp to
    // Feb's actual last day, not overflow into March.
    const nov30 = new Date(Date.UTC(2025, 10, 30))
    expect(iso(computeNextRecurrenceDate(nov30, "QUARTERLY"))).toBe("2026-02-28")
  })

  it("ANNUALLY adds twelve calendar months, clamping a leap-day anchor into a non-leap year", () => {
    const feb29LeapYear = new Date(Date.UTC(2028, 1, 29))
    expect(iso(computeNextRecurrenceDate(feb29LeapYear, "ANNUALLY"))).toBe("2029-02-28")
  })

  it("ANNUALLY on a non-leap-day anchor simply preserves month and day", () => {
    const mar15 = new Date(Date.UTC(2026, 2, 15))
    expect(iso(computeNextRecurrenceDate(mar15, "ANNUALLY"))).toBe("2027-03-15")
  })

  it("throws a descriptive error for an unsupported schedule value (exhaustiveness guard)", () => {
    // Simulates a caller bypassing the type system (e.g. a value that slipped
    // through from an untrusted source) — this must fail loudly rather than
    // silently generating no further occurrences.
    expect(() =>
      computeNextRecurrenceDate(anchor, "IRREGULAR" as unknown as Parameters<
        typeof computeNextRecurrenceDate
      >[1]),
    ).toThrow(/Unsupported recurrence schedule/)
  })
})
