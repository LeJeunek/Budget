# Bug Report: `toDebt()`'s `...row` spread leaks a raw, unconverted `Decimal` (`account.balance`) into every `DebtWithProjection` object passed to Client Components on `/debt` and `/financial-goals`

## Severity
**Medium** — does not crash the page or corrupt visible figures in dev mode (every *displayed* number still goes through the correctly-converted `effectiveBalance`/`balance`/etc. fields), but it is a real, confirmed defect: a Prisma `Decimal` class instance (a non-plain object) is passed as part of a prop from a Server Component to multiple Client Components on every request to two routes, on every debt that has a linked Account. This is the exact bug class flagged during the Phase 5a accessibility audit ("a benign-looking Next.js dev console warning... Decimal objects are not supported... flagged here for the Bug Hunter's upcoming pass to triage") — confirmed real and reproducible, tracked down to its exact source.

## Component
`src/features/debt/server/service.ts` lines 28-46 (`DebtRowWithLinkedAccountBalance`, `toDebt`), lines 64-84 (`toDebtWithProjection`), lines 86-137 (`LINKED_ACCOUNT_BALANCE_INCLUDE`, `getDebts`, `getDebtById`)

Downstream Client Component consumers that receive the tainted object as a prop directly from a Server Component:
- `src/features/debt/components/debt-list.tsx` → `src/features/debt/components/debt-card.tsx` (`debt` prop)
- `src/features/debt/components/strategy-comparison.tsx` (`debts` prop)
- `src/features/financial-goals/components/debt-payoff-goal-form.tsx`'s `AddDebtPayoffGoalButton` (`eligibleDebts` prop)

Pages that trigger it: `src/app/(dashboard)/debt/page.tsx`, `src/app/(dashboard)/financial-goals/page.tsx` (the latter calls `getDebts` a second time purely for its own `eligibleDebtsForNewGoal`/`debtNameById` page-level joins).

## Summary
`getDebts`/`getDebtById` always query with `LINKED_ACCOUNT_BALANCE_INCLUDE` (`{ account: { select: { balance: true } } }`), so every returned Prisma row is typed `DebtRowWithLinkedAccountBalance = PrismaDebtRow & { account: { balance: Decimal } | null }` — when a Debt is linked to an Account (the Credit Card linking feature), `row.account` is a real object containing a live `Decimal` instance, not `null`.

`toDebtWithProjection` calls `toDebt(row)` to build the plain-number `Debt` shape. `toDebt`'s implementation is:

```ts
function toDebt(row: PrismaDebtRow): Debt {
  return {
    ...row,
    balance: row.balance.toNumber(),
    interestRate: row.interestRate.toNumber(),
    minimumPayment: row.minimumPayment.toNumber(),
  }
}
```

The `...row` spread copies **every enumerable own property of the actual runtime object**, not just the fields declared on the `PrismaDebtRow` type it's annotated with. Because `toDebtWithProjection` calls `toDebt(row)` with a `DebtRowWithLinkedAccountBalance` (a structural supertype — TypeScript allows passing it wherever a `PrismaDebtRow` is expected, since it has all of `PrismaDebtRow`'s fields plus one extra), the extra `account: { balance: Decimal }` property survives into `toDebt`'s return value uncaught. TypeScript does not flag this: excess properties surviving a spread into an explicitly-typed return value are not checked by TypeScript's excess-property-check (that check only applies to object *literals* assigned directly, not to spreads of a variable) — so the `Debt`/`DebtWithProjection` types both claim (falsely, at runtime) to be plain-number shapes with no `account` field, while the actual object handed to every consumer still carries the raw, un-converted `account: { balance: Decimal }` sub-object. This is why the type system, `tsc --noEmit`, and every existing unit test missed it — it is only observable at runtime, in the browser console, when React's Server-to-Client serialization step inspects the actual object.

`toDebtWithProjection`'s own final return (`{ ...debt, effectiveBalance, payoffDate, ... }`) spreads `debt` (which already carries the leaked `account` field) forward one more time, so the leak reaches every one of `getDebts`'/`getDebtById`'s callers unchanged.

## Reproduction Steps
1. Seed or use an account with at least one Debt of type `CREDIT_CARD` linked to an Account (`Debt.accountId` set) — the showcase account (`showcase@lkbudget.demo`) already has this.
2. Start the dev server (`npm run dev`) and open a browser with the DevTools console open.
3. Sign in as `showcase@lkbudget.demo` and navigate to `/debt`.
4. Observe in the console:
   ```
   Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported.
     {balance: Decimal}
               ^^^^^^^
   ```
5. Repeat for `/financial-goals` (which also calls `getDebts` for its own `eligibleDebtsForNewGoal` page-level join) — the identical warning reproduces.
6. Confirmed via a scripted Playwright console-listener across both runs; reproduces deterministically, every load, on both routes.

## Expected Behavior
Every value crossing the Server Component / Client Component boundary should be a plain, serializable value — matching this codebase's own stated, consistently-applied convention (`features/accounts/server/service.ts`'s `toAccount`, `features/investments/server/service.ts`'s `toHolding`, and this very file's own `toDebt` JSDoc: "Converts a Prisma `Debt` row... into the plain-number `Debt` shape... safe to pass across the Server Component / Client Component boundary"). The `account` field used internally to compute `effectiveBalance` should never itself reach a Client Component — it is deliberately not part of the `Debt`/`DebtWithProjection` type contract.

## Actual Behavior
`toDebt()`'s `{ ...row, ... }` spread silently forwards the joined `account: { balance: Decimal }` sub-object (present only because of `LINKED_ACCOUNT_BALANCE_INCLUDE`, needed internally by `toDebtWithProjection` to compute `effectiveBalance`) into the final object returned to every caller, even though neither `Debt` nor `DebtWithProjection`'s declared type includes an `account` field. Every Client Component receiving a linked debt (`DebtCard`, `StrategyComparison`, `AddDebtPayoffGoalButton`) is handed this tainted object as a prop, triggering React's "Only plain objects can be passed to Client Components... Decimal objects are not supported" console error on every render, on both `/debt` and `/financial-goals`.

## Suggested Owner
Backend Engineer, `src/features/debt/server/service.ts`. Fix should destructure only the known `Debt` fields explicitly in `toDebt` (never `...row` on a row that might carry extra joined relations) — or, since `toDebt`'s own JSDoc already documents it as taking a plain `PrismaDebtRow`, give `toDebtWithProjection` its own explicit object construction instead of routing a row that structurally carries extra joined data through a spread-based converter designed for the narrower type. Worth a quick grep across the rest of the codebase for the same `{ ...row, someField: row.someField.toNumber() }` pattern applied to a row type that is ever widened by a join (this is the one instance found in this pass, but the pattern itself is fragile and TypeScript won't catch a repeat).
