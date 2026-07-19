# Product Spec — Dashboard Overview v1 (Phase 1)

## User Story
As a FinanceOS user, I want to land on a dashboard that immediately tells me where I stand financially — what I'm worth, what came in and went out this month, and where my money went — built entirely from my own accounts and transactions, so I don't have to dig through a table to answer "am I doing okay right now?"

## Business Value
The dashboard is the product's first impression on every return visit and the reason a user keeps coming back after the initial setup effort of adding accounts and transactions. It's also the clearest proof to the user that their data entry (accounts, transactions, categorization) is paying off — a correct, trustworthy dashboard is what turns "I entered my data" into "I use this app." Getting the core numbers right in Phase 1 (before budgeting, goals, and debt exist) sets the trust baseline every later phase's dashboard additions build on.

## Acceptance Criteria

### Stat cards
1. **Net Worth**: the sum of all the user's non-archived account balances, with Credit Card balances treated as a liability (subtracted) and all other account types treated as assets (added), per the sign convention defined in the Accounts spec. Displays correctly whether positive or negative.
2. **Monthly Income**: the sum of all money-in transactions dated within the current calendar month to date, across all accounts. Clearly labeled as month-to-date so a user viewing this on the 3rd of the month isn't misled into thinking it's the full month's total.
3. **Monthly Expenses**: the sum of all money-out transactions dated within the current calendar month to date, across all accounts, same month-to-date labeling as above.
4. **Remaining Budget**: shows an explicit "no budget set" state in Phase 1, since budgeting doesn't exist until Phase 2 — this must read as an intentional, forward-looking empty state (not a broken or missing card).
5. **Cash Flow**: Monthly Income minus Monthly Expenses for the current month to date, clearly signed (positive shown as net-positive, negative as net-negative).
6. **Savings Rate**: (Income − Expenses) ÷ Income for the current month to date, shown as a percentage. When Income is zero for the period, this must show a clear "not enough data" state rather than a divide-by-zero error, a misleading 0%, or an undefined value.

### Charts
7. **Spending by Category**: a breakdown of the current month's expense transactions grouped by category, including an "Uncategorized" bucket for transactions with no category, so no spending is silently excluded from the total shown.
8. **Income vs. Expense**: a direct comparison of the current month's total income against total expenses, so a user can see at a glance whether they're net-positive or net-negative for the month.
9. **Monthly Trends**: income and expenses shown across recent months (at least the last 6 months of history, or fewer if the user's account is newer than that), so a user can see whether their financial position is improving or worsening over time.

### Data integrity across all of the above
10. Every dollar of transaction volume is counted exactly once in every stat card and chart, regardless of whether a transaction has been split — a split transaction's line items are counted, never the original parent plus its splits together.
11. A transaction belonging to an account that has since been archived still counts correctly toward the historical month(s) it actually occurred in (archiving an account only removes it from *current* Net Worth and future activity, never rewrites history).
12. All figures and charts are scoped strictly to the authenticated user's own accounts and transactions.

## Edge Cases

- **Brand-new user, zero accounts/transactions**: every stat card and chart shows a clear, encouraging empty state with a path to add an account or transaction — never a blank space, a zero that looks like real data, or an error.
- **User has accounts but no transactions yet**: Net Worth reflects account balances correctly; Income/Expenses/Cash Flow/Savings Rate/charts show an empty "no activity yet this month" state rather than misleading zeros.
- **All transactions are income (no expenses) or vice versa**: Savings Rate and Cash Flow must still compute and display sensibly (e.g. 100% savings rate, or an expenses-only state) rather than breaking.
- **Heavy debt / negative net worth**: displayed plainly as a negative number, not hidden, rounded to zero, or flagged as an error state.
- **Future-dated transactions** (see Transactions spec, allowed as an edge case there): must not be included in "this month to date" totals if their date is after today, to avoid overstating current-month income/expenses.
- **A user whose account history is shorter than 6 months**: Monthly Trends shows only the months that actually have data, not fabricated/blank placeholder months.
- **Large balances/volumes**: figures format legibly (thousands separators, consistent currency display) rather than overflowing or truncating card layouts.

## Definition of Done

- All 6 stat cards and 3 charts render correctly against real, varied user data: zero-data, partial-month, full-history, and negative-net-worth scenarios are all explicitly verified, not just the happy path.
- Remaining Budget's "no budget set" placeholder is implemented and reads as intentional.
- Split transactions, archived accounts, and Uncategorized transactions are verified not to double-count, drop, or misattribute any dollar amount in any card or chart.
- Loading skeletons are shown while dashboard data loads, consistent with the patterns established in this phase.
- Meets the release-level bar defined in the Project Charter: tests passing (including calculation-correctness tests against known fixture data), Security Architect review (all aggregates scoped to the authenticated user only), Performance Engineer review (dashboard remains responsive as transaction history grows), documentation, and CTO/architecture sign-off.

## Dependencies

- Accounts (Phase 1): Net Worth and account-scoped context depend entirely on account data and the balance sign convention defined there.
- Transactions (Phase 1): Income, Expenses, Cash Flow, Savings Rate, and all three charts are computed entirely from transaction data, including correct handling of splits.
- Categories (Phase 1): Spending by Category depends on the category list (including the Uncategorized fallback).
- Budgeting (Phase 2): Remaining Budget and, per the Roadmap, a future "Budget Health Score" go fully live only once Phase 2 ships — Phase 1 intentionally ships the placeholder state, not a partial implementation.

## Success Metrics

- Percentage of sessions where the dashboard is the first screen viewed after login (confirms it's serving as the intended "home base").
- Qualitative/UX benchmark: a user with real data should be able to state their current net worth and whether they were net-positive or net-negative this month within a few seconds of landing on the page.
- Zero reported discrepancies between dashboard figures and a manual recalculation from the transaction table (correctness is non-negotiable for a finance product — this is a trust-critical surface).
- Continued engagement signal: correlation between dashboard visits and continued transaction entry/import in the following days (does seeing the dashboard drive more data entry, closing the loop).
