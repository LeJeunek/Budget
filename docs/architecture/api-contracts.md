# FinanceOS — API Contracts (Phase 0 + Phase 1 + Phase 2)

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

**Phase 2 update (see Receipts section below):** `deleteTransaction`'s behavior changes — it now also purges any attached receipt files from storage before removing the row. This is documented fully in the Receipts section rather than duplicated here; the row above is otherwise unchanged.

## Dashboard (`features/dashboard`)
Read-only aggregation, Server Component direct calls (no client mutation, so no Server Actions/routes needed):
- `service.getNetWorth(userId)` → `{ total: number; byAccount: { accountId: string; balance: number }[] }`
- `service.getMonthlySummary(userId, month)` → `{ income: number; expenses: number; cashFlow: number; savingsRate: number }`
- `service.getSpendingByCategory(userId, month)` → `{ categoryId: string; categoryName: string; amount: number }[]`
- `service.getMonthlyTrends(userId, monthsBack: number)` → `{ month: string; income: number; expenses: number }[]`

**Phase 2 update:** two more read functions are added, both thin pass-throughs to Budgeting's own service (Dashboard does not recompute budget aggregation itself — see the Budgeting section's "Dashboard integration" note):
- `service.getRemainingBudgetCard(userId)` → calls `budgeting.service.getBudgetMonthSummary(userId, currentMonth)` and maps it to the stat card's `{ totalRemaining: number } | null` shape (`null` = show the "no budget set" placeholder, per Budgeting AC11).
- `service.getBudgetHealthScoreCard(userId)` → calls `budgeting.service.getBudgetHealthScore(userId, currentMonth)` directly (already in the exact shape the card needs, per Budgeting AC12).

These are intentionally not REST endpoints in Phase 1/2 since nothing client-side needs to refetch them independently of a full page load; promote to `/api/dashboard/*` routes only if a later phase needs client-side refresh (e.g. after a transaction is added without a full page reload).

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

**Phase 2 update (Categories deletion cascades into Budgeting):** per `docs/product/budgeting.md`'s "Category deleted mid-month" edge case, `deleteCategory`'s implementation must also remove that category's *current and future month* `BudgetCategory` allocation rows (past months' historical allocations are preserved as read-only history). Since Categories must not reach into Budgeting's tables directly (module boundary rule — no direct Prisma reach-through across domains), `deleteCategory`'s Server Action calls a new exported function `budgeting.service.removeCategoryFromCurrentAndFutureBudgets(userId, categoryId)` as an explicit cross-domain service call, same pattern as every other cross-domain read/write in this document.

---

## Budgeting (`features/budgeting`) — Phase 2

Per `docs/product/budgeting.md`. Read paths are Server Component direct calls; the only mutation is setting a category's allocation for a month.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's budget | Server Component direct call to `service.getBudgetMonth(userId, month)` | `month: "YYYY-MM"` | `BudgetMonthView` — see shape below |
| Set/update a category's allocation | Server Action `setCategoryAllocation` | `SetAllocationSchema { month: "YYYY-MM"; categoryId: string; amount: number }` (amount ≥ 0; every call creates-or-updates a row, which is how "set to zero" becomes distinguishable from "unset" — see Data model note) | `ApiResult<BudgetCategoryLine>` |
| Get Budget Health Score | Server Component direct call to `service.getBudgetHealthScore(userId, month)` (also called by Dashboard, see above) | `month` | `{ score: number; label: "Good" \| "Fair" \| "Needs attention" } \| null` (`null` = zero allocations set this month, i.e. the undefined state in AC12) |
| Get month summary (for Dashboard's Remaining Budget card) | Server Component direct call to `service.getBudgetMonthSummary(userId, month)` | `month` | `{ totalAllocated: number; totalSpent: number; totalRemaining: number } \| null` (`null` = zero allocations set, AC11's placeholder condition) |

`BudgetMonthView` shape:
```ts
{
  month: string                 // "YYYY-MM"
  isEditable: boolean           // false for past months (AC3)
  hasAnyBudgetData: boolean     // false = "no budget was set this month" empty state (past-month edge case)
  categories: {
    categoryId: string
    categoryName: string
    isSystem: boolean
    allocated: number | null    // null = unset (AC2) — never conflated with 0
    spent: number                // sum of expense transactions/split line items for this category+month
    remaining: number | null     // null when allocated is null (nothing to measure against, AC9)
    percentUsed: number | null   // null when allocated is null
    isOverBudget: boolean        // false when allocated is null
  }[]
  totals: { totalAllocated: number; totalSpent: number; totalRemaining: number } // excludes unbudgeted categories, per AC10
  uncategorizedSpent: number     // informational only, excluded from totals, per Edge Cases
}
```

