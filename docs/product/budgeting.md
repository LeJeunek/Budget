# Product Spec — Budgeting (Phase 2)

## User Story
As a FinanceOS user, I want to set a monthly spending plan for each category I care about and see, in real time, how much I've allocated, spent, and have left — with a clear visual signal the moment I go over — so that I can catch overspending during the month instead of discovering it after the fact.

## Business Value
Budgeting is the feature that turns FinanceOS from a system of record into a system of control: Accounts and Transactions (Phase 1) tell a user what already happened, but Budgeting is the first feature that helps them decide what happens next. It's also the direct unlock for two pieces of the Dashboard that have shipped as intentional placeholders since Phase 1 — the "Remaining Budget" stat card and the "Budget Health Score" (see the Dashboard Overview v1 spec) — so this feature completes a promise the product already made to the user in its first release. A user who sets a budget and checks it regularly is a materially more engaged, retained user than one who only logs transactions.

## Acceptance Criteria

### Setting up a monthly budget
1. A user has exactly one budget per calendar month. Every one of the user's categories — the 11 system starter categories and any custom categories they've created (per the Categories spec) — appears in that month's planner as a line item, whether or not the user has allocated anything to it yet.
2. A user can set an allocated (planned) amount for any category for the current month. An allocation of zero and "not yet set" are distinct, valid states — the UI must not silently treat an unset category as if it had a deliberate $0 budget with 0% used.
3. A user can navigate to a past or future month's budget. Past months are shown as read-only history (what was actually planned and spent); the current month and future months are editable.
4. When a new month begins, that month's planner starts from the **previous month's allocations, carried forward automatically as an editable starting point** — not a blank sheet — so a user with a stable budget doesn't have to re-enter the same 11+ numbers every month. The user can freely adjust any carried-forward amount, and a brand-new user with no prior month has every category start unallocated.
5. A newly created custom category (per the Categories spec) appears in the current month's budget planner (and all future months) immediately, defaulted to unallocated; it does not retroactively appear in past months' budgets.

