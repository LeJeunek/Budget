# FinanceOS — Naming Standards

## Files & folders
- Folders: `kebab-case` (`transactions/`, `data-table/`)
- React component files: `kebab-case.tsx`, default export named in `PascalCase` matching the concept (`account-form.tsx` exports `AccountForm`)
- Non-component TS files: `kebab-case.ts` (`use-accounts.ts`, `validation.ts`)
- Test files: co-located, `<subject>.test.ts(x)`

## Code
- Components: `PascalCase` (`AccountForm`, `TransactionTable`)
- Hooks: `useCamelCase`, always prefixed `use` (`useAccounts`, `useTransactionFilters`)
- Server Actions: verb-first camelCase (`createAccount`, `deleteTransaction`, `importTransactionsFromCsv`)
- Route Handlers: standard Next.js `GET`/`POST`/`PATCH`/`DELETE` exports, no custom naming
- Zod schemas: `PascalCase` + `Schema` suffix (`CreateAccountSchema`, `TransactionFilterSchema`); inferred types drop the suffix (`type CreateAccountInput = z.infer<typeof CreateAccountSchema>`)
- Prisma models: `PascalCase` singular (`Account`, `Transaction`, `Category`) — owned by Database Architect, referenced here for consistency
- Enums (TS and Prisma): `PascalCase` type, `SCREAMING_CASE` members (`AccountType.CREDIT_CARD`)

## API response shape (every Route Handler and Server Action)
```ts
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```
Defined once in `lib/api-response.ts`. No endpoint invents its own shape.

## CSS / Tailwind
- No inline arbitrary colors — use the Tailwind theme tokens configured for shadcn/ui (`bg-primary`, `text-muted-foreground`, etc.) so theming/dark mode stays centralized.
- Category/account "color" fields (user-chosen) are stored as hex strings in the database and applied via inline `style`, not Tailwind classes — the only sanctioned exception, since these are user data, not design tokens.

## Git / commits (for whichever role is producing them)
- Conventional-commit-style prefixes recommended (`feat:`, `fix:`, `chore:`) but not enforced by tooling in Phase 0.
