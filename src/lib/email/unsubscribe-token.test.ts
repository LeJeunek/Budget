import { beforeEach, describe, expect, it, vi } from "vitest"

import { generateUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token"

/**
 * `lib/email/unsubscribe-token.ts` — the one-click unsubscribe token's
 * mint/verify pair (docs/architecture/phase-4b-technical-design.md §5).
 * Pure, database-free logic — no `@/lib/db` import anywhere here — so this
 * is a real, direct unit test, not a source-level check.
 */
describe("generateUnsubscribeToken / verifyUnsubscribeToken", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret-do-not-use-in-production")
  })

  it("round-trips a token back to its original { userId, type } payload", () => {
    const token = generateUnsubscribeToken({ userId: "user-1", type: "BUDGET_OVER" })
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: "user-1", type: "BUDGET_OVER" })
  })

  it("round-trips correctly for every one of the six NotificationType members", () => {
    const types = [
      "BUDGET_OVER",
      "BILL_DUE_SOON",
      "BILL_LATE",
      "GOAL_ACHIEVED",
      "LARGE_PURCHASE",
      "LOW_BALANCE",
      "MONTHLY_SUMMARY_READY",
    ] as const

    for (const type of types) {
      const token = generateUnsubscribeToken({ userId: "user-42", type })
      expect(verifyUnsubscribeToken(token)).toEqual({ userId: "user-42", type })
    }
  })

  it("rejects a token whose signature has been tampered with", () => {
    const token = generateUnsubscribeToken({ userId: "user-1", type: "LOW_BALANCE" })
    const [payload] = token.split(".")
    const tampered = `${payload}.0000000000000000000000000000000000000000000000000000000000000000`
    expect(verifyUnsubscribeToken(tampered)).toBeNull()
  })

  it("rejects a token whose payload has been swapped for a different user's payload but signed with the ORIGINAL signature", () => {
    const originalToken = generateUnsubscribeToken({ userId: "user-1", type: "LOW_BALANCE" })
    const [, originalSignature] = originalToken.split(".")

    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: "victim-user", type: "LOW_BALANCE" }),
      "utf-8",
    ).toString("base64url")
    const forgedToken = `${forgedPayload}.${originalSignature}`

    expect(verifyUnsubscribeToken(forgedToken)).toBeNull()
  })

  it("rejects a malformed token with no separator at all", () => {
    expect(verifyUnsubscribeToken("not-a-real-token")).toBeNull()
  })

  it("rejects a token signed under a DIFFERENT secret (e.g. after secret rotation)", () => {
    const token = generateUnsubscribeToken({ userId: "user-1", type: "GOAL_ACHIEVED" })

    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-completely-different-rotated-secret")

    expect(verifyUnsubscribeToken(token)).toBeNull()
  })

  it("rejects a validly-signed token whose decoded payload has an invalid NotificationType value (the Zod re-validation step, not just signature verification)", () => {
    const token = generateUnsubscribeToken({
      userId: "user-1",
      // Cast needed to construct a deliberately invalid, but still
      // correctly-signed, payload for this negative test —
      // `generateUnsubscribeToken` never produces one itself in real use.
      type: "NOT_A_REAL_TYPE" as never,
    })
    expect(verifyUnsubscribeToken(token)).toBeNull()
  })
})
