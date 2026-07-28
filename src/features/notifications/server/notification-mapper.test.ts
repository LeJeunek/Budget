import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { toNotification, type NotificationRow } from "./notification-mapper"

/**
 * `toNotification` is a pure function of plain/Prisma-row data — no `@/lib/db`
 * import anywhere in this test file, per this codebase's standing "no
 * integration-test database" convention (mirrors
 * `features/investments/server/service.test.ts`'s `toHolding` fixture-based
 * coverage exactly, including its `new Prisma.Decimal(...)` fixture-building
 * pattern). `createNotificationIfNew`'s own DB-touching create-and-catch-P2002
 * behavior is verified at the source level below, the same way
 * `rate-limit.test.ts`/`snapshot.test.ts` verify their own DB-touching
 * functions' wiring without a live database.
 */

/** Every column `NOTIFICATION_INCLUDE` could join in, defaulted to `null` so
 * each test only overrides the one relation its `type` actually needs —
 * mirrors `investments/service.test.ts`'s `buildHoldingRow` "fixed,
 * arbitrary-but-valid value the mapper never inspects" convention. */
function buildNotificationRow(overrides: Partial<NotificationRow> & Pick<NotificationRow, "type">): NotificationRow {
  return {
    id: "notif-1",
    userId: "user-1",
    budgetCategoryId: null,
    budgetCategory: null,
    billOccurrenceId: null,
    billOccurrence: null,
    financialGoalId: null,
    financialGoal: null,
    transactionId: null,
    transaction: null,
    accountId: null,
    account: null,
    monthlySummaryId: null,
    monthlySummary: null,
    readAt: null,
    dismissedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    emailSentAt: null,
    emailSendError: null,
    ...overrides,
  }
}

describe("toNotification — Phase 4b new trigger types", () => {
  it("shapes a GOAL_ACHIEVED row using the joined FinancialGoal's name", () => {
    const row = buildNotificationRow({
      type: "GOAL_ACHIEVED",
      financialGoalId: "goal-1",
      financialGoal: { id: "goal-1", name: "Pay off car loan" },
    })

    const result = toNotification(row)
    expect(result).toEqual({
      id: "notif-1",
      createdAt: row.createdAt,
      readAt: null,
      dismissedAt: null,
      type: "GOAL_ACHIEVED",
      financialGoalId: "goal-1",
      goalName: "Pay off car loan",
    })
  })

  it("returns null for a GOAL_ACHIEVED row missing its joined FinancialGoal (defensive)", () => {
    const row = buildNotificationRow({ type: "GOAL_ACHIEVED", financialGoalId: "goal-1" })
    expect(toNotification(row)).toBeNull()
  })

  it("shapes a LARGE_PURCHASE row, converting the negative stored amount to a positive magnitude", () => {
    const row = buildNotificationRow({
      type: "LARGE_PURCHASE",
      transactionId: "txn-1",
      transaction: {
        id: "txn-1",
        merchant: "Big Box Store",
        amount: new Prisma.Decimal(-750.5),
        date: new Date("2026-07-15T00:00:00.000Z"),
      },
    })

    const result = toNotification(row)
    expect(result).toMatchObject({
      type: "LARGE_PURCHASE",
      transactionId: "txn-1",
      merchant: "Big Box Store",
      amount: 750.5,
    })
  })

  it("returns null for a LARGE_PURCHASE row missing its joined Transaction (defensive)", () => {
    const row = buildNotificationRow({ type: "LARGE_PURCHASE", transactionId: "txn-1" })
    expect(toNotification(row)).toBeNull()
  })

  it("shapes a LOW_BALANCE row from the joined Account's current name/balance", () => {
    const row = buildNotificationRow({
      type: "LOW_BALANCE",
      accountId: "acct-1",
      account: { id: "acct-1", name: "Everyday Checking", balance: new Prisma.Decimal(42.1) },
    })

    const result = toNotification(row)
    expect(result).toEqual({
      id: "notif-1",
      createdAt: row.createdAt,
      readAt: null,
      dismissedAt: null,
      type: "LOW_BALANCE",
      accountId: "acct-1",
      accountName: "Everyday Checking",
      balance: 42.1,
    })
  })

  it("returns null for a LOW_BALANCE row missing its joined Account (defensive)", () => {
    const row = buildNotificationRow({ type: "LOW_BALANCE", accountId: "acct-1" })
    expect(toNotification(row)).toBeNull()
  })

  it("shapes a MONTHLY_SUMMARY_READY row, formatting the month and passing the narrative verbatim", () => {
    const row = buildNotificationRow({
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
      monthlySummary: {
        id: "summary-1",
        month: new Date(Date.UTC(2026, 6, 1)),
        narrative: "You saved $500 more than last month.",
      },
    })

    const result = toNotification(row)
    expect(result).toEqual({
      id: "notif-1",
      createdAt: row.createdAt,
      readAt: null,
      dismissedAt: null,
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
      month: "2026-07",
      narrative: "You saved $500 more than last month.",
    })
  })

  it("returns null for a MONTHLY_SUMMARY_READY row whose joined narrative is still null (should never be created, but handled defensively)", () => {
    const row = buildNotificationRow({
      type: "MONTHLY_SUMMARY_READY",
      monthlySummaryId: "summary-1",
      monthlySummary: { id: "summary-1", month: new Date(Date.UTC(2026, 6, 1)), narrative: null },
    })
    expect(toNotification(row)).toBeNull()
  })

  it("returns null for a MONTHLY_SUMMARY_READY row missing its joined MonthlySummary (defensive)", () => {
    const row = buildNotificationRow({ type: "MONTHLY_SUMMARY_READY", monthlySummaryId: "summary-1" })
    expect(toNotification(row)).toBeNull()
  })
})

// `createNotificationIfNew` always touches `@/lib/db` and is out of scope
// for a live-database test, per this codebase's standing convention — its
// "attempt the create, catch-and-ignore P2002" dedup contract is instead
// verified at the source level, mirroring `dashboard/server/snapshot.ts`'s
// identical P2002-catch precedent and `rate-limit.test.ts`'s own
// source-level-wiring checks.
describe("createNotificationIfNew source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "notification-mapper.ts"), "utf-8")

  it("attempts db.notification.create, never db.notification.upsert (dedup is create-plus-catch, not upsert)", () => {
    const fnStart = SOURCE.indexOf("export async function createNotificationIfNew")
    const fnBody = SOURCE.slice(fnStart)
    expect(fnBody).toMatch(/db\.notification\.create\(/)
    expect(fnBody).not.toMatch(/db\.notification\.upsert\(/)
  })

  it("catches P2002 (Prisma's unique-constraint-violation code) and returns null instead of rethrowing", () => {
    const fnStart = SOURCE.indexOf("export async function createNotificationIfNew")
    const fnBody = SOURCE.slice(fnStart)
    expect(fnBody).toMatch(/isDuplicateNotificationError\(error\)/)
    expect(fnBody).toMatch(/return null/)
    expect(SOURCE).toMatch(/error\.code === "P2002"/)
  })

  it("rethrows any error that is NOT a duplicate-key violation, never silently swallowing a genuine failure", () => {
    const fnStart = SOURCE.indexOf("export async function createNotificationIfNew")
    const fnBody = SOURCE.slice(fnStart)
    expect(fnBody).toMatch(/throw error/)
  })
})
