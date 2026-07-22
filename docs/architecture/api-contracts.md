# FinanceOS — API Contracts (Phase 0 + Phase 1 + Phase 2 + Phase 3a + Phase 3b + Phase 4a foundation)

All responses use `ApiResult<T>` from `lib/api-response.ts` (see naming-standards.md). All endpoints require an authenticated session (Better Auth) except `/api/auth/*`; unauthenticated requests return `{ success: false, error: "UNAUTHENTICATED" }` with HTTP 401. All queries are scoped server-side to `getCurrentUser().id` — no endpoint accepts a client-supplied user ID. **(Phase 3a exception, documented in full in its own section below, extended by Phase 4a)**: `app/api/cron/net-worth-snapshot/route.ts` is authenticated by a shared secret instead of a user session, since it has no calling user — it iterates all users server-side. It does not use `ApiResult<T>` either, for the same reason `app/api/uploadthing/route.ts` doesn't (system/integration surface, not a client-facing contract). **Phase 4a adds three more instances of this exact same exception** — `app/api/cron/categorize-transactions/route.ts`, `app/api/cron/monthly-summary/route.ts`, `app/api/cron/financial-health-score-snapshot/route.ts` — see the Phase 4a section at the end of this document. **Phase 4a also introduces one new, cross-cutting response-shape composition** (not a new exception to `ApiResult<T>`, an addition on top of it): every on-demand AI-generation Server Action returns `ApiResult<AiFeatureResult<T>>` — see that section's own note for why.

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

**(Phase 3a) `setDerivedBalance` — new, narrow, internal function, not a client-facing action.** Per Architecture.md's "Investments → Accounts: the derived-balance write-back," `features/accounts/server/service.ts` exports one new function, e.g. `setDerivedBalance(userId, accountId, balance): Promise<Account>`, called only from `features/investments/server/actions.ts`.

**(Phase 3b) `getAccounts` gains one new read-only caller, no signature change.** `features/financial-goals/server/service.ts` calls the existing `service.getAccounts(userId)` (non-archived only, its existing default) to sum a user-selected Account subset for the Net Worth/Savings Target goal type's `ACCOUNT_SUBSET` measurement basis — see api-contracts.md's Financial Goals section below. No new Accounts function is introduced for this; the sign-adjustment (`CREDIT_CARD` balances subtracted) is applied by the caller, matching the existing convention already inlined in `dashboard.service.getNetWorth`.

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

**Phase 2 update (see Receipts section below):** `deleteTransaction`'s behavior changes — it now also purges any attached receipt files from storage before removing the row.

**(Phase 3a) `searchTransactionsForLinking` reused, not duplicated.** Recurring Income's mark-received link-picker (AC8) reuses the exact same exported function Bills already added in Phase 2.

**(Phase 3b) `EXCLUDE_SPLIT_PARENTS` gains a third consumer, confirmed as the canonical import site, not duplicated a third time.** `features/transactions/server/service.ts`'s `EXCLUDE_SPLIT_PARENTS` (already imported by `features/transactions/server/aggregations.ts`) is now also imported by every Analytics function touching expense transactions — see Architecture.md's Phase 3b "Analytics module structure" section for the full reasoning, including the pre-existing, out-of-scope duplicate copy in `features/dashboard/server/service.ts` flagged there for a future cleanup pass.

**(Phase 4a) Transaction Auto-Categorization — see its own full section at the end of this document.** No change to any row above; the new suggestion lifecycle (`requestCategorySuggestion`/`acceptCategorySuggestion`/`rejectCategorySuggestion`) is entirely additive, and `acceptCategorySuggestion` reuses `updateTransaction`'s existing category-assignment code path rather than introducing a second write mechanism (per Feature 1 AC4).

