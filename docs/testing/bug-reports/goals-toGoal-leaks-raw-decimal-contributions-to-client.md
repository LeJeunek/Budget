# Bug Report: `toGoal()`'s `...row` spread leaks raw, unconverted `Decimal`/`Date` contribution rows into `getGoals()`'s `GoalWithProgress[]` result

## Severity
**Medium** — same bug class, same non-blocking severity rationale as the already-fixed `debt/server/service.ts` `toDebt()` leak (`docs/testing/bug-reports/debt-toDebt-leaks-raw-decimal-account-to-client.md`): does not crash the page or corrupt any *displayed* figure (every rendered number still goes through a correctly-converted field), but a Prisma `Decimal`/`Date`-bearing sub-array is passed as part of a prop from a Server Component to Client Components on every request to `/financial-goals` for any goal with at least one contribution. Found live by the Release Manager during the Phase 5a first-pass review (`docs/release/phase-5a-notes.md`) while re-checking for repeats of the just-fixed Debt instance.

## Component
`src/features/goals/server/service.ts` — `toGoal()` (converter) and `getGoals()` (the one leaking caller).

## Summary
`getGoals()` queries with `include: { contributions: { select: { amount: true, date: true } } }`, so every returned Prisma row is a structural supertype of `PrismaGoalRow` carrying an extra `contributions: { amount: Decimal, date: Date }[]` array. `toGoal()`'s original implementation was:

```ts
export function toGoal(row: PrismaGoalRow): Goal {
  return {
    ...row,
    targetAmount: row.targetAmount.toNumber(),
    plannedMonthlyContribution: ...,
  }
}
```

The `...row` spread copies every enumerable own property of the actual runtime object, not just the fields declared on the `PrismaGoalRow` type it's annotated with — the same excess-property-check gap the Debt instance exploited (that check only applies to object literals, never to a spread of a variable). `getGoals()` calls `toGoal(row)` on a row shape that structurally carries the joined `contributions` array, so it survived into `goal.contributions` uncaught, and `getGoals()`'s final `return { ...goal, ...computeGoalProgress(...) }` never explicitly re-sets `contributions`, so the raw leaked array (still holding live `Decimal`/`Date` instances) reached every one of `getGoals()`'s callers unchanged.

`getGoalById()` calls the same `toGoal(row)` on an equally-widened row (it includes the full contribution history), so it leaked identically at that intermediate step — but its own final return, `{ ...goal, ...progress, contributions }`, explicitly re-sets `contributions` to the separately-converted (via `toGoalContribution`) array as the last spread, which overwrites the leaked raw one. So only `getGoals()` (the list view backing `/financial-goals`) actually surfaced the bug to a Client Component; `getGoalById()`'s `GoalDetail` result was never actually tainted, purely as an accident of key-overwrite order, not a deliberate guard.

## Reproduction Steps
1. Seed or use an account with at least one Savings Goal that has at least one logged contribution — the showcase account (`showcase@lkbudget.demo`) already has this.
2. Start the dev server (`npm run dev`) and open a browser with the DevTools console open.
3. Sign in as `showcase@lkbudget.demo` and navigate to `/financial-goals`.
4. Observe in the console:
   ```
   Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported.
     {amount: Decimal, date: Date}
               ^^^^^^^
   ```
5. Live-reproduced by the Release Manager during the Phase 5a first-pass review.

## Expected Behavior
Every value crossing the Server Component / Client Component boundary should be a plain, serializable value — matching `toGoal`'s own JSDoc ("into the plain-number `Goal` shape... ") and the same convention already restored for Debt.

## Actual Behavior
`toGoal()`'s `{ ...row, ... }` spread silently forwarded the joined `contributions: { amount: Decimal, date: Date }[]` array (present only because `getGoals()`'s query includes it, needed internally to compute progress) into the object `getGoals()` returns to its callers, even though `Goal`/`GoalWithProgress`'s declared types include no such leak path once progress is computed separately. Every Client Component receiving a `GoalWithProgress` from `/financial-goals`'s list view triggers React's "Only plain objects can be passed to Client Components... Decimal objects are not supported" console error, for any goal with a logged contribution.

## Resolution
Fixed the same way as the Debt instance: `toGoal()` now constructs its return value with every `Goal` field named explicitly (`id`, `userId`, `name`, `targetAmount`, `targetDate`, `plannedMonthlyContribution`, `archivedAt`, `createdAt`, `updatedAt`) instead of spreading `...row` — so a row that structurally carries an extra joined `contributions` array can no longer leak it through this converter, in either caller. `getGoalById()`'s independent `contributions`-key-overwrite in its own final return is unaffected and still correct, but no longer needed as an accidental guard against this specific converter. Verified via `npm run typecheck` and `npm run lint` (both clean) after the change; no unit test previously covered this shape, so none needed updating.

## Suggested Owner
Backend Engineer, `src/features/goals/server/service.ts` — fixed in this pass. Same standing recommendation as the Debt report: worth a repo-wide grep for the `{ ...row, someField: row.someField.toNumber() }` pattern applied to any row type ever widened by an `include`/`select` join, since TypeScript will not catch a third repeat of this bug class either.
