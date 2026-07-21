# FinanceOS — API Contracts (Phase 0 + Phase 1 + Phase 2 + Phase 3a + Phase 3b)

All responses use `ApiResult<T>` from `lib/api-response.ts` (see naming-standards.md). All endpoints require an authenticated session (Better Auth) except `/api/auth/*`; unauthenticated requests return `{ success: false, error: "UNAUTHENTICATED" }` with HTTP 401. All queries are scoped server-side to `getCurrentUser().id` — no endpoint accepts a client-supplied user ID. **(Phase 3a exception, documented in full in its own section below)**: `app/api/cron/net-worth-snapshot/route.ts` is authenticated by a shared secret instead of a user session, since it has no calling user — it iterates all users server-side. It does not use `ApiResult<T>` either, for the same reason `app/api/uploadthing/route.ts` doesn't (system/integration surface, not a client-facing contract).

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

**Data model recommendation for the Database Architect:** `BillOccurrence.transactionId` should be a nullable, unique FK to `Transaction`, `onDelete: SetNull`.

**Bills reads via other domains, explicit service calls only:** `searchTransactionsForLinking(userId, { query? })` on `features/transactions/server/service.ts`, now also reused by Recurring Income.

**Not extended in Phase 3b.** No Phase 3b spec requests any Bills change — Bills is untouched by Net Worth History, Analytics, or Financial Goals.

## Calendar v1 — Phase 2

Per `docs/product/calendar-and-notifications.md`. No new data, no mutations — entirely a read view over Bills.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's calendar | Server Component direct call to `bills.service.getCalendarMonth(userId, month)` | `month: "YYYY-MM"` | `{ day: string; occurrences: { billId; billOccurrenceId; billName; amount; status }[] }[]` |

Scoped to bills only, unchanged through Phase 3b — no Phase 3b spec requests extending Calendar v1.

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

**Unchanged and confirmed stable through Phase 3b.** Every Phase 3b consumer of Net Worth (the Net Worth History chart, Financial Goals' `NET_WORTH_SAVINGS_TARGET` type) reads this same `total`/`totalUnlinkedDebtLiability` shape, never re-deriving net worth independently — the single-source-of-truth guarantee this formula exists to provide holds unchanged into Phase 3b.

## Net Worth Snapshot job (`features/dashboard/server/snapshot.ts`) — Phase 3a

Per `roadmap.md`'s Phase 3a milestone 6 and Risk #10.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Capture a snapshot for every user | `POST /api/cron/net-worth-snapshot` — authenticated via a shared secret, not a user session | none | `{ processed: number }`, plain JSON, HTTP 200 — not `ApiResult<T>` |

Internally calls `dashboard.service.captureAllUsersNetWorthSnapshots()`, looping every user and calling `captureNetWorthSnapshot(userId)`.

**Data model:** `NetWorthSnapshot { id, userId (FK), capturedAt, capturedDate, totalNetWorth, totalAccountBalance, totalUnlinkedDebtLiability }`, `@@unique([userId, capturedDate])`, indexed on `(userId, capturedAt)` — as-built, per er-diagram.md.

**Unchanged through Phase 3b.** Phase 3b's Net Worth History chart is a pure read layer over this exact table — see its own section immediately below. No change to the cadence, the cron mechanism, or the row shape is requested or required.

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
