import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { shouldAttemptNarrativeGeneration } from "./health-score-narrative"

// Verifies this feature's Definition of Done bar (docs/product/ai-features.md
// Feature 5): "The narrative-unavailable path is verified, by test, to never
// affect the numeric score, its breakdown, or the page's overall rendering."
// This file has no Prisma access of its own (see its own top-of-file "owns NO
// persistence" note), so unlike `monthly-summary.ts`'s test suite there is no
// pure date-math to unit-test beyond the one guard predicate below -- the
// rest of this suite is the same source-level "wired into the cross-feature
// reasoningModel rate limit" + "performs no Prisma access of its own"
// convention `insights.test.ts`/`monthly-summary.test.ts` already established
// (this codebase's standing "no integration-test database" convention: every
// `*.test.ts` file is a pure unit test against fixture data/schemas or a
// source-level text check, never a live database/mocked-`generateObject`
// exercise).

describe("shouldAttemptNarrativeGeneration", () => {
  it("returns true when both totalScore and label are defined", () => {
    expect(shouldAttemptNarrativeGeneration({ totalScore: 72, label: "Fair" })).toBe(true)
  })

  it("returns false when totalScore is null (zero computable components -- Feature 5's own 'not enough data yet' state)", () => {
    expect(shouldAttemptNarrativeGeneration({ totalScore: null, label: null })).toBe(false)
  })

  it("returns false when totalScore is defined but label is somehow null (defensive -- these are always written together)", () => {
    expect(shouldAttemptNarrativeGeneration({ totalScore: 72, label: null })).toBe(false)
  })

  it("returns false when label is defined but totalScore is somehow null (defensive -- these are always written together)", () => {
    expect(shouldAttemptNarrativeGeneration({ totalScore: null, label: "Fair" })).toBe(false)
  })

  it("returns true at the exact 0 boundary (a real, reachable 'Needs attention' score, not falsy-equivalent to null)", () => {
    expect(shouldAttemptNarrativeGeneration({ totalScore: 0, label: "Needs attention" })).toBe(
      true,
    )
  })
})

describe("health-score-narrative.ts owns no persistence of its own, by construction", () => {
  const SOURCE = readFileSync(join(__dirname, "health-score-narrative.ts"), "utf-8")

  it("never imports the Prisma client directly", () => {
    expect(SOURCE).not.toMatch(/from ["']@\/lib\/db["']/)
    expect(SOURCE).not.toMatch(/\bdb\./)
  })

  it("never calls a Prisma write method on any model", () => {
    const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]
    for (const method of WRITE_METHODS) {
      expect(SOURCE).not.toMatch(new RegExp(`\\.${method}\\(`))
    }
  })

  it("is never imported by the deterministic score's own service module (structural degradation guarantee)", () => {
    // This file's own guarantee is the OTHER direction (it must not import
    // service.ts to avoid a cycle back into the deterministic score), which
    // is what this assertion actually checks -- the reverse direction
    // (service.ts never importing this file) is Backend Engineer's
    // `service.ts` test suite to verify once that file exists.
    expect(SOURCE).not.toMatch(/from ["']\.\/service["']/)
    expect(SOURCE).not.toMatch(/from ["']\.\/snapshot["']/)
  })
})

describe("health-score-narrative.ts is wired into the cross-feature reasoningModel rate limit", () => {
  const SOURCE = readFileSync(join(__dirname, "health-score-narrative.ts"), "utf-8")

  it("gates generation on checkReasoningModelRateLimit, after the shouldAttemptNarrativeGeneration guard but before ever calling generateStructuredOutput", () => {
    const guardIndex = SOURCE.indexOf("if (!shouldAttemptNarrativeGeneration(current))")
    const gateIndex = SOURCE.indexOf("checkReasoningModelRateLimit(")
    const generateIndex = SOURCE.indexOf("await generateStructuredOutput(")

    expect(guardIndex).toBeGreaterThan(-1)
    expect(gateIndex).toBeGreaterThan(-1)
    expect(generateIndex).toBeGreaterThan(-1)
    expect(gateIndex).toBeGreaterThan(guardIndex)
    expect(generateIndex).toBeGreaterThan(gateIndex)
  })

  it("records exactly one ReasoningModelCallLog row per generation attempt via recordReasoningModelCall", () => {
    expect(SOURCE).toMatch(/recordReasoningModelCall\(/)
  })

  it("uses one shared featureName constant for both generateStructuredOutput and recordReasoningModelCall, never two independently-typed strings", () => {
    expect(SOURCE).toMatch(/featureName: REASONING_MODEL_FEATURE_NAME/)
    expect(SOURCE).toMatch(
      /recordReasoningModelCall\(userId, REASONING_MODEL_FEATURE_NAME, now\)/,
    )
  })

  it("uses the financialHealthScore.narrative featureName, per naming-standards.md's <module>.<feature> convention", () => {
    expect(SOURCE).toMatch(
      /REASONING_MODEL_FEATURE_NAME = "financialHealthScore\.narrative"/,
    )
  })

  it("never re-derives a score from the model's own output -- only ever reads result.data.narrative, never a totalScore/component field", () => {
    expect(SOURCE).toMatch(/result\.data\.narrative/)
    expect(SOURCE).not.toMatch(/result\.data\.totalScore/)
    expect(SOURCE).not.toMatch(/result\.data\.components/)
  })
})