**Month materialization / carry-forward (AC3, AC4) — an explicit read-time rule, not a background job:**
`service.getBudgetMonth(userId, month)`:
- If `month` is the current month or a future month **and no `BudgetMonth` row exists yet**, it is lazily created at read time by copying the immediately preceding month's allocations (or left fully unallocated if there is no preceding month, e.g. a brand-new user) — this is the only place carry-forward logic lives.
- If `month` is a **past** month with no existing row, nothing is created; the response has `hasAnyBudgetData: false` and `isEditable: false` — this is a pure, non-mutating read, satisfying the "no budget was set this month" edge case exactly (a past month must never be silently materialized just because someone viewed it).

**Data model recommendation for the Database Architect (not this Architect's file to edit, flagged here so the read/unset-vs-zero contract above is actually satisfiable):** "unset" vs "allocated $0" should be modeled as **row presence**, not a nullable `amount` column — i.e., no `BudgetCategory` row for a given month+category means unset; a row with `amount: 0` means deliberately zero. This avoids overloading a single nullable column with two different meanings (SQL `NULL` vs. business "unset") and keeps `setCategoryAllocation`'s upsert semantics simple (`amount ≥ 0` is the only validation needed; there is no separate "clear allocation" action in the spec).

**Duplication note (Spent calculation):** "Spent" for a category+month is "the sum of that category's expense transactions for the month, including split line items" — the exact same aggregation Dashboard's Phase 1 `service.getSpendingByCategory` already computes. To avoid two independently-maintained copies of this logic drifting apart (a correctness risk explicitly called out in both the Dashboard and Budgeting specs' Definition of Done), this aggregation is extracted into `features/transactions/server/aggregations.ts`, exporting `getSpendingByCategoryForMonth(userId, month)` and `getUncategorizedSpendingForMonth(userId, month)`. Both `features/dashboard/server/service.ts` and `features/budgeting/server/service.ts` call these instead of each re-implementing the query — consistent with Transactions being the stated owner of "Spent is computed entirely from transaction data" per the Budgeting spec's own Dependencies section.

## Savings Goals (`features/goals`) — Phase 2

Per `docs/product/savings-goals.md`. Follows the exact archive/unarchive CRUD shape established by Accounts.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List goals | Server Component direct call to `service.getGoals(userId, { includeArchived? })` | — | `GoalWithProgress[]` |
| Get goal detail | Server Component direct call to `service.getGoalById(userId, goalId)` | — | `GoalWithProgress & { contributions: GoalContribution[] }` |
| Create goal | Server Action `createGoal` | `CreateGoalSchema` (name, targetAmount > 0, targetDate?, plannedMonthlyContribution?) | `ApiResult<Goal>` |
| Update goal | Server Action `updateGoal` | `UpdateGoalSchema` (id + partial: name, targetAmount, targetDate, plannedMonthlyContribution) — never touches progress | `ApiResult<Goal>` |
| Archive goal | Server Action `archiveGoal` | `GoalIdSchema` (`{ id: string }`) — idempotent | `ApiResult<Goal>` |
| Unarchive goal | Server Action `unarchiveGoal` | `GoalIdSchema` — idempotent | `ApiResult<Goal>` |
| Add contribution | Server Action `addContribution` | `AddContributionSchema { goalId: string; amount: number (> 0); date: Date }` | `ApiResult<GoalContribution>` |
| Delete contribution | Server Action `deleteContribution` | `{ id: string }` | `ApiResult<{ id: string }>` |
| List (client-side refetch) | `GET /api/goals?includeArchived=` — thin wrapper, used only by `features/goals/hooks/use-goals.ts`, mirrors `GET /api/accounts` exactly | — | `ApiResult<GoalWithProgress[]>` |

