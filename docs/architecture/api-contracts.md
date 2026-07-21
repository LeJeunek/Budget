# FinanceOS — API Contracts (Phase 0 + Phase 1 + Phase 2 + Phase 3a)

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

**(Phase 3a) `setDerivedBalance` — new, narrow, internal function, not a client-facing action.** Per Architecture.md's "Investments → Accounts: the derived-balance write-back," `features/accounts/server/service.ts` exports one new function, e.g. `setDerivedBalance(userId, accountId, balance): Promise<Account>`, called only from `features/investments/server/actions.ts` (never from a Route Handler, Server Action, or any client code) whenever a holding is created/updated/closed for that container. This is not listed as a user-facing "Action" in the table above because it is not one — it exists purely to keep `Account.balance` correct for `Account`'s own pre-existing consumers (Accounts list/detail, Transaction form's account picker, Dashboard's Net Worth base sum) without those consumers needing any Investments-awareness. Naming/exact signature is Backend Engineer's implementation call; the constraint (Investments-only caller, same-transaction atomicity with the holding mutation) is what matters architecturally.

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

**(Phase 3a) `searchTransactionsForLinking` reused, not duplicated.** Recurring Income's mark-received link-picker (AC8) reuses the exact same exported function Bills already added in Phase 2 (`features/transactions/server/service.ts`'s `searchTransactionsForLinking(userId, { query? })`) rather than either domain defining its own copy. No signature change needed — the function already returns generic transaction search results with no Bills-specific shape baked in.