## Dashboard (`features/dashboard`)
Read-only aggregation, Server Component direct calls (no client mutation, so no Server Actions/routes needed):
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[] }`
- `service.getMonthlySummary(userId, month)` → `{ income: number; expenses: number; cashFlow: number; savingsRate: number }`
- `service.getSpendingByCategory(userId, month)` → `{ categoryId: string; categoryName: string; amount: number }[]`
- `service.getMonthlyTrends(userId, monthsBack: number)` → `{ month: string; income: number; expenses: number }[]`

**Phase 2 update:** two more read functions, both thin pass-throughs to Budgeting's own service:
- `service.getRemainingBudgetCard(userId)` → maps `budgeting.service.getBudgetMonthSummary` to `{ totalRemaining: number } | null`.
- `service.getBudgetHealthScoreCard(userId)` → calls `budgeting.service.getBudgetHealthScore(userId, currentMonth)` directly.

**(Phase 3a) Net Worth Aggregation Update — see its own full section below**, immediately after Recurring Income, for the complete, double-count-safe formula and the new `service.getNetWorth` contract.

**(Phase 3b) Net Worth History chart — see its own full section below**, after Financial Goals, for the new `features/dashboard/server/net-worth-history.ts` module and its one new Route Handler.

**(Phase 4a) `service.getFinancialHealthScoreCard(userId)`** — a third thin pass-through, added alongside the two above, mirroring `getBudgetHealthScoreCard` exactly: calls `features/financial-health-score/server/service.ts.getFinancialHealthScore(userId)` and maps it to the Dashboard summary card's small shape. **Automatic Monthly Summaries** also add read functions to this module — see the Phase 4a section at the end of this document.

## Categories (`features/categories`)
**Scope correction (CTO, 2026-07-19):** this section previously scoped Phase 1 Categories as seed-only/no-CRUD, which conflicted with the Roadmap's Phase 1 description. Resolved: **minimal custom-category CRUD ships in Phase 1.**

The fixed 11-category list from the Charter is still seeded automatically at signup (`isSystem: true`, protected from rename/delete).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List categories | Server Component direct call to `service.getCategories(userId)` | — | `Category[]` (system + custom) |
| Create custom category | Server Action `createCategory` | `CreateCategorySchema` (name, color?) — name unique per user, case-insensitive | `ApiResult<Category>` |
| Rename/recolor category | Server Action `updateCategory` | `UpdateCategorySchema` (id, name?, color?) — server rejects a `name` change where `isSystem: true`; color changes are allowed on any category | `ApiResult<Category>` |
| Delete custom category | Server Action `deleteCategory` | `{ id: string }` — server rejects if `isSystem: true`; transactions referencing the deleted category are left in place with `categoryId` set to `null` | `ApiResult<{ id: string }>` |

New small feature module: `features/categories/{server/{service.ts, actions.ts, validation.ts}, types.ts, components/category-form.tsx, category-list.tsx}` per folder-tree.md's module boundary rules.

**Phase 2 update (Categories deletion cascades into Budgeting):** `deleteCategory`'s implementation must also remove that category's *current and future month* `BudgetCategory` allocation rows, via `budgeting.service.removeCategoryFromCurrentAndFutureBudgets(userId, categoryId)`.

---

## Budgeting (`features/budgeting`) — Phase 2

Per `docs/product/budgeting.md`. Read paths are Server Component direct calls; the only mutation is setting a category's allocation for a month.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's budget | Server Component direct call to `service.getBudgetMonth(userId, month)` | `month: "YYYY-MM"` | `BudgetMonthView` — see shape below |
| Set/update a category's allocation | Server Action `setCategoryAllocation` | `SetAllocationSchema { month: "YYYY-MM"; categoryId: string; amount: number }` | `ApiResult<BudgetCategoryLine>` |
| Get Budget Health Score | Server Component direct call to `service.getBudgetHealthScore(userId, month)` | `month` | `{ score: number; label: "Good" \| "Fair" \| "Needs attention" } \| null` |
| Get month summary (for Dashboard's Remaining Budget card) | Server Component direct call to `service.getBudgetMonthSummary(userId, month)` | `month` | `{ totalAllocated: number; totalSpent: number; totalRemaining: number } \| null` |

`BudgetMonthView` shape:
```ts
{
  month: string                 // "YYYY-MM"
  isEditable: boolean           // false for past months (AC3)
  hasAnyBudgetData: boolean     // false = "no budget was set this month" empty state
  categories: {
    categoryId: string
    categoryName: string
    isSystem: boolean
    allocated: number | null    // null = unset (AC2) — never conflated with 0
    spent: number
    remaining: number | null
    percentUsed: number | null
    isOverBudget: boolean
  }[]
  totals: { totalAllocated: number; totalSpent: number; totalRemaining: number }
  uncategorizedSpent: number
}
```

**Month materialization / carry-forward (AC3, AC4) — an explicit read-time rule, not a background job:** `service.getBudgetMonth` lazily creates the current/future month by copying the preceding month's allocations at read time; past months with no row return `hasAnyBudgetData: false` without mutating anything.

**Data model recommendation for the Database Architect:** "unset" vs "allocated $0" is modeled as row presence, not a nullable `amount` column.

**Duplication note (Spent calculation):** extracted into `features/transactions/server/aggregations.ts`, exporting `getSpendingByCategoryForMonth(userId, month)` and `getUncategorizedSpendingForMonth(userId, month)`.

**(Phase 3b) `getBudgetMonth` gains a new caller, reused as-is, no signature change.** `features/analytics/server/budget-comparison.ts` calls `getBudgetMonth(userId, month)` once per month in the selected reporting period to build the multi-month Budget vs. Actual table (analytics.md AC9) — see the Analytics section below. Calling it in a per-month loop is the same bounded-loop shape `dashboard.service.getMonthlyTrends` already uses; past months' lazy-materialization behavior ("past months with no row return `hasAnyBudgetData: false` without mutating anything," restated just above) makes this safe to call repeatedly with no side effects on historical months.

**(Phase 4a) `getBudgetHealthScore` gains a new caller, reused verbatim, no signature change.** `features/financial-health-score/server/service.ts` calls `budgeting.service.getBudgetHealthScore(userId, month)` directly for the Financial Health Score's Budget Adherence component (`ai-features.md` Feature 5's own requirement: "never independently recomputed with new logic"). **AI Budget Advisor — see the Phase 4a section at the end of this document.**

## Savings Goals (`features/goals`) — Phase 2

Per `docs/product/savings-goals.md`. Follows the exact archive/unarchive CRUD shape established by Accounts.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List goals | Server Component direct call to `service.getGoals(userId, { includeArchived? })` | — | `GoalWithProgress[]` |
| Get goal detail | Server Component direct call to `service.getGoalById(userId, goalId)` | — | `GoalWithProgress & { contributions: GoalContribution[] }` |
| Create goal | Server Action `createGoal` | `CreateGoalSchema` (name, targetAmount > 0, targetDate?, plannedMonthlyContribution?) | `ApiResult<Goal>` |
| Update goal | Server Action `updateGoal` | `UpdateGoalSchema` (id + partial) | `ApiResult<Goal>` |
| Archive goal | Server Action `archiveGoal` | `GoalIdSchema` (`{ id: string }`) — idempotent | `ApiResult<Goal>` |
| Unarchive goal | Server Action `unarchiveGoal` | `GoalIdSchema` — idempotent | `ApiResult<Goal>` |
| Add contribution | Server Action `addContribution` | `AddContributionSchema { goalId: string; amount: number (> 0); date: Date }` | `ApiResult<GoalContribution>` |
| Delete contribution | Server Action `deleteContribution` | `{ id: string }` | `ApiResult<{ id: string }>` |
| List (client-side refetch) | `GET /api/goals?includeArchived=` | — | `ApiResult<GoalWithProgress[]>` |

`GoalWithProgress` — every derived field is computed at read time in `service.ts`, never stored:
```ts
{
  ...Goal fields,
  currentProgress: number
  remainingAmount: number
  overageAmount: number
  percentComplete: number
  isCompleted: boolean
  isTargetDatePassed: boolean
  estimatedCompletion:
    | { month: string }
    | { status: "not_enough_data" }
}
```

No functional dependency on Accounts or Transactions (confirmed resolved, CTO 2026-07-19).

**(Phase 3b) No functional dependency on `FinancialGoal` in either direction (confirmed, per financial-goals.md's Boundary section and Risk #12's resolution).** `SavingsGoal` is untouched by Phase 3b — no shared code, no shared table, no cross-import. See the Financial Goals section below for the full, resolved boundary reasoning.

**Not extended in Phase 4a.** No Phase 4a feature reads or writes `SavingsGoal`/`GoalContribution` — none of the five AI features' Dependencies sections name Savings Goals as a data source.

## Bills (`features/bills`) — Phase 2

Per `docs/product/bills.md`. Includes the optional occurrence-to-Transaction link (AC7) and backs Calendar v1.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List bills | Server Component direct call to `service.getBills(userId, { includeArchived? })` | — | `BillSummary[]` |
| Get bill detail + payment history | Server Component direct call to `service.getBillById(userId, billId)` | — | `Bill & { occurrences: BillOccurrence[] }` |
| Create bill | Server Action `createBill` | `CreateBillSchema` (name, expectedAmount > 0, dueDate, schedule, categoryId?) | `ApiResult<Bill>` |
| Update bill | Server Action `updateBill` | `UpdateBillSchema` (id + partial) | `ApiResult<Bill>` |
| Archive bill | Server Action `archiveBill` | `BillIdSchema` — idempotent | `ApiResult<Bill>` |
| Unarchive bill | Server Action `unarchiveBill` | `BillIdSchema` — idempotent | `ApiResult<Bill>` |
| Mark occurrence paid (manual) | Server Action `markOccurrencePaid` | `{ occurrenceId: string; paidAmount: number; paidDate: Date }` | `ApiResult<BillOccurrence>` |
| Mark occurrence paid (linked) | Server Action `linkOccurrenceToTransaction` | `{ occurrenceId: string; transactionId: string }` — **(Phase 3a update, see below)** | `ApiResult<BillOccurrence>` |
| Unmark occurrence | Server Action `unmarkOccurrencePaid` | `{ occurrenceId: string }` | `ApiResult<BillOccurrence>` |
| Upcoming list | Server Component direct call to `service.getUpcomingOccurrences(userId)` | — | `{ billId; billName; occurrenceId; dueDate; expectedAmount; status }[]` |
| List (client-side refetch) | `GET /api/bills?includeArchived=` | — | `ApiResult<BillSummary[]>` |

**Recurring-occurrence generation strategy: lazy, on-read generation with persisted rows and a rolling horizon.** `ensureOccurrencesGenerated(bill, throughDate)` runs at the top of every read function needing occurrence data.

**Status is never a stored column — always computed**, via `occurrence.ts`'s `computeStatus(dueDate, paidState, today)`.

**(Phase 3a update to `occurrence.ts`):** its date-cadence math is extracted to `lib/recurrence.ts` and shared with Recurring Income's own `occurrence.ts`; `computeStatus` stays in `bills/server/occurrence.ts` unchanged.

**(Phase 3a update to `linkOccurrenceToTransaction`):** before creating the link, it now also calls `lib/transaction-link-guard.ts`'s `assertTransactionNotAlreadyLinked`.

**Bills reads via other domains, explicit service calls only:** `searchTransactionsForLinking(userId, { query? })` on `features/transactions/server/service.ts`, now also reused by Recurring Income.

**Not extended in Phase 3b or Phase 4a.** No spec in either phase requests any Bills change — Bills is untouched by Net Worth History, Analytics, Financial Goals, or any of the five Phase 4a AI features.

## Calendar v1 — Phase 2

Per `docs/product/calendar-and-notifications.md`. No new data, no mutations — entirely a read view over Bills.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's calendar | Server Component direct call to `bills.service.getCalendarMonth(userId, month)` | `month: "YYYY-MM"` | `{ day: string; occurrences: { billId; billOccurrenceId; billName; amount; status }[] }[]` |

Scoped to bills only, unchanged through Phase 4a — no phase requests extending Calendar v1.

---

## Notifications v1 (`features/notifications`) — Phase 2

Per `docs/product/calendar-and-notifications.md`. Lazy, on-read materialization into a dedicated `Notification` table, triggered by polling the notification inbox.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get inbox (list + unread count) | `GET /api/notifications` — calls `service.ensureNotifications(userId)` then `service.getNotifications(userId)` | — | `ApiResult<{ items: Notification[]; unreadCount: number }>` |
| Mark one read | Server Action `markNotificationRead` | `{ id: string }` | `ApiResult<Notification>` |
| Dismiss one | Server Action `dismissNotification` | `{ id: string }` | `ApiResult<Notification>` |
| Mark all read | Server Action `markAllNotificationsRead` | — | `ApiResult<{ count: number }>` |

`service.ensureNotifications(userId)` reads from `budgeting.service.getOverBudgetCategories` and `bills.service.getDueSoonAndLateOccurrences`, upserting `Notification` rows; never writes to Budgeting/Bills.

**Not extended in Phase 3a or Phase 3b.** No spec in either phase requests a Debt/Investment/Recurring-Income/Analytics/Financial-Goal-triggered notification type (e.g. "you just paid off a debt," per financial-goals.md AC7's own explicit "notifications are out of scope for this phase — Notifications v2 is Phase 4"). Flagged again here so it isn't assumed silently: if Phase 4 wants one, it follows the exact same one-directional read pattern already established here.

**Not extended in Phase 4a either — confirmed, not just carried forward by omission.** None of the five AI features generates a new `Notification` row or a new `NotificationType` (e.g. "a new spending insight is ready," "your monthly recap is available") — `ai-features.md` names no such requirement, and `roadmap.md`'s own Phase 4b description reserves new trigger types for "Notifications v2." This is worth stating explicitly here (not just leaving it implied) because Phase 4a's monthly-cadence cron jobs (categorization batches, monthly summaries, health-score snapshots) are the most plausible-looking candidates yet for "maybe this should also notify the user" — flagged now so a future implementer doesn't wire one in as an unrequested scope addition.

**Data model recommendation for the Database Architect:** `id, userId, type (enum), budgetCategoryId (nullable FK), billOccurrenceId (nullable FK), createdAt, readAt, dismissedAt`, with unique constraints per steps 1–2 of the ensure-algorithm.

**Notification bell placement:** unchanged from Phase 2 — composed into `components/shared/top-nav.tsx` via the existing `notificationSlot` prop.

---

## Receipts — Phase 2 addendum to Transactions (`features/transactions/server/receipts.ts`)

Per `docs/product/transactions.md`'s "Phase 2 Addendum: Receipt Attachment." File storage is UploadThing.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Upload endpoint | `app/api/uploadthing/route.ts` — `GET`/`POST` via UploadThing's `createRouteHandler(fileRouter)` | UploadThing's own request contract | UploadThing's own response contract |
| Upload from the browser | `features/transactions/components/receipt-uploader.tsx`, wrapping `<UploadButton endpoint="receiptUploader" />` | file (image or PDF) | `{ url, key, name, size }[]` client-side callback |
| Persist receipt metadata | Server Action `attachReceipt` | `AttachReceiptSchema { transactionId; url; key; name; size; mimeType }` | `ApiResult<Receipt>` |
| List receipts for a transaction | Server Component direct call to `receipts.getReceiptsForTransaction(userId, transactionId)` | — | `Receipt[]` |
| Remove a receipt | Server Action `removeReceipt` | `{ id: string }` | `ApiResult<{ id: string }>` — deletes the DB row and calls `utapi.deleteFiles(key)` |

**Existing action updated, not a new endpoint:** `deleteTransaction` also calls `utapi.deleteFiles(...)` for every attached receipt before removing the `Transaction` row.

**Schema note (resolved, Database Architect):** `Transaction.receiptUrl` was dropped, replaced by the one-to-many `Receipt` model.

---

## Debt Tracker (`features/debt`) — Phase 3a

Per `docs/product/debt-tracker.md`. Follows the archive/unarchive CRUD shape established by Accounts/Goals/Bills, plus a computed-at-read-time projection layer and a client-side-recomputable strategy comparison.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List debts | Server Component direct call to `service.getDebts(userId, { includeArchived? })` | — | `DebtWithProjection[]` |
| Get debt detail | Server Component direct call to `service.getDebtById(userId, debtId)` | — | `DebtWithProjection` |
| Create debt | Server Action `createDebt` | `CreateDebtSchema` (name, type: `DebtType`, balance > 0, interestRate ≥ 0, minimumPayment > 0) | `ApiResult<Debt>` |
| Update debt | Server Action `updateDebt` | `UpdateDebtSchema` (id + partial) | `ApiResult<Debt>` |
| Archive debt (soft delete) | Server Action `archiveDebt` | `DebtIdSchema` (`{ id: string }`) — idempotent | `ApiResult<Debt>` |
| Unarchive debt | Server Action `unarchiveDebt` | `DebtIdSchema` — idempotent | `ApiResult<Debt>` |
| Link to an existing Account (Credit Card only) | Server Action `linkDebtToAccount` | `{ debtId: string; accountId: string }` | `ApiResult<Debt>` |
| Unlink from Account | Server Action `unlinkDebtFromAccount` | `{ debtId: string }` | `ApiResult<Debt>` |
| Compare snowball vs. avalanche | Client-side only via `features/debt/payoff-math.ts`'s `compareSnowballAndAvalanche(debts, extraPayment)` | — | `StrategyComparisonResult`, recomputed in-browser |
| List (client-side refetch) | `GET /api/debts?includeArchived=` | — | `ApiResult<DebtWithProjection[]>` |

`DebtWithProjection` — every derived field computed at read time, never stored:
```ts
{
  ...Debt fields,                    // id, name, type, minimumPayment, interestRate, linkedAccountId (nullable)
  effectiveBalance: number
  payoffDate: string | null
  totalInterestRemaining: number | null
  isNegativeAmortization: boolean
  isPaidOff: boolean
  isEstimate: boolean
}
```

**(Phase 3b) `getDebtById` gains a new cross-domain caller and one confirmed behavior, no signature change.** `features/financial-goals/server/service.ts` calls `getDebtById(userId, debtId)` for the Debt Payoff goal type's live `effectiveBalance` and `archivedAt` state. **Confirmation required from the Backend Engineer (not a redesign):** this single-record lookup must return the Debt regardless of its `archivedAt` value (unlike `getDebts`' list, which correctly defaults to excluding archived) — Financial Goals' "a linked Debt is archived while its goal is active: progress freezes at its last-known value" edge case depends on this, and needs no new function or schema change to satisfy, since an archived Debt's row (and its live `balance`) is never deleted. See Architecture.md's Phase 3b Financial Goals section for the full reasoning.

**(Phase 4a) `debt.service` gains a new read-only aggregate consumer, no signature change.** `features/financial-health-score/server/service.ts` reads active, non-archived Debts' minimum payments (summed) for the Financial Health Score's Debt-to-Income component (`ai-features.md` Feature 5's formula) — likely via the same `getTotalActiveDebtBalanceForNetWorth`-style existing aggregate pattern already used for Net Worth, or a small new sibling read function if a minimum-payment total isn't already exposed; either way, **no schema change**, since every Debt row already carries `minimumPayment`.

`StrategyComparisonResult` shape (pure output of `payoff-math.ts`, never persisted):
```ts
{
  extraPayment: number
  snowball: { monthsToDebtFree: number; totalInterestPaid: number; payoffOrder: string[] }
  avalanche: { monthsToDebtFree: number; totalInterestPaid: number; payoffOrder: string[] }
  isIdentical: boolean
}
```

## Investments (`features/investments`) — Phase 3a

Per `docs/product/investments.md`. Containers are existing Investment/Retirement/Crypto `Account` rows; `Holding` is a new child model.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List containers | Server Component direct call to `service.getContainers(userId)` | — | `ContainerSummary[]` |
| Get container detail (holdings list) | Server Component direct call to `service.getHoldingsForContainer(userId, accountId, { includeClosed? })` | — | `Holding[]` |
| Get holding detail | Server Component direct call to `service.getHoldingById(userId, holdingId)` | — | `Holding & { valueHistory: HoldingValueHistoryEntry[]; dividends: DividendEntry[] }` |
| Create holding (incl. inline container creation) | Server Action `createHolding` | `CreateHoldingSchema` | `ApiResult<Holding>` |
| Update holding | Server Action `updateHolding` | `UpdateHoldingSchema` | `ApiResult<Holding>` |
| Close holding | Server Action `closeHolding` | `HoldingIdSchema` | `ApiResult<Holding>` |
| Log dividend | Server Action `logDividend` | `LogDividendSchema` | `ApiResult<DividendEntry>` |
| Get portfolio overview | Server Component direct call to `service.getPortfolioOverview(userId)` | — | `PortfolioOverview` |
| Get allocation | Server Component direct call to `service.getAllocation(userId, { by: "assetType" \| "sector" })` | — | `{ label: string; value: number; percent: number }[]` |
| Get growth history | Server Component direct call to `service.getGrowthHistory(userId, { holdingId? })` | — | `{ date: string; value: number }[]` |
| List (client-side refetch) | `GET /api/investments?includeClosed=` | — | `ApiResult<ContainerSummary[]>` |

`Holding` gain/loss (AC6) is computed at read time, never stored.

**(Phase 3b) New required function, no schema change:** `service.getGainLossForPeriod(userId, { start, end }): Promise<number>` — sums `(HoldingValueHistoryEntry.newValue - previousValue)` across every entry recorded within `[start, end]`, across both active and closed holdings. Consumed by `features/analytics/server/savings-growth.ts` (AC15's "with any investment holdings' gain/loss for that same period subtracted out"). This is deliberately **not** the same figure as `getPortfolioOverview`'s lifetime `totalGainLoss` — that is a point-in-time cumulative total (`currentValue - costBasis`), while this new function is a period-scoped delta, using data the existing `HoldingValueHistoryEntry` table (already queried by `getGrowthHistory`) already fully supports. See Architecture.md's Phase 3b Analytics section for the full reasoning.

**Not extended in Phase 4a.** No Phase 4a feature's Dependencies section names Investments as a data source (Feature 5's Net Worth Trend component reads Dashboard's already-double-count-safe `getNetWorth`, which already folds in Investments' contribution — no direct Investments read is needed).

## Recurring Income (`features/recurring-income`) — Phase 3a

Per `docs/product/recurring-income.md`. Mirrors Bills' proven lazy on-read occurrence generation exactly, with its own status vocabulary and an Irregular/One-off cadence Bills has no equivalent of.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List income streams | Server Component direct call to `service.getIncomeStreams(userId, { includeArchived? })` | — | `IncomeStreamSummary[]` |
| Get stream detail + receipt history | Server Component direct call to `service.getStreamById(userId, streamId)` | — | `IncomeStream & { occurrences: IncomeOccurrence[] }` |
| Create income stream | Server Action `createIncomeStream` | `CreateIncomeStreamSchema` | `ApiResult<IncomeStream>` |
| Update income stream | Server Action `updateIncomeStream` | `UpdateIncomeStreamSchema` | `ApiResult<IncomeStream>` |
| Archive income stream | Server Action `archiveIncomeStream` | `IncomeStreamIdSchema` | `ApiResult<IncomeStream>` |
| Unarchive income stream | Server Action `unarchiveIncomeStream` | `IncomeStreamIdSchema` | `ApiResult<IncomeStream>` |
| Mark occurrence received (manual) | Server Action `markOccurrenceReceived` | `{ occurrenceId: string; receivedAmount: number; receivedDate: Date }` | `ApiResult<IncomeOccurrence>` |
| Mark occurrence received (linked) | Server Action `linkOccurrenceToTransaction` | `{ occurrenceId: string; transactionId: string }` | `ApiResult<IncomeOccurrence>` |
| Unmark occurrence | Server Action `unmarkOccurrenceReceived` | `{ occurrenceId: string }` | `ApiResult<IncomeOccurrence>` |
| Log an Irregular/One-off event | Server Action `logIrregularIncomeEvent` | `LogIrregularIncomeEventSchema` | `ApiResult<IrregularIncomeEvent>` |
| Expected upcoming income total | Server Component direct call to `service.getExpectedUpcomingIncome(userId, { period })` | `period` | `{ total: number; byStream: { streamId: string; streamName: string; nextOccurrenceAmount: number }[] }` |
| List (client-side refetch) | `GET /api/income?includeArchived=` | — | `ApiResult<IncomeStreamSummary[]>` |

**(Phase 3b) `IncomeOccurrence`/`IrregularIncomeEvent` gain a new read-only, cross-domain caller.** `features/analytics/server/income-analytics.ts` reads these two tables' actual-received amounts, grouped by the parent `IncomeStream.type`, for Income Growth and Income Sources (AC13/AC14) — via a new query living entirely in `features/recurring-income/server/service.ts` (this Architect's recommendation: expose it as `recurring-income.service`'s own function, e.g. `getActualReceivedIncomeBySource(userId, { start, end })`, rather than Analytics reaching into `IncomeOccurrence`/`IrregularIncomeEvent` via direct Prisma access — preserving the "explicit, individually-exported service calls, not direct Prisma reach-through" rule for this new cross-domain read the same way every other one in this document already does). **No schema change required** — both tables already carry every field this query needs (`receivedAmount`/`receivedDate` and the parent stream's `type`).

`IncomeOccurrence.status` is never a stored column — always computed at read time.

**(Phase 4a) `recurring-income.service` gains a new read-only aggregate consumer, no signature change.** `features/financial-health-score/server/service.ts` reads total actual-received monthly income (reusing `getActualReceivedIncomeBySource`'s underlying data, or a thin new total-only wrapper around it) for the Financial Health Score's Debt-to-Income denominator and the Net Worth Trend component's income-relative normalization (`ai-features.md` Feature 5's CTO-corrected formula). **No schema change.**

## Financial Goals (`features/financial-goals`) — Phase 3b

Per `docs/product/financial-goals.md`. Follows the archive/unarchive CRUD shape established by Accounts/Goals/Bills/Debt — with **no contribution/manual-update action of any kind**, which is this feature's single defining structural difference from Savings Goals (AC6). See Architecture.md's Phase 3b "FinancialGoal schema-adjacent module design" section for the full module-boundary and schema handoff.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List goals | Server Component direct call to `service.getFinancialGoals(userId, { includeArchived? })` | — | `FinancialGoalWithProgress[]` |
| Get goal detail | Server Component direct call to `service.getFinancialGoalById(userId, goalId)` | — | `FinancialGoalWithProgress` |
| Create goal | Server Action `createFinancialGoal` | `CreateFinancialGoalSchema` — a discriminated union on `type`: `{ type: "DEBT_PAYOFF"; name; linkedDebtId }` \| `{ type: "NET_WORTH_SAVINGS_TARGET"; name; targetAmount > 0; measurementBasis: "TOTAL_NET_WORTH" \| "ACCOUNT_SUBSET"; accountIds?: string[] }` \| `{ type: "SAVINGS_RATE_TARGET"; name; targetPercent (0–100); targetDate? }` — server re-validates the exclusivity rule (Debt Payoff) and the 0–100 bound (Savings Rate) regardless of client-side validation | `ApiResult<FinancialGoal>` |
| Update goal | Server Action `updateFinancialGoal` | `UpdateFinancialGoalSchema` (id + partial, **excluding `type`** — AC1: "the type is fixed at creation... editing a goal's type after creation is not supported") | `ApiResult<FinancialGoal>` |
| Archive goal | Server Action `archiveFinancialGoal` | `FinancialGoalIdSchema` (`{ id: string }`) — idempotent; allowed on an already-Completed goal (Edge Cases) | `ApiResult<FinancialGoal>` |
| Unarchive goal | Server Action `unarchiveFinancialGoal` | `FinancialGoalIdSchema` — idempotent | `ApiResult<FinancialGoal>` |
| List (client-side refetch) | — **not introduced this phase** — the Financial Goals list page is a plain Server Component read, same shape as Savings Goals' own list page; no toggle-and-refetch need exists yet (archived/active are both shown via a page-level filter re-render, not a client cache toggle) | — | — |

`FinancialGoalWithProgress` — every progress/completion field computed at read time in `service.ts`, never stored, same rule as `GoalWithProgress`/`DebtWithProjection`:
```ts
{
  ...FinancialGoal fields,           // id, name, type, archivedAt, plus each type's own stored config
                                      // (linkedDebtId/startingBalance, targetAmount/measurementBasis,
                                      // targetPercent/targetDate — see the schema shape in Architecture.md)

  // Discriminated on `type`; shape below is per goal type, computed fresh on every read:

  // DEBT_PAYOFF
  currentEffectiveBalance?: number   // live, via debt.service.getDebtById — see the archived-Debt
                                      //   confirmation note in the Debt Tracker section above
  percentPaidOff?: number            // (startingBalance - currentEffectiveBalance) / startingBalance,
                                      //   clamped to 0 (never negative) if the balance increased
                                      //   since the goal began (Edge Cases)
  linkedDebtArchived?: boolean       // true = progress frozen at its last-known value, per Edge Cases
  isCompleted?: boolean              // currentEffectiveBalance <= 0

  // NET_WORTH_SAVINGS_TARGET
  currentMeasuredValue?: number      // dashboard.service.getNetWorth(userId).total, OR the live,
                                      //   sign-adjusted sum of the selected Account subset
  distanceToTarget?: number          // targetAmount - currentMeasuredValue (may be negative — shown
                                      //   plainly, per Edge Cases' "never hide a negative number")
  trend?: { date: string; value: number }[]  // only present when measurementBasis is
                                      //   TOTAL_NET_WORTH — reuses dashboard.getNetWorthHistory;
                                      //   omitted (not a fabricated partial series) for ACCOUNT_SUBSET,
                                      //   per the spec's own stated constraint
  isCompleted?: boolean              // currentMeasuredValue >= targetAmount

  // SAVINGS_RATE_TARGET
  currentRollingAverageRate?: number | null   // null = "not enough data" (fewer than 3 qualifying
                                      //   months in the trailing 3-month window, or every month in
                                      //   the window had $0 income)
  isCompleted?: boolean              // currentRollingAverageRate !== null && >= targetPercent
}
```

**No `percentComplete`-style 0–100% fill-bar field is returned for `SAVINGS_RATE_TARGET`** — per the spec's own resolved decision ("not shown as a conventional 0–100% fill bar... shows the current rolling-average rate plainly next to the target"), `currentRollingAverageRate` and `targetPercent` are returned side by side and it is the Frontend Lead's job to render them as two plain figures, not a progress bar.

**Debt Payoff exclusivity ("at most one active goal per Debt")** is enforced inside `createFinancialGoal`'s Server Action, calling a private helper in `financial-goals/server/service.ts` (query for an existing non-archived `DEBT_PAYOFF` goal with the same `linkedDebtId`) — see Architecture.md's Phase 3b section for the full reasoning on why this needs no shared `lib/`-level guard (unlike Bills↔Recurring Income) and this Architect's recommendation for how the Database Architect enforces it (application-level check vs. a partial unique index).

**Data model recommendation for the Database Architect:** see Architecture.md's full `FinancialGoal`/`FinancialGoalAccount` schema shape, under "FinancialGoal schema-adjacent module design."

**Not extended in Phase 4a.** No Phase 4a feature's Dependencies section names Financial Goals as a data source or consumer; `FinancialGoal` is untouched.

## Analytics (`features/analytics`) — Phase 3b

Per `docs/product/analytics.md`. Entirely read-only aggregation (Server Component direct calls) plus one small mutation (dismissing a false-positive subscription candidate). See Architecture.md's Phase 3b "Analytics module structure" section for the full file-layout reasoning and Risk #11's resolution (raw on-read aggregation, no materialized/cached aggregates).

**Shared reporting-period control**, per AC2 — one Zod-validated searchParam on `app/(dashboard)/analytics/page.tsx`, `?period=this-year|last-12-months|year-to-date|all-time` (default `this-year`), resolved once via `features/analytics/server/period.ts`'s `resolveReportingPeriodRange(period, now)` and passed into every period-aware metric call below. Top Merchants and Largest Purchases ignore this control by default (analytics.md's own "Top Merchants defaults to all-time unless filtered") — both accept an optional, independent period override instead.

| Metric | Mechanism | Input | Output |
|---|---|---|---|
| Yearly Spending | Server Component direct call to `spending-trends.getYearlySpending(userId)` (always all-time by definition — AC6: "across all years the user has data for") | — | `{ year: number; totalExpenses: number }[]` |
| Category Trends | Server Component direct call to `spending-trends.getCategoryTrends(userId, period)` | `period` | `{ categoryId: string; categoryName: string; points: { month: string; amount: number }[] }[]` |
| Expense Distribution | Server Component direct call to `expense-breakdown.getExpenseDistribution(userId, period)` | `period` | `{ categoryId: string; categoryName: string; amount: number }[]` (same "Uncategorized" sentinel-id convention as `dashboard.service.getSpendingByCategory`) |
| Budget vs. Actual | Server Component direct call to `budget-comparison.getBudgetVsActual(userId, period)` | `period` | `{ month: string; categories: { categoryId: string; categoryName: string; allocated: number \| null; actual: number }[] }[]` |
| Top Merchants | Server Component direct call to `expense-breakdown.getTopMerchants(userId, { period?, limit? })` | `period?` (default all-time), `limit?` (default 20) | `{ normalizedMerchantName: string; displayName: string; totalSpend: number; transactionCount: number }[]` |
| Largest Purchases | Server Component direct call to `expense-breakdown.getLargestPurchases(userId, { period?, limit? })` | `period?` (default all-time), `limit?` (default 20) | `{ transactionId: string; date: string; merchant: string; categoryName: string; amount: number }[]` |
| Daily Spending Heatmap | Server Component direct call to `spending-heatmap.getDailySpendingHeatmap(userId, period)` | `period` | `{ date: string; amount: number; relativeIntensity: number }[]` — `relativeIntensity` is `amount / averageDailySpendOverPeriod`, computed once per call, never stored |
| Income Growth | Server Component direct call to `income-analytics.getIncomeGrowth(userId, period)` | `period` | `{ month: string; total: number; bySource: { type: IncomeType \| "UNTRACKED"; amount: number }[] }[]` |
| Income Sources | Server Component direct call to `income-analytics.getIncomeSources(userId, period)` | `period` | `{ type: IncomeType \| "UNTRACKED"; amount: number; percent: number }[]` |
| Savings Growth | Server Component direct call to `savings-growth.getSavingsGrowth(userId, period)` | `period` | `{ month: string; actualSavings: number \| null }[]` — `null` for any month excluded per the "$0 income month" rule (AC's own edge case, mirroring `dashboard.service.computeSavingsRate`'s null-on-zero-income convention) |
| Subscription Cost Detection (list) | Server Component direct call to `subscriptions.getSubscriptionCandidates(userId)` | — | `SubscriptionCandidate[]` (see shape below) — always all-time, ignores the shared period control entirely (needs full history for first/most-recent detection) |
| Subscription Cost Detection (total) | Server Component direct call to `subscriptions.getActiveSubscriptionAnnualizedTotal(userId)` | — | `{ total: number }` — sum of `estimatedAnnualizedCost` across every currently `ACTIVE` candidate |
| Dismiss a false positive | Server Action `dismissSubscriptionCandidate` | `DismissSubscriptionCandidateSchema { normalizedMerchantName: string }` | `ApiResult<{ normalizedMerchantName: string }>` |

`SubscriptionCandidate` shape (computed at read time from `Transaction` data plus one exclusion-set lookup against `DismissedSubscriptionMerchant`, never itself stored):
```ts
{
  normalizedMerchantName: string
  displayName: string                // most-recent raw merchant string for this group, for display
  averageAmount: number
  detectedInterval: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY"
  firstDetectedDate: string
  mostRecentChargeDate: string
  estimatedAnnualizedCost: number
  status: "ACTIVE" | "POSSIBLY_CANCELLED"
}
```

**Merchant normalization** for both Top Merchants and Subscription Cost Detection is `lib/merchant-normalization.ts`'s `normalizeMerchantName(raw)` — one shared, pure, unit-tested function, not two independent implementations. See Architecture.md's Phase 3b "Reusable utilities" section for why this is deliberately **not** merged with Transactions' own private CSV-dedup normalization.

**Subscription detection's pure algorithm** (`features/analytics/server/subscription-detection.ts`) is unit-tested against fixture data per analytics.md's Definition of Done: the 3-occurrence minimum (no false positive on 2 matches), price-change-as-continuation, and the Active/Possibly Cancelled status transition — the same fixture-driven testability bar `payoff-math.ts` already established for Debt Tracker.

**Data model recommendation for the Database Architect:** see Architecture.md's full `DismissedSubscriptionMerchant` schema shape, under "Subscription Cost Detection's dismissal-tracking schema requirement."

**(Phase 4a) Spending Insights — see the Phase 4a section at the end of this document.** No change to any row above; Insights reads every one of the 11 metric functions listed here as a pure downstream consumer (never re-implementing any of them), exactly as `ai-features.md` Feature 4's Dependencies require.

---

## Net Worth Aggregation Update (`features/dashboard`) — Phase 3a

Per `roadmap.md`'s Phase 3a milestone 5 and both `debt-tracker.md`'s and `investments.md`'s Dependencies sections. This is an update to the existing `service.getNetWorth(userId)` contract (Phase 1), not a new endpoint.

**The double-counting risk this contract exists to prevent:** per `accounts.md` AC6, a Credit Card `Account`'s balance is already a positive "amount owed" figure that Phase 1's Net Worth formula already subtracts. If a `Debt` record is linked to that same Credit Card Account, that Debt's `effectiveBalance` is, by design, the exact same number, read live. Naively adding a second "subtract every active debt's balance" term would double-subtract that liability.

**Required formula:**
```
totalAccountBalance   = sum of non-archived Account.balance, sign-adjusted (Credit Card subtracted)
unlinkedDebtLiability = sum of active, non-archived, non-Paid-Off Debt.effectiveBalance
                        WHERE the Debt is NOT linked to an Account