### Tracking spend against the plan
6. For each budgeted category, the system shows: **Allocated** (the planned amount), **Spent** (the sum of that category's expense transactions for the month, including individual split-transaction line items — never the original parent transaction — matching the accounting convention established in the Transactions and Dashboard specs), and **Remaining** (Allocated − Spent, which may be negative).
7. Each budgeted category shows a progress bar reflecting percentage of allocation used (Spent ÷ Allocated), and the percentage as a number.
8. A category that is over its allocation (Spent > Allocated) is visually flagged with a clear over-budget indicator (e.g. the progress bar and remaining figure both signal overage distinctly, not just a bar that visually caps at 100% and hides how far over the user actually is).
9. A category with no allocation set for the month still shows its actual Spent amount (so the user can see real activity even in unbudgeted categories), but does not show a percentage-used or over-budget indicator, since there is no plan to measure against.
10. The budget page shows month-level totals: Total Allocated, Total Spent, Total Remaining, aggregated across every category that has an allocation set for the month (unbudgeted categories' spend is shown separately as informational, not folded into the "Total" figures, to avoid an unallocated category silently making the whole month look over budget).

### Dashboard integration
11. The Dashboard's "Remaining Budget" stat card (previously a "no budget set" placeholder per the Dashboard Overview v1 spec) now shows Total Remaining for the current month once the user has at least one category allocation set; if the user still has zero allocations set for the current month, the placeholder empty state continues to apply.
12. The Dashboard's "Budget Health Score" goes live per the Roadmap, as a 0–100 score (**resolved, CTO, 2026-07-19**), computed as:
    - **Category score** = (number of budgeted categories not over allocation ÷ number of budgeted categories) × 100. Undefined if the user has zero categories with an allocation set — see below.
    - **Overall score** = 100 if Total Spent ≤ Total Allocated; otherwise `max(0, 100 − (Total Spent ÷ Total Allocated − 1) × 100)` — i.e. the score falls linearly to 0 as total spend reaches double the total allocation, and floors at 0 beyond that rather than going negative.
    - **Final score** = round(0.6 × Category score + 0.4 × Overall score) — category-level discipline is weighted higher than the aggregate figure, since a user can be "within budget overall" while badly over in one category and under in another, which the score should still surface as a problem.
    - Displayed with a banded label alongside the number: 70–100 "Good", 40–69 "Fair", 0–39 "Needs attention".
    - If the user has zero categories with an allocation set for the current month, the score is undefined and the Dashboard shows the same "no budget set" placeholder as the Remaining Budget card, not a misleading 0 or 100.

## Edge Cases

- **Category deleted mid-month** (per the Categories spec, only custom categories are deletable): its allocation for the current and future months is removed along with it; any past months' historical budget data for that category is preserved as read-only history, not deleted, so past-month totals don't silently change.
- **Uncategorized spending**: transactions with no category (either never assigned, or their category was since deleted) cannot have a budget allocation, since "Uncategorized" isn't a real, budgetable category. Their total is shown as a separate informational line on the budget page ("Uncategorized spending this month: $X") so the user isn't misled into thinking all of their spend is accounted for by the category totals, but it is excluded from Total Allocated/Total Spent/Total Remaining.
- **Allocating more than the user can realistically afford**: allowed without restriction — the system does not validate a budget's allocations against income or account balances; it is the user's plan, not an enforced limit.
- **Negative or non-numeric allocation input**: rejected with a validation error; allocations must be zero or a positive amount.
- **A category with an allocation but literally zero transactions all month**: shown as 0% used, 100% remaining, not an error or empty state.
- **Editing an allocation partway through the month, after spend has already occurred**: allowed at any time; Spent/Remaining/percentage recalculate immediately against the new allocation.
- **A split transaction whose line items span multiple categories**: each split line item counts only toward its own category's Spent total, matching the Transactions and Dashboard specs' split-accounting rule.
- **Viewing a past month that has no budget history at all** (e.g. a month before the user started using Budgeting): shown as an explicit "no budget was set this month" state, not a blank/zeroed table that implies the user allocated nothing on purpose.
- **A user with only system categories and no custom ones**: the monthly planner still functions fully with all 11 starter categories.

## Definition of Done

- Every user category (system + custom) appears in the monthly planner; allocation can be set, edited, and correctly distinguishes "unset" from "set to zero."
- Spent/Remaining/percentage-used/over-budget indicator compute correctly against real transaction data, verified against split transactions and Uncategorized spend specifically (both are common sources of miscounting).
- Month-to-month navigation works, including the previous-month carry-forward behavior on a newly entered month and correct read-only treatment of past months.
- Dashboard's Remaining Budget stat card and Budget Health Score both go live per the acceptance criteria above (Budget Health Score formula finalized per the open question below before this is considered fully done).
- Meets the release-level bar defined in the Project Charter: tests passing (including calculation-correctness tests against fixture data, mirroring the Dashboard spec's bar), Security Architect review (budgets scoped strictly to the authenticated user), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Categories (Phase 1): every budget line item is a category; system category protections and the Uncategorized fallback both carry directly into this feature.
- Transactions (Phase 1): Spent is computed entirely from transaction data, including correct split-transaction accounting.
- Dashboard Overview v1 (Phase 1): the Remaining Budget stat card's placeholder is replaced by this feature; Budget Health Score is new dashboard surface introduced by this feature.
- Bills (Phase 2): **resolved (CTO, 2026-07-19)** — a bill occurrence marked paid may optionally link to an existing Transaction (see the Bills spec). When linked, that payment is already a normal Transaction and is counted in Spent through the exact same aggregation this spec already uses — no bill-aware special-casing is needed in Budgeting's Spent calculation at all. When not linked, the bill payment simply isn't reflected here, same as any spend the user hasn't logged as a transaction.

## Success Metrics

- Percentage of active users who set at least one category allocation within their first month of the feature being available (adoption).
- Percentage of budgeted categories that stay within allocation vs. go over, tracked over time (are users actually gaining control, or just watching themselves go over budget repeatedly).
- Month-over-month retention of budget usage (do users keep updating/checking their budget in month two, or is it a one-time setup that gets abandoned).
- Dashboard "Remaining Budget" and "Budget Health Score" view rate (confirms the Phase 1 placeholder is now serving its intended purpose).
- Zero reported discrepancies between the budget page's Spent figures and a manual recalculation from the transaction table (same correctness bar as the Dashboard spec).

## Resolved (CTO, 2026-07-19)

All three open questions this spec originally raised are resolved:
1. **Budget Health Score formula** — see AC12 above for the concrete formula.
2. **Carry-forward default** — confirmed as specified in AC4 (previous month's allocations carry forward automatically, editable; a brand-new user starts unallocated).
3. **Bill payments vs. budget Spent** — see the Dependencies section above and the Bills spec: resolved via optional Bill→Transaction linking, requiring no special-case logic here.