## Dashboard (`features/dashboard`)
Read-only aggregation, Server Component direct calls (no client mutation, so no Server Actions/routes needed):
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[] }`
- `service.getMonthlySummary(userId, month)` → `{ income: number; expenses: number; cashFlow: number; savingsRate: number }`
- `service.getSpendingByCategory(userId, month)` → `{ categoryId: string; categoryName: string; amount: number }[]`
- `service.getMonthlyTrends(userId, monthsBack: number)` → `{ month: string; income: number; expenses: number }[]`

**Phase 2 update:** two more read functions, both thin pass-throughs to Budgeting's own service:
- `service.getRemainingBudgetCard(userId)` → maps `budgeting.service.getBudgetMonthSummary` to `{ totalRemaining: number } | null`.
- `service.getBudgetHealthScoreCard(userId)` → calls `budgeting.service.getBudgetHealthScore(userId, currentMonth)` directly.

These are intentionally not REST endpoints in Phase 1/2 since nothing client-side needs to refetch them independently of a full page load; promote to `/api/dashboard/*` routes only if a later phase needs client-side refresh.

**(Phase 3a) Net Worth Aggregation Update — see its own full section below**, immediately after Recurring Income, for the complete, double-count-safe formula and the new `service.getNetWorth` contract.

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

**(Phase 3a update to `occurrence.ts`):** its date-cadence math (next-due-date-per-schedule) is extracted to `lib/recurrence.ts` and shared with Recurring Income's own `occurrence.ts`; `computeStatus` (Bills-specific wording, incl. "Late") stays in `bills/server/occurrence.ts` unchanged. See Architecture.md's "Reusable utilities added in Phase 3a."

**(Phase 3a update to `linkOccurrenceToTransaction`):** before creating the link, it now also calls `lib/transaction-link-guard.ts`'s `assertTransactionNotAlreadyLinked(userId, transactionId, { excluding: { billOccurrenceId: occurrenceId } })`, so a Transaction already linked to a Recurring Income occurrence is rejected with the same friendly error it already gives for "already linked to a different Bill occurrence." This is an update to an existing Phase 2 file, flagged per this doc's established convention for touching prior-phase files — see Architecture.md's "Cross-feature exclusivity: Bills ↔ Recurring Income" for the full rationale.

**Data model recommendation for the Database Architect:** `BillOccurrence.transactionId` should be a nullable, unique FK to `Transaction`, `onDelete: SetNull`.

**Bills reads via other domains, explicit service calls only:** `searchTransactionsForLinking(userId, { query? })` on `features/transactions/server/service.ts`, now also reused by Recurring Income (see above).

## Calendar v1 — Phase 2

Per `docs/product/calendar-and-notifications.md`. No new data, no mutations — entirely a read view over Bills.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's calendar | Server Component direct call to `bills.service.getCalendarMonth(userId, month)` | `month: "YYYY-MM"` | `{ day: string; occurrences: { billId; billOccurrenceId; billName; amount; status }[] }[]` |

Scoped to bills only in this phase (paydays deferred to Phase 3, per the spec's own scope note). **Still true as of Phase 3a**: no product spec in this phase requests extending Calendar v1 to show Recurring Income's expected occurrences — flagged here only to confirm it remains explicitly out of scope, not silently forgotten. If a future phase wants it, `getCalendarMonth` would need a second data source call into `recurring-income.service`, which is a small, additive change, not a redesign.

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

**Not extended in Phase 3a.** No product spec in this phase requests a Debt/Investment/Recurring-Income-triggered notification type (e.g. "debt paid off," "income not yet received"). Flagged explicitly so this isn't assumed silently: if a future phase wants one, it follows the exact same one-directional read pattern already established here (Notifications reads a small new exported function from the relevant domain; that domain never imports Notifications).

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

**Account-linkage note (binding on this contract's shape, non-binding on the Database Architect's final schema call):** every row below is written assuming the Product Owner's/this Architect's recommended hybrid shape (Option C: standalone `Debt` record, optional nullable-unique link to `Account`). If the Database Architect instead chooses Option A (extend `Account`) or Option B (fully standalone, no link), only the `linkDebtToAccount`/`unlinkDebtFromAccount` rows and `debt.service`'s internal effective-balance helper change — every other row (create/update/archive, payoff projection, strategy comparison) is unaffected. See Architecture.md's "Phase 3a — the Account-linkage handoff."

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List debts | Server Component direct call to `service.getDebts(userId, { includeArchived? })` | — | `DebtWithProjection[]` |
| Get debt detail | Server Component direct call to `service.getDebtById(userId, debtId)` | — | `DebtWithProjection` |
| Create debt | Server Action `createDebt` | `CreateDebtSchema` (name, type: `DebtType`, balance > 0, interestRate ≥ 0 — required, unlike Accounts' optional `interestRate`, per AC1 — minimumPayment > 0) | `ApiResult<Debt>` |
| Update debt | Server Action `updateDebt` | `UpdateDebtSchema` (id + partial: name, balance, interestRate, minimumPayment) — recalculates projections at next read only, never retroactively (AC3) | `ApiResult<Debt>` |
| Archive debt (soft delete) | Server Action `archiveDebt` | `DebtIdSchema` (`{ id: string }`) — idempotent; allowed even with nonzero balance (AC10/Edge Cases) | `ApiResult<Debt>` |
| Unarchive debt | Server Action `unarchiveDebt` | `DebtIdSchema` — idempotent | `ApiResult<Debt>` |
| Link to an existing Account (Credit Card only, if the Database Architect adopts Option C) | Server Action `linkDebtToAccount` | `{ debtId: string; accountId: string }` — server rejects if the Account isn't the current user's, isn't `CREDIT_CARD` type, or is already linked to a different Debt | `ApiResult<Debt>` |
| Unlink from Account | Server Action `unlinkDebtFromAccount` | `{ debtId: string }` — reverts the Debt to manually-maintained balance, seeded from the linked Account's last-known balance at the moment of unlinking (a one-time copy, not a live link from then on) | `ApiResult<Debt>` |
| Compare snowball vs. avalanche | **No server call at all after initial load** — `features/debt/components/strategy-comparison.tsx` calls `features/debt/payoff-math.ts`'s `compareSnowballAndAvalanche(debts, extraPayment)` directly, client-side, on every extra-payment input change (AC6/AC7) | — | `StrategyComparisonResult` (see shape below), recomputed in-browser |
| List (client-side refetch) | `GET /api/debts?includeArchived=` — mirrors `GET /api/accounts` | — | `ApiResult<DebtWithProjection[]>` |

`DebtWithProjection` — every derived field computed at read time in `service.ts` (via `payoff-math.ts`), never stored, same rule as `GoalWithProgress`/`BudgetHealthScore`/Bill occurrence status:
```ts
{
  ...Debt fields,                    // id, name, type, minimumPayment, interestRate, linkedAccountId (nullable)
  effectiveBalance: number           // Debt.balance, OR the linked Account's live balance if linkedAccountId is set —
                                      //   read via the join, never copied (same precedent as BillOccurrence)
  payoffDate: string | null          // "YYYY-MM", assuming minimum-payment-only (AC4); null if isNegativeAmortization
  totalInterestRemaining: number | null   // null if isNegativeAmortization
  isNegativeAmortization: boolean    // minimum payment doesn't cover accruing interest (Edge Cases)
  isPaidOff: boolean                 // effectiveBalance <= 0 (AC9) — auto-detected, never a manually-set flag
  isEstimate: boolean                // true only for type === "CREDIT_CARD" (AC5's revolving-credit caveat)
}
```

`StrategyComparisonResult` shape (pure output of `payoff-math.ts`, never persisted):
```ts
{
  extraPayment: number
  snowball: { monthsToDebtFree: number; totalInterestPaid: number; payoffOrder: string[] /* debt IDs */ }
  avalanche: { monthsToDebtFree: number; totalInterestPaid: number; payoffOrder: string[] }
  isIdentical: boolean   // true when extraPayment === 0 or only one active debt (Edge Cases) — drives the
                         //   "add an extra payment amount to see how each strategy differs" messaging (AC/Edge Cases)
}
```

**`payoff-math.ts` correctness requirements (binding on whoever implements it, verified by Integration Test Engineer against fixture data per the spec's Definition of Done):**
- 0% interest rate: balance reduces by minimum payment alone, no division by zero (Edge Cases).
- Negative amortization (minimum payment < accruing monthly interest): `payoffDate`/`totalInterestRemaining` return `null` with `isNegativeAmortization: true`, never an infinite loop or a nonsensical far-future date (Edge Cases).
- `$0` extra payment: `snowball` and `avalanche` produce numerically identical results, and `isIdentical: true` (Edge Cases) — the UI must not imply one "wins" when they're mathematically forced to tie.
- A debt paid off mid-projection correctly rolls its former minimum payment onto the next debt in that strategy's order for the remainder of the projection (Edge Cases).

## Investments (`features/investments`) — Phase 3a

Per `docs/product/investments.md`. Containers are existing Investment/Retirement/Crypto `Account` rows (this Architect's recommendation, matching the Product Owner's); `Holding` is a new child model.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List containers | Server Component direct call to `service.getContainers(userId)` | — | `ContainerSummary[]` (Account fields + `holdingCount`, `hasHoldings: boolean` — drives the "balance now calculated from holdings" messaging, AC1) |
| Get container detail (holdings list) | Server Component direct call to `service.getHoldingsForContainer(userId, accountId, { includeClosed? })` | — | `Holding[]` |
| Get holding detail | Server Component direct call to `service.getHoldingById(userId, holdingId)` | — | `Holding & { valueHistory: HoldingValueHistoryEntry[]; dividends: DividendEntry[] }` |
| Create holding (incl. inline container creation) | Server Action `createHolding` | `CreateHoldingSchema` (accountId **or** `newContainer: { name; type: "INVESTMENT" \| "RETIREMENT" \| "CRYPTO" }` — exactly one of the two, per AC1's "offers to create the appropriate container Account inline"; name, assetType, sector? (required unless assetType is Crypto/Bond/Other, AC2), costBasis ≥ 0, currentValue ≥ 0) | `ApiResult<Holding>` — if `newContainer` was supplied, internally calls `accounts.actions.createAccount` first, same as if the user had created the Account separately |
| Update holding | Server Action `updateHolding` | `UpdateHoldingSchema` (id + partial: name, assetType, sector, costBasis, currentValue) — every `currentValue` change (including "unchanged" re-confirmations, per Edge Cases) appends a `HoldingValueHistoryEntry`; also triggers the derived-balance write-back onto the container Account (see Architecture.md) | `ApiResult<Holding>` |
| Close holding | Server Action `closeHolding` | `HoldingIdSchema` (`{ id: string }`) — idempotent; drops out of active allocation/overview but retains full history (AC5) | `ApiResult<Holding>` |
| Log dividend | Server Action `logDividend` | `LogDividendSchema { holdingId: string; amount: number (> 0); date: Date }` — allowed even on a Closed holding (Edge Cases) | `ApiResult<DividendEntry>` |
| Get portfolio overview | Server Component direct call to `service.getPortfolioOverview(userId)` | — | `PortfolioOverview` (see shape below) |
| Get allocation | Server Component direct call to `service.getAllocation(userId, { by: "assetType" \| "sector" })` | — | `{ label: string; value: number; percent: number }[]` — active holdings only (AC9) |
| Get growth history | Server Component direct call to `service.getGrowthHistory(userId, { holdingId? })` (omit `holdingId` for portfolio-level aggregate) | — | `{ date: string; value: number }[]` |
| List (client-side refetch) | `GET /api/investments?includeClosed=` | — | `ApiResult<ContainerSummary[]>` |

`Holding` gain/loss (AC6) is computed at read time, never stored: `gainLossAmount = currentValue - costBasis`, `gainLossPercent = costBasis === 0 ? null : (gainLossAmount / costBasis) * 100` (guards the same divide-by-zero class of edge case `payoff-math.ts` guards for 0% interest).

`PortfolioOverview` shape:
```ts
{
  totalCurrentValue: number         // active holdings only, across all containers
  totalGainLoss: number
  totalDividendIncome: number
  byContainer: { accountId: string; accountName: string; currentValue: number; gainLoss: number; dividendIncome: number }[]
}
```

**Sector allocation's "Other/Not Applicable" bucket (AC9/Edge Cases):** holdings with `sector: null` (Crypto/Bond/Other asset types, or a Stock/ETF/Mutual Fund the user genuinely didn't set — validation should prevent that combination per AC2, but the read-side aggregation defensively buckets any `null` regardless) are grouped into a single `"Other / Not Applicable"` label rather than excluded from the total, so allocation percentages always sum to 100%.

**Growth chart single-data-point state (AC7):** `getGrowthHistory` returning exactly one entry is a valid, expected response — `growth-chart.tsx` (Frontend Lead/UI territory) renders an explicit "not enough history yet" state for a one-entry array rather than attempting to draw a line chart with a single point.

## Recurring Income (`features/recurring-income`) — Phase 3a

Per `docs/product/recurring-income.md`. Mirrors Bills' proven lazy on-read occurrence generation exactly, with its own status vocabulary and an Irregular/One-off cadence Bills has no equivalent of.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List income streams | Server Component direct call to `service.getIncomeStreams(userId, { includeArchived? })` | — | `IncomeStreamSummary[]` (name, type, schedule, expectedAmount?, nextExpectedDate?) |
| Get stream detail + receipt history | Server Component direct call to `service.getStreamById(userId, streamId)` | — | `IncomeStream & { occurrences: IncomeOccurrence[] }` (or `{ events: IrregularIncomeEvent[] }` for Irregular streams) |
| Create income stream | Server Action `createIncomeStream` | `CreateIncomeStreamSchema` (name, type: `IncomeType`, schedule: `IncomeSchedule`, expectedAmount — required unless schedule is `IRREGULAR`, per AC2) | `ApiResult<IncomeStream>` |
| Update income stream | Server Action `updateIncomeStream` | `UpdateIncomeStreamSchema` (id + partial: name, type, schedule, expectedAmount) — applies to future occurrences only (AC5) | `ApiResult<IncomeStream>` |
| Archive income stream | Server Action `archiveIncomeStream` | `IncomeStreamIdSchema` — idempotent; stops future occurrence generation | `ApiResult<IncomeStream>` |
| Unarchive income stream | Server Action `unarchiveIncomeStream` | `IncomeStreamIdSchema` — idempotent; resumes generation forward from "today," no backfill of the archived gap (mirrors Bills' unarchive exactly) | `ApiResult<IncomeStream>` |
| Mark occurrence received (manual) | Server Action `markOccurrenceReceived` | `{ occurrenceId: string; receivedAmount: number; receivedDate: Date }` | `ApiResult<IncomeOccurrence>` |
| Mark occurrence received (linked) | Server Action `linkOccurrenceToTransaction` | `{ occurrenceId: string; transactionId: string }` — calls `lib/transaction-link-guard.ts` before linking (see Architecture.md); rejects with a friendly error if the Transaction is already linked to a Bill occurrence or a different Income occurrence | `ApiResult<IncomeOccurrence>` |
| Unmark occurrence | Server Action `unmarkOccurrenceReceived` | `{ occurrenceId: string }` — clears manual fields and any link; reverts to computed status | `ApiResult<IncomeOccurrence>` |
| Log an Irregular/One-off event | Server Action `logIrregularIncomeEvent` | `LogIrregularIncomeEventSchema { streamId: string; amount: number (> 0); date: Date; transactionId?: string }` — the optional link goes through the same `transaction-link-guard.ts` check (AC11) | `ApiResult<IrregularIncomeEvent>` |
| Expected upcoming income total | Server Component direct call to `service.getExpectedUpcomingIncome(userId, { period })` | `period`, e.g. `"this-month"` | `{ total: number; byStream: { streamId: string; streamName: string; nextOccurrenceAmount: number }[] }` — clearly a distinct surface from Dashboard's Monthly Income (AC10); no shared code path with `dashboard.service.getMonthlySummary` |
| List (client-side refetch) | `GET /api/income?includeArchived=` — mirrors `GET /api/bills` | — | `ApiResult<IncomeStreamSummary[]>` |

`IncomeOccurrence.status` (`IncomeOccurrenceStatus`) is never a stored column — always computed at read time by `features/recurring-income/server/occurrence.ts`'s `computeStatus(expectedDate, receivedState, today)`, mirroring Bills' `computeStatus` exactly but with income's own vocabulary (`Upcoming | Expected Today | Not Yet Received | Received` — deliberately not "Late," per AC7's resolved product decision).

**Occurrence generation:** identical mechanism to Bills — `ensureOccurrencesGenerated(stream, throughDate)` runs at the top of every read needing occurrence data, generating any missing rows using `lib/recurrence.ts`'s shared cadence math (see Architecture.md). **Irregular/One-off streams never call this** — they have no generated occurrences at all, only user-logged `IrregularIncomeEvent` rows (AC11), which is why `getStreamById`'s response shape branches on schedule type above rather than always returning `occurrences`.

**Linked amount is read live, never copied** — same precedent as `BillOccurrence`: a linked `IncomeOccurrence`'s effective received amount/date are read via the join to `Transaction` at render time (AC8's "if that Transaction is later edited, the occurrence updates to match").

**Data model recommendation for the Database Architect:** `IncomeOccurrence.transactionId` (and `IrregularIncomeEvent.transactionId`) should each be a nullable, unique FK to `Transaction`, `onDelete: SetNull` — same shape as `BillOccurrence.transactionId`. The cross-table "at most one of any kind" invariant these two unique constraints don't cover by themselves is `lib/transaction-link-guard.ts`'s job at the application layer — see Architecture.md's "Cross-feature exclusivity" section for the full reasoning and the flagged race-condition consideration.

---

## Net Worth Aggregation Update (`features/dashboard`) — Phase 3a

Per `roadmap.md`'s Phase 3a milestone 5 and both `debt-tracker.md`'s and `investments.md`'s Dependencies sections. This is an update to the existing `service.getNetWorth(userId)` contract (Phase 1), not a new endpoint.

**The double-counting risk this contract exists to prevent (this Architect's primary flag for the Database Architect and whoever implements this milestone):** per `accounts.md` AC6, a Credit Card `Account`'s balance is already a positive "amount owed" figure that Phase 1's Net Worth formula already subtracts. If a `Debt` record is linked to that same Credit Card Account (the hybrid Option C shape), that Debt's `effectiveBalance` is, by design, the exact same number, read live (see the Debt Tracker section above). Naively adding a second term — "subtract the sum of every active debt's balance" — to the existing formula would **subtract that one real-world liability twice**: once via the base Account-sum (already negative/subtracted for Credit Card type), and again via the new debt-liability term. This is a genuine, concrete correctness bug waiting to happen, not a hypothetical one, and it is exactly the class of risk Risk #9 and this feature's own success metric ("zero reported incidents of incorrect... math") are guarding against.

**Required formula (binding on the implementation, regardless of which Account-linkage option the Database Architect ultimately chooses — the exclusion principle generalizes):**
```
totalAccountBalance   = sum of non-archived Account.balance, sign-adjusted per accounts.md AC6
                         (Credit Card subtracted; unchanged from Phase 1. Investment/Retirement/Crypto
                         accounts with active holdings already carry their derived, holdings-sum balance
                         here via the write-back described in Architecture.md — no separate addition needed.)