`GoalWithProgress` — every derived field below is **computed at read time in `service.ts`, never stored**, for the same reason Budget Health Score is computed rather than persisted (AC's "editing a target amount can flip Completed↔Active" and "deleting a contribution recalculates progress" both fall out for free with no write-side sync logic if nothing is cached):
```ts
{
  ...Goal fields,
  currentProgress: number       // sum of this goal's GoalContribution.amount
  remainingAmount: number       // max(targetAmount - currentProgress, 0)
  overageAmount: number         // max(currentProgress - targetAmount, 0), per the overshoot edge case
  percentComplete: number       // currentProgress / targetAmount * 100, uncapped display-side (overshoot shown, not clamped)
  isCompleted: boolean          // currentProgress >= targetAmount
  isTargetDatePassed: boolean   // targetDate < today && !isCompleted
  estimatedCompletion:
    | { month: string }                         // AC7 case 1 or 2 (planned or average-rate estimate)
    | { status: "not_enough_data" }              // AC7 case 3
}
```

No functional dependency on Accounts or Transactions (confirmed resolved, CTO 2026-07-19) — `features/goals/server/` never imports from `features/accounts/` or `features/transactions/`, which also means Goals cannot introduce a circular dependency with any other Phase 2 module.

## Bills (`features/bills`) — Phase 2

Per `docs/product/bills.md`. Includes the optional occurrence-to-Transaction link (AC7) and backs Calendar v1 (see its own section below).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| List bills | Server Component direct call to `service.getBills(userId, { includeArchived? })` | — | `BillSummary[]` (name, expectedAmount, nextDueDate, nextStatus, schedule, categoryId) |
| Get bill detail + payment history | Server Component direct call to `service.getBillById(userId, billId)` | — | `Bill & { occurrences: BillOccurrence[] }` |
| Create bill | Server Action `createBill` | `CreateBillSchema` (name, expectedAmount > 0, dueDate, schedule: weekly\|biweekly\|monthly\|quarterly\|annually, categoryId?) | `ApiResult<Bill>` |
| Update bill | Server Action `updateBill` | `UpdateBillSchema` (id + partial) — amount/schedule changes apply to not-yet-generated occurrences only (AC4) | `ApiResult<Bill>` |
| Archive bill | Server Action `archiveBill` | `BillIdSchema` — idempotent; stops future occurrence generation | `ApiResult<Bill>` |
| Unarchive bill | Server Action `unarchiveBill` | `BillIdSchema` — idempotent; resumes generation forward from "today," does not backfill the archived gap | `ApiResult<Bill>` |
| Mark occurrence paid (manual) | Server Action `markOccurrencePaid` | `{ occurrenceId: string; paidAmount: number; paidDate: Date }` | `ApiResult<BillOccurrence>` |
| Mark occurrence paid (linked) | Server Action `linkOccurrenceToTransaction` | `{ occurrenceId: string; transactionId: string }` — rejects with a friendly error (not a raw constraint exception) if the Transaction is already linked to a different occurrence, or doesn't belong to the current user | `ApiResult<BillOccurrence>` |
| Unmark occurrence | Server Action `unmarkOccurrencePaid` | `{ occurrenceId: string }` — clears both the manual paid fields and any link; reverts to computed status | `ApiResult<BillOccurrence>` |
| Upcoming list | Server Component direct call to `service.getUpcomingOccurrences(userId)` | — | `{ billId; billName; occurrenceId; dueDate; expectedAmount; status }[]`, one entry per active bill (its next unpaid occurrence only), sorted by `dueDate` |
| List (client-side refetch) | `GET /api/bills?includeArchived=` — mirrors `GET /api/accounts` | — | `ApiResult<BillSummary[]>` |

**Recurring-occurrence generation strategy — recommendation: lazy, on-read generation with persisted rows and a rolling horizon. Rejected alternative: eager generation of "all future occurrences" at create/edit time.**

Justification:
1. **Unbounded eager generation is a real problem, not a hypothetical one.** A weekly bill has no natural end date; generating "all future occurrences" at create time means generating forever, which is impossible, or picking an arbitrary cutoff that still produces hundreds of rows per bill up front for no read that needs them yet.
2. **There is no background job infrastructure in this app** (confirmed absent — same constraint the task brief calls out for Notifications), so nothing can run on a schedule to keep "the next N occurrences" topped up over time even if a bounded window were chosen at create time.
3. **Every read that needs occurrence data — bill list's "next due date," the upcoming list, the calendar, a bill's detail/history — already has to query the database anyway**, so piggybacking generation onto that same read is not extra infrastructure, just an extra step inside an existing query path.

Mechanism: `service.ts` calls an internal (not exported) `ensureOccurrencesGenerated(bill, throughDate)` at the top of every read function that needs occurrence data. It generates any `BillOccurrence` rows missing between the bill's latest already-generated occurrence and `throughDate` (default `throughDate = max(today, requested-range-end)`), using `occurrence.ts`'s pure schedule math. This single mechanism also correctly handles the "bill dormant for months" edge case for free: the next time *any* read happens, generation fills the entire gap up to today, and every occurrence in that gap correctly computes as Late (never silently skipped), with no separate backfill code path required.

Occurrence rows must be persisted (not computed ephemerally on every read with no DB row) because AC7/AC8 require **per-occurrence mutable state** — manual paid amount/date, an optional linked Transaction, un-mark — that has no other place to live.

**Status is never a stored column — always computed.** `occurrence.ts` exports a pure `computeStatus(dueDate, paidState, today)` function; `BillOccurrence`'s "status" is derived at every read, not persisted. Storing it would create exactly the kind of stored/derived drift bug this app has otherwise avoided everywhere else in Phase 2 (Budget Health Score, Goal progress/completion) — an "Upcoming" row would silently become wrong the instant its due date passes if nothing else ever touched that row again.

**Linked-Transaction paid amount is also never copied/duplicated onto `BillOccurrence`.** When an occurrence is linked, its paid amount/date are read via a join to the linked `Transaction` at read time, not stored redundantly — this is what makes AC7's "a linked occurrence's paid amount always reflects its linked Transaction's amount, live" true with zero write-side synchronization code (no event/webhook needed when a Transaction is edited). `paidAmount`/`paidDate` columns on `BillOccurrence` are used only for the manual (non-linked) path.

**Data model recommendation for the Database Architect (flagged, not decided here):** `BillOccurrence.transactionId` should be a nullable, **unique** FK to `Transaction`, with `onDelete: SetNull` — this makes "a Transaction can back at most one occurrence" (Bills spec edge case) a database-enforced invariant rather than only an application check, and makes "the linked Transaction is later deleted → the occurrence reverts to its computed status" (Bills spec edge case) fall out automatically from the FK behavior with no Bills-side event handling required, the same `onDelete: SetNull` pattern already established for `Transaction.categoryId` in Phase 1.

**Bills reads via other domains, explicit service calls only (module boundary rule):** the transaction-link picker in `mark-paid-dialog.tsx` needs to search the user's transactions — Bills' server code calls a small new exported function in `features/transactions/server/service.ts` (e.g. `searchTransactionsForLinking(userId, { query? })`) rather than querying the `Transaction` table directly from `features/bills/server/`.

## Calendar v1 — Phase 2

Per `docs/product/calendar-and-notifications.md`. No new data, no mutations — entirely a read view over Bills (see folder-tree.md's rationale for why this lives inside `features/bills/` rather than its own module).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get a month's calendar | Server Component direct call to `bills.service.getCalendarMonth(userId, month)` | `month: "YYYY-MM"` | `{ day: string /* "YYYY-MM-DD" */; occurrences: { billId; billOccurrenceId; billName; amount; status }[] }[]` |

Scoped to bills only in this phase (paydays deferred to Phase 3, per the spec's own scope note) — `getCalendarMonth` has no payday-related parameters to design around yet, and adding any would be speculative ahead of Phase 3's Recurring Income model existing.

---

## Notifications v1 (`features/notifications`) — Phase 2

Per `docs/product/calendar-and-notifications.md`. **Recommendation: lazy, on-read materialization into a dedicated `Notification` table, triggered by polling the notification inbox — not a background job, and not a fully-ephemeral "recompute every render with nothing stored" approach.** This is a deliberate refinement of the "computed at read time" default suggested in the task brief — read on for why a pure-ephemeral design does not actually satisfy this spec's acceptance criteria.

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Get inbox (list + unread count) | `GET /api/notifications` — calls `service.ensureNotifications(userId)` (materializes any newly-detected triggers as rows) and then `service.getNotifications(userId)` | — | `ApiResult<{ items: Notification[]; unreadCount: number }>` |
| Mark one read | Server Action `markNotificationRead` | `{ id: string }` | `ApiResult<Notification>` |
| Dismiss one | Server Action `dismissNotification` | `{ id: string }` — sets `dismissedAt` on the `Notification` row only; per AC4, this never writes to Budgeting or Bills data | `ApiResult<Notification>` |
| Mark all read | Server Action `markAllNotificationsRead` | — | `ApiResult<{ count: number }>` |

**Why not fully ephemeral (compute-only, no storage)?** AC4 requires dismissing a notification to be durable — reappearing on the next page load would be indistinguishable from "dismiss didn't work" from the user's perspective, and the underlying trigger condition (e.g. still over budget) does *not* go away just because the user dismissed the notification about it, so a purely-recomputed-every-render list would resurrect it immediately. Separately, the "one active over-budget notification per category per month" dedup requirement (Edge Cases) needs a stable identity to dedupe against across reads — there is nothing to dedupe against if nothing is ever stored. A small persisted table is the minimum structure that satisfies both requirements; it is not being added for its own sake.

**Why not a background job?** No such infrastructure exists yet in this app (confirmed), and none is needed: `ensureNotifications(userId)` is a cheap, per-user, on-demand check (a handful of small queries against the current user's own Budgeting/Bills data) that only needs to run when that user's notification surface is actually being viewed. It is triggered opportunistically by `GET /api/notifications`, which `features/notifications/hooks/use-notifications.ts` polls (TanStack Query, short interval + refetch-on-window-focus) — this is the one Phase 2 module that genuinely needs a client-side query hook, for the same "ambient, needs to update without a full page navigation" reason Transactions' table needed one in Phase 1 (ordinary server-rendered data is otherwise preferred, per Architecture.md).

`service.ensureNotifications(userId)` algorithm (read-only into Budgeting/Bills, write-only into `Notification`):
1. Calls `budgeting.service.getOverBudgetCategories(userId, currentMonth)` (small new exported read function) → for each result, `upsert`s a `Notification { type: "BUDGET_OVER", budgetCategoryId, userId }` row — a unique constraint on `(budgetCategoryId)` where `type = "BUDGET_OVER"` makes the one-per-category-per-month dedup a database guarantee, not just application logic.
2. Calls `bills.service.getDueSoonAndLateOccurrences(userId)` (small new exported read function; the "few days out" advance window in AC2 is a Backend Engineer implementation default, not an architectural decision) → `upsert`s `Notification { type: "BILL_DUE_SOON" | "BILL_LATE", billOccurrenceId, userId }` rows, unique on `(billOccurrenceId, type)` (an occurrence can have at most one due-soon *and* at most one late notification, matching AC2's "and again if it becomes Late").
3. Occurrences/categories that are no longer over-budget or that get paid simply stop being returned by the two read functions above, so no new rows are created for them — already-fired rows are left untouched (never retroactively deleted, per Edge Cases), matching "no further notifications fire for that already-resolved occurrence."

**Data model recommendation for the Database Architect (flagged — this is a genuine gap, see the report below):** a `Notification` model is required and is **not currently listed** in `docs/database/migration-strategy.md`'s Phase 2 section (which lists `Budget`, `BudgetCategory`, `Goal`, `Bill` only). Suggested shape: `id, userId (FK), type (enum: BUDGET_OVER | BILL_DUE_SOON | BILL_LATE), budgetCategoryId (FK, nullable), billOccurrenceId (FK, nullable), createdAt, readAt (nullable), dismissedAt (nullable)`, with the two unique constraints described in steps 1–2 above. Ownership is entirely within `features/notifications/` — Budgeting and Bills are never written to by this module, only read from via their own service functions (see the two new read-only exports above), which is what keeps Notifications' cross-domain dependency one-directional and avoids a circular import between Notifications and either domain it reads from.

**Notification bell placement:** `features/notifications/components/notification-bell.tsx` is composed into the existing `components/shared/top-nav.tsx` via a new optional `notificationSlot?: React.ReactNode` prop (additive, defaults to nothing rendered — does not change `TopNav`'s existing behavior for any current caller). `app/(dashboard)/layout.tsx` passes `<TopNav notificationSlot={<NotificationBell />} ... />`, keeping `TopNav` itself domain-agnostic (it renders whatever `ReactNode` it's given, same pattern as its existing `themeToggle` slot) while the domain-aware bell component lives inside the `notifications` feature module, per the existing `components/shared/` vs `features/*/components/` boundary.

---

## Receipts — Phase 2 addendum to Transactions (`features/transactions/server/receipts.ts`)

Per `docs/product/transactions.md`'s "Phase 2 Addendum: Receipt Attachment." File storage is UploadThing, wired up this phase; this is currently UploadThing's only consumer (Bills does not need its own storage feature per its spec's Dependencies section).

| Action | Mechanism | Input | Output |
|---|---|---|---|
| Upload endpoint (UploadThing's own integration surface) | `app/api/uploadthing/route.ts` — `GET`/`POST` handlers generated by UploadThing's `createRouteHandler(fileRouter)`, wired to the `receiptUploader` endpoint defined in `app/api/uploadthing/core.ts` | UploadThing's own request contract (not `ApiResult<T>` — this is third-party integration surface, not one of our own endpoints) | UploadThing's own response contract |
| Upload from the browser | `features/transactions/components/receipt-uploader.tsx`, wrapping UploadThing's `<UploadButton endpoint="receiptUploader" />` React component | file (image or PDF; max size and accepted MIME types enforced in `core.ts`'s `.middleware()`/config, per AC5) | `onClientUploadComplete` callback fires client-side with `{ url, key, name, size }[]` — the browser uploads directly to UploadThing's storage, not through our own server as a proxy |
| Persist receipt metadata | Server Action `attachReceipt` (defined in `receipts.ts`, re-exported from `actions.ts`) | `AttachReceiptSchema { transactionId: string; url: string; key: string; name: string; size: number; mimeType: string }` — server re-validates the transaction belongs to the current user before persisting (never trusts the client-supplied `transactionId` alone) | `ApiResult<Receipt>` |
| List receipts for a transaction | Server Component direct call to `receipts.getReceiptsForTransaction(userId, transactionId)` — used in the transaction detail view only, **not** included in the paginated table-row shape (avoids an N+1-style receipt fetch on every row of a table that can have thousands of rows) | — | `Receipt[]` |
| Remove a receipt | Server Action `removeReceipt` | `{ id: string }` | `ApiResult<{ id: string }>` — deletes the DB row **and** calls `lib/uploadthing.ts`'s `utapi.deleteFiles(key)` first, so no orphaned file is ever left in storage (AC/Edge Cases requirement) |

**Existing action updated, not a new endpoint:** `deleteTransaction` (`features/transactions/server/actions.ts`, Phase 1 file) must be updated to also call `utapi.deleteFiles(...)` for every receipt attached to the transaction being deleted, before or alongside removing the `Transaction` row — per the addendum's edge case ("deleting a transaction that has an attached receipt: the receipt is deleted along with it, no orphaned file left in storage"). This is flagged explicitly here because it is a behavioral change to a Phase 1 file being made as part of Phase 2 work, not a new contract entry.

**Split transactions:** no special-casing anywhere in this table — split line items are already their own `Transaction` rows (per Transactions AC14), so `attachReceipt`/`removeReceipt`/`getReceiptsForTransaction` work identically whether `transactionId` refers to an unsplit transaction or a split line item.

**Required dependency install (not performed by this Architect):** `uploadthing` and `@uploadthing/react` are absent from `package.json` as of this writing — whoever implements this addendum must `npm install` both, plus add the UploadThing environment variable(s) (e.g. `UPLOADTHING_TOKEN`) to `.env.example`.

**Schema conflict flagged for the Database Architect (see this Architect's final report):** `docs/database/er-diagram.md` already lists a single `Transaction.receiptUrl: string` field from Phase 1. That field cannot satisfy this addendum's requirement of **multiple** receipts per transaction (AC1, and the "transaction with multiple receipts attached... all individually removable" edge case) — a proper one-to-many `Receipt` model (as implied by the contract above: `id, userId, transactionId, url, key, name, size, mimeType, createdAt`) is required instead. Resolving whether `receiptUrl` is dropped outright (if genuinely unused since it was a Phase 1 placeholder never wired to any UI) or migrated is the Database Architect's call, following `docs/database/migration-strategy.md`'s additive-first / two-migration-rename rules as applicable — flagged here, not decided by this document.