netWorth = totalAccountBalance - unlinkedDebtLiability
```

`debt.service` exports `getTotalActiveDebtBalanceForNetWorth(userId): Promise<number>` directly.

**Updated contract:**
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[]; totalUnlinkedDebtLiability: number }`

**Unchanged and confirmed stable through Phase 4a.** Every consumer of Net Worth (the Net Worth History chart, Financial Goals' `NET_WORTH_SAVINGS_TARGET` type, and — new in Phase 4a — the Financial Health Score's Net Worth Trend component) reads this same `total`/`totalUnlinkedDebtLiability` shape, never re-deriving net worth independently — the single-source-of-truth guarantee this formula exists to provide holds unchanged into Phase 4a.

## Net Worth Snapshot job (`features/dashboard/server/snapshot.ts`) — Phase 3a

Per `roadmap.md`'s Phase 3a milestone 6 and Risk #10.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Capture a snapshot for every user | `POST /api/cron/net-worth-snapshot` — authenticated via a shared secret, not a user session | none | `{ processed: number }`, plain JSON, HTTP 200 — not `ApiResult<T>` |

Internally calls `dashboard.service.captureAllUsersNetWorthSnapshots()`, looping every user and calling `captureNetWorthSnapshot(userId)`.

**Data model:** `NetWorthSnapshot { id, userId (FK), capturedAt, capturedDate, totalNetWorth, totalAccountBalance, totalUnlinkedDebtLiability }`, `@@unique([userId, capturedDate])`, indexed on `(userId, capturedAt)` — as-built, per er-diagram.md.

