import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

// `categorization.ts` transitively imports `EXCLUDE_SPLIT_PARENTS` from
// `./service.ts`, which imports `./receipts.ts` -> `lib/uploadthing.ts`,
// whose module-level `export const utapi = new UTApi()` throws under
// vitest's jsdom test environment (`UTApi`'s own server-only guard). This
// mock exists purely to make the module graph importable in a test process
// -- mirrors `features/dashboard/server/monthly-summary.test.ts`'s and
// `features/analytics/server/income-analytics.test.ts`'s identical mock;
// never exercised by anything in this file.
vi.mock("@/lib/uploadthing", () => ({ utapi: {} }))

import { CATEGORIZATION_BATCH_SIZE, MAX_BATCHES_PER_USER_PER_INVOCATION } from "@/lib/ai/rate-limit"

import { selectBatchesForInvocation } from "./categorization"

// Verifies the Phase 4a review-gate fix for the Performance Engineer's HIGH
// finding: `generateAutomaticSuggestionsForUser`'s batch loop had no
// per-invocation upper bound, so one user's large backlog could alone
// exhaust the cron route's `maxDuration = 60` budget and starve every user
// after it in iteration order. `selectBatchesForInvocation` is the pure
// calculation behind the fix -- unit-tested directly (no database), per
// this codebase's standing "no integration-test database" convention
// (`features/budgeting/server/advisor.test.ts`,
// `src/lib/ai/rate-limit.test.ts`): `generateAutomaticSuggestionsForUser`/
// `generateAutomaticSuggestionsForAllUsers` themselves always touch Prisma
// and the model, and are out of scope for these unit tests; their wiring
// into this pure function is instead verified at the source level below,
// mirroring `advisor.test.ts`'s identical structural-check pattern.

describe("selectBatchesForInvocation", () => {
  it("returns every candidate, chunked, when the backlog fits within the cap (no regression for the common/small-user case)", () => {
    const candidates = Array.from({ length: 25 }, (_, i) => i)
    const batches = selectBatchesForInvocation(candidates, 40, 1)
    expect(batches).toEqual([candidates])
  })

  it("returns an empty array for an empty backlog", () => {
    expect(selectBatchesForInvocation([], 40, 1)).toEqual([])
  })

  it("chunks a backlog exactly at the batch-size boundary into two full batches, both included when the cap allows it", () => {
    const candidates = Array.from({ length: 80 }, (_, i) => i)
    const batches = selectBatchesForInvocation(candidates, 40, 2)
    expect(batches).toEqual([candidates.slice(0, 40), candidates.slice(40, 80)])
  })

  // The core starvation-prevention property: a backlog far larger than the
  // cap only ever gets partial processing in one invocation -- the
  // remaining candidates are never included in any returned batch, and are
  // therefore never passed to `generateSuggestionsForBatch`, so they never
  // receive a `CategorySuggestion` row this invocation. Because
  // `generateAutomaticSuggestionsForUser`'s own eligibility query excludes
  // only transactions that already have a PENDING suggestion (unchanged by
  // this fix), every one of these omitted candidates remains eligible and
  // is picked up again the next invocation -- exactly the "remainder stays
  // eligible for the next invocation" property this fix requires, achieved
  // with no separate cursor/offset persistence.
  it("caps a backlog far larger than the per-invocation limit to only the first N batches, leaving the remainder untouched", () => {
    // Mirrors the exact defect scenario: a 2,000-row CSV import at the
    // real CATEGORIZATION_BATCH_SIZE, which would otherwise cost
    // ceil(2000/40) = 50 sequential batch calls in one invocation.
    const candidates = Array.from({ length: 2000 }, (_, i) => i)
    const batches = selectBatchesForInvocation(
      candidates,
      CATEGORIZATION_BATCH_SIZE,
      MAX_BATCHES_PER_USER_PER_INVOCATION,
    )

    expect(batches).toHaveLength(MAX_BATCHES_PER_USER_PER_INVOCATION)

    const processedCount = batches.reduce((sum, batch) => sum + batch.length, 0)
    expect(processedCount).toBe(
      MAX_BATCHES_PER_USER_PER_INVOCATION * CATEGORIZATION_BATCH_SIZE,
    )
    expect(processedCount).toBeLessThan(candidates.length)

    // Every candidate actually included is drawn from the front of the
    // backlog (oldest-first, per `generateAutomaticSuggestionsForUser`'s own
    // `orderBy: { createdAt: "asc" }`) -- the remainder (index 40 onward, at
    // today's cap of 1) is never present in any returned batch.
    const includedIds = new Set(batches.flat())
    expect(includedIds.has(candidates[0])).toBe(true)
    expect(includedIds.has(candidates[candidates.length - 1])).toBe(false)
  })

  it("never returns more than maxBatches groups regardless of how large the backlog is", () => {
    const candidates = Array.from({ length: 100_000 }, (_, i) => i)
    const batches = selectBatchesForInvocation(candidates, 40, 3)
    expect(batches.length).toBeLessThanOrEqual(3)
    expect(batches).toHaveLength(3)
  })

  // Starvation prevention only holds if a large user's capped work is
  // computed independently of any other user's backlog size -- this pure
  // function takes no state beyond its own three arguments, so a huge
  // "other user" backlog earlier in `generateAutomaticSuggestionsForAllUsers`'s
  // sequential loop can never influence (shrink, delay, or skip) what this
  // function returns for a later user's own call. Modeled here as two
  // independent calls representing the defect's own two-user scenario.
  it("computes a later user's own batch allocation independently of an earlier user's backlog size", () => {
    const largeUserBacklog = Array.from({ length: 2000 }, (_, i) => i)
    const smallUserBacklog = Array.from({ length: 10 }, (_, i) => i)

    const largeUserBatches = selectBatchesForInvocation(
      largeUserBacklog,
      CATEGORIZATION_BATCH_SIZE,
      MAX_BATCHES_PER_USER_PER_INVOCATION,
    )
    const smallUserBatches = selectBatchesForInvocation(
      smallUserBacklog,
      CATEGORIZATION_BATCH_SIZE,
      MAX_BATCHES_PER_USER_PER_INVOCATION,
    )

    // The large user is capped (partial processing)...
    expect(largeUserBatches.flat().length).toBeLessThan(largeUserBacklog.length)
    // ...while the small user -- queued after them in iteration order --
    // still gets its own full backlog attempted in the very same invocation,
    // completely unaffected by how large the previous user's backlog was.
    expect(smallUserBatches.flat()).toEqual(smallUserBacklog)
  })
})

