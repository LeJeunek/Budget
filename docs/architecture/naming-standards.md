# FinanceOS — Naming Standards

## Files & folders
- Folders: `kebab-case` (`transactions/`, `data-table/`, `recurring-income/`)
- React component files: `kebab-case.tsx`, default export named in `PascalCase` matching the concept (`account-form.tsx` exports `AccountForm`)
- Non-component TS files: `kebab-case.ts` (`use-accounts.ts`, `validation.ts`)
- Test files: co-located, `<subject>.test.ts(x)`
- **(Phase 3a) Isomorphic pure-calculation files** (importable from both a Server Component and a Client Component — see Architecture.md's guiding-pattern note) live at the feature root, sibling to `types.ts`, never under `server/`. Name them `<concern>-math.ts` (e.g. `features/debt/payoff-math.ts`). These files must never import `lib/db.ts`, `lib/auth.ts`, or anything else server-only.
- **(Phase 3b) Pure-but-server-only calculation files** (no Prisma, fully unit-testable with fixture data, but never called directly by a Client Component) stay under `server/` like any other server file — they do **not** get the feature-root `-math.ts` treatment, since that placement rule is specifically about client-callability, not purity. Name them `<concern>.ts` describing the concern directly (e.g. `features/analytics/server/subscription-detection.ts`, `features/analytics/server/period.ts`), not `-math.ts` — reserving the `-math.ts` suffix exclusively for the feature-root, client-importable case keeps the naming convention itself a reliable signal of placement, not just a style preference.

## Code
- Components: `PascalCase` (`AccountForm`, `TransactionTable`, `StrategyComparison`)
- Hooks: `useCamelCase`, always prefixed `use` (`useAccounts`, `useDebts`, `useHoldings`, `useIncomeStreams`, `useNetWorthHistory` — Phase 3b)
- Server Actions: verb-first camelCase (`createAccount`, `deleteTransaction`, `createDebt`, `logDividend`, `linkOccurrenceToTransaction`, `dismissSubscriptionCandidate`, `createFinancialGoal`, `archiveFinancialGoal` — Phase 3b)
- Route Handlers: standard Next.js `GET`/`POST`/`PATCH`/`DELETE` exports, no custom naming. **(Phase 3a exception, documented, not a new rule)**: `app/api/cron/net-worth-snapshot/route.ts` exports `POST` and is authenticated by a shared secret rather than a browser session. **(Phase 3b)** `app/api/dashboard/net-worth-history/route.ts` exports `GET` and follows the ordinary authenticated-session rule (no new exception) — it is simply the first Dashboard Route Handler ever needed, per Architecture.md's Server/client boundary notes.
- Zod schemas: `PascalCase` + `Schema` suffix (`CreateAccountSchema`, `CreateDebtSchema`, `LogDividendSchema`, `CreateFinancialGoalSchema`, `DismissSubscriptionCandidateSchema`, `ReportingPeriodSchema` — Phase 3b); inferred types drop the suffix (`type CreateDebtInput = z.infer<typeof CreateDebtSchema>`)
- Prisma models: `PascalCase` singular (`Account`, `Transaction`, `Category`, `Debt`, `Holding`, `IncomeStream`, and — pending the Database Architect's Phase 3b schema pass — `FinancialGoal`, `FinancialGoalAccount`, `DismissedSubscriptionMerchant`) — owned by Database Architect, referenced here for consistency
- Enums (TS and Prisma): `PascalCase` type, `SCREAMING_CASE` members (`AccountType.CREDIT_CARD`). Phase 3a introduced `DebtType`, `AssetType`, `Sector`, `IncomeType`, `IncomeSchedule`, `IncomeOccurrenceStatus` (see prior revisions of this document for their full member lists — unchanged by Phase 3b). **Phase 3b introduces:**
  - `ReportingPeriod`: `THIS_YEAR | LAST_12_MONTHS | YEAR_TO_DATE | ALL_TIME` (analytics.md AC2's shared reporting-period control; the searchParam itself is kebab-case per the URL convention below — `this-year | last-12-months | year-to-date | all-time` — parsed into this enum server-side via `ReportingPeriodSchema`)
  - `SubscriptionStatus`: `ACTIVE | POSSIBLY_CANCELLED` — never persisted, computed at read time by `features/analytics/server/subscriptions.ts`, same "never a stored column" rule as `IncomeOccurrenceStatus`/Bills' `OccurrenceStatus`
  - `FinancialGoalType`: `DEBT_PAYOFF | NET_WORTH_SAVINGS_TARGET | SAVINGS_RATE_TARGET` — fixed at creation (financial-goals.md AC1), never changed after; this is the one Phase 3b enum that **is** persisted (it's `FinancialGoal.type`'s discriminator column, not a computed status)
  - `MeasurementBasis`: `TOTAL_NET_WORTH | ACCOUNT_SUBSET` — `NET_WORTH_SAVINGS_TARGET`-type goals only; persisted alongside `FinancialGoal.type`, since it's part of the goal's fixed configuration, not a derived value
- **URL searchParam values use `kebab-case`**, matching the existing convention already established by Budgeting's `?month=YYYY-MM` and Bills' `?view=list|calendar`: Analytics' reporting-period control is `?period=this-year|last-12-months|year-to-date|all-time`, and the Net Worth History chart's range selector is `?range=30d|90d|1y|all` (the client-side hook's query param, not a page searchParam, since the chart refetches via `use-net-worth-history.ts` rather than a full navigation — see Architecture.md's Phase 3b data-flow example).

## API response shape (every Route Handler and Server Action)
```ts
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```
Defined once in `lib/api-response.ts`. No endpoint invents its own shape. **(Phase 3a)** `app/api/cron/net-worth-snapshot/route.ts` is the sole documented exception. **(Phase 3b)** `app/api/dashboard/net-worth-history/route.ts` follows the ordinary `ApiResult<T>` rule (it is a normal, session-authenticated, client-facing endpoint — no exception here, only `net-worth-snapshot`'s system-to-system cron route is exempt).

## CSS / Tailwind
- No inline arbitrary colors — use the Tailwind theme tokens configured for shadcn/ui (`bg-primary`, `text-muted-foreground`, etc.) so theming/dark mode stays centralized.
- Category/account "color" fields (user-chosen) are stored as hex strings in the database and applied via inline `style`, not Tailwind classes — the only sanctioned exception, since these are user data, not design tokens.
- **(Phase 3a)** Gain/loss and negative-amortization warnings use the same red/green semantic-color convention already established for over-budget indicators (Phase 2).
- **(Phase 3b)** Net Worth History's Assets/Debt breakdown series, Savings Growth's chart, and Subscription Cost Detection's Active/Possibly Cancelled badges all reuse this same existing red/green/neutral semantic-color token set — no new ad hoc colors are introduced for any Phase 3b feature specifically, same discipline already applied to Phase 3a's gain/loss and negative-amortization indicators.

## Git / commits (for whichever role is producing them)
- Conventional-commit-style prefixes recommended (`feat:`, `fix:`, `chore:`) but not enforced by tooling in Phase 0.