unlinkedDebtLiability = sum of active (non-archived, non-Paid-Off) Debt.effectiveBalance
                         WHERE the Debt is NOT linked to an Account
                         (i.e., every Personal Loan/Auto Loan/Student Loan/Mortgage — which have no
                         Account counterpart at all — plus any Credit Card debt the user chose to
                         track manually rather than link)

netWorth = totalAccountBalance - unlinkedDebtLiability
```

`debt.service` exports the second term directly — `getTotalActiveDebtBalanceForNetWorth(userId): Promise<number>` — so Dashboard never has to know about linkage internals; it just calls this one function and subtracts the result. This keeps Dashboard a pure downstream consumer (unchanged architectural role from Phase 1/2) and keeps the exclusion logic owned entirely by the one module (`debt`) that actually knows which debts are linked.

**Updated contract:**
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[]; totalUnlinkedDebtLiability: number }` — the new field is additive and surfaced (not hidden inside `total`) specifically so the Dashboard UI can, if the Frontend Lead/Product Owner want it later, show "$X in accounts, −$Y in tracked debt" as two line items instead of one opaque number; nothing requires that UI split this phase, but the data shape supports it without another backend change.

**If the Database Architect chooses Option A or B instead of the recommended hybrid (Option C):** this exclusion term simplifies (Option B: every Debt is unlinked by definition, so the whole formula is just "subtract every active Debt's balance," no exclusion needed at all; Option A: there is no separate `Debt` model to subtract — the Credit Card's debt-specific fields live on `Account` itself, so Phase 1's existing Account-sum formula requires no change beyond whatever new loan/mortgage `Account.type` values are added to the enum). Flagged here so the Backend Engineer implementing this milestone knows the formula's complexity is a direct function of the Database Architect's decision, not an independent design choice of this Architect's.