**Unchanged through Phase 4a.** Phase 3b's Net Worth History chart, and Phase 4a's Financial Health Score Net Worth Trend component, are both pure read layers over this exact table — see their own sections for the read-side contract. No change to the cadence, the cron mechanism, or the row shape is requested or required by either. **Phase 4a's own `FinancialHealthScoreSnapshot`-shaped table (see the Phase 4a section below) is a deliberate new sibling table, not an extension of this one** — see Architecture.md's Phase 4a module-placement resolution for the full reasoning.

## Net Worth History chart (`features/dashboard`) — Phase 3b

Per `docs/product/net-worth-history.md`. A read layer over the existing `NetWorthSnapshot` table (Phase 3a) — no new model, no new index, confirmed nothing architecturally tricky here. See Architecture.md's Phase 3b "Net Worth History chart's data source and read-side contract" section for the full reasoning (thinning strategy, default-range resolution).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get history (initial load) | Server Component direct call to `features/dashboard/server/net-worth-history.ts`'s `getNetWorthHistory(userId, range)` | `range: "30d" \| "90d" \| "1y" \| "all"` | `NetWorthHistoryResponse` (see shape below) |
| Resolve the default range (AC3) | Server Component direct call to `resolveDefaultRange(userId)` | — | `{ defaultRange: "90d" \| "all"; daysTracked: number }` — a cheap `min(capturedDate)`/count query, not a full row fetch |
| Get history (range/refetch, client-side) | `GET /api/dashboard/net-worth-history?range=` — the one new Dashboard Route Handler this phase, used only by `features/dashboard/hooks/use-net-worth-history.ts` when the user changes the range selector after initial load | `range` | `ApiResult<NetWorthHistoryResponse>` |