describe("generateAutomaticSuggestionsForUser/generateAutomaticSuggestionsForAllUsers source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "categorization.ts"), "utf-8")

  it("bounds its batch loop via selectBatchesForInvocation using the shared MAX_BATCHES_PER_USER_PER_INVOCATION cap, not an unbounded per-candidate loop", () => {
    expect(SOURCE).toMatch(
      /selectBatchesForInvocation\(\s*candidateTransactions,\s*CATEGORIZATION_BATCH_SIZE,\s*MAX_BATCHES_PER_USER_PER_INVOCATION,?\s*\)/,
    )
  })

  it("imports MAX_BATCHES_PER_USER_PER_INVOCATION from the shared lib/ai/rate-limit.ts module, not a locally re-derived constant", () => {
    expect(SOURCE).toMatch(/import\s*{[^}]*MAX_BATCHES_PER_USER_PER_INVOCATION[^}]*}\s*from\s*"@\/lib\/ai\/rate-limit"/)
  })

  it("still iterates every eligible user unconditionally in a single pass -- no early break/return that would itself reintroduce starvation of later users", () => {
    const fnStart = SOURCE.indexOf(
      "export async function generateAutomaticSuggestionsForAllUsers",
    )
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = SOURCE.slice(fnStart)
    const loopStart = fnBody.indexOf("for (const user of usersWithUncategorizedTransactions)")
    expect(loopStart).toBeGreaterThan(-1)
    // The loop's own closing brace is the line immediately before the
    // function's final `return { processed, suggested }` statement -- slice
    // up to that return, not just the next `\n}` (which would otherwise
    // match the loop's own close brace one line too early, or the
    // function's if unrolled differently), so this only inspects the loop
    // body itself.
    const returnStart = fnBody.indexOf("return { processed, suggested }", loopStart)
    expect(returnStart).toBeGreaterThan(loopStart)
    const loopBody = fnBody.slice(loopStart, returnStart)
    expect(loopBody).not.toMatch(/\bbreak\b/)
    expect(loopBody).not.toMatch(/\breturn\b/)
  })

  it("still catches a single user's failure so it never aborts processing of users queued after it", () => {
    expect(SOURCE).toMatch(/catch \(error\) {\s*console\.error\(\s*`\[categorization cron\]/)
  })
})
