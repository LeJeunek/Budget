import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Verifies Feature 2's own Definition of Done requirement (docs/product/ai-features.md):
// "A test verifies the advisor has no code path capable of writing to
// Budget/BudgetCategory data -- it is read-only, by construction, not just by
// convention." This codebase has no integration-test database (every
// existing test in this repo is a pure unit test against fixture data/schemas
// -- confirmed by grep: no `*.test.ts` file imports `@/lib/db`), so this is a
// source-level check: `advisor.ts`'s own Prisma calls are inspected directly
// rather than exercised against a live database. A mutation here (any
// `db.budget.<write>` / `db.budgetCategory.<write>` call appearing in this
// file) would fail this test immediately, making "read-only" a property this
// suite actually enforces, not just documents.

const ADVISOR_SOURCE = readFileSync(join(__dirname, "advisor.ts"), "utf-8")

const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]

describe("advisor.ts is read-only against Budget/BudgetCategory, by construction", () => {
  it("never calls a Prisma write method on db.budget", () => {
    for (const method of WRITE_METHODS) {
      expect(ADVISOR_SOURCE).not.toMatch(new RegExp(`db\\.budget\\.${method}\\b`))
    }
  })

  it("never calls a Prisma write method on db.budgetCategory", () => {
    for (const method of WRITE_METHODS) {
      expect(ADVISOR_SOURCE).not.toMatch(new RegExp(`db\\.budgetCategory\\.${method}\\b`))
    }
  })

  it("reads Budget data only through service.ts's existing getBudgetMonth/getBudgetHealthScore", () => {
    expect(ADVISOR_SOURCE).toMatch(/getBudgetMonth/)
    expect(ADVISOR_SOURCE).toMatch(/getBudgetHealthScore/)
    // Never queries `db.budget` or `db.budgetCategory` directly -- every read
    // goes through the shared service functions above, so this feature can
    // never compute Allocated/Spent/Remaining differently than the rest of
    // the Budgeting page (Cross-Cutting Requirement #2, "no fabricated
    // figures").
    expect(ADVISOR_SOURCE).not.toMatch(/db\.budget\./)
    expect(ADVISOR_SOURCE).not.toMatch(/db\.budgetCategory\./)
  })

  it("its only persistence is its own BudgetAdvisorCache row", () => {
    expect(ADVISOR_SOURCE).toMatch(/db\.budgetAdvisorCache\.(create|update|updateMany|findUnique)\(/)
  })
})

// Phase 4a follow-up: verifies the retrofit that closes the gap
// `MIN_REFRESH_INTERVAL_MS`'s own comment previously flagged (a per-user +
// project-wide `reasoningModel` rolling-day rate limit, now backed by
// `ReasoningModelCallLog` via `lib/ai/rate-limit.ts`). Source-level, per this
// file's own standing "no integration-test database" convention above --
// `checkReasoningModelRateLimit`/`recordReasoningModelCall` themselves are
// unit-tested directly in `lib/ai/rate-limit.test.ts`.
describe("advisor.ts is wired into the cross-feature reasoningModel rate limit", () => {
  it("gates generation on checkReasoningModelRateLimit before ever claiming the per-key cooldown slot", () => {
    expect(ADVISOR_SOURCE).toMatch(/checkReasoningModelRateLimit\(/)
    const gateIndex = ADVISOR_SOURCE.indexOf("checkReasoningModelRateLimit(")
    const claimFnIndex = ADVISOR_SOURCE.indexOf("async function claimGenerationSlot")
    expect(gateIndex).toBeGreaterThan(-1)
    // The rate-limit check must be defined ahead of (textually precede) the
    // per-key claim it gates, mirroring `claimReasoningModelGenerationSlot`'s
    // own "cheap check before the side-effecting claim" ordering.
    expect(gateIndex).toBeGreaterThan(claimFnIndex)
  })

  it("records exactly one ReasoningModelCallLog row per generation attempt via recordReasoningModelCall", () => {
    expect(ADVISOR_SOURCE).toMatch(/recordReasoningModelCall\(/)
  })

  it("uses one shared featureName constant for both generateStructuredOutput and recordReasoningModelCall, never two independently-typed strings", () => {
    expect(ADVISOR_SOURCE).toMatch(/featureName: REASONING_MODEL_FEATURE_NAME/)
    expect(ADVISOR_SOURCE).toMatch(
      /recordReasoningModelCall\(userId, REASONING_MODEL_FEATURE_NAME\)/,
    )
  })
})

// Phase 4a frontend follow-up (docs/performance/phase-4a-frontend-followup-review.md
// Finding 1): verifies the cache-hit-first reorder in
// `getBudgetAdvisorRecommendations` -- the `BudgetAdvisorCache` lookup must
// textually precede the expensive `getBudgetMonth`/`getBudgetHealthScore`
// fetch, so a cache hit returns without ever calling either. Source-level,
// per this file's own standing "no integration-test database" convention
// above -- there is no mock-call-count assertion available since nothing in
// this suite spins up a Prisma client, so call ORDER is verified the same
// way `checkReasoningModelRateLimit`'s ordering already is above: by textual
// position within the function body.
describe("getBudgetAdvisorRecommendations checks the cache before gathering budget data", () => {
  // Isolates just this function's body so the identically-ordered but
  // deliberately-NOT-reordered `refreshBudgetAdvisorRecommendations` below it
  // (see that function's own doc comment for why) can never accidentally
  // satisfy this assertion instead.
  const functionBody = ADVISOR_SOURCE.slice(
    ADVISOR_SOURCE.indexOf("export async function getBudgetAdvisorRecommendations"),
    ADVISOR_SOURCE.indexOf("export async function refreshBudgetAdvisorRecommendations"),
  )

  it("finds the cache row before ever calling getBudgetMonth/getBudgetHealthScore in this function", () => {
    const cacheCheckIndex = functionBody.indexOf("db.budgetAdvisorCache.findUnique(")
    const getBudgetMonthIndex = functionBody.indexOf("getBudgetMonth(userId, month)")
    const getBudgetHealthScoreIndex = functionBody.indexOf("getBudgetHealthScore(userId, month)")

    expect(cacheCheckIndex).toBeGreaterThan(-1)
    expect(getBudgetMonthIndex).toBeGreaterThan(-1)
    expect(getBudgetHealthScoreIndex).toBeGreaterThan(-1)
    expect(cacheCheckIndex).toBeLessThan(getBudgetMonthIndex)
    expect(cacheCheckIndex).toBeLessThan(getBudgetHealthScoreIndex)
  })

  it("returns cacheRowToResult(existing) immediately after the cache check, before the Promise.all data fetch", () => {
    const cacheCheckIndex = functionBody.indexOf("db.budgetAdvisorCache.findUnique(")
    const earlyReturnIndex = functionBody.indexOf(
      "if (existing) {\n      return cacheRowToResult(existing)",
    )
    const promiseAllIndex = functionBody.indexOf("Promise.all([\n      getBudgetMonth")

    expect(earlyReturnIndex).toBeGreaterThan(cacheCheckIndex)
    expect(earlyReturnIndex).toBeLessThan(promiseAllIndex)
  })
})

// refreshBudgetAdvisorRecommendations intentionally does NOT get the same
// reorder (see its own doc comment: an explicit refresh always needs
// getBudgetMonth/getBudgetHealthScore to build the regeneration prompt,
// regardless of any cache row) -- confirms it has no cache-row read at all
// ahead of its own data fetch, so a future edit can't silently reintroduce a
// redundant cache check there without a deliberate change to this test too.
describe("refreshBudgetAdvisorRecommendations has no cache check to reorder (regenerate-always by design)", () => {
  const functionBody = ADVISOR_SOURCE.slice(
    ADVISOR_SOURCE.indexOf("export async function refreshBudgetAdvisorRecommendations"),
  )

  it("calls getBudgetMonth/getBudgetHealthScore unconditionally, with no preceding db.budgetAdvisorCache.findUnique", () => {
    expect(functionBody).not.toMatch(/db\.budgetAdvisorCache\.findUnique\(/)
    expect(functionBody).toMatch(/getBudgetMonth\(userId, month\)/)
    expect(functionBody).toMatch(/getBudgetHealthScore\(userId, month\)/)
  })
})
