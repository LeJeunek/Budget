# Bug Report: Editing a starter-category-template entry that a concurrent request deletes mid-edit throws an unhandled Prisma error instead of the same friendly "not found" failure the identical scenario produces when the delete happens slightly earlier

## Severity
**Medium** — no data corruption (the entry really is gone either way, which is the correct end state), but a genuine unhandled-exception path in an admin-only Server Action. It contradicts this codebase's own established convention — visible in this exact file, one function up — of translating every known failure mode into a friendly `ApiResult` failure rather than letting a raw error escape. The affected admin sees a broken-looking failure (a generic/opaque error, or a full stack trace in development) for what is, from the product's point of view, an entirely ordinary and already-partially-handled situation: "I tried to edit an entry that no longer exists."

## Component
`src/features/categories/server/template.ts` lines 145-172 (`updateTemplateEntry`)
`src/features/admin/server/actions.ts` lines 174-206 (`updateCategoryTemplateEntry`, whose `catch` block only special-cases two specific error classes)

## Summary
`updateTemplateEntry` performs a "does this exist" check up front, but there is a real async gap between that check and the actual write, during which the row can be deleted out from under it by a concurrent request:

```ts
export async function updateTemplateEntry(input: UpdateTemplateEntryInput) {
  const entry = await db.systemCategoryTemplate.findUnique({ where: { id: input.id } }) // (1)
  if (!entry) throw new CategoryTemplateEntryNotFoundError()

  const isRenaming = input.name !== undefined && input.name.toLowerCase() !== entry.name.toLowerCase()
  if (isRenaming) {
    const duplicate = await findCaseInsensitiveDuplicate(input.name as string, input.id) // (2) — another DB round trip
    if (duplicate) throw new DuplicateCategoryTemplateNameError(input.name as string)
  }

  return db.systemCategoryTemplate.update({ where: { id: input.id }, data: { ... } }) // (3)
}
```

If a concurrent `deleteCategoryTemplateEntry` call removes `input.id`'s row *after* step (1)'s `findUnique` succeeds but *before* step (3)'s `update` executes (i.e., during the window opened by step (2)'s extra round trip when renaming, or even just ordinary network/DB latency between (1) and (3) for a color-only edit), Prisma's `update()` throws a `PrismaClientKnownRequestError` with code `P2025` ("Record to update not found") — a raw Prisma error, not the `CategoryTemplateEntryNotFoundError` this same function already throws for the *earlier*-timed version of the identical scenario.

The Server Action wrapper's `catch` block only recognizes two specific classes:

```ts
} catch (error) {
  if (error instanceof DuplicateCategoryTemplateNameError || error instanceof CategoryTemplateEntryNotFoundError) {
    return fail(error.message)
  }
  throw error   // <-- P2025 falls through here, unhandled
}
```

`PrismaClientKnownRequestError` is neither of those two classes, so it falls through to `throw error` and escapes the Server Action as a raw, unformatted exception — in production, Next.js will redact it to a generic digest-only error with no actionable message; in development, a full Prisma stack trace surfaces to the admin UI. Either way, this is a materially worse experience than the `ApiResult` failure ("Category template entry not found") the exact same "someone deleted this while you were editing it" situation already produces when the timing is slightly different.

The identical unhandled-error risk applies to `reorderTemplateEntries` (`template.ts` lines 180-193): its `db.$transaction([...])` batch of per-id updates will likewise throw `P2025` for any id concurrently deleted mid-reorder, and `reorderCategoryTemplateEntries` (`admin/server/actions.ts` lines 214-236) has **no try/catch at all** around the call — every error, known or not, propagates unhandled.

## Reproduction Steps
1. Ensure at least two entries exist in `SystemCategoryTemplate`; note one entry's id as `X`.
2. Begin an update to `X` that also renames it (forcing the extra `findCaseInsensitiveDuplicate` round trip): call `updateCategoryTemplateEntry({ id: X, name: "New Name" })`, but pause/delay execution after its internal `findUnique` resolves and before its final `update()` call (in a test, this can be done by mocking/spying on `db.systemCategoryTemplate.update` to await a controlled promise; in a live repro, throttle the network and time a concurrent request to land in that window).
3. While step 2's request is paused in that window, complete a separate, concurrent `deleteCategoryTemplateEntry({ id: X })` call to completion (assuming ≥2 entries exist so the delete's own "never zero" guard passes).
4. Allow step 2's `update()` call to proceed. Observe: it throws `PrismaClientKnownRequestError` (`code: "P2025"`), which is not caught by `updateCategoryTemplateEntry`'s `catch` block and propagates out of the Server Action unhandled — contrast this with simply calling `updateCategoryTemplateEntry({ id: X, ... })` *after* `X` has already been fully deleted (no race needed), which correctly returns `fail("Category template entry not found")` via the `findUnique` check at step (1).

## Expected Behavior
Editing an entry that has been concurrently deleted should produce the same graceful `ApiResult` failure regardless of exactly when, relative to the request's own internal steps, the deletion happened — a user-facing "this entry no longer exists" message, never a raw unhandled exception.

## Actual Behavior
Only the deletion-before-the-initial-lookup timing is handled gracefully. Deletion during the window between that lookup and the final write throws a raw Prisma `P2025` error that is not caught by `updateCategoryTemplateEntry`'s (or `reorderCategoryTemplateEntries`'s, which has no error handling at all) `catch` block, and escapes the Server Action unhandled.

## Suggested Owner
Backend Engineer, `src/features/categories/server/template.ts` (`updateTemplateEntry`/`reorderTemplateEntries`) and `src/features/admin/server/actions.ts` (`updateCategoryTemplateEntry`/`reorderCategoryTemplateEntries`) — the fix is either catching Prisma's `P2025` alongside the existing custom error classes and translating it to the same "not found" `ApiResult` failure, or wrapping the write itself so a concurrently-vanished row is detected and reported consistently regardless of which of the function's internal steps happens to observe it.
