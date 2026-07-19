# Product Spec — Transactions (Phase 1)

Includes Global Search v1 (transactions + accounts), which is minor scope for this phase and specified as its own section below.

## User Story
As a FinanceOS user, I want to record, review, search, and organize every transaction across all my accounts — whether I type them in one at a time or import a batch from my bank's CSV export — so that I always have an accurate, complete record of where my money goes and can trust every number the dashboard shows me.

## Business Value
Transactions are the single largest and most frequently touched data set in the product; getting the table's search/sort/filter/pagination experience right is what makes the app usable daily rather than abandoned after setup. CSV import removes the biggest adoption barrier (manually re-typing months of history), and split transactions let users accurately categorize real-world purchases (e.g. a single Target run that's part groceries, part household). This feature is also the direct data source for every dashboard number and chart, so its correctness has downstream trust implications for the entire product.

## Acceptance Criteria

### Viewing & finding transactions
1. A user can view all their transactions in a table showing date, merchant, category, amount, account, and any notes/tags, ordered by date (most recent first) by default.
2. A user can sort the table by date, amount, merchant, or category.
3. A user can filter the table by account, by category (including an "Uncategorized" filter option), and by a date range.
4. A user can search transactions by merchant name and notes text, and combine that search with any of the filters above (filters and search narrow the result set together, not independently).
5. The table is paginated and remains fast and usable as a user's transaction history grows into the thousands of rows.
6. A user with zero transactions (or zero transactions matching their current filters/search) sees a clear empty/no-results state, not a blank table.

### Adding, editing, deleting
7. A user can manually add a transaction by providing: date, merchant/description, amount, account (required), category (optional), and notes (optional).
8. Every transaction is recorded as either money in or money out relative to its account; the two are visually and unambiguously distinguished throughout the table and any totals.
9. A user can edit any field of an existing transaction, including re-categorizing it and adding/removing notes and tags.
10. A user can delete a transaction. If the transaction is a split parent, deleting it removes all of its split line items as well, and the user is warned about this before confirming.
11. A user can add and remove free-form tags on any transaction; a tag typed for the first time is created automatically.
12. Only non-archived accounts can be selected when adding or reassigning a transaction (see Accounts spec).

