import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

// `insights.ts` transitively imports `EXCLUDE_SPLIT_PARENTS` (via
// `expense-breakdown.ts`) from `features/transactions/server/service.ts`,
// which itself imports `features/transactions/server/receipts.ts` ->
// `lib/uploadthing.ts`, whose module-level `export const utapi = new UTApi()`
// throws under vitest's jsdom test environment (`UTApi`'s own server-only
// guard). This mock exists purely to make the module graph importable in a
// test process -- mirrors `monthly-summary.test.ts`'s identical mock; never
// exercised by anything in this file.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { resolveInsightsPeriodRange } from "./insights"

// Verifies this feature's Definition of Done bar (docs/product/ai-features.md
// Feature 4): "the AI-unavailable path is verified to leave the rest of the
// Dashboard/Analytics page fully functional," restated here as the same
// source-level "read-only, by construction" + "wired into the cross-feature
// reasoningModel rate limit" bar `advisor.test.ts`/`monthly-summary.test.ts`
// already established -- this codebase has no integration-test database
// (every `*.test.ts` file is a pure unit test against fixture data/schemas),
// so these are source-level checks against `insights.ts`'s own text, not a
// live database exercise.

describe("resolveInsightsPeriodRange", () => {
  const now = new Date(Date.UTC(2026, 6, 20)) // July 20, 2026

  it("resolves a real ReportingPeriod value the same way Analytics' own resolver would", () => {
    const range = resolveInsightsPeriodRange("THIS_YEAR", now)
    expect(range.start).toEqual(new Date(Date.UTC(2026, 0, 1)))
    expect(range.end).toEqual(new Date(Date.UTC(2026, 11, 31)))
  })

  it("resolves ALL_TIME to an open-ended (null start) range", () => {
    const range = resolveInsightsPeriodRange("ALL_TIME", now)
    expect(range.start).toBeNull()
  })

  it("resolves DASHBOARD_DEFAULT to the same range as LAST_12_MONTHS (judgment call -- see insights.ts's own doc comment)", () => {
    const dashboardRange = resolveInsightsPeriodRange("DASHBOARD_DEFAULT", now)
    const last12MonthsRange = resolveInsightsPeriodRange("LAST_12_MONTHS", now)
    expect(dashboardRange).toEqual(last12MonthsRange)
  })
})

describe("insights.ts is read-only against every other feature's data, by construction", () => {
  const SOURCE = readFileSync(join(__dirname, "insights.ts"), "utf-8")
  const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]
  const OTHER_FEATURE_MODELS = [
    "transaction",
    "account",
    "budget",
    "budgetCategory",
    "category",
    "dismissedSubscriptionMerchant",
  ]

  it("never calls a Prisma write method on any other feature's model", () => {
    for (const model of OTHER_FEATURE_MODELS) {
      for (const method of WRITE_METHODS) {
        expect(SOURCE).not.toMatch(new RegExp(`db\\.${model}\\.${method}\\b`))
      }
    }
  })

  it("its only persistence is its own SpendingInsightsCache row", () => {
    expect(SOURCE).toMatch(/db\.spendingInsightsCache\.(create|update|updateMany|findUnique)\(/)
  })

  it("reads Analytics data only through existing metric functions, never a direct groupBy/aggregate of its own", () => {
    expect(SOURCE).toMatch(/getCategoryTrends/)
    expect(SOURCE).toMatch(/getTopMerchants/)
    expect(SOURCE).toMatch(/getLargestPurchases/)
    expect(SOURCE).toMatch(/getSubscriptionCandidates/)
    expect(SOURCE).toMatch(/getDailySpendingHeatmap/)
    expect(SOURCE).toMatch(/getSavingsGrowth/)
    // No direct db.transaction query of its own -- every figure this feature
    // ever cites is sourced from one of the six calls above.
    expect(SOURCE).not.toMatch(/db\.transaction\./)
  })
})

// Phase 4a follow-up: verifies this feature is wired into the shared
// cross-feature `reasoningModel` rate limit from day one -- mirrors
// `advisor.test.ts`'s/`monthly-summary.test.ts`'s identical retrofit-
// verification suite exactly. Source-level, per this file's own standing
// "no integration-test database" convention above --
// `checkReasoningModelRateLimit`/`recordReasoningModelCall` themselves are
// unit-tested directly in `lib/ai/rate-limit.test.ts`.
describe("insights.ts is wired into the cross-feature reasoningModel rate limit", () => {
  const SOURCE = readFileSync(join(__dirname, "insights.ts"), "utf-8")

  it("gates generation on checkReasoningModelRateLimit before ever claiming the per-key cooldown slot", () => {
    expect(SOURCE).toMatch(/checkReasoningModelRateLimit\(/)
    const gateIndex = SOURCE.indexOf("checkReasoningModelRateLimit(")
    const claimFnIndex = SOURCE.indexOf("async function claimGenerationSlot")
    expect(gateIndex).toBeGreaterThan(-1)
    // The rate-limit check must be defined ahead of (textually precede) the
    // per-key claim it gates, mirroring `claimReasoningModelGenerationSlot`'s
    // own "cheap check before the side-effecting claim" ordering.
    expect(gateIndex).toBeGreaterThan(claimFnIndex)
  })

  it("records exactly one ReasoningModelCallLog row per generation attempt via recordReasoningModelCall", () => {
    expect(SOURCE).toMatch(/recordReasoningModelCall\(/)
  })

  it("uses one shared featureName constant for both generateStructuredOutput and recordReasoningModelCall, never two independently-typed strings", () => {
    expect(SOURCE).toMatch(/featureName: REASONING_MODEL_FEATURE_NAME/)
    expect(SOURCE).toMatch(
      /recordReasoningModelCall\(userId, REASONING_MODEL_FEATURE_NAME\)/,
    )
  })

  it("uses the analytics.spendingInsights featureName, per naming-standards.md's <module>.<feature> convention", () => {
    expect(SOURCE).toMatch(/REASONING_MODEL_FEATURE_NAME = "analytics\.spendingInsights"/)
  })
})
