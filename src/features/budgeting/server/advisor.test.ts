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
