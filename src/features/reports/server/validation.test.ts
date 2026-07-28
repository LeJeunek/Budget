import { describe, expect, it } from "vitest"

import { parseGenerateReportRequest } from "./validation"

// Coverage for `GenerateReportRequestSchema`'s parsing rules — per-type
// period-shape validation, the Income/Expense/Cash Flow types' "exactly one
// of period or start+end" exclusivity rule, and Risk #22's custom-range
// upper bound.

describe("parseGenerateReportRequest", () => {
  it("parses a valid monthly request", () => {
    const result = parseGenerateReportRequest({ type: "monthly", month: "2026-06" })
    expect(result).toEqual({ success: true, data: { type: "MONTHLY", month: "2026-06" } })
  })

  it("rejects a malformed month", () => {
    const result = parseGenerateReportRequest({ type: "monthly", month: "June 2026" })
    expect(result.success).toBe(false)
  })

  it("parses a valid yearly request, coercing year to a number", () => {
    const result = parseGenerateReportRequest({ type: "yearly", year: "2025" })
    expect(result).toEqual({ success: true, data: { type: "YEARLY", year: 2025 } })
  })

  it("parses a valid tax-summary request", () => {
    const result = parseGenerateReportRequest({ type: "tax-summary", year: "2025" })
    expect(result).toEqual({ success: true, data: { type: "TAX_SUMMARY", year: 2025 } })
  })

  it("rejects an unrecognized report type", () => {
    const result = parseGenerateReportRequest({ type: "nonsense" })
    expect(result.success).toBe(false)
  })

  it("parses income/expense/cash-flow with a preset period", () => {
    const result = parseGenerateReportRequest({ type: "income", period: "this-year" })
    expect(result).toEqual({
      success: true,
      data: { type: "INCOME", period: { kind: "PRESET", preset: "THIS_YEAR" } },
    })
  })

  it("maps the cash-flow type param to CASH_FLOW (underscore, not hyphen)", () => {
    const result = parseGenerateReportRequest({ type: "cash-flow", period: "all-time" })
    expect(result.success).toBe(true)
    expect(result.success && result.data.type).toBe("CASH_FLOW")
  })

  it("parses expense with a custom start/end range", () => {
    const result = parseGenerateReportRequest({
      type: "expense",
      start: "2026-01-15",
      end: "2026-03-20",
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === "EXPENSE") {
      expect(result.data.period).toEqual({
        kind: "CUSTOM",
        start: new Date(Date.UTC(2026, 0, 15)),
        end: new Date(Date.UTC(2026, 2, 20)),
      })
    }
  })

  it("rejects supplying both a preset and a custom range", () => {
    const result = parseGenerateReportRequest({
      type: "income",
      period: "this-year",
      start: "2026-01-01",
      end: "2026-02-01",
    })
    expect(result.success).toBe(false)
  })

  it("rejects supplying neither a preset nor a custom range", () => {
    const result = parseGenerateReportRequest({ type: "income" })
    expect(result.success).toBe(false)
  })

  it("rejects a custom range with only one of start/end supplied", () => {
    const result = parseGenerateReportRequest({ type: "income", start: "2026-01-01" })
    expect(result.success).toBe(false)
  })

  it("rejects a custom range where end precedes start", () => {
    const result = parseGenerateReportRequest({
      type: "income",
      start: "2026-03-20",
      end: "2026-01-15",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a custom range exceeding the maximum bound (Risk #22)", () => {
    const result = parseGenerateReportRequest({
      type: "income",
      start: "2000-01-01",
      end: "2026-01-01",
    })
    expect(result.success).toBe(false)
  })

  it("accepts a custom range comfortably within the maximum bound", () => {
    const result = parseGenerateReportRequest({
      type: "income",
      start: "2016-07-20",
      end: "2026-07-19",
    })
    expect(result.success).toBe(true)
  })
})
