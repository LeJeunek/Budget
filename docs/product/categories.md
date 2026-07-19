# Product Spec — Categories (Phase 1)

## User Story
As a FinanceOS user, I want every transaction to be organized into a sensible set of spending categories — starting from a ready-made list I don't have to build myself, but which I can adjust to fit my own life — so that my spending is meaningful to me at a glance and the dashboard's category breakdowns are actually useful rather than generic.

## Business Value
Categorization is what turns a raw list of transactions into insight. A good default category set removes the "blank page" problem most budgeting apps fail on (asking a brand-new user to build a taxonomy before they've entered a single transaction), while still letting users tailor categories to their own life (e.g. adding "Pets" or "Childcare"). Categories are also the backbone of the Dashboard's Spending by Category chart and every later phase's budgeting, analytics, and reporting features — getting this right in Phase 1 avoids rework later.

## Acceptance Criteria

1. Every new user automatically receives the Charter's fixed 11-category starter set at signup, with no action required on their part: Housing, Utilities, Transportation, Food, Entertainment, Shopping, Healthcare, Insurance, Investments, Savings, Misc.
2. These 11 starter categories are marked as system categories and are protected: a user cannot rename or delete them. This guarantees every user always has a baseline categorization scheme, and that later phases (budgeting, analytics) can rely on their presence.
3. A user can view their full category list (system + any custom categories they've added), each shown with its name and color.
4. A user can add a new custom category with a name (required, unique per user) and a color (optional, defaults if not chosen).
5. A user can rename or recolor any custom category they've added. System categories' color may be adjustable (cosmetic only) but their name may not change.
6. A user can delete a custom category they've added. System categories cannot be deleted.
7. Categories are usable everywhere a transaction needs classification: assigning a category to a transaction (or to each part of a split transaction), filtering the transaction table by category, and driving the Dashboard's Spending by Category chart.

## Edge Cases

- **Attempting to rename or delete a system category**: blocked, with a clear explanation that the starter categories are fixed (color changes may still be permitted).
- **Creating a duplicate category name**: rejected with a validation error; matching should be case-insensitive so "Food" and "food" aren't treated as distinct categories.
- **Deleting a custom category that has transactions assigned to it**: the transactions are **not** deleted — they become Uncategorized. The user must be warned before deletion, with a count of how many transactions will be affected (e.g. "12 transactions will become Uncategorized").
- **A transaction with no category** (either never assigned, or its category was since deleted): must display and behave as a distinct "Uncategorized" state everywhere categories are shown or filtered — including in the Spending by Category chart, where it should appear as its own bucket rather than being silently dropped.
- **Deleting all custom categories**: allowed; the 11 system categories always remain as a floor, so the user is never left with zero categories.
- **Very long category names**: a reasonable maximum length is enforced to keep list/chart/legend displays readable.
- **Split transactions**: if a category used by one or more split line items is deleted, each affected split line becomes Uncategorized individually — the rest of the split is unaffected.

## Definition of Done

- Category seeding is verified to run automatically and exactly once at signup for every new user (no duplicate or missing starter categories).
- Full list view, add, rename/recolor, and delete flows work end to end for custom categories.
- System category protections (no rename, no delete) are enforced and clearly communicated in the UI, not just silently blocked.
- The Uncategorized fallback behavior is verified end to end: deleting a used category leaves its transactions intact and correctly reclassified.
- Category color and name are used consistently everywhere categories appear (transaction table, filters, Spending by Category chart).
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (categories scoped strictly to their owning user), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Phase 0 authentication and signup flow — the signup process must trigger starter-category creation for every new user.
- Transactions feature: categories are only useful once transactions exist to apply them to; the transaction category picker and category filter both consume this feature.
- Dashboard Overview v1: the Spending by Category chart consumes the category list, including the Uncategorized bucket.

## Success Metrics

- Percentage of transactions left permanently Uncategorized (lower is better — indicates the starter set plus custom categories are covering users' real spending).
- Percentage of active users who create at least one custom category (signal that the starter set is a helpful baseline, not a rigid constraint).
- Zero reports of a user losing transaction data as a result of deleting a category (Uncategorized fallback must hold up in practice, not just in testing).

## Resolved (CTO, 2026-07-19)

The conflict this spec originally flagged — `api-contracts.md` scoping Categories as seed-only/no-CRUD versus the Roadmap's "user-editable" wording — is resolved in favor of this spec's acceptance criteria: **minimal custom-category CRUD ships in Phase 1** (add/rename/recolor/delete custom categories; system categories protected from rename/delete). `docs/architecture/api-contracts.md` and `docs/architecture/folder-tree.md` have been updated accordingly (new `features/categories/` module), and the Roadmap's Phase 1 Categories bullet now states the scope explicitly. No change to this document's acceptance criteria was needed — they already matched the resolved scope.
