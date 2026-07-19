import { describe, expect, it } from "vitest"
import { cn, formatCurrency, formatDate } from "./utils"

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })
})

describe("formatCurrency", () => {
  it("formats a number as USD by default", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50")
  })

  it("formats negative amounts", () => {
    expect(formatCurrency(-42)).toBe("-$42.00")
  })
})

describe("formatDate", () => {
  it("formats a UTC date consistently regardless of local timezone", () => {
    expect(formatDate("2026-01-15T00:00:00.000Z")).toBe("Jan 15, 2026")
  })
})
