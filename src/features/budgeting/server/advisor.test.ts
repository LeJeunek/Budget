import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Verifies Feature 2's own Definition of Done requirement (docs/product/ai-features.md):
// "A test verifies the advisor has no code path capable of writing to
// Budget/BudgetCategory data -- it is read-only, by construction, not just by
// convention." This codebase has no integration-test database (every
// existing test in this repo is a pure unit test against fixture data/schemas
// -- confirmed by grep: no `*.test.ts` file imports `@/lib/db`), so this is a
// source-level check: `advisor.ts`'s own Prisma calls are inspected directly
// rather than exercised against a live database. A mutation here (any
// `db.budget.<write>` / `db.budgetCategory.<write>` call appearing in this
// file) would fail this test immediately, making "read-only" a property this
// suite actually enforces, not just documents.

const ADVISOR_SOURCE = readFileSync(join(__dirname, "advisor.ts"), "utf-8")

const WRITE_METHODS = ["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany"]

describe("advisor.ts is read-only against Budget/BudgetCategory, by construction", () => {
  it("never calls a Prisma write method on db.budget", () => {
    for (const method of WRITE_METHODS) {
      expect(ADVISOR_SOURCE).not.toMatch(new RegExp(`db\\.budget\\.${method}\\b`))
    }
  })

  it("never calls a Prisma write method on db.budgetCategory", () => {
    for (const method of WRITE_METHODS) {
      expect(ADVISOR_SOURCE).not.toMatch(new RegExp(`db\\.budgetCategory\\.${method}\\b`))
    }
  })

  it("reads Budget data only through service.ts's existing getBudgetMonth/getBudgetHealthScore", () => {
    expect(ADVISOR_SOURCE).toMatch(/getBudgetMonth/)
    expect(ADVISOR_SOURCE).toMatch(/getBudgetHealthScore/)
    // Never queries `db.budget` or `db.budgetCategory` directly -- every read
    // goes through the shared service functions above, so this feature can
    // never compute Allocated/Spent/Remaining differently than the rest of
    // the Budgeting page (Cross-Cutting Requirement #2, "no fabricated
    // figures").
    expect(ADVISOR_SOURCE).not.toMatch(/db\.budget\./)
    expect(ADVISOR_SOURCE).not.toMatch(/db\.budgetCategory\./)
  })

  it("its only persistence is its own BudgetAdvisorCache row", () => {
    expect(ADVISOR_SOURCE).toMatch(/db\.budgetAdvisorCache\.(create|update|updateMany|findUnique)\(/)
  })
})