`NetWorthHistoryResponse` shape:
```ts
{
  range: "30d" | "90d" | "1y" | "all"
  daysTracked: number             // total distinct captured days across the user's *entire* history,
                                    //   independent of `range` — powers AC4's sparse-history messaging
                                    //   ("Building your net worth history — N days tracked so far")
                                    //   even when a shorter range is selected
  isSparse: boolean                // daysTracked < 14 (AC4)
  points: {
    date: string                   // "yyyy-MM-dd", the snapshot's `capturedDate`
    netWorth: number
    assets: number                 // NetWorthSnapshot.totalAccountBalance (AC5's "Assets" series)
    debt: number                   // NetWorthSnapshot.totalUnlinkedDebtLiability (AC5's "Debt" series)
    isMostRecent: boolean           // true only for the last point — drives AC9's "as of" label
  }[]
}
```

**Thinning (AC7):** when the resolved range's row count exceeds a legibility threshold (~120 points), `getNetWorthHistory` selects one real, already-captured row per bucket (e.g. the last snapshot in each week/month, depending on range) rather than returning every daily row — never an averaged or synthetic point. Every point in `points` is always a genuine day's real snapshot; gaps in captured history (AC8) are represented by simply omitting that day, never by interpolating a value for it.

**Breakdown toggle (AC5)** is a pure client-side view switch in `features/dashboard/components/net-worth-history-chart.tsx` between the single `netWorth` series and the `assets`/`debt` two-series view — both are already present on every point in the one response above, so toggling never triggers a new fetch.

