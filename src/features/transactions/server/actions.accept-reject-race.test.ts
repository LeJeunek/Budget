import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Regression coverage for the Phase 4a review-gate's Bug Hunter findings
 * against `acceptCategorySuggestion`/`rejectCategorySuggestion`
 * (`server/actions.ts`):
 *
 *   - HIGH: `docs/testing/bug-reports/accept-reject-category-suggestion-toctou-race.md`
 *   - LOW-MEDIUM: `docs/testing/bug-reports/accept-suggestion-category-deleted-mid-flight-stuck-pending.md`
 *
 * Per this codebase's own standing "no integration-test database" convention
 * (see `categorization.test.ts`'s identical framing, and both bug reports'
 * own reproductions), these functions are never exercised end-to-end against
 * a real Prisma client here. Instead, this file:
 *
 *   1. Models the FIXED control-flow shape — atomic "claim by rows-affected"
 *      conditional update, exactly mirroring
 *      `db.categorySuggestion.updateMany({ where: { ..., status: "PENDING" },
 *      data: { status } })` — as a small in-memory harness, adapted directly
 *      from the TOCTOU report's own reproduction harness (same idea: an
 *      in-memory row standing in for the DB row, concurrent "requests"
 *      racing against it with independently-timed delays standing in for
 *      network/DB latency). This proves the *algorithm* the fix uses closes
 *      the race under adversarial interleaving, not merely in the sequential
 *      case.
 *   2. Separately asserts, at the source level (mirroring
 *      `categorization.test.ts`'s own "source-level wiring" precedent), that
 *      the REAL `acceptCategorySuggestion`/`rejectCategorySuggestion` in
 *      `actions.ts` actually implement that exact atomic-claim shape — tying
 *      the harness's assumptions back to the shipped code, not just to an
 *      idealized model of it.
 */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// 1. In-memory harness modeling the fixed atomic-claim shape
// ---------------------------------------------------------------------------

type SuggestionStatus = "PENDING" | "ACCEPTED" | "REJECTED"

interface FakeSuggestionRow {
  id: string
  status: SuggestionStatus
  suggestedCategoryId: string | null
}

interface FakeStore {
  suggestion: FakeSuggestionRow
  /** Stands in for `Transaction.categoryId` — must only ever change as a
   * result of a call that actually won the ACCEPTED claim. */
  transactionCategoryId: string | null
}

function makeStore(suggestedCategoryId: string | null): FakeStore {
  return {
    suggestion: { id: "sugg-1", status: "PENDING", suggestedCategoryId },
    transactionCategoryId: null,
  }
}

/** Mirrors `db.categorySuggestion.updateMany({ where: { id, status:
 * "PENDING" }, data: { status: next } })` — the sole authority for the state
 * transition, exactly as implemented in `actions.ts` post-fix. Returns the
 * Prisma-style `count` of rows actually updated (0 or 1). */
function claimAtomically(
  store: FakeStore,
  id: string,
  next: "ACCEPTED" | "REJECTED",
): number {
  if (store.suggestion.id === id && store.suggestion.status === "PENDING") {
    store.suggestion.status = next
    return 1
  }
  return 0
}

type AcceptOutcome =
  | { result: "accepted" }
  | { result: "already_resolved" }
  | { result: "category_invalid" }

/**
 * Mirrors `acceptCategorySuggestion`'s fixed shape: a non-authoritative read
 * (`readDelayMs` standing in for that round trip), THEN the atomic claim,
 * and ONLY IF the claim succeeds does the transaction-mutating side effect
 * (`sideEffectDelayMs` standing in for `updateTransaction`'s own, strictly
 * larger, round trip) run.
 */
async function fixedAccept(
  store: FakeStore,
  id: string,
  readDelayMs: number,
  sideEffectDelayMs: number,
): Promise<AcceptOutcome> {
  const snapshot = { ...store.suggestion }
  await delay(readDelayMs)

  if (!snapshot.suggestedCategoryId) {
    const claimed = claimAtomically(store, id, "REJECTED")
    return claimed === 1 ? { result: "category_invalid" } : { result: "already_resolved" }
  }

  const claimed = claimAtomically(store, id, "ACCEPTED")
  if (claimed === 0) {
    return { result: "already_resolved" }
  }

  // The side effect only ever runs after winning the claim — this ordering
  // is the entire fix.
  await delay(sideEffectDelayMs)
  store.transactionCategoryId = snapshot.suggestedCategoryId
  return { result: "accepted" }
}

type RejectOutcome = { result: "rejected" } | { result: "already_resolved" }

async function fixedReject(
  store: FakeStore,
  id: string,
  readDelayMs: number,
): Promise<RejectOutcome> {
  await delay(readDelayMs)
  const claimed = claimAtomically(store, id, "REJECTED")
  return claimed === 1 ? { result: "rejected" } : { result: "already_resolved" }
}

describe("acceptCategorySuggestion/rejectCategorySuggestion concurrency fix (HIGH finding)", () => {
  it("Accept winning the race: exactly one caller succeeds, and the transaction's category changes if and only if the suggestion ends up ACCEPTED", async () => {
    const store = makeStore("cat-groceries")

    // Accept's own work (read + side effect) takes longer in wall-clock terms
    // than Reject's single write — the report's own "Reject wins the last
    // write" scenario shape, but here proving the FIX no longer lets Accept's
    // side effect land unconditionally.
    const [acceptOutcome, rejectOutcome] = await Promise.all([
      fixedAccept(store, "sugg-1", 5, 5),
      fixedReject(store, "sugg-1", 1),
    ])

    // Reject wins the atomic claim (it reaches the claim first because its
    // own read delay is shorter) — Accept must then fail closed rather than
    // silently applying its side effect anyway.
    expect(rejectOutcome.result).toBe("rejected")
    expect(acceptOutcome.result).toBe("already_resolved")
    expect(store.suggestion.status).toBe("REJECTED")
    // The core invariant the original bug violated: a REJECTED suggestion
    // must never coincide with a changed transaction category.
    expect(store.transactionCategoryId).toBeNull()
  })

  it("Accept winning outright (Reject arrives after Accept has already claimed): the transaction's category changes and the suggestion is consistently ACCEPTED", async () => {
    const store = makeStore("cat-groceries")

    const [acceptOutcome, rejectOutcome] = await Promise.all([
      fixedAccept(store, "sugg-1", 0, 1),
      fixedReject(store, "sugg-1", 20),
    ])

    expect(acceptOutcome.result).toBe("accepted")
    expect(rejectOutcome.result).toBe("already_resolved")
    expect(store.suggestion.status).toBe("ACCEPTED")
    expect(store.transactionCategoryId).toBe("cat-groceries")
  })

  it("holds the core invariant (status/category-change consistency, exactly one winner) across many randomized concurrent orderings", async () => {
    for (let trial = 0; trial < 25; trial += 1) {
      const store = makeStore("cat-groceries")
      const acceptReadDelay = Math.random() * 10
      const acceptSideEffectDelay = Math.random() * 10
      const rejectReadDelay = Math.random() * 10

      const [acceptOutcome, rejectOutcome] = await Promise.all([
        fixedAccept(store, "sugg-1", acceptReadDelay, acceptSideEffectDelay),
        fixedReject(store, "sugg-1", rejectReadDelay),
      ])

      // Exactly one of the two ever wins.
      const winners = [acceptOutcome.result, rejectOutcome.result].filter(
        (result) => result !== "already_resolved",
      )
      expect(winners).toHaveLength(1)

      if (store.suggestion.status === "ACCEPTED") {
        expect(store.transactionCategoryId).toBe("cat-groceries")
        expect(acceptOutcome.result).toBe("accepted")
      } else {
        expect(store.suggestion.status).toBe("REJECTED")
        expect(store.transactionCategoryId).toBeNull()
      }
    }
  })

  it("never lets a losing Accept apply its side effect even when it is given every opportunity to still do so after losing its own claim", async () => {
    // Reject is invoked first (and with the shortest possible delay), so it
    // wins the atomic claim before Accept's own claim attempt runs. Accept
    // is then given a generous extra window (well after it has already lost)
    // in which the original, unfixed shape would have gone on to apply its
    // side effect unconditionally — the fix must prevent that regardless.
    const store = makeStore("cat-groceries")

    const [rejectOutcome, acceptOutcome] = await Promise.all([
      fixedReject(store, "sugg-1", 0),
      fixedAccept(store, "sugg-1", 0, 15),
    ])

    expect(rejectOutcome.result).toBe("rejected")
    expect(acceptOutcome.result).toBe("already_resolved")
    expect(store.transactionCategoryId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 1b. Sequential control-flow trace for the LOW-MEDIUM finding
// ---------------------------------------------------------------------------
//
// Per the bug report's own admission, the category-deleted-mid-flight race
// "requires a live Postgres instance to execute the two statements in the
// adversarial order — no integration-test database exists in this codebase
// per this project's own standing convention" — so this is verified as a
// precise control-flow trace (the exact sequence of reads/writes
// `acceptCategorySuggestion` performs), not an executed concurrent race,
// consistent with how the report itself presents the defect.

type UpdateTransactionStub = { success: false; error: string } | { success: true }

/** Mirrors exactly the fixed control flow of `acceptCategorySuggestion`'s
 * non-null-`suggestedCategoryId` branch, taking a stand-in for
 * `updateTransaction`'s own result so this trace can inject the specific
 * "Category not found" failure the report's step 5 describes, without
 * needing a real Prisma client. */
async function fixedAcceptTrace(
  suggestion: { id: string; status: SuggestionStatus; suggestedCategoryId: string | null },
  updateTransactionResult: UpdateTransactionStub,
): Promise<{ message: string; finalStatus: SuggestionStatus }> {
  const claimed = suggestion.status === "PENDING"
  if (!claimed) {
    return { message: "This suggestion has already been resolved", finalStatus: suggestion.status }
  }
  suggestion.status = "ACCEPTED"

  if (!updateTransactionResult.success) {
    if (updateTransactionResult.error === "Category not found") {
      suggestion.status = "REJECTED"
      return {
        message: "This suggested category no longer exists",
        finalStatus: suggestion.status,
      }
    }
    suggestion.status = "PENDING"
    return { message: updateTransactionResult.error, finalStatus: suggestion.status }
  }

  return { message: "ok", finalStatus: suggestion.status }
}

describe("acceptCategorySuggestion category-deleted-mid-flight fix (LOW-MEDIUM finding)", () => {
  it("marks the suggestion REJECTED with the feature's own message when updateTransaction's fresh lookup finds the category already deleted", async () => {
    // Step 2 of the report: this function's own read still sees a non-null
    // suggestedCategoryId (the delete hasn't landed yet from this
    // function's point of view).
    const suggestion = {
      id: "sugg-1",
      status: "PENDING" as SuggestionStatus,
      suggestedCategoryId: "cat-groceries",
    }

    // Step 3-5: the category was deleted concurrently, so updateTransaction's
    // OWN fresh assertOwnedCategory lookup (run after this function's read)
    // comes up empty.
    const outcome = await fixedAcceptTrace(suggestion, {
      success: false,
      error: "Category not found",
    })

    expect(outcome.message).toBe("This suggested category no longer exists")
    expect(outcome.finalStatus).toBe("REJECTED")
    // Never left stuck PENDING (the original bug) — the row is
    // deterministically resolved either way.
    expect(outcome.finalStatus).not.toBe("PENDING")
  })

  it("does not fire the invalidation branch for an unrelated updateTransaction failure (e.g. the transaction itself was deleted concurrently)", async () => {
    const suggestion = {
      id: "sugg-1",
      status: "PENDING" as SuggestionStatus,
      suggestedCategoryId: "cat-groceries",
    }

    const outcome = await fixedAcceptTrace(suggestion, {
      success: false,
      error: "Transaction not found",
    })

    // Reverted to PENDING (retryable), not misreported as an invalidated
    // category, and not left stuck ACCEPTED with no applied effect.
    expect(outcome.message).toBe("Transaction not found")
    expect(outcome.finalStatus).toBe("PENDING")
  })

  it("still succeeds normally when updateTransaction succeeds (no regression for the non-race path)", async () => {
    const suggestion = {
      id: "sugg-1",
      status: "PENDING" as SuggestionStatus,
      suggestedCategoryId: "cat-groceries",
    }

    const outcome = await fixedAcceptTrace(suggestion, { success: true })

    expect(outcome.finalStatus).toBe("ACCEPTED")
  })
})

// ---------------------------------------------------------------------------
// 2. Source-level verification the real implementation matches the harness
// ---------------------------------------------------------------------------

describe("acceptCategorySuggestion/rejectCategorySuggestion source-level wiring", () => {
  const SOURCE = readFileSync(join(__dirname, "actions.ts"), "utf-8")

  it("claims the ACCEPTED transition atomically via updateMany keyed on status: \"PENDING\", not a plain update after a separate read", () => {
    const fnStart = SOURCE.indexOf("export async function acceptCategorySuggestion")
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = SOURCE.slice(fnStart, SOURCE.indexOf("export async function rejectCategorySuggestion"))

    expect(fnBody).toMatch(
      /categorySuggestion\.updateMany\(\{\s*where:\s*\{\s*id:\s*suggestion\.id,\s*userId:\s*user\.id,\s*status:\s*"PENDING",?\s*\},\s*data:\s*\{\s*status:\s*"ACCEPTED"/,
    )
    // The claim's result gates the side effect — `updateTransaction` is only
    // ever called after checking `claimed.count`.
    const claimIndex = fnBody.indexOf('data: { status: "ACCEPTED"')
    const updateTransactionIndex = fnBody.indexOf("await updateTransaction(")
    expect(claimIndex).toBeGreaterThan(-1)
    expect(updateTransactionIndex).toBeGreaterThan(claimIndex)
  })

  it("claims the REJECTED transition atomically via updateMany keyed on status: \"PENDING\" in rejectCategorySuggestion", () => {
    const fnStart = SOURCE.indexOf("export async function rejectCategorySuggestion")
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = SOURCE.slice(fnStart)

    expect(fnBody).toMatch(
      /categorySuggestion\.updateMany\(\{\s*where:\s*\{\s*id:\s*suggestionId,\s*userId:\s*user\.id,\s*status:\s*"PENDING",?\s*\},\s*data:\s*\{\s*status:\s*"REJECTED"/,
    )
  })

  it("treats updateTransaction's 'Category not found' failure as an invalidation (REJECTED + the feature's own message), not a propagated generic error (LOW-MEDIUM finding)", () => {
    const fnStart = SOURCE.indexOf("export async function acceptCategorySuggestion")
    const fnEnd = SOURCE.indexOf("export async function rejectCategorySuggestion")
    const fnBody = SOURCE.slice(fnStart, fnEnd)

    expect(fnBody).toMatch(/updateResult\.error === "Category not found"/)

    const specificCheckIndex = fnBody.indexOf('updateResult.error === "Category not found"')
    const rejectedWriteIndex = fnBody.indexOf('status: "REJECTED"', specificCheckIndex)
    const friendlyMessageIndex = fnBody.indexOf(
      'fail("This suggested category no longer exists")',
      specificCheckIndex,
    )
    expect(rejectedWriteIndex).toBeGreaterThan(specificCheckIndex)
    expect(friendlyMessageIndex).toBeGreaterThan(specificCheckIndex)
  })

  it("reverts an unrelated updateTransaction failure back to PENDING rather than leaving the row stuck ACCEPTED with no applied category change", () => {
    const fnStart = SOURCE.indexOf("export async function acceptCategorySuggestion")
    const fnEnd = SOURCE.indexOf("export async function rejectCategorySuggestion")
    const fnBody = SOURCE.slice(fnStart, fnEnd)

    expect(fnBody).toMatch(
      /categorySuggestion\.updateMany\(\{\s*where:\s*\{\s*id:\s*suggestion\.id,\s*userId:\s*user\.id,\s*status:\s*"ACCEPTED",?\s*\},\s*data:\s*\{\s*status:\s*"PENDING"/,
    )
  })
})
