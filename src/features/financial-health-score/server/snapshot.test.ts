import { readFileSync } from "node:fs"
import { join } from "node:path"

import { FinancialHealthScoreLabel as PrismaFinancialHealthScoreLabel } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

// `snapshot.ts` transitively imports `getBudgetHealthScore` (via
// `./service.ts`), which itself imports `features/transactions/server/
// aggregations.ts` -> `features/transactions/server/service.ts` ->
// `features/transactions/server/receipts.ts` -> `lib/uploadthing.ts`, whose
// module-level `export const utapi = new UTApi()` throws under vitest's
// jsdom test environment (`UTApi`'s own server-only guard). This mock exists
// purely to make the module graph importable in a test process -- mirrors
// `features/dashboard/server/monthly-summary.test.ts`'s identical mock;
// never exercised by anything in this file.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { fromPrismaLabel, toPrismaLabel } from "./snapshot"

describe("toPrismaLabel / fromPrismaLabel", () => {
  it("round-trips 'Good'", () => {
    expect(fromPrismaLabel(toPrismaLabel("Good"))).toBe("Good")
    expect(toPrismaLabel("Good")).toBe(PrismaFinancialHealthScoreLabel.GOOD)
  })

  it("round-trips 'Fair'", () => {
    expect(fromPrismaLabel(toPrismaLabel("Fair"))).toBe("Fair")
    expect(toPrismaLabel("Fair")).toBe(PrismaFinancialHealthScoreLabel.FAIR)
  })

  it("round-trips 'Needs attention'", () => {
    expect(fromPrismaLabel(toPrismaLabel("Needs attention"))).toBe("Needs attention")
    expect(toPrismaLabel("Needs attention")).toBe(PrismaFinancialHealthScoreLabel.NEEDS_ATTENTION)
  })
})

// The DB-touching orchestration (`captureFinancialHealthScoreSnapshot`,
// `captureAllUsersFinancialHealthScoreSnapshots`) always touches the
// database and is out of scope for these unit tests, per this codebase's
// standing "no integration-test database" convention (mirrors
// `monthly-summary.test.ts`'s identical split). The invariants below --
// Feature 5's own strongest degradation guarantee -- are instead verified
// structurally, at the source level, the same way `monthly-summary.test.ts`
// verifies its own rate-limit-gate ordering.
describe("snapshot.ts never lets a narrative failure block or roll back the score write", () => {
  const SOURCE = readFileSync(join(__dirname, "snapshot.ts"), "utf-8")

  it("upserts the score row before ever attempting narrative generation", () => {
    const upsertIndex = SOURCE.indexOf("db.financialHealthScoreSnapshot.upsert(")
    const generateIndex = SOURCE.indexOf("generateFinancialHealthScoreNarrative(")
    expect(upsertIndex).toBeGreaterThan(-1)
    expect(generateIndex).toBeGreaterThan(-1)
    expect(generateIndex).toBeGreaterThan(upsertIndex)
  })

  it("wraps the narrative step in its own try/catch, independent of the score upsert", () => {
    const tryIndex = SOURCE.indexOf("try {")
    const generateIndex = SOURCE.indexOf("generateFinancialHealthScoreNarrative(")
    const upsertIndex = SOURCE.indexOf("db.financialHealthScoreSnapshot.upsert(")
    expect(tryIndex).toBeGreaterThan(-1)
    // The try block starts AFTER the upsert has already executed (the
    // upsert itself is not inside this try/catch, so it can never be
    // swallowed by the narrative's own error handling).
    expect(tryIndex).toBeGreaterThan(upsertIndex)
    expect(generateIndex).toBeGreaterThan(tryIndex)
  })

  it("never writes the narrative column as part of the score upsert's own update/create data", () => {
    const upsertCallStart = SOURCE.indexOf("db.financialHealthScoreSnapshot.upsert(")
    const upsertCallEnd = SOURCE.indexOf("\n  })", upsertCallStart)
    const upsertCallBody = SOURCE.slice(upsertCallStart, upsertCallEnd)
    expect(upsertCallBody).not.toMatch(/narrative:/)
  })
})

describe("captureAllUsersFinancialHealthScoreSnapshots loops sequentially, never concurrently", () => {
  const SOURCE = readFileSync(join(__dirname, "snapshot.ts"), "utf-8")

  it("uses a for...of loop over users, not Promise.all", () => {
    const fnStart = SOURCE.indexOf(
      "export async function captureAllUsersFinancialHealthScoreSnapshots",
    )
    const fnBody = SOURCE.slice(fnStart)
    expect(fnBody).toMatch(/for \(const user of users\)/)
    expect(fnBody).not.toMatch(/Promise\.all\(\s*users/)
  })

  it("catches a single user's failure so the rest of the run still completes", () => {
    const fnStart = SOURCE.indexOf(
      "export async function captureAllUsersFinancialHealthScoreSnapshots",
    )
    const fnBody = SOURCE.slice(fnStart)
    expect(fnBody).toMatch(/catch \(error\)/)
  })
})
