import { describe, expect, it } from "vitest"

import { assertSingleUserBatch } from "./assert-single-user-batch"

// Fixture-driven coverage of the cross-user isolation invariant
// (docs/architecture/ai-features-design.md §4.5, Security Architect Finding
// 3): "a single `generateStructuredOutput` call's data payload must never
// contain rows belonging to more than one user." This is the specific,
// always-on assertion every feature's batch-prompt-building step
// (`features/transactions/server/categorization.ts`, and — in future
// dispatches — the Monthly Summary/Financial Health Score snapshot cron
// jobs) runs before a prompt is ever constructed.

describe("assertSingleUserBatch", () => {
  it("does not throw when every row belongs to the expected user", () => {
    expect(() =>
      assertSingleUserBatch(
        [{ userId: "user-1" }, { userId: "user-1" }, { userId: "user-1" }],
        "user-1",
      ),
    ).not.toThrow()
  })

  it("does not throw for an empty batch", () => {
    expect(() => assertSingleUserBatch([], "user-1")).not.toThrow()
  })

  it("throws when a single row belongs to a different user than expected", () => {
    expect(() =>
      assertSingleUserBatch([{ userId: "user-2" }], "user-1"),
    ).toThrow(/Cross-user AI batch payload detected/)
  })

  it("throws when a batch mostly belonging to the expected user contains one row from another user", () => {
    expect(() =>
      assertSingleUserBatch(
        [{ userId: "user-1" }, { userId: "user-1" }, { userId: "user-2" }],
        "user-1",
      ),
    ).toThrow(/Cross-user AI batch payload detected/)
  })

  it("identifies the offending userId in the thrown error message", () => {
    expect(() =>
      assertSingleUserBatch([{ userId: "attacker-user" }], "victim-user"),
    ).toThrow(/attacker-user/)
  })
})
