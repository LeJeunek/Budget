# Bug Report: `deleteTemplateEntry`'s "never zero entries" guard is a count-then-delete race — concurrently deleting the last two starter-category-template entries can leave the template empty, silently seeding zero starter categories for the next signup

## Severity
**High** — this is a genuine data-integrity violation of admin.md Capability 5 AC6 ("The template can never be reduced to zero entries... removing the last remaining entry is blocked with a clear explanation") with a real, user-facing downstream consequence: the *very next signup* after the race receives zero starter categories, silently (no error anywhere in that path — `db.category.createMany({ data: [] })` inside `lib/auth.ts`'s signup hook is simply a no-op). The code's own comment on this function explicitly names this exact outcome as the thing the guard exists to prevent ("a fully empty template would silently seed zero categories for the next signup, a regression no admin action should ever be able to trigger") — yet the guard as written does not actually prevent it under concurrency.

## Component
`src/features/categories/server/template.ts` lines 200-212 (`deleteTemplateEntry`)
`src/features/admin/server/actions.ts` lines 244-277 (`deleteCategoryTemplateEntry`, the thin Server Action wrapper)
`src/lib/auth.ts` lines 145-171 (the signup hook that reads the resulting empty template)

## Summary
`deleteTemplateEntry`'s entire "never zero" enforcement is:

```ts
export async function deleteTemplateEntry(id: string): Promise<void> {
  const entry = await db.systemCategoryTemplate.findUnique({ where: { id } })
  if (!entry) throw new CategoryTemplateEntryNotFoundError()

  const total = await db.systemCategoryTemplate.count()   // CHECK
  if (total <= 1) throw new CategoryTemplateWouldBeEmptyError()

  await db.systemCategoryTemplate.delete({ where: { id } }) // ACT
}
```

The count-check and the delete are two separate, unsynchronized statements — no transaction, no row lock (e.g. `SELECT ... FOR UPDATE`), no atomic "delete only if count would remain ≥ 1" conditional. With exactly two entries remaining (`X`, `Y`):

1. Admin (or two admins) issue `deleteCategoryTemplateEntry({id: X})` and `deleteCategoryTemplateEntry({id: Y})` concurrently — e.g. two browser tabs, a double-click during a slow request, or two team members independently cleaning up the template at the same time (admin.md's own "An admin edits the template while a signup is in progress" edge case already establishes this feature tolerates unlocked concurrent operations, just not for *this* specific invariant).
2. Both calls' `count()` executes before either's `delete()` commits — both observe `total === 2`, so both pass the `total <= 1` guard.
3. Both `delete()` calls proceed and succeed. `SystemCategoryTemplate` now has **zero** rows.
4. The next user who signs up triggers `lib/auth.ts`'s `databaseHooks.user.create.after` hook, which calls `getSystemCategoryTemplate()` (returns `[]`) and `db.category.createMany({ data: [] })` — a valid, successful, zero-row write. The new user's account is created normally, with **no starter categories at all**, and nothing anywhere logs or surfaces this as an anomaly (the hook's own try/catch only guards against a thrown error, and an empty array is not one).

## Reproduction Steps
1. Seed (or reduce, via ordinary single deletes) `SystemCategoryTemplate` down to exactly two entries, `X` and `Y`.
2. Fire two concurrent calls to `deleteCategoryTemplateEntry`, one for `X` and one for `Y` — e.g. in a test: `Promise.all([deleteCategoryTemplateEntry({id: X.id}), deleteCategoryTemplateEntry({id: Y.id})])`, timed so both requests' `db.systemCategoryTemplate.count()` executes before either's `db.systemCategoryTemplate.delete()` commits (trivially achievable given `count()` and `delete()` are separate round-trips with real network latency to the database).
3. Observe both calls return success (`ApiResult.ok({ id })`) — neither's guard ever saw the other's in-flight delete.
4. Query `db.systemCategoryTemplate.count()` directly: it is `0`.
5. Sign up a brand-new user (through the ordinary product signup flow, not Admin). Query that user's `Category` rows: zero rows exist. The new user's Categories page, Transactions categorization dropdown, Budgeting page, etc. all render with no categories available at all — a broken first-run experience with no error anywhere in the chain that produced it.

## Expected Behavior
Per AC6, it must be structurally impossible to reduce the starter-category template to zero entries through the product, including under concurrent admin actions — the guard's check and the actual deletion must be atomic with respect to each other (equivalent to serializing concurrent deletes against the same table, or expressing the delete as a single conditional statement).

## Actual Behavior
The count-then-delete guard is not atomic. Two concurrent deletions targeting the second-to-last and last remaining entries can both pass their independent checks and both succeed, reducing the template to zero rows — exactly the outcome the function's own design comment says must never be reachable.

## Suggested Owner
Backend Engineer, `src/features/categories/server/template.ts` (`deleteTemplateEntry`) — the fix likely needs either a `db.$transaction` with `Serializable` isolation (so one of the two concurrent transactions is forced to retry/fail against the other's uncommitted delete) or a single atomic raw statement (e.g. `DELETE ... WHERE id = $1 AND (SELECT COUNT(*) FROM "SystemCategoryTemplate") > 1`, re-checked post-delete) rather than the current separate `count()` then `delete()` shape. Worth checking whether `reorderTemplateEntries`'s existing `db.$transaction([...])` batch (lines 180-193 of the same file) is available as a precedent for wrapping this guard correctly.
