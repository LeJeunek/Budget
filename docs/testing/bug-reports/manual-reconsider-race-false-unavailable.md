# Bug Report: Two concurrent "reconsider" requests for the same transaction report a false "unavailable" to the losing request, even though a real suggestion was just created

## Severity
**Medium** — misleading user-facing failure with no actual data loss (the suggestion the losing request asked for genuinely exists and will appear on the next page load/refresh), but the direct response to the user's own action is simply wrong, and nothing in the returned `AiFeatureResult` or the Server Action's `ApiResult` distinguishes "generation genuinely failed" from "someone else's identical request already succeeded."

## Component
`src/features/transactions/server/categorization.ts` — `requestManualSuggestion` (lines 451-540), specifically the `generateSuggestionsForBatch` call and the `if (suggested === 0) return { status: "unavailable" }` branch immediately after it (lines 502-511).

## Summary
`requestManualSuggestion`'s only fast path for "a suggestion already exists" is its own upfront `existingPending` read (lines 456-469, 489-500) — taken **before** attempting generation. If no `PENDING` row exists yet at that read, the function proceeds to `generateSuggestionsForBatch`, which persists a suggestion via `db.categorySuggestion.create` — a write guarded by the partial unique index `category_suggestion_transactionId_pending_key` (`prisma/schema.prisma`), so of two concurrent creates for the same transaction, exactly one succeeds and the other throws P2002, which `categorization.ts`'s own `isPendingSuggestionAlreadyExistsError` catches as an idempotent no-op — correctly avoiding a duplicate row, but also **not incrementing `suggested` for the loser**.

Back in `requestManualSuggestion`, the code only re-reads the just-created suggestion (to build the response) when `suggested > 0`:

```ts
const { suggested } = await generateSuggestionsForBatch(...)
if (suggested === 0) {
  return { status: "unavailable" }   // <-- loser hits this, even though a PENDING row now exists
}
const created = await db.categorySuggestion.findFirst({ where: { ..., status: "PENDING" }, ... })
```

The race loser's own `suggested` count is 0 purely because it lost the insert race, not because generation actually failed — but the function gives up immediately rather than re-checking whether a `PENDING` suggestion now exists for this transaction (which it structurally must, since the partial unique index guarantees the winner's insert succeeded). The loser's caller (`requestCategorySuggestion` in `server/actions.ts`) receives `{ status: "unavailable" }` and surfaces it to the user as a failure, even though the transaction now unambiguously has a usable, real `PENDING` suggestion sitting in the database — created by the very request the user just made (from the user's perspective, both clicks were "their" reconsider request).

## Reproduction Steps
Verified with a `vitest` harness reproducing `requestManualSuggestion`'s exact control flow (read-existing-pending → generate → branch on `suggested === 0`) against an in-memory store that models the real partial-unique-index race (the first `create` for a given `transactionId` succeeds; a concurrent second `create` for the same `transactionId` is rejected, exactly as Postgres's own partial unique index would reject it):

1. No `PENDING` suggestion exists yet for `txn-1`.
2. Fire two "reconsider" requests for `txn-1` concurrently (e.g. a double-click before the per-transaction 60s cooldown has recorded anything, or two browser tabs on the same transaction) — both read "no existing pending suggestion," so both proceed to generation.
3. Both reach the persistence step at roughly the same time; the in-memory store's `create` allows exactly one of the two to succeed (mirroring the real partial unique index).
4. Result: exactly one request reports `{ status: "ok" }`; the other reports `{ status: "unavailable" }`.
5. Despite the second request's own reported failure, `store.findPending("txn-1")` confirms a real `PENDING` suggestion exists for the transaction at that moment — created as a direct result of this same pair of requests, not by some unrelated third party.

## Expected Behavior
A "reconsider" request that loses a concurrent-insert race against an identical request for the same transaction should still report success (referencing whichever suggestion actually ended up persisted), since from the calling user's perspective the outcome they wanted — "a fresh suggestion exists for this transaction" — was in fact achieved. At minimum, the function should re-check for a now-existing `PENDING` suggestion before concluding `"unavailable"`, the same way it already does for the `suggested > 0` branch.

## Actual Behavior
The race loser unconditionally reports `{ status: "unavailable" }` without ever re-checking whether a `PENDING` suggestion now exists, producing a false-negative failure that doesn't match the actual, immediately-queryable database state.

## Suggested Owner
AI Engineer (`src/features/transactions/server/categorization.ts`, `requestManualSuggestion`) — the fix (re-running the same `existingPending`-style lookup when `suggested === 0`, before giving up) is a small, local change to this same function, not something for this Bug Hunter role to implement.
