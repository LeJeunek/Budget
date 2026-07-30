import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Coverage for `updateDashboardCardVisibility`'s TOCTOU fix
// (dashboard-card-visibility-toctou-empty-dashboard.md). This codebase has no
// integration-test database (see `lib/ai/rate-limit.test.ts`'s identical
// note) — a true "fire two concurrent calls against a real Postgres and
// assert the invariant holds" test isn't executable in this environment, so
// the actual cross-transaction concurrency-control mechanism (Postgres's
// `Serializable` isolation aborting one of two truly-concurrent
// transactions) is instead verified at the source level, the same
// `readFileSync` + regex-assertion convention `rate-limit.test.ts` already
// established for the identical "persistence behavior only verifiable
// against a live DB" situation. `service.test.ts`'s own
// `wouldHideLastVisibleCard` suite covers the guard's pure decision logic;
// this file confirms that logic is actually wired up the way the fix
// requires: re-evaluated fresh, inside a Serializable transaction, never
// trusted from a pre-transaction read.
describe("updateDashboardCardVisibility's Serializable-transaction TOCTOU fix", () => {
  const SOURCE = readFileSync(join(__dirname, "actions.ts"), "utf-8")

  it("wraps the guard check and the write in a single db.$transaction", () => {
    expect(SOURCE).toMatch(/db\.\$transaction\(\s*async \(tx\) => \{/)
  })

  it("runs that transaction under Serializable isolation, not the default isolation level", () => {
    expect(SOURCE).toMatch(
      /isolationLevel:\s*Prisma\.TransactionIsolationLevel\.Serializable/,
    )
  })

  it("re-reads DashboardCardPreference rows FROM THE TRANSACTION CLIENT (tx), never from a pre-transaction read, before evaluating the guard", () => {
    expect(SOURCE).toMatch(/tx\.dashboardCardPreference\.findMany\(/)
  })

  it("evaluates the guard against that fresh, in-transaction read via wouldHideLastVisibleCard", () => {
    expect(SOURCE).toMatch(/wouldHideLastVisibleCard\(current, key, visible\)/)
  })

  it("persists the write against the same transaction client (tx), not the top-level db singleton", () => {
    expect(SOURCE).toMatch(/persistAllCardPreferences\(tx, user\.id, nextCards\)/)
  })

  it("catches Prisma's P2034 (serialization conflict) and translates it into a friendly ApiResult failure, never lets it escape unhandled", () => {
    expect(SOURCE).toMatch(/error\.code === "P2034"/)
    expect(SOURCE).toMatch(/isTransactionConflictError\(error\)/)
  })
})
