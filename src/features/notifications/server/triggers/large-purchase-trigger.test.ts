import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * This file deliberately never imports `large-purchase-trigger.ts` itself
 * (only reads its source text) — that module transitively imports
 * `features/transactions/server/service.ts` -> `.../receipts.ts` ->
 * `lib/uploadthing.ts`, whose module-level `export const utapi = new UTApi()`
 * throws under vitest's jsdom test environment, and every one of this
 * trigger's exported functions always touches the database
 * (`db.transaction.findMany`, `getNotificationThresholdSettings`,
 * `createNotificationIfNew`) and is out of scope for a live-database test,
 * per this codebase's standing "no integration-test database" convention.
 * Its recency-window/deterministic-only/dedup contract is instead verified
 * at the source level, mirroring `lib/ai/rate-limit.test.ts`'s own
 * source-level checks.
 */
describe("large-purchase-trigger.ts source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "large-purchase-trigger.ts"), "utf-8")

  it("filters on Transaction.date, never createdAt — the recency window that prevents a bulk historical CSV import from flooding notifications", () => {
    expect(SOURCE).toMatch(/date: \{ gte: windowStart \}/)
    expect(SOURCE).not.toMatch(/createdAt: \{/)
  })

  it("uses the proposed 7-day recency window default", () => {
    expect(SOURCE).toMatch(/RECENCY_WINDOW_DAYS = 7/)
  })

  it("scopes to expense transactions only (amount < 0), excluding split-parent rows via EXCLUDE_SPLIT_PARENTS", () => {
    expect(SOURCE).toMatch(/amount: \{ lt: 0 \}/)
    expect(SOURCE).toMatch(/\.\.\.EXCLUDE_SPLIT_PARENTS/)
  })

  it("compares the absolute value of amount against the threshold (a transaction's stored amount is negative for expenses)", () => {
    expect(SOURCE).toMatch(/Math\.abs\(transaction\.amount\.toNumber\(\)\) >= largePurchaseThreshold/)
  })

  it("dedups via createNotificationIfNew (the Notification (transactionId, type) unique constraint), never a separate latch column on Transaction", () => {
    expect(SOURCE).toMatch(/createNotificationIfNew\(/)
    expect(SOURCE).not.toMatch(/\.updateMany\(/)
  })

  it("never imports Spending Insights or any lib/ai/ module — deterministic-only, per binding constraint 1", () => {
    const importLines = SOURCE.split("\n").filter((line) => line.trim().startsWith("import "))
    expect(importLines.some((line) => line.includes("analytics"))).toBe(false)
    expect(importLines.some((line) => line.includes("lib/ai"))).toBe(false)
  })
})