**Investments requires no separate addition to this formula**, only the derived-balance write-back described in Architecture.md — Investment/Retirement/Crypto `Account.balance` already reflects the holdings sum by the time Net Worth reads it, since Investments keeps it in sync rather than Net Worth computing it fresh. This is a direct, deliberate simplification this Architect's design achieves versus a naive "call `investments.service` separately and add its total" approach, which would have needed its own exclusion logic (don't double-count an Account's stored balance *and* its holdings sum) mirroring the Debt case above. One exclusion problem in this phase, not two.

## Net Worth Snapshot job (`features/dashboard/server/snapshot.ts`) — Phase 3a

Per `roadmap.md`'s Phase 3a milestone 6 and Risk #10 ("begin periodically recording net worth... backend only, no UI... does not wait for 3b's chart"). This is the first scheduled/cron-triggered surface in the codebase; no comparable Phase 1/2 precedent exists, so its design is spelled out in full here.

**Why not lazy, on-read materialization (the pattern Bills/Notifications both use)?** Both prior lazy-generation patterns work because the thing being generated is *read* immediately after — a bill's occurrence is generated because the bill list needs to display it right now. A net worth snapshot has no such natural read trigger: nothing in this phase reads historical net worth data (the chart that will is Phase 3b's, explicitly deferred, per Risk #10's own reasoning — "if snapshotting only starts when the chart is built, the chart launches with an empty history"). Snapshots must be captured on a *time* cadence (e.g. daily), independent of any user visiting any particular page, which is a genuinely different requirement from every other "generate on read" mechanism in this app.

