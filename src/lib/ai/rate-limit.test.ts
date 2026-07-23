import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  canRefreshNow,
  hasReachedRollingWindowCap,
  isReasoningModelCallAllowed,
  REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY,
  REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY,
  REASONING_MODEL_ROLLING_WINDOW_MS,
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

// Phase 4a follow-up: `ReasoningModelCallLog`'s cross-feature per-user +
// project-wide rolling-day rate limit (ai-features-design.md §2 Finding
// 6a/§6.1). `isReasoningModelCallAllowed` is the pure reduction of both
// already-queried counts to a single allow/deny decision -- kept separate
// from `checkReasoningModelRateLimit` specifically so it is unit-testable
// without a database, mirroring `hasReachedRollingWindowCap`'s own
// database-free precedent above.
describe("isReasoningModelCallAllowed", () => {
  it("allows a call when both counts are well under their caps", () => {
    expect(isReasoningModelCallAllowed(0, 0)).toBe(true)
    expect(isReasoningModelCallAllowed(1, 1)).toBe(true)
  })

  it("denies a call once the per-user count reaches its cap, even if the project-wide count is still low", () => {
    expect(
      isReasoningModelCallAllowed(REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY, 1),
    ).toBe(false)
  })

  it("denies a call once the project-wide count reaches its cap, even if the per-user count is still low", () => {
    expect(
      isReasoningModelCallAllowed(1, REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY),
    ).toBe(false)
  })

  it("denies a call when both counts are already at or past their caps", () => {
    expect(
      isReasoningModelCallAllowed(
        REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY + 5,
        REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY + 5,
      ),
    ).toBe(false)
  })

  it("allows a call exactly one below each cap (inclusive boundary matches hasReachedRollingWindowCap)", () => {
    expect(
      isReasoningModelCallAllowed(
        REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY - 1,
        REASONING_MODEL_MAX_CALLS_PROJECT_WIDE_PER_DAY - 1,
      ),
    ).toBe(true)
  })
})

describe("REASONING_MODEL_ROLLING_WINDOW_MS", () => {
  it("is a rolling day, not a rolling hour -- the daily Gemini free-tier constraint §6.1 requires for reasoningModel", () => {
    expect(REASONING_MODEL_ROLLING_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })
})

// `checkReasoningModelRateLimit`/`recordReasoningModelCall` themselves always
// touch `ReasoningModelCallLog` via `@/lib/db` -- this codebase has no
// integration-test database (every existing test here is a pure unit test
// against fixture data/schemas or a source-level check, per
// `advisor.test.ts`/`monthly-summary.test.ts`'s identical standing
// convention), so their persistence behavior is verified at the source level
// instead of by exercising a live Prisma call.
describe("checkReasoningModelRateLimit/recordReasoningModelCall persistence shape", () => {
  const SOURCE = readFileSync(join(__dirname, "rate-limit.ts"), "utf-8")

  it("checkReasoningModelRateLimit counts ReasoningModelCallLog rows both per-user and project-wide", () => {
    expect(SOURCE).toMatch(/db\.reasoningModelCallLog\.count\(/)
    // Per-user query is scoped by `userId`; the project-wide query is the
    // identical shape with no `userId` filter at all (this model's own
    // schema comment's exact requirement) -- two separate `count(` call
    // sites, not one query reused with a conditional filter.
    expect(SOURCE.match(/db\.reasoningModelCallLog\.count\(/g)?.length).toBe(2)
  })

  it("recordReasoningModelCall inserts exactly one row per call, never updates/upserts an existing one (append-only log)", () => {
    expect(SOURCE).toMatch(/db\.reasoningModelCallLog\.create\(/)
    expect(SOURCE).not.toMatch(/db\.reasoningModelCallLog\.(update|upsert|delete)/)
  })

  it("both functions derive their window from rollingWindowStart, never a re-derived cutoff calculation", () => {
    expect(SOURCE).toMatch(
      /rollingWindowStart\(REASONING_MODEL_ROLLING_WINDOW_MS, now\)/,
    )
  })
})
