# FinanceOS — Naming Standards

## Files & folders
- Folders: `kebab-case` (`transactions/`, `data-table/`, `recurring-income/`)
- React component files: `kebab-case.tsx`, default export named in `PascalCase` matching the concept (`account-form.tsx` exports `AccountForm`)
- Non-component TS files: `kebab-case.ts` (`use-accounts.ts`, `validation.ts`)
- Test files: co-located, `<subject>.test.ts(x)`
- **(Phase 3a) Isomorphic pure-calculation files** (importable from both a Server Component and a Client Component — see Architecture.md's guiding-pattern note) live at the feature root, sibling to `types.ts`, never under `server/`. Name them `<concern>-math.ts` (e.g. `features/debt/payoff-math.ts`) to visually distinguish them from both `server/service.ts` (Prisma-touching, server-only) and ordinary `types.ts`/`validation.ts`. These files must never import `lib/db.ts`, `lib/auth.ts`, or anything else server-only — a lint rule or code-review checklist item enforcing this is recommended for whoever implements Phase 3a (Backend Engineer/Bug Hunter), since a future accidental import here would silently break the client bundle.

## Code
- Components: `PascalCase` (`AccountForm`, `TransactionTable`, `StrategyComparison`)
- Hooks: `useCamelCase`, always prefixed `use` (`useAccounts`, `useDebts`, `useHoldings`, `useIncomeStreams`)
- Server Actions: verb-first camelCase (`createAccount`, `deleteTransaction`, `createDebt`, `logDividend`, `linkOccurrenceToTransaction`)
- Route Handlers: standard Next.js `GET`/`POST`/`PATCH`/`DELETE` exports, no custom naming. **(Phase 3a exception, documented, not a new rule)**: `app/api/cron/net-worth-snapshot/route.ts` exports `POST` and is the first Route Handler authenticated by a shared secret (an `Authorization: Bearer <CRON_SECRET>` header check) rather than a browser session — see api-contracts.md's Net Worth Snapshot section. This does not change the naming rule; it changes who is allowed to call it.
- Zod schemas: `PascalCase` + `Schema` suffix (`CreateAccountSchema`, `CreateDebtSchema`, `LogDividendSchema`); inferred types drop the suffix (`type CreateDebtInput = z.infer<typeof CreateDebtSchema>`)
- Prisma models: `PascalCase` singular (`Account`, `Transaction`, `Category`, and — pending the Database Architect's schema pass — `Debt`, `Holding`, `IncomeStream`) — owned by Database Architect, referenced here for consistency
- Enums (TS and Prisma): `PascalCase` type, `SCREAMING_CASE` members (`AccountType.CREDIT_CARD`). Phase 3a introduces:
  - `DebtType`: `CREDIT_CARD | PERSONAL_LOAN | AUTO_LOAN | STUDENT_LOAN | MORTGAGE | OTHER`
  - `AssetType`: `STOCK | ETF | MUTUAL_FUND | BOND | CRYPTO | RETIREMENT_FUND | OTHER`
  - `Sector`: `TECHNOLOGY | HEALTHCARE | FINANCIALS | ENERGY | CONSUMER | REAL_ESTATE | INDUSTRIALS | OTHER` (nullable on a `Holding` for asset types where sector doesn't apply, per `investments.md` AC2/AC9 — modeled as `null`, not a `NOT_APPLICABLE` enum member, so it composes cleanly with the existing "nullable = not applicable" convention already used elsewhere, e.g. Goals' `targetDate`)
  - `IncomeType`: `SALARY | SIDE_HUSTLE | DIVIDEND | RENTAL | BONUS | OTHER`
  - `IncomeSchedule`: `WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | ANNUALLY | IRREGULAR` — note this is a **distinct enum** from Bills' existing `BillSchedule` (`WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | ANNUALLY`), not a shared/reused one, since `IRREGULAR` has no equivalent in Bills and no generated-occurrence behavior at all (AC1/AC11). Do not attempt to make Bills reuse `IncomeSchedule` or vice versa — the shared piece is `lib/recurrence.ts`'s cadence-math functions, not the enum itself, since `lib/recurrence.ts`'s functions only need to accept the five schedule values both enums have in common.
  - `IncomeOccurrenceStatus`: `UPCOMING | EXPECTED_TODAY | NOT_YET_RECEIVED | RECEIVED` — deliberately not reusing Bills' `OccurrenceStatus` (`Upcoming | DueToday | Late | Paid`) even though structurally similar, per `recurring-income.md` AC7's explicit, resolved product decision that "Late" framing is wrong for income (see Architecture.md's cross-domain notes). Never persisted — computed at read time, same rule as `OccurrenceStatus`.

## API response shape (every Route Handler and Server Action)
```ts
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```
Defined once in `lib/api-response.ts`. No endpoint invents its own shape. **(Phase 3a)** `app/api/cron/net-worth-snapshot/route.ts` is the sole documented exception — it is a system-to-system trigger, not a client-facing endpoint, and returns a minimal `{ processed: number }`/HTTP-status-only response rather than `ApiResult<T>`, the same class of exception already established for `app/api/uploadthing/route.ts` in Phase 2 (third-party/system integration surface, not our own contract).

## CSS / Tailwind
- No inline arbitrary colors — use the Tailwind theme tokens configured for shadcn/ui (`bg-primary`, `text-muted-foreground`, etc.) so theming/dark mode stays centralized.
- Category/account "color" fields (user-chosen) are stored as hex strings in the database and applied via inline `style`, not Tailwind classes — the only sanctioned exception, since these are user data, not design tokens.
- **(Phase 3a)** Gain/loss and negative-amortization warnings use the same red/green semantic-color convention already established for over-budget indicators (Phase 2) — reuse the existing Tailwind tokens (e.g. `text-destructive` for losses/warnings, a positive-value equivalent for gains), do not introduce new ad hoc color tokens for these two features specifically.

## Git / commits (for whichever role is producing them)
- Conventional-commit-style prefixes recommended (`feat:`, `fix:`, `chore:`) but not enforced by tooling in Phase 0.
