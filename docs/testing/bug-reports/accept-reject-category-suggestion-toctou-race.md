# Bug Report: `acceptCategorySuggestion`/`rejectCategorySuggestion` race lets a rejected suggestion still silently categorize the transaction (or vice versa)

## Severity
**High** — a financial-data-integrity defect: the transaction's own `categoryId` can end up changed as a direct result of a suggestion whose final, persisted status is `REJECTED`, with no error surfaced to either caller. This is exactly the kind of "the AI silently did something the user didn't approve" outcome Cross-Cutting Product Requirement #3/#4 (`ai-features-design.md` §4.4's "no autonomous write path" rule) is designed to prevent, and it is reachable via two ordinary overlapping requests, not a contrived adversarial setup.

## Component
`src/features/transactions/server/actions.ts` — `acceptCategorySuggestion` (lines 598-642), `rejectCategorySuggestion` (lines 651-679)

## Summary
Both actions follow the identical, non-atomic shape:

```
1. suggestion = db.categorySuggestion.findFirst({ id, userId })
2. if (suggestion.status !== "PENDING") return fail("already resolved")
3. ...perform this action's own side effect(s)...
4. db.categorySuggestion.update({ status: <ACCEPTED|REJECTED> })
```

Step 2's guard is read-then-branch, not part of a single atomic conditional update (contrast with `lib/ai/rate-limit.ts`'s own `claimGenerationSlot` pattern used elsewhere in this same Phase 4a dispatch, which is exactly the atomic-update technique this code path needed but doesn't use). Two concurrent requests for the **same `suggestionId`** — one Accept, one Reject — can both read `status === "PENDING"` at step 1 before either has written anything at step 4, so both proceed unconditionally:

- Accept's side effect (step 3) calls `updateTransaction({ categoryId: suggestion.suggestedCategoryId })` **unconditionally** — it never re-checks that the suggestion is still `PENDING`, or that a concurrent Reject hasn't just dismissed it.
- Reject's side effect (its own step 4) writes `status: "REJECTED"` **unconditionally**.

Depending purely on which request's DB round trip finishes last (ordinary network/DB jitter, not anything under attacker control), one of two inconsistent final states results:

- **Reject "wins" the last write:** the transaction's `categoryId` is permanently changed to the suggested category (Accept's write already landed), while the suggestion's persisted `status` is `REJECTED` — a `REJECTED` suggestion with no corresponding `ACCEPTED`/`PENDING` row anywhere, yet the transaction is categorized as if it had been accepted. The user who clicked Reject sees "Suggestion dismissed" and has no reason to suspect their transaction's category changed anyway.
- **Accept "wins" the last write:** the suggestion ends up `ACCEPTED` (overwriting Reject's write), so the user who clicked Reject was told "Suggestion dismissed" (a 200 success response) yet the suggestion they dismissed is, moments later, silently flipped back to `ACCEPTED` by the other in-flight request.

Either way, at least one of the two callers receives a success response that does not match the eventually-persisted state.

## Reproduction Steps
Verified with a deterministic reproduction that mirrors the exact control flow of both functions line-for-line (both functions call `getCurrentUser()`/`db`/`updateTransaction`'s own further Prisma calls, which would require mocking the whole transaction-update stack to exercise via the real exported functions directly — the harness below reproduces the identical read-check-write *shape and ordering* against an in-memory row, which is the actual defect; nothing feature-specific to Transactions is involved beyond that shape):

1. Seed one `PENDING` `CategorySuggestion` row for transaction `txn-1`, `suggestedCategoryId: "cat-groceries"`.
2. Fire two concurrent "requests" against the identical suggestion id:
   - Accept: reads `status === "PENDING"` → proceeds → (after its own DB round trip) sets `transaction.categoryId = "cat-groceries"`, then sets `suggestion.status = "ACCEPTED"`.
   - Reject: reads `status === "PENDING"` → proceeds → (after its own, independently-timed DB round trip) sets `suggestion.status = "REJECTED"`.
3. With Reject's round trip taking longer than Accept's two sequential writes (a realistic ordering — `updateTransaction` does strictly more work than a single `status` update: an account/category ownership check plus a `$transaction` block), the final state is:
   - `transaction.categoryId === "cat-groceries"` (Accept's mutation landed)
   - `suggestion.status === "REJECTED"` (Reject's write landed last)
4. Both requests reported `blocked: false` — neither was stopped by the `status !== "PENDING"` guard, confirming the guard has no effect under concurrency.

(A second variant with the delays reversed instead produces `suggestion.status === "ACCEPTED"` with Reject's own success response now describing a state that no longer holds — both orderings were confirmed reproducible by simply swapping which side's simulated DB latency is longer.)

## Expected Behavior
Exactly one of Accept/Reject should ever "win" for a given suggestion, and the loser should receive an explicit "this suggestion was already resolved" failure (the same message the code already returns for the *sequential* already-resolved case) rather than silently succeeding and producing a race-dependent, order-sensitive final state. The transaction's `categoryId` must never be changed as a side effect of a request that is not the one whose corresponding suggestion is actually left in `ACCEPTED` status.

## Actual Behavior
Both requests pass the `status !== "PENDING"` guard and both perform their own unconditional side effect; the final persisted state (which status "sticks", and whether the transaction's category was changed) depends entirely on network/DB timing, not on any enforced mutual exclusion. At least one caller's response (a 200 success) misrepresents the actual outcome.

## Suggested Owner
Backend Engineer / AI Engineer (Transaction Auto-Categorization, `src/features/transactions/server/actions.ts`) — the fix is a Backend Engineer concern (make the status transition an atomic conditional update, e.g. `db.categorySuggestion.updateMany({ where: { id, userId, status: "PENDING" }, data: { status: <...> } })` and only proceed with the transaction-mutating side effect if `count === 1`, mirroring the `claimGenerationSlot` atomic-update pattern this same phase's `lib/ai/rate-limit.ts` already established elsewhere), not something for this Bug Hunter role to implement.
