# Bug Report: A category deleted in the narrow window between reading a suggestion and accepting it leaves the suggestion permanently `PENDING` with a misleading error, instead of being auto-invalidated

## Severity
**Low-Medium** — narrow timing window (requires a category delete to land in the small gap between two sequential reads inside a single request), no data corruption, and self-healing on a **second** accept attempt — but when it does hit, the user sees a generic, wrong error message instead of the specific "this suggested category no longer exists" message the code otherwise handles correctly for the non-race case, and the suggestion is left dangling (neither `ACCEPTED` nor `REJECTED`) until someone retries.

## Component
`src/features/transactions/server/actions.ts` — `acceptCategorySuggestion` (lines 598-642), specifically the gap between the `suggestion.suggestedCategoryId` null-check (lines 620-626) and `updateTransaction`'s own fresh `assertOwnedCategory` lookup (called at line 628, defined at lines 89-98).

## Summary
`ai-features.md`'s own documented edge case: "the suggested category is deleted between suggestion generation and the user viewing/accepting it — the suggestion is invalidated" (marked `REJECTED`, with a clear error). `acceptCategorySuggestion` implements this correctly **for the case where the category is already gone by the time the suggestion is read**:

```ts
const suggestion = await db.categorySuggestion.findFirst({ where: { id: suggestionId, userId: user.id } })
...
if (!suggestion.suggestedCategoryId) {                 // already null (SetNull already ran)
  await db.categorySuggestion.update({ ..., status: "REJECTED" })
  return fail("This suggested category no longer exists")
}
const updateResult = await updateTransaction({ id: suggestion.transactionId, categoryId: suggestion.suggestedCategoryId })
```

But if the category is deleted **after** this suggestion is read (so `suggestion.suggestedCategoryId` is still a real, non-null id in this function's local variable) and **before** `updateTransaction`'s own internal `assertOwnedCategory` lookup runs, the deletion's `onDelete: SetNull` cascade has already nulled out the `CategorySuggestion.suggestedCategoryId` **column** in the database, but this function is holding a stale in-memory copy from its earlier read. `updateTransaction` re-looks-up the category fresh (`assertOwnedCategory` → `db.category.findFirst({ id: categoryId, userId })`), correctly finds nothing (it was just deleted), and returns `fail("Category not found")`. `acceptCategorySuggestion` propagates that failure directly:

```ts
if (!updateResult.success) {
  return updateResult   // "Category not found" -- the wrong message, and no suggestion-row update at all
}
```

At no point in this path does the suggestion row itself get updated — it is left `PENDING` forever, with a `suggestedCategoryId` column that (per the FK's own `SetNull` cascade) is already `null` in the database, even though this request's own in-memory copy never saw that. The user sees a generic "Category not found" error instead of the feature's own documented "This suggested category no longer exists" message, and the stuck suggestion isn't auto-resolved to `REJECTED` — it silently disappears from correctness bookkeeping until a **second** accept attempt (which re-reads the suggestion fresh, this time correctly observing `suggestedCategoryId === null`, and handles it via the already-correct branch).

## Reproduction Steps (code-level trace; the actual race requires a live Postgres instance to execute the two statements in the adversarial order — no integration-test database exists in this codebase per this project's own standing convention, so this is presented as a precise control-flow trace rather than an executed race, consistent with how `rate-limit.ts`'s own `checkReasoningModelRateLimit` persistence shape is verified in this codebase's existing test suite)
1. A `PENDING` `CategorySuggestion` row exists for `transactionId = "txn-1"`, `suggestedCategoryId = "cat-groceries"`.
2. Request A calls `acceptCategorySuggestion({ suggestionId })`. It reads the suggestion row: `suggestion.suggestedCategoryId === "cat-groceries"` (still true at this instant).
3. Before request A's next line runs, a **separate** request deletes category `"cat-groceries"` (e.g. the user, in another tab, deletes the category they were about to accept a suggestion into). The FK's `onDelete: SetNull` immediately sets `CategorySuggestion.suggestedCategoryId = NULL` in the database for every suggestion that referenced it, including this one.
4. Request A proceeds using its own stale local `suggestion.suggestedCategoryId = "cat-groceries"` value, calling `updateTransaction({ id: "txn-1", categoryId: "cat-groceries" })`.
5. `updateTransaction`'s `assertOwnedCategory("cat-groceries")` does a fresh lookup → not found (deleted in step 3) → `updateTransaction` returns `fail("Category not found")`.
6. `acceptCategorySuggestion` returns this failure directly, without ever updating the suggestion row.
7. The suggestion row is now stuck: `status: "PENDING"`, `suggestedCategoryId: NULL` (per the DB's own cascade) — a state the *first-read* branch (line 620) exists specifically to auto-resolve, but never reaches here because this request read the row before the deletion happened.

## Expected Behavior
Per `ai-features.md`'s own edge case, a suggestion whose category is deleted concurrently with an in-flight accept attempt should be invalidated (marked `REJECTED`) with the specific "this suggested category no longer exists" message — the same outcome the code already produces correctly when the deletion happens strictly *before* the suggestion is read.

## Actual Behavior
When the deletion happens in the (narrow but real) window between this function's own suggestion read and `updateTransaction`'s internal category re-check, the user gets the generic `updateTransaction`-level "Category not found" message instead, and the suggestion row is left `PENDING` (not auto-`REJECTED`) — it only resolves correctly on a subsequent retry.

## Suggested Owner
AI Engineer (`src/features/transactions/server/actions.ts`, `acceptCategorySuggestion`) — the fix is local (re-check `db.category.findFirst` — or simply treat `updateTransaction`'s specific "Category not found" failure as the same REJECTED-marking trigger the null-`suggestedCategoryId` branch already uses — before giving up), not something for this Bug Hunter role to implement.
