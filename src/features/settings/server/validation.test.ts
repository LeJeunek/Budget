import { describe, expect, it } from "vitest"

import { DASHBOARD_CARD_KEYS } from "@/features/dashboard/dashboard-cards"

import {
  ACCENT_COLOR_OPTIONS,
  AccentColorSchema,
  CURRENCY_DISPLAY_OPTIONS,
  CurrencyDisplaySchema,
  ReorderDashboardCardsSchema,
  TimezoneSchema,
  UpdateDashboardCardVisibilitySchema,
} from "./validation"

// Coverage for the Settings module's pure Zod validation logic — per this
// dispatch's own requirement to test TimezoneSchema and the currency/
// accent-color schemas, following this codebase's established
// `parseX`/schema unit-test convention (e.g. `features/reports/server/
// validation.test.ts`).

describe("AccentColorSchema", () => {
  it("accepts every preset in ACCENT_COLOR_OPTIONS", () => {
    for (const option of ACCENT_COLOR_OPTIONS) {
      expect(AccentColorSchema.safeParse(option.value).success).toBe(true)
    }
  })

  it("rejects an unrecognized accent color", () => {
    expect(AccentColorSchema.safeParse("chartreuse").success).toBe(false)
  })

  it("has between five and eight presets (customization.md AC1)", () => {
    expect(ACCENT_COLOR_OPTIONS.length).toBeGreaterThanOrEqual(5)
    expect(ACCENT_COLOR_OPTIONS.length).toBeLessThanOrEqual(8)
  })
})

describe("CurrencyDisplaySchema", () => {
  it("accepts exactly the six currencies customization.md AC1 requires", () => {
    expect(CURRENCY_DISPLAY_OPTIONS.map((option) => option.value)).toEqual([
      "USD",
      "EUR",
      "GBP",
      "CAD",
      "AUD",
      "JPY",
    ])
  })

  it("rejects a currency outside the curated list", () => {
    expect(CurrencyDisplaySchema.safeParse("CHF").success).toBe(false)
  })
})

describe("TimezoneSchema", () => {
  it("accepts standard IANA timezone names", () => {
    expect(TimezoneSchema.safeParse("America/New_York").success).toBe(true)
    expect(TimezoneSchema.safeParse("Europe/London").success).toBe(true)
    expect(TimezoneSchema.safeParse("UTC").success).toBe(true)
  })

  it("accepts an extreme-offset zone (customization.md Edge Case)", () => {
    expect(TimezoneSchema.safeParse("Pacific/Kiritimati").success).toBe(true)
  })

  it("rejects a raw UTC-offset string, not an IANA name", () => {
    expect(TimezoneSchema.safeParse("UTC+14").success).toBe(false)
  })

  it("rejects a nonsense string", () => {
    expect(TimezoneSchema.safeParse("Not/A/Timezone").success).toBe(false)
  })

  it("is validated against Node's own live Intl.supportedValuesOf list, never a hand-maintained array", () => {
    const anyRealZone = Intl.supportedValuesOf("timeZone")[0]
    expect(TimezoneSchema.safeParse(anyRealZone).success).toBe(true)
  })
})

describe("UpdateDashboardCardVisibilitySchema", () => {
  it("accepts a recognized card key", () => {
    const result = UpdateDashboardCardVisibilitySchema.safeParse({
      key: DASHBOARD_CARD_KEYS[0].key,
      visible: false,
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unrecognized card key", () => {
    const result = UpdateDashboardCardVisibilitySchema.safeParse({
      key: "not-a-real-card",
      visible: false,
    })
    expect(result.success).toBe(false)
  })
})

describe("ReorderDashboardCardsSchema", () => {
  const allKeys = DASHBOARD_CARD_KEYS.map((card) => card.key)

  it("accepts a full permutation of every canonical card key", () => {
    const permuted = [...allKeys].reverse()
    expect(ReorderDashboardCardsSchema.safeParse({ orderedKeys: permuted }).success).toBe(true)
  })

  it("rejects a list missing a canonical key", () => {
    const missingOne = allKeys.slice(1)
    expect(ReorderDashboardCardsSchema.safeParse({ orderedKeys: missingOne }).success).toBe(false)
  })

  it("rejects a list with a duplicate key", () => {
    const withDuplicate = [...allKeys, allKeys[0]]
    expect(
      ReorderDashboardCardsSchema.safeParse({ orderedKeys: withDuplicate }).success,
    ).toBe(false)
  })

  it("rejects a list containing an unrecognized key", () => {
    const withUnknown = [...allKeys.slice(1), "not-a-real-card"]
    expect(ReorderDashboardCardsSchema.safeParse({ orderedKeys: withUnknown }).success).toBe(
      false,
    )
  })
})