### Splitting a transaction
13. A user can split a single transaction into two or more category allocations, each with its own amount, such that the allocations sum exactly to the original transaction's total amount. The system must not allow the split to be saved unless the amounts sum exactly.
14. Once split, the original transaction is represented in the table as its individual split line items (same date, merchant, and account; each with its own category and amount) rather than a single combined row.
15. A transaction that has already been split cannot itself be split again (no splitting a split's line item).

### CSV Import
16. A user can import a CSV of transactions into a single, specific account they choose before importing.
17. The system validates each row independently: valid rows are imported, and invalid rows (missing required fields, unparseable dates/amounts) are skipped and reported back to the user with the specific row and reason, so the user knows exactly what needs fixing and can re-import just those rows if needed.
18. The system detects and skips transactions that are very likely duplicates of ones already in that account (e.g. same date, amount, and merchant already on file), and reports how many were skipped as duplicates, so re-importing an overlapping export doesn't double-count history.
19. After import, the user sees a clear summary: how many transactions were imported, how many duplicates were skipped, and any row-level errors.
20. If a CSV row includes a category value that matches one of the user's existing category names, the imported transaction is assigned to that category automatically; otherwise it is imported as Uncategorized rather than blocking the import.
21. The system enforces a reasonable maximum file size/row count per import and rejects oversized files with a clear, actionable message rather than failing silently or timing out.

### Receipt attachment — deferred
22. Receipt attachment is **out of scope for Phase 1**. Per the Roadmap, this was an Architect's call contingent on file-storage integration risk, and the Phase 1 architecture does not wire up file storage — it lands in Phase 2 alongside Bills' storage needs. Phase 1 transactions do not expose an attach-receipt action.

## Edge Cases

- **Deleting a category referenced by many transactions** (see Categories spec): those transactions must appear as Uncategorized in the table, not disappear or error.
- **Archiving an account that has transactions** (see Accounts spec): its past transactions remain fully visible/searchable/editable (notes, category, tags) in the table; the account itself just can't be chosen for new transactions or as a reassignment target.
- **Split remainder/rounding**: e.g. splitting $10.00 across 3 categories evenly doesn't divide cleanly — the user must be able to adjust individual split amounts, and the save action must be blocked with a clear error until the amounts sum exactly to the original.
- **Reverting a split**: there is no dedicated "merge back into one" action in Phase 1; a user who wants to undo a split does so by deleting the split line items. This is an accepted Phase 1 limitation, not a bug.
- **CSV with malformed encoding, extra/missing columns, or a totally unrecognized format**: the import must fail gracefully with a clear message rather than a generic error or partial silent import.
- **CSV re-imported by accident (same file twice)**: duplicate detection should skip the second import's rows, not create a second copy of the user's transaction history.
- **Very large individual amounts or many decimal places**: validated against supported monetary precision, same as Accounts.
- **Search with no matches, or an empty search string**: returns to the unfiltered (or filtered-only) list rather than erroring.
- **Deleting the last transaction in an account**: allowed; the account simply shows zero transactions, dashboard aggregates adjust accordingly.
- **Transaction dated in the future**: allowed (users sometimes log planned/pending transactions ahead of time) but should be visually distinguishable if it materially affects dashboard "this month" totals — flagged for Dashboard spec to account for.

## Definition of Done

- Table supports sort, filter (account/category/date range), search, and pagination, verified against a data set of several thousand transactions without a degraded experience.
- Manual add/edit/delete works end to end, including tag add/remove.
- Split transactions can be created, validated (sum-must-match), viewed as separate rows, and deleted (with cascade warning).
- CSV import handles valid rows, invalid rows (with per-row error detail), duplicate detection, and an oversized-file rejection path — stress-tested against large and malformed files per the risk register.
- Uncategorized and archived-account edge cases behave as specified above, verified end to end with real Categories/Accounts data.
- Loading skeletons, toast notifications (success/error), and empty/no-results states are implemented, consistent with the patterns established in this phase.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (no cross-user transaction access, CSV upload handled safely), Performance Engineer review (pagination/filtering under real data volume), documentation, and CTO/architecture sign-off.

## Dependencies

- Accounts (Phase 1): a transaction cannot exist without an account.
- Categories (Phase 1): categorization, filtering, and the Uncategorized state all depend on the category list existing.
- Dashboard Overview v1 (Phase 1): consumes transaction data for every stat card and chart; transaction correctness (sign convention, split handling, duplicate handling) directly determines dashboard accuracy.
- File storage (UploadThing), planned for Phase 2, is a dependency for receipt attachment only — not for any other Transactions functionality in this phase.

## Success Metrics

- Median transactions logged per active user per week (manual entry adoption).
- Percentage of new users who complete a CSV import within their first week (adoption of the higher-leverage onboarding path vs. manual entry).
- CSV import success rate (rows imported vs. rows errored) across real user files, tracked to catch format issues early.
- Percentage of transactions left Uncategorized 30 days after import/entry (categorization quality signal, shared with the Categories spec).
- Table search/filter usage rate (signal that the table is being used as a real tool, not just glanced at).
- Zero reported incidents of duplicate transaction inflation from repeated CSV imports.

---

## Global Search v1 (Transactions + Accounts)

### User Story
As a FinanceOS user, I want a single search I can use from anywhere in the app to find a specific transaction or account, so I don't have to navigate to the right screen and manually filter to find what I'm looking for.

### Business Value
A fast, reliable global search is a small feature with an outsized trust payoff — it signals the app can be used the way people actually think ("where's that Amazon charge from last month?") rather than only the way its screens are organized. It's explicitly scoped narrow in Phase 1 (transactions + accounts only) so it ships as a solid, expandable pattern rather than a half-built search across everything.

### Acceptance Criteria
1. A search input is available from anywhere in the app (not tied to a specific page).
2. Searching matches against transaction merchant name and notes, and against account name and institution.
3. Results are grouped by type (Accounts, Transactions) so a user can immediately tell what kind of thing they found.
4. Each result shows enough context to identify it without opening it: for an account, its name, institution, and balance; for a transaction, its merchant, date, and amount.
5. Selecting a result takes the user directly to that account or transaction in context.
6. Archived accounts are included in results (users may search for historical accounts) but are visually marked as archived so they aren't mistaken for active ones.
7. Results are always scoped to the authenticated user's own data — never another user's.
8. An empty/no-results state is shown for queries that match nothing.

### Edge Cases
- Very short queries (e.g. a single character) may return a large result set — results should still be capped/paginated rather than returning an unbounded list.
- Special characters or punctuation in the query (e.g. searching "T-Mobile") must not break the search or throw an error.
- A query matching both an account and many transactions must render both groups clearly rather than one crowding out the other.

### Definition of Done
- Search returns correct, user-scoped results across both accounts and transactions, verified with mixed data including archived accounts and Uncategorized transactions.
- Empty state and result-grouping are implemented per the criteria above.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (search cannot leak another user's data), Performance Engineer review, documentation, and CTO/architecture sign-off.

### Dependencies
- Accounts and Transactions features must exist first, since Global Search v1 is explicitly scoped to only those two domains in Phase 1.

### Success Metrics
- Global search usage rate among active users (adoption of the pattern).
- Percentage of searches that result in a click-through to a result (relevance signal).
- Zero reported cross-user data exposure incidents via search.
