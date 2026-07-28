import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * This file deliberately never imports `goal-achieved-trigger.ts` itself —
 * every one of its exported functions always touches the database
 * (`getFinancialGoals`, `db.financialGoal.updateMany`,
 * `createNotificationIfNew`) and is out of scope for a live-database test,
 * per this codebase's standing "no integration-test database" convention.
 * Its atomic-claim contract (the exact TOCTOU-race-prevention pattern
 * `ai-features-design.md` Finding 6b requires, applied here to
 * `FinancialGoal.completionNotifiedAt`) is instead verified at the source
 * level, mirroring `lib/ai/rate-limit.test.ts`'s own source-level checks for
 * `checkReasoningModelRateLimit`/`recordReasoningModelCall`.
 */
describe("goal-achieved-trigger.ts source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "goal-achieved-trigger.ts"), "utf-8")

  it("claims the 'already notified' latch via a single atomic conditional updateMany, never a separate read-then-write", () => {
    expect(SOURCE).toMatch(
      /db\.financialGoal\.updateMany\(\{\s*where: \{ id: goal\.id, userId, completionNotifiedAt: null \}/,
    )
    expect(SOURCE).toMatch(/data: \{ completionNotifiedAt: now \}/)
  })

  it("only creates a Notification if this call actually won the claim (count === 1), never unconditionally", () => {
    const claimIndex = SOURCE.indexOf("db.financialGoal.updateMany(")
    const restOfFunction = SOURCE.slice(claimIndex)
    expect(restOfFunction).toMatch(/claim\.count !== 1/)
    const guardIndex = restOfFunction.indexOf("claim.count !== 1")
    const createIndex = restOfFunction.indexOf("createNotificationIfNew(")
    expect(createIndex).toBeGreaterThan(guardIndex)
  })

  it("filters candidates to isCompleted && completionNotifiedAt === null before ever attempting a claim", () => {
    expect(SOURCE).toMatch(
      /goal\.isCompleted === true && goal\.completionNotifiedAt === null/,
    )
  })

  it("reads getFinancialGoals with its default (non-archived-only) options, never explicitly requesting includeArchived: true — an archived goal is never evaluated by this trigger", () => {
    expect(SOURCE).toMatch(/getFinancialGoals\(userId\)/)
    expect(SOURCE).not.toMatch(/includeArchived:\s*true/)
  })
})