**Recommended mechanism: an authenticated Route Handler, triggered by an external scheduler.**
| Action | Mechanism | Input | Output |
|---|---|---|---|
| Capture a snapshot for every user | `POST /api/cron/net-worth-snapshot` — authenticated via a shared secret (`Authorization: Bearer <CRON_SECRET>` header, compared against a server-only env var), **not** a user session — there is no calling user, it acts on all users | none (no request body) | `{ processed: number }`, plain JSON, HTTP 200 — **not** `ApiResult<T>`, per naming-standards.md's documented exception (system-to-system call, no client to interpret an `ApiResult` shape) |

Internally, this route calls `dashboard.service.captureAllUsersNetWorthSnapshots()`, which loops every user and calls `dashboard.service.captureNetWorthSnapshot(userId)` — itself just `getNetWorth(userId)` plus its Debt/Investment component breakdown, persisted as one new row. No new calculation logic is introduced by the snapshot job; it purely persists a timestamped copy of numbers `getNetWorth` already computes.

**What this Architect is explicitly NOT deciding:**
- **Which scheduler actually calls this route, and how often.** Options include Vercel Cron (`vercel.json`'s `crons` array, if Vercel is the confirmed Phase 0 deployment target), a GitHub Actions scheduled workflow hitting the route over HTTPS, or any other external trigger. This depends on the deployment target decided in Phase 0 — **required artifact from DevOps/Backend Engineer before this job can go live**: confirmation of the deployment platform's scheduling mechanism, and the actual cadence (daily is the natural default given "net worth history," but is a product/ops call, not an architecture one).
- **Where `CRON_SECRET` is generated/stored** (`.env.example` + the hosting platform's secret store) — Backend/DevOps territory, same category of exclusion already established for UploadThing's env vars in Phase 2.

**Data model recommendation for the Database Architect (flagged, not decided here):** a new model, e.g. `NetWorthSnapshot { id, userId (FK), capturedAt, totalNetWorth, totalAccountBalance, totalUnlinkedDebtLiability }`, indexed on `(userId, capturedAt)` for the Phase 3b chart's eventual range queries. Not currently listed anywhere in `docs/database/`, same category of gap as Phase 2's `Notification` model was when it was first flagged.

**Performance note for the Performance Engineer's Phase 3a review:** `captureAllUsersNetWorthSnapshots()` runs `getNetWorth` once per user in the whole system on every invocation — at this app's current scale this is fine, but if the user base grows large enough for a single cron invocation to run long, the fix is batching/pagination within that function (process N users per invocation, track a cursor), not a redesign of the mechanism above.
