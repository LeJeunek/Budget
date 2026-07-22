import { describe, expect, it } from "vitest"

import {
  canRefreshNow,
  hasReachedRollingWindowCap,
  rollingWindowStart,
} from "./rate-limit"

const NOW = new Date(Date.UTC(2026, 6, 22, 12, 0, 0))

describe("canRefreshNow", () => {
  it("allows a refresh when there is no prior generation at all", () => {
    expect(canRefreshNow(null, 60_000, NOW)).toBe(true)
  })

  it("blocks a refresh requested before the minimum interval has elapsed", () => {
    const lastGeneratedAt = new Date(NOW.getTime() - 30_000)
    expect(canRefreshNow(lastGeneratedAt, 60_000, NOW)).toBe(false)
  })

  it("allows a refresh exactly at the minimum interval boundary", () => {
    const lastGeneratedAt = new Date(NOW.getTime() - 60_000)
    expect(canRefreshNow(lastGeneratedAt, 60_000, NOW)).toBe(true)
  })

  it("allows a refresh once comfortably past the minimum interval", () => {
    const lastGeneratedAt = new Date(NOW.getTime() - 120_000)
    expect(canRefreshNow(lastGeneratedAt, 60_000, NOW)).toBe(true)
  })
})

describe("rollingWindowStart", () => {
  it("returns a timestamp exactly windowMs before now", () => {
    const windowMs = 60 * 60 * 1000
    expect(rollingWindowStart(windowMs, NOW).getTime()).toBe(
      NOW.getTime() - windowMs,
    )
  })
})

describe("hasReachedRollingWindowCap", () => {
  it("has not reached the cap when the count is below the max", () => {
    expect(hasReachedRollingWindowCap(5, 30)).toBe(false)
  })

  it("has reached the cap when the count equals the max (inclusive boundary)", () => {
    expect(hasReachedRollingWindowCap(30, 30)).toBe(true)
  })

  it("has reached the cap when the count exceeds the max", () => {
    expect(hasReachedRollingWindowCap(31, 30)).toBe(true)
  })

  it("has not reached a zero-count window", () => {
    expect(hasReachedRollingWindowCap(0, 30)).toBe(false)
  })
})