**Scoping (AC10):** `getNetWorthHistory` and `resolveDefaultRange` both take `userId` from the caller's `getCurrentUser()` result, same as every other read function in this document — no endpoint accepts a client-supplied user id.

---

## AI Features (Phase 4a)

Per `docs/product/ai-features.md` (Product Owner spec, all five features + the Financial Health Score's deterministic-formula scope resolution) and `docs/architecture/ai-features-design.md` (AI Engineer's technical design — LLM provider, `lib/ai/` internals, the Zod structured-output/grounding/retry pattern, prompt-injection defenses, cost/latency bounds). **This section documents only the API surface** — mechanism classification (Server Action vs. Server-Component-direct-call vs. Route Handler) and input/output shapes at the contract level — for all five features, following this document's established per-phase pattern. For *why* a given call returns what it returns, or how a schema/prompt is built, see `ai-features-design.md`; it is not restated here.

**Doc update (AI Engineer, following the Security Architect's design-stage APPROVE-WITH-CHANGES review):** `ai-features-design.md` was revised to address Findings 1, 2, 3, 4, 6, 7, and 8 (Finding 5 — `CategorySuggestion` cron-level concurrency — is out of scope for that revision, handled separately with the Database Architect). The shapes and rate-limit descriptions below are updated accordingly: every narrative/insight-text field below is now an explicitly bounded `z.string().max(N)` and passes a new `lib/ai/verify-narrative-safety.ts` check in addition to the existing `citedFigures` grounding check (Finding 1); `CategorySuggestion.transactionId` is now closed-set (a per-request `z.enum`) like `categoryId` already was (Finding 4); every rate-limited on-demand action below uses an atomic conditional update plus a secondary per-user rolling-window cap, not a plain read-then-write minimum-interval check (Finding 6). The per-feature prompt-input DTOs and the cross-user batch-payload invariant introduced for Findings 2 and 3 are internal to `lib/ai/`/each feature's server directory and don't change any row's documented client-facing shape, so they aren't restated here — see `ai-features-design.md` §4.1/§4.5.

### The `ApiResult<AiFeatureResult<T>>` composition — read this once, applies to every on-demand action below

Every one of the five features' *on-demand* generate/refresh Server Actions returns a **nested** result: the outer `ApiResult<T>` (this codebase's standing convention, `lib/api-response.ts`) communicates ordinary request-level success/failure (auth, input validation, an unexpected server exception) — exactly as it does for every other Server Action in this document. The inner `AiFeatureResult<T>` (`lib/ai/types.ts`, per `ai-features-design.md` §5) communicates the AI-specific outcome: `{ status: "ok"; data: T }` or `{ status: "unavailable" }`. **These are not redundant with each other.** A degraded AI outcome (provider down, timeout, invalid output even after retry) is `{ success: true, data: { status: "unavailable" } }` — a **successful** request that happened to determine the AI feature can't currently produce output — never `{ success: false, ... }`. Reserving `success: false` for genuine request-level failures (bad input, no session) keeps the outer `ApiResult` contract's existing meaning intact and gives the Frontend Lead exactly one place to check for "did the AI generation itself work" (the inner `status` field) rather than conflating it with request-level error handling. This is the one genuinely new response-shape convention Phase 4a introduces; see naming-standards.md for where `AiFeatureResult<T>` itself is defined and how it composes.

