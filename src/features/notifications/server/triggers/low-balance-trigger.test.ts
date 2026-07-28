import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { resolveEffectiveLowBalanceThreshold } from "./low-balance-trigger"

/**
 * `resolveEffectiveLowBalanceThreshold` is a pure, database-free function —
 * tested directly, no mocking needed. `evaluateLowBalanceTriggers`/
 * `evaluateOneAccount` always touch the database (`getAccounts`,
 * `db.account.updateMany`) and are out of scope for a live-database test,
 * per this codebase's standing "no integration-test database" convention —
 * their atomic-claim/re-arm contract is instead verified at the source
 * level below, mirroring `lib/ai/rate-limit.test.ts`'s own source-level
 * checks for `checkReasoningModelRateLimit`/`recordReasoningModelCall`.
 */

describe("resolveEffectiveLowBalanceThreshold", () => {
  it("uses the account's own override when set", () => {
    expect(resolveEffectiveLowBalanceThreshold(250, 100)).toBe(250)
  })

  it("falls back to the user's default threshold when the account has no override", () => {
    expect(resolveEffectiveLowBalanceThreshold(null, 100)).toBe(100)
  })

  it("treats an override of exactly 0 as a real, explicit value — not the same as 'unset'", () => {
    expect(resolveEffectiveLowBalanceThreshold(0, 100)).toBe(0)
  })
})

describe("low-balance-trigger.ts source-level wiring (atomic claim/re-arm)", () => {
  const SOURCE = readFileSync(join(__dirname, "low-balance-trigger.ts"), "utf-8")

  it("claims the crossing latch via a single conditional updateMany, never a separate read-then-write", () => {
    expect(SOURCE).toMatch(
      /db\.account\.updateMany\(\{\s*where: \{ id: account\.id, userId, lowBalanceNotifiedAt: null \}/,
    )
    // The claim's own success check — count === 1 — gates whether a
    // notification is ever created, so a lost race creates nothing.
    expect(SOURCE).toMatch(/claim\.count !== 1/)
  })

  it("clears the latch on recovery (balance back at/above threshold) via the same atomic updateMany shape, never creating a notification for the recovery itself", () => {
    const recoveryWhereIndex = SOURCE.indexOf("lowBalanceNotifiedAt: { not: null }")
    expect(recoveryWhereIndex).toBeGreaterThan(-1)
    const recoveryBlock = SOURCE.slice(recoveryWhereIndex, recoveryWhereIndex + 200)
    expect(recoveryBlock).toMatch(/lowBalanceNotifiedAt: null/)

    // Nothing after the recovery-clearing updateMany ever calls
    // `createNotificationIfNew` -- confirms a recovery never fires a
    // notification, only silently re-arms the latch.
    const recoverySection = SOURCE.slice(recoveryWhereIndex)
    expect(recoverySection).not.toMatch(/createNotificationIfNew/)
  })

  it("only ever evaluates the three eligible account types (Checking/Savings/Cash) — Credit Card/Investment/Retirement/Crypto excluded", () => {
    expect(SOURCE).toMatch(/ELIGIBLE_ACCOUNT_TYPES[\s\S]*=[\s\S]*\[\s*"CHECKING",\s*"SAVINGS",\s*"CASH",?\s*\]/)
  })
})
