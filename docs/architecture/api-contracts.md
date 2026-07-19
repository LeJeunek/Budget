# FinanceOS — API Contracts (Phase 0 + Phase 1)

All responses use `ApiResult<T>` from `lib/api-response.ts` (see naming-standards.md). All endpoints require an authenticated session (Better Auth) except `/api/auth/*`; unauthenticated requests return `{ success: false, error: "UNAUTHENTICATED" }` with HTTP 401. All queries are scoped server-side to `getCurrentUser().id` — no endpoint accepts a client-supplied user ID.

## Auth
- `ALL /api/auth/[...all]` — handled entirely by Better Auth's Next.js handler. Backend Engineer wires it up; does not reimplement auth logic.

## Accounts (`features/accounts`)
**Doc correction (Backend Engineer, 2026-07-19):** this table previously listed a `deleteAccount` action returning `ApiResult<{ id: string }>`, implying a hard delete. There is no hard-delete action — the implementation (and `docs/product/accounts.md` AC4/AC5, and the schema's own "Never hard-delete an Account" comment) is archive/unarchive only, corrected below.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List accounts | Server Component direct call to `service.getAccounts(userId, { includeArchived? })` | — | `Account[]` |
| Create account | Server Action `createAccount` | `CreateAccountSchema` (name, type, institution?, balance, interestRate?, color) | `ApiResult<Account>` |
| Update account | Server Action `updateAccount` | `UpdateAccountSchema` (id + partial fields) | `ApiResult<Account>` |
| Archive account (soft delete) | Server Action `archiveAccount` | `AccountIdSchema` (`{ id: string }`) — idempotent, archiving an already-archived account just confirms the end state | `ApiResult<Account>` |
| Unarchive account (restore) | Server Action `unarchiveAccount` | `AccountIdSchema` (`{ id: string }`) — idempotent | `ApiResult<Account>` |
| List (client-side refetch) | `GET /api/accounts?includeArchived=` — thin wrapper around `service.getAccounts`, used only by `features/accounts/hooks/use-accounts.ts` for post-mutation cache refetch; Server Components should still call `service.getAccounts` directly, not this route | — | `ApiResult<Account[]>` |

Archiving (never hard-deleting) an account with existing transactions is required — transaction history must remain intact for analytics/reports in later phases. `archivedAt` is a timestamp, not a boolean, per the Database Architect's schema.

## Transactions (`features/transactions`)
**Doc correction (CTO, 2026-07-19):** the List row originally had no `sortBy`/`sortDir` params, even though `docs/product/transactions.md` AC2 requires sorting by date/amount/merchant/category. The implementing agent correctly declined to extend this contract unilaterally and flagged the gap instead of guessing — resolved below.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List (paginated/filtered/sorted) | `GET /api/transactions?page=&pageSize=&accountId=&categoryId=&search=&dateFrom=&dateTo=&sortBy=&sortDir=` | query params, parsed via `TransactionFilterSchema`. `sortBy` is one of `date` \| `amount` \| `merchant` \| `category` (default `date`); `sortDir` is `asc` \| `desc` (default `desc`) | `ApiResult<{ items: Transaction[]; total: number }>` |
| Create | Server Action `createTransaction` | `CreateTransactionSchema` | `ApiResult<Transaction>` |
| Update (incl. re-categorize, add notes/tags) | Server Action `updateTransaction` | `UpdateTransactionSchema` | `ApiResult<Transaction>` |
| Delete | Server Action `deleteTransaction` | `{ id: string }` | `ApiResult<{ id: string }>` |
| Split | Server Action `splitTransaction` | `{ id: string; splits: { categoryId: string; amount: number }[] }` — splits must sum to original amount, validated server-side | `ApiResult<Transaction[]>` |
| Import CSV | `POST /api/transactions/import` (multipart, needs a real HTTP endpoint, not a Server Action) | file + `accountId` | `ApiResult<{ imported: number; skippedDuplicates: number; errors: { row: number; message: string }[] }>` |

Pagination uses `page`/`pageSize` (not cursor) for Phase 1 — matches TanStack Table's built-in pagination model. Revisit to cursor-based only if a phase-3+ performance review flags it.

## Dashboard (`features/dashboard`)
Read-only aggregation, Server Component direct calls (no client mutation, so no Server Actions/routes needed):
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[] }`
- `service.getMonthlySummary(userId, month)` → `{ income: number; expenses: number; cashFlow: number; savingsRate: number }`
- `service.getSpendingByCategory(userId, month)` → `{ categoryId: string; categoryName: string; amount: number }[]`
- `service.getMonthlyTrends(userId, monthsBack: number)` → `{ month: string; income: number; expenses: number }[]`

These are intentionally not REST endpoints in Phase 1 since nothing client-side needs to refetch them independently of a full page load; promote to `/api/dashboard/*` routes only if a later phase needs client-side refresh (e.g. after a transaction is added without a full page reload).

## Categories (`features/categories`)
**Scope correction (CTO, 2026-07-19):** this section previously scoped Phase 1 Categories as seed-only/no-CRUD, which conflicted with the Roadmap's Phase 1 description ("seeded per user, user-editable") and with the Database Architect's own rationale for the `isSystem` flag (documented in `docs/database/er-diagram.md`), which exists specifically to let non-system categories be freely renamed/deleted while protecting the fixed 11. The Product Owner's spec (`docs/product/categories.md`) flagged this conflict rather than silently picking a side, and it's resolved as follows: **minimal custom-category CRUD ships in Phase 1.** "Full category management" (bulk merge, icons, custom ordering, org-wide admin controls) remains deferred to the Phase 4 admin feature — this is a small, scoped CRUD surface, not that.

The fixed 11-category list from the Charter is still seeded automatically at signup (`isSystem: true`, protected from rename/delete).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List categories | Server Component direct call to `service.getCategories(userId)` | — | `Category[]` (system + custom) |
| Create custom category | Server Action `createCategory` | `CreateCategorySchema` (name, color?) — name unique per user, case-insensitive | `ApiResult<Category>` |
| Rename/recolor category | Server Action `updateCategory` | `UpdateCategorySchema` (id, name?, color?) — server rejects a `name` change where `isSystem: true`; color changes are allowed on any category | `ApiResult<Category>` |
| Delete custom category | Server Action `deleteCategory` | `{ id: string }` — server rejects if `isSystem: true`; transactions referencing the deleted category are left in place with `categoryId` set to `null` (matches the schema's `onDelete: SetNull`, i.e. Uncategorized), not deleted | `ApiResult<{ id: string }>` |

New small feature module: `features/categories/{server/{service.ts, actions.ts, validation.ts}, types.ts, components/category-form.tsx, category-list.tsx}` per folder-tree.md's module boundary rules — not folded into `features/transactions`, since Categories is consumed by Transactions, Dashboard, and (from Phase 2 onward) Budgeting alike, and a single-owner domain shouldn't hold a concept three other domains depend on.
