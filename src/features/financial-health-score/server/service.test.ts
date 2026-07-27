import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// `service.ts`'s formula math itself is tested database-free in
// `formula.test.ts` (mirrors `features/dashboard/server/monthly-summary
// .test.ts`'s split between pure-calculation tests and these structural,
// source-level invariant checks). `getFinancialHealthScore`/
// `getLatestNarrative` themselves always touch the database and are out of
// scope for these unit tests, per this codebase's standing "no
// integration-test database" convention.
//
// Verifies two Definition-of-Done-level invariants from
// `docs/product/ai-features.md` Feature 5 that can't be expressed as a plain
// input/output assertion:
//   - "The Budget Adherence component is verified to be read directly from
//     the existing Budget Health Score computation, never independently
//     reimplemented."
//   - "Score computation... has ZERO AI dependency" (Feature 5's Reasoning
//     point 5 / this file's own top-of-file note).
const SOURCE = readFileSync(join(__dirname, "service.ts"), "utf-8")

describe("service.ts reuses Budget Health Score verbatim for Budget Adherence", () => {
  it("calls budgeting's getBudgetHealthScore rather than reimplementing budget-adherence math", () => {
    expect(SOURCE).toMatch(/import \{ getBudgetHealthScore \} from "@\/features\/budgeting\/server\/service"/)
    expect(SOURCE).toMatch(/getBudgetHealthScore\(userId, formatMonthKey\(now\)\)/)
  })

  it("never computes its own allocated/spent/remaining aggregation (no db.budget or db.budgetCategory access)", () => {
    expect(SOURCE).not.toMatch(/db\.budget\b/)
    expect(SOURCE).not.toMatch(/db\.budgetCategory\b/)
  })
})

describe("service.ts's score computation has zero AI dependency", () => {
  it("imports only the AiFeatureResult TYPE from lib/ai/ (for getLatestNarrative's return shape) -- never any AI-generation machinery", () => {
    // The only lib/ai/ import allowed here is the plain `AiFeatureResult`
    // type -- getLatestNarrative reads an already-persisted string, it never
    // generates one. Confirmed by the absence of every actual
    // generation-calling import below.
    expect(SOURCE).toMatch(/import type \{ AiFeatureResult \} from "@\/lib\/ai\/types"/)
    expect(SOURCE).not.toMatch(/generateStructuredOutput/)
    expect(SOURCE).not.toMatch(/reasoningModel/)
    expect(SOURCE).not.toMatch(/checkReasoningModelRateLimit/)
    expect(SOURCE).not.toMatch(/recordReasoningModelCall/)
  })

  it("getFinancialHealthScore/getLatestNarrative never call a Prisma write method", () => {
    const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]
    for (const method of WRITE_METHODS) {
      expect(SOURCE).not.toMatch(new RegExp(`\\.${method}\\(`))
    }
  })
})

describe("service.ts is a pure downstream leaf consumer (acyclicity)", () => {
  it("does not implement dashboard.service.getFinancialHealthScoreCard (would create an import cycle with dashboard/server/service.ts)", () => {
    expect(SOURCE).not.toMatch(/export (async )?function getFinancialHealthScoreCard/)
  })
})

// Phase 4a frontend follow-up (docs/performance/phase-4a-frontend-followup-review.md
// Finding 3): verifies the optional `precomputedBudgetHealthScore` escape
// hatch that lets a caller who already has this exact month's
// `BudgetHealthScore` (the Dashboard page) skip `gatherBudgetAdherenceComponent`'s
// own independent `getBudgetHealthScore` re-fetch. Source-level, per this
// file's own standing "no integration-test database" convention above.
describe("getFinancialHealthScore accepts an optional precomputed Budget Health Score to avoid a duplicate fetch", () => {
  it("threads an optional precomputedBudgetHealthScore param through to gatherBudgetAdherenceComponent", () => {
    expect(SOURCE).toMatch(
      /export async function getFinancialHealthScore\(\s*userId: string,\s*now: Date = new Date\(\),\s*precomputedBudgetHealthScore\?: BudgetHealthScore \| null,/,
    )
    expect(SOURCE).toMatch(
      /gatherBudgetAdherenceComponent\(userId, now, precomputedBudgetHealthScore\)/,
    )
  })

  it("only skips the getBudgetHealthScore fetch when precomputed is not undefined -- distinguishing 'not passed' from 'passed as null'", () => {
    expect(SOURCE).toMatch(/precomputed !== undefined \? precomputed : await getBudgetHealthScore/)
  })
})
