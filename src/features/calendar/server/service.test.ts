import { describe, expect, it, vi } from "vitest"

import type { CalendarDay } from "@/features/bills/types"
import type { PaydayCalendarDay } from "@/features/recurring-income/types"

// `calendar.service.getCalendarMonth` is PURE COMPOSITION over
// `bills.service.getCalendarMonth`/`recurringIncome.service.
// getIncomeCalendarMonth` (docs/architecture/phase-4c-technical-design.md
// §2.2) — mocking those two already-exported functions directly lets this
// suite exercise the zip/day-matching/reset-marker logic that actually
// belongs to this file, deterministically and without a database, mirroring
// this codebase's standing "extract the pure calculation, unit-test it
// without a database" precedent (`net-worth-history.test.ts`,
// `monthly-summary.test.ts`) — just applied here via dependency mocking
// rather than a separately-extracted pure function, since this file's own
// entire body *is* the thing worth testing.
const getBillsCalendarMonth = vi.fn<
  (userId: string, month: string) => Promise<CalendarDay[]>
>()
const getIncomeCalendarMonth = vi.fn<
  (userId: string, month: string) => Promise<PaydayCalendarDay[]>
>()

vi.mock("@/features/bills/server/service", () => ({
  getCalendarMonth: (userId: string, month: string) => getBillsCalendarMonth(userId, month),
}))
vi.mock("@/features/recurring-income/server/service", () => ({
  getIncomeCalendarMonth: (userId: string, month: string) =>
    getIncomeCalendarMonth(userId, month),
}))

import { getCalendarMonth } from "./service"

const USER_ID = "user-1"
const MONTH = "2026-06"

/** Builds a minimal, zero-occurrence `CalendarDay[]` for every day of June
 * 2026 (30 days) — the fixture shape `bills.service.getCalendarMonth` itself
 * always returns (one entry per calendar day, even empty ones). */
function buildEmptyBillDays(): CalendarDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    day: `2026-06-${String(i + 1).padStart(2, "0")}`,
    occurrences: [],
  }))
}

/** Builds a minimal, zero-payday `PaydayCalendarDay[]` for every day of June
 * 2026 — mirrors `buildEmptyBillDays` for the Recurring Income side. */
function buildEmptyPaydayDays(): PaydayCalendarDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    day: `2026-06-${String(i + 1).padStart(2, "0")}`,
    paydays: [],
  }))
}

describe("calendar.service.getCalendarMonth", () => {
  it("calls both composed sources with the same userId and month", async () => {
    getBillsCalendarMonth.mockResolvedValueOnce(buildEmptyBillDays())
    getIncomeCalendarMonth.mockResolvedValueOnce(buildEmptyPaydayDays())

    await getCalendarMonth(USER_ID, MONTH)

    expect(getBillsCalendarMonth).toHaveBeenCalledWith(USER_ID, MONTH)
    expect(getIncomeCalendarMonth).toHaveBeenCalledWith(USER_ID, MONTH)
  })

  it("returns one CalendarMonthDay per day, echoing bills/paydays for each matching day key", async () => {
    const billDays = buildEmptyBillDays()
    billDays[14] = {
      day: "2026-06-15",
      occurrences: [
        { billId: "b1", billOccurrenceId: "bo1", billName: "Rent", amount: 1500, status: "UPCOMING" },
      ],
    }

    const paydayDays = buildEmptyPaydayDays()
    paydayDays[14] = {
      day: "2026-06-15",
      paydays: [{ streamId: "s1", streamName: "Salary", amount: 3000, status: "UPCOMING" }],
    }

    getBillsCalendarMonth.mockResolvedValueOnce(billDays)
    getIncomeCalendarMonth.mockResolvedValueOnce(paydayDays)

    const result = await getCalendarMonth(USER_ID, MONTH)

    expect(result.days).toHaveLength(30)
    const day15 = result.days.find((d) => d.day === "2026-06-15")
    expect(day15?.bills).toEqual(billDays[14].occurrences)
    expect(day15?.paydays).toEqual(paydayDays[14].paydays)

    // Every other day carries no bills/paydays.
    const day1 = result.days.find((d) => d.day === "2026-06-01")
    expect(day1?.bills).toEqual([])
    expect(day1?.paydays).toEqual([])
  })

  it("sets isBudgetResetDay true only for the day ending in -01, false for every other day (AC8/AC9)", async () => {
    getBillsCalendarMonth.mockResolvedValueOnce(buildEmptyBillDays())
    getIncomeCalendarMonth.mockResolvedValueOnce(buildEmptyPaydayDays())

    const result = await getCalendarMonth(USER_ID, MONTH)

    const resetDays = result.days.filter((d) => d.isBudgetResetDay)
    expect(resetDays).toHaveLength(1)
    expect(resetDays[0].day).toBe("2026-06-01")
    expect(result.days.filter((d) => !d.isBudgetResetDay)).toHaveLength(29)
  })

  it("echoes the requested month back as budgetResetMonth (the reset marker's link target)", async () => {
    getBillsCalendarMonth.mockResolvedValueOnce(buildEmptyBillDays())
    getIncomeCalendarMonth.mockResolvedValueOnce(buildEmptyPaydayDays())

    const result = await getCalendarMonth(USER_ID, MONTH)

    expect(result.budgetResetMonth).toBe(MONTH)
  })

  it("handles a day with both a bill and a payday without one crowding out the other (Edge Case)", async () => {
    const billDays = buildEmptyBillDays()
    billDays[9] = {
      day: "2026-06-10",
      occurrences: [
        { billId: "b1", billOccurrenceId: "bo1", billName: "Electric", amount: 120, status: "DUE_TODAY" },
      ],
    }
    const paydayDays = buildEmptyPaydayDays()
    paydayDays[9] = {
      day: "2026-06-10",
      paydays: [{ streamId: "s1", streamName: "Freelance", amount: 500 }],
    }

    getBillsCalendarMonth.mockResolvedValueOnce(billDays)
    getIncomeCalendarMonth.mockResolvedValueOnce(paydayDays)

    const result = await getCalendarMonth(USER_ID, MONTH)
    const day10 = result.days.find((d) => d.day === "2026-06-10")

    expect(day10?.bills).toHaveLength(1)
    expect(day10?.paydays).toHaveLength(1)
  })

  it("returns an empty-but-present days array with the reset marker for a month with no bills/paydays at all", async () => {
    getBillsCalendarMonth.mockResolvedValueOnce(buildEmptyBillDays())
    getIncomeCalendarMonth.mockResolvedValueOnce(buildEmptyPaydayDays())

    const result = await getCalendarMonth(USER_ID, MONTH)

    expect(result.days.every((d) => d.bills.length === 0 && d.paydays.length === 0)).toBe(true)
    expect(result.days.some((d) => d.isBudgetResetDay)).toBe(true)
  })
})