**Server-Component-direct-call reads** that surface AI-generated content return `AiFeatureResult<T>` directly (no outer `ApiResult` wrapper), consistent with every other Server-Component-direct-call row in this document never being `ApiResult`-wrapped either (e.g. Accounts' "List accounts" row above returns a plain `Account[]`, not `ApiResult<Account[]>`).

### Feature 1 — Transaction Auto-Categorization (`features/transactions`)

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Automatic suggestion generation (batch) | `POST /api/cron/categorize-transactions` — shared-secret authenticated, not a user session, not `ApiResult<T>` (same exception class as `net-worth-snapshot`) | none | `{ processed: number; suggested: number }` plain JSON |
| Manual "reconsider" suggestion | Server Action `requestCategorySuggestion` | `{ transactionId: string } \| { splitLineItemId: string }` — rate-limited per `lib/ai/rate-limit.ts` via an atomic conditional update against that transaction's own last-requested timestamp (not read-then-write — `ai-features-design.md` §2/§6, Security Architect Finding 6b), plus a secondary per-user rolling-window cap across all of that user's "reconsider" calls in aggregate, not just this one transaction (Finding 6a) | `ApiResult<AiFeatureResult<CategorySuggestion>>` |
| Get pending suggestions for a transaction/batch | Server Component direct call to `categorization.getPendingSuggestions(userId, { importBatchId? })` | — | `TransactionSuggestion[]` — the persisted, `PENDING`-state rows (see the suggestion/audit-trail table's required facts, `ai-features-design.md` §7); this is a plain read of already-generated suggestions, not a new generation call, so it is never AI-feature-result-wrapped |
| Accept a suggestion | Server Action `acceptCategorySuggestion` | `{ suggestionId: string }` — internally calls the **same** category-assignment path `updateTransaction` already uses (Feature 1 AC4); this is the **only** code path that ever writes `Transaction.categoryId` as a result of a suggestion | `ApiResult<Transaction>` |
| Reject a suggestion | Server Action `rejectCategorySuggestion` | `{ suggestionId: string }` | `ApiResult<{ suggestionId: string }>` |

`CategorySuggestion` shape (the model's structured output, validated against a per-request-built `z.enum` of the user's own real category IDs — `ai-features-design.md` §4.2 — never persisted in this exact shape; the persisted row is the suggestion/audit-trail table, Database Architect's schema):
```ts
{
  transactionId: string           // or splitLineItemId, for the split-line-item case (AC8) — validated
                                    //   against a per-request-built z.enum of the exact batch's own
                                    //   candidate IDs, the same closed-set technique as categoryId
                                    //   (`ai-features-design.md` §4.2, Security Architect Finding 4;
                                    //   previously an unconstrained z.string(), fixed this revision)
  categoryId: string               // guaranteed to be one of the caller's own current category IDs —
                                    //   the schema itself is the closed set (§4.2), not a post-hoc check
  confidence: number                // 0–1
}
```

### Feature 2 — AI Budget Advisor (`features/budgeting`)

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get advisor card (initial view — generates on first view, or reads the cached row) | Server Component direct call to `advisor.getBudgetAdvisorRecommendations(userId, month)` | `month: "YYYY-MM"` — **current, editable month only** (Feature 2 AC5); never called for a past month | `AiFeatureResult<BudgetAdvisorRecommendations>` |
| Refresh recommendations | Server Action `refreshBudgetAdvisor` | `{ month: string }` — rate-limited against the cached row's own `generatedAt` via an atomic conditional update, not read-then-write (`ai-features-design.md` §2/§6, Finding 6b), plus a secondary per-user rolling-window cap across every month the user might refresh, not just the current `(userId, month)` key (Finding 6a) | `ApiResult<AiFeatureResult<BudgetAdvisorRecommendations>>` |

`BudgetAdvisorRecommendations` shape:
```ts
{
  recommendations: { text: string; citedFigures: { label: string; value: number }[] }[]  // 1–3 items;
                                    //   `text` is `z.string().max(~500)` (exact ceiling is the schema
                                    //   file's own call) — every narrative field is now explicitly
                                    //   bounded, never unbounded (Security Architect Finding 1a), and
                                    //   is additionally checked by `lib/ai/verify-narrative-safety.ts`
                                    //   alongside the existing `citedFigures` grounding check
                                    //   (Finding 1b) before this shape is ever returned as `"ok"`
  generatedAt: string
}
```

**Rendering requirement (Finding 1c, Frontend Lead):** `text` must always render as a plain text node — never `dangerouslySetInnerHTML`, never a markdown-to-HTML pipeline. See `ai-features-design.md` §4.3/§8.

**Read-only, by construction, not just by convention.** `features/budgeting/server/advisor.ts` has no Prisma **write** access to `Budget`/`BudgetCategory` at all (Feature 2's own Definition of Done requires this be verifiable by test, not merely by code review) — its only persistence is its own generated-content cache row, owned entirely within Budgeting's module (see Architecture.md's Phase 4a "module ownership" note).

### Feature 3 — Automatic Monthly Summaries (`features/dashboard`)

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Cron generation (once per user, per just-closed month) | `POST /api/cron/monthly-summary` — shared-secret authenticated, plain JSON | none | `{ processed: number }` |
| Get most-recent summary (Dashboard card) | Server Component direct call to `monthly-summary.getMostRecentSummary(userId)` | — | `MonthlySummary \| null` — `null` only for a brand-new user with no completed month yet (Feature 3's own "no fabricated first month" edge case); a completed month whose generation failed still returns its persisted row (with enough state for the UI to render "Summary not available for [Month]" — exact column shape is the Database Architect's call) |
| Browse summary history | Server Component direct call to `monthly-summary.getSummaryHistory(userId)` | — | `MonthlySummary[]` |
| Regenerate a summary (optional, if built per Feature 3's "may optionally be offered") | Server Action `regenerateMonthlySummary` | `{ month: string }` — rate-limited, same atomic-conditional-update-plus-per-user-rolling-cap pattern as Advisor's refresh (`ai-features-design.md` §6, Finding 6) | `ApiResult<AiFeatureResult<MonthlySummary>>` |

`MonthlySummary` shape:
```ts
{
  month: string                    // "YYYY-MM", always a fully-closed month (Feature 3 AC3)
  narrative: string                 // z.string().max(~800) — bounded, never unbounded (Finding 1a);
                                    //   checked by lib/ai/verify-narrative-safety.ts alongside the
                                    //   citedFigures grounding check below (Finding 1b) before this
                                    //   shape is ever returned as "ok"; must render as a plain text
                                    //   node client-side, never dangerouslySetInnerHTML or a markdown
                                    //   pipeline (Finding 1c)
  citedFigures: { label: string; value: number }[]   // income, expenses, cash flow, savings rate,
                                    //   net worth change, top category/merchant — every figure this
                                    //   narrative references, per the grounding-verification pattern
                                    //   (ai-features-design.md §4.3)
  isPartialMonth: boolean            // true only for a user's genuinely partial first month (Edge Cases)
}
```

**Persisted, never regenerated automatically (Feature 3 AC2)** — this Server Component read is a plain row fetch; no AI call ever happens on this path. Only the cron route and the optional `regenerateMonthlySummary` action ever call `lib/ai/`.

### Feature 4 — Spending Insights (`features/analytics`)

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get insights (initial view — generates on first view, or reads the cached row) | Server Component direct call to `insights.getSpendingInsights(userId, period)` | `period` — Analytics' existing shared reporting-period control when surfaced on the Analytics page (AC5); a fixed current-month-vs-prior comparison when surfaced on the Dashboard, per the same AC | `AiFeatureResult<SpendingInsight[]>` |
| Refresh insights | Server Action `refreshSpendingInsights` | `{ period }` — rate-limited against the cached row's own `generatedAt` via an atomic conditional update, not read-then-write (Finding 6b), plus a secondary per-user rolling-window cap across every reporting period the user might refresh, not just the current `(userId, period)` key (Finding 6a) | `ApiResult<AiFeatureResult<SpendingInsight[]>>` |

`SpendingInsight` shape:
```ts
{
  text: string                      // z.string().max(~150) — bounded, never unbounded (Finding 1a);
                                    //   checked by lib/ai/verify-narrative-safety.ts alongside
                                    //   citedFigures below (Finding 1b); must render as a plain text
                                    //   node client-side, never dangerouslySetInnerHTML or a markdown
                                    //   pipeline (Finding 1c)
  citedFigures: { label: string; value: number }[]   // every percentage/dollar amount/merchant-or-
                                    //   category name referenced, grounded against the specific
                                    //   Analytics metric it's sourced from (§4.3's verification)
  sourceMetric: "categoryTrends" | "topMerchants" | "largestPurchases" | "subscriptionDetection"
               | "dailySpendingHeatmap" | "savingsGrowth"   // which of the 11 Analytics metrics this
                                    //   insight is drawn from — never a computation of its own
}
```

2–4 items per refresh (Feature 4 AC1). Reads every one of Analytics' 11 metric functions listed in the Analytics section above as a pure downstream consumer — `features/analytics/server/insights.ts` never recomputes any of them.

### Feature 5 — Financial Health Score (`features/financial-health-score` — new module; see Architecture.md's module-placement resolution)

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get score + 4-component breakdown (always available — **zero AI dependency in this row**) | Server Component direct call to `service.getFinancialHealthScore(userId)` | — | `FinancialHealthScoreBreakdown` — a plain value, **never** `AiFeatureResult`-wrapped, per Feature 5's own strongest-degradation guarantee (this row's correctness and availability cannot be affected by the AI provider in any way) |
| Get historical trend (sparkline) | Server Component direct call to `snapshot.getFinancialHealthScoreHistory(userId)` | — | `{ date: string; score: number }[]` — reads the periodic, cron-captured snapshot rows (AC7) |
| Get the latest narrative (optional, may be unavailable) | Server Component direct call to `service.getLatestNarrative(userId)` | — | `AiFeatureResult<{ narrative: string; asOf: string }>` — `narrative` is `z.string().max(~400)` (bounded, Finding 1a), checked by `lib/ai/verify-narrative-safety.ts` alongside its own `citedFigures` grounding check (Finding 1b) before persistence, and must render as a plain text node client-side, never `dangerouslySetInnerHTML` or a markdown pipeline (Finding 1c); reads the narrative persisted onto the most recent snapshot row; **no on-demand refresh action exists for this one** (see note below) |
| Cron: capture snapshot + generate narrative (one invocation) | `POST /api/cron/financial-health-score-snapshot` — shared-secret authenticated, plain JSON | none | `{ processed: number }` |
| Dashboard summary card | Server Component direct call to `dashboard.service.getFinancialHealthScoreCard(userId)` | — | `{ score: number; label: "Good" \| "Fair" \| "Needs attention" } \| { status: "not_enough_data" }` — thin pass-through, mirrors `getBudgetHealthScoreCard` exactly |

`FinancialHealthScoreBreakdown` shape:
```ts
{
  score: number | null              // null = zero components computable (brand-new user) — Feature 5's
                                    //   own "never show a misleading 0" rule
  label: "Good" | "Fair" | "Needs attention" | null
  components: {
    debtToIncome: number | null
    savingsRate: number | null
    budgetAdherence: number | null  // identical to Budgeting's own Budget Health Score value —
                                    //   read via budgeting.service.getBudgetHealthScore, never
                                    //   independently recomputed (Feature 5's own DoD requirement)
    netWorthTrend: number | null
  }
  undefinedComponents: ("debtToIncome" | "savingsRate" | "budgetAdherence" | "netWorthTrend")[]
                                    // which component(s), if any, are undefined and why-labeled
                                    //   in the UI (AC4) — e.g. fewer than 3 months of income history
}
```

**Deliberately, `refreshSpendingInsights`-style on-demand regeneration does not exist for the Health Score narrative.** Per `ai-features-design.md` §6's explicit recommendation, the narrative is generated **only** as a side effect of the same cron invocation that captures the historical snapshot (AC7) — never on a page view, never via a user-triggered refresh — because that cadence is what keeps this feature's cost bound to "once per snapshot interval per user," not "once per page view." This is an intentional, permanent asymmetry with Features 2 and 4 (both of which do offer a user-triggered refresh), not an oversight — flagged here so a future implementer doesn't "complete the pattern" by adding a refresh action that would reintroduce the exact per-page-view cost risk the CTO's constraints were written to prevent.

### Cross-feature note: no new client-side hooks, no new session-authenticated Route Handlers

Every on-demand path across all five features above is a Server Action followed by the ordinary `revalidatePath` → Server Component re-fetch flow already used by every mutation in this codebase — none of them is a TanStack Query hook or a client-refetchable `GET` route. This is a deliberate continuity with the rest of the app (Server Actions are the default mutation mechanism everywhere) and not an oversight of a "should this have a hook" question: none of the five features has a Net-Worth-History-style "change a client-side control without a full navigation" requirement that would justify one. The only three new Route Handlers this phase are the shared-secret cron routes, listed above.
