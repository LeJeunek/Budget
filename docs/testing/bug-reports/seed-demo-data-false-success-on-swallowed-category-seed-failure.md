# Bug Report: If the showcase user's category-seeding step silently fails (an already-swallowed error path in the signup hook), "Refresh Demo Data" still reports success — a materially degraded demo account presented to the admin as a clean success

## Severity
**Medium** — requires a secondary precondition (the signup hook's category-seeding step actually failing) that Admin's own code doesn't control, so this isn't reachable through Admin code alone in the common case. It is Medium rather than Low because: (1) when the precondition is met, the resulting failure mode is *exactly* the one admin.md Capability 6 AC4 explicitly prohibits — "the admin sees a clear failure message... rather than a silent partial refresh" — and (2) the precondition is not far-fetched: `lib/auth.ts`'s own comment on this exact code path documents that it already went unnoticed once ("Category seeding was flagged as an open gap by the agent that built the Categories backend and went unaddressed until caught by live testing"), and — per a separate report in this review (`category-template-delete-toctou-zero-entries.md`) — an admin-triggerable race can leave `SystemCategoryTemplate` with zero rows, which is one concrete, in-product way to reliably trigger this exact precondition.

## Component
`src/lib/auth.ts` lines 142-182 (`databaseHooks.user.create.after` — the category-seeding `try/catch` that logs and swallows any failure)
`prisma/seed-showcase/user.ts` (`createOrReplaceShowcaseUser`, which calls `auth.api.signUpEmail` and therefore triggers the hook above)
`prisma/seed-showcase/index.ts` lines 22-77 (`main`, which never verifies `getCategoryMap` returned a non-empty map before proceeding)
`src/features/admin/server/demo-data.ts` (`triggerDemoDataSeed` — reports success purely based on the child process's exit code)
`src/features/admin/server/actions.ts` lines 119-137 (`seedDemoData`)

## Summary
`npm run seed:showcase`'s `main()` (`prisma/seed-showcase/index.ts`) starts by calling `createOrReplaceShowcaseUser()`, which goes through Better Auth's real `signUpEmail` so the signup hook fires exactly as it would for a real user — including `lib/auth.ts`'s category-seeding step:

```ts
try {
  const template = await getSystemCategoryTemplate()
  await db.category.createMany({ data: template.map(...) })
} catch (error) {
  console.error(`Failed to seed default categories for user ${user.id}:`, error)
}
```

This is deliberately non-fatal for *ordinary* signups (a user should never be blocked from creating an account by a seeding hiccup) — but it means `signUpEmail` (and therefore `createOrReplaceShowcaseUser`) resolves **successfully** even when category seeding fails or silently seeds zero rows (e.g. because `SystemCategoryTemplate` is empty — see the companion TOCTOU report on `deleteTemplateEntry`, or any transient DB error during that one `createMany` call).

`main()` then calls `getCategoryMap(user.id)` (`prisma/seed-showcase/client.ts`), which simply queries whatever `Category` rows exist for the user — if seeding produced zero rows, this returns `{}`, and `main()` has no check anywhere for this. It proceeds through `createRecurringIncome`, `createBills`, `createExpenseTransactions`, `createBudgets`, `createCategorySuggestion` — every one of which looks up category ids by name from this map (e.g. `categoryMap.Food`). Because `Bill.categoryId` / `Transaction.categoryId` / `BudgetCategory.categoryId` are all nullable (`String?` in `prisma/schema.prisma`), passing `categoryId: undefined` (an empty-map lookup) is accepted by Prisma silently — the field is simply omitted from the write, resulting in an uncategorized row — rather than throwing a foreign-key or validation error that would surface the underlying problem.

`main()` therefore completes without ever throwing, the child process exits `0`, `execAsync` in `triggerDemoDataSeed` resolves normally, and `seedDemoData()` (`admin/server/actions.ts`) logs `AdminActionLog` with `{ success: true }` and returns `ok({ success: true })`. The admin sees "Refresh Demo Data — succeeded," while the actual resulting showcase account has zero categories and every transaction/bill/budget allocation that should have been categorized is instead uncategorized — breaking the Spending-by-Category chart, the Budgeting page's per-category progress, and any AI-cache narrative that references category names, for exactly the account the team is about to use on a live sales call or screenshot.

## Reproduction Steps
1. In a non-production environment, force the category-seeding step inside `lib/auth.ts`'s signup hook to fail or produce zero rows for the *next* signup specifically — the most direct in-product way: use the admin-triggerable race in `category-template-delete-toctou-zero-entries.md` to reduce `SystemCategoryTemplate` to zero rows (or, for a more surgical repro, temporarily stub `getSystemCategoryTemplate` to return `[]` / throw, or briefly interrupt DB connectivity during that one `createMany` call).
2. With that precondition in place, trigger "Refresh Demo Data" from `/admin/demo-data` (or call `seedDemoData()` directly).
3. Observe the script runs to completion, exits `0`, and the admin UI reports success (`AdminActionLog` row: `{ action: "DEMO_DATA_SEEDED", details: { success: true } }`).
4. Query `Category` rows for `showcase@lkbudget.demo`: zero rows exist (or a partial/empty set, depending on exactly where the interruption landed).
5. Query `Transaction`/`Bill`/`BudgetCategory` rows for that same user: every row has `categoryId: null`, despite `createBills`/`createExpenseTransactions`/`createBudgets` having run with the clear intent of assigning specific categories to each.
6. Load the showcase account's Dashboard/Budgeting/Transactions pages: every category-dependent surface (Spending by Category chart, Budgeting progress bars, category filters) shows nothing or an "uncategorized" state, despite the admin having just been told the refresh "succeeded."

## Expected Behavior
Per Capability 6 AC4, "the admin sees a clear failure message... rather than a silent partial refresh" — this should hold for *any* materially incomplete seed outcome, not only for the narrower case where the child process itself throws/exits non-zero. If the showcase account ends up with a category map that doesn't match what the template defines (in particular, an empty one), the seed should either fail loudly (so the admin sees "Demo data seeding failed" and knows not to use the account yet) or the underlying category-seeding step it depends on should not be capable of silently no-op'ing in the first place.

## Actual Behavior
The signup hook's category-seeding failure is swallowed (by design, for ordinary signups) with no signal that propagates to `seed-showcase.ts`'s `main()`, which has no precondition check of its own before proceeding to seed every other domain against a possibly-empty category map. The overall script — and therefore the admin-facing "Refresh Demo Data" action — reports unqualified success even when the resulting demo account is missing all of its categorization.

## Suggested Owner
Backend Engineer, `prisma/seed-showcase/index.ts` (`main`) — the most contained fix is a precondition check immediately after `getCategoryMap(user.id)` (e.g. asserting the map has the expected 11 entries, or at minimum is non-empty) that throws if seeding produced no categories, so the existing `main().catch(() => process.exit(1))` path — and therefore `triggerDemoDataSeed`'s existing honest-failure reporting — kicks in exactly as it already does for every other failure this script recognizes. Flagging also for whoever owns `src/lib/auth.ts`'s signup hook (Categories feature owner), since the root swallowed-error behavior there is what creates the silent-empty-map precondition in the first place, even though changing that hook's behavior for *ordinary* signups is out of this report's scope.
