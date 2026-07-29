import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// `getIncomeCalendarMonth` always touches the database (lazy occurrence
// generation, then two range queries) and is out of scope for a database-
// free unit test, per this codebase's standing "no integration-test
// database" convention (mirrors `features/dashboard/server/
// monthly-summary.test.ts`'s and `features/financial-health-score/server/
// snapshot.test.ts`'s identical split) — `features/bills/server/
// service.ts`'s own `getCalendarMonth`, the function this one is deliberately
// modeled after, has no test coverage of its own for the identical reason.
//
// The invariants that matter most for this function — per
// docs/architecture/phase-4c-technical-design.md §2.3 — are instead verified
// structurally, at the source level, the same way `snapshot.test.ts`
// verifies its own ordering/never-reimplemented guarantees: (1) status is
// always computed via the existing, imported `computeOccurrenceStatus`,
// never a second, parallel status computation invented for the calendar's
// benefit, and (2) Irregular events are read directly, with no occurrence-
// generation step, per calendar-v2.md AC7.
describe("getIncomeCalendarMonth never reimplements status math or projects Irregular events", () => {
  const SOURCE = readFileSync(join(__dirname, "service.ts"), "utf-8")
  const fnStart = SOURCE.indexOf("export async function getIncomeCalendarMonth")
  const fnBody = SOURCE.slice(fnStart)

  it("exists as an exported function", () => {
    expect(fnStart).toBeGreaterThan(-1)
  })

  it("computes occurrence status via the shared, imported computeOccurrenceStatus — never a second implementation", () => {
    expect(fnBody).toMatch(/computeOccurrenceStatus\(/)
    // `computeOccurrenceStatus` itself is imported from `./occurrence`, not
    // redefined in this file — a second `function computeOccurrenceStatus`
    // declaration anywhere in the module would mean the calendar path
    // silently forked its own copy of Bills'/this module's status logic.
    expect(SOURCE.match(/function computeOccurrenceStatus/g) ?? []).toHaveLength(0)
  })

  it("queries IrregularIncomeEvent directly, with no ensureOccurrencesGenerated call for it (AC7)", () => {
    expect(fnBody).toMatch(/db\.irregularIncomeEvent\.findMany\(/)
    // Only the scheduled-stream branch calls the lazy generator; the
    // Irregular-event query must not be preceded by a generation call for
    // Irregular streams (there is nothing to generate — AC11/AC7).
    const generationCallCount = (fnBody.match(/ensureOccurrencesGenerated\(/g) ?? []).length
    expect(generationCallCount).toBe(1)
  })

  it("restricts occurrence generation to non-IRREGULAR streams only", () => {
    expect(fnBody).toMatch(/schedule: \{ not: IncomeSchedule\.IRREGULAR \}/)
  })
})
