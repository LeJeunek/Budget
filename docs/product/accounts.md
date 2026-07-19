# Product Spec — Accounts (Phase 1)

## User Story
As a FinanceOS user, I want to add and manage every financial account I hold — checking, savings, credit card, cash, investment, retirement, and crypto — so that the app has a complete, accurate picture of what I own and owe, and every other feature (transactions, dashboard, budgeting, net worth) has real data to work from.

## Business Value
Accounts are the foundation of the entire product: no transaction can be logged, no dashboard number can be calculated, and no budget can be planned without at least one account existing. Getting a user to add their first account is the single highest-leverage activation moment in the product — it is the difference between an empty shell and a dashboard that reflects the user's real financial life. A low-friction, trustworthy account setup experience directly drives activation and retention.

## Acceptance Criteria

1. A user can create an account by providing:
   - **Name** (required, free text — e.g. "Chase Checking")
   - **Type** (required, one of: Checking, Savings, Credit Card, Cash, Investment, Retirement, Crypto)
   - **Institution** (optional free text — e.g. "Chase," "Coinbase"; naturally blank for Cash)
   - **Balance** (required, defaults to 0, entered as a decimal currency amount)
   - **Interest Rate** (optional decimal percentage; only meaningful for interest-bearing types such as Savings, Credit Card, Retirement)
   - **Color** (required; defaults to a system color if the user doesn't pick one; used to visually distinguish the account across lists and charts)
2. A user can view a list of all their non-archived accounts, showing name, type, institution, current balance, and color.
3. A user can edit any field on an existing account, including correcting the account type after creation.
4. A user can archive an account (soft delete). Archiving:
   - Removes the account from default account lists and from Net Worth and other dashboard aggregates going forward.
   - Does **not** delete the account's transaction history — past transactions remain fully intact and reachable.
   - Prevents new transactions from being logged against the account going forward.
5. A user can view their archived accounts in a separate view and can unarchive (restore) one, which returns it to the active list and re-includes it in aggregates going forward.
6. **Balance sign convention** (binding for all downstream calculations, including the Dashboard):
   - For Checking, Savings, Cash, Investment, Retirement, and Crypto accounts, the balance represents money the user owns (an asset) and is entered/displayed as a positive value.
   - For Credit Card accounts, the balance represents the amount currently owed (a liability) and is entered/displayed as a positive value representing debt; it is treated as a subtraction in Net Worth and any other net-position calculation.
7. For Investment, Retirement, and Crypto accounts, the balance is a manually entered current value that the user is responsible for keeping up to date (no live market data in Phase 1 — that is a Phase 3 decision). The account view should make clear this figure is user-reported, not live.
8. All monetary values are displayed in a single, user-level currency (per the Charter, multi-currency accounts are out of scope for the entire v1 arc).

## Edge Cases

- **Duplicate account names**: allowed (e.g. two accounts both named "Checking" at different institutions). The institution field and color help the user disambiguate; no uniqueness enforcement is required.
- **Negative balances**: allowed for Checking/Savings/Cash (e.g. overdraft) — must not be blocked or flagged as an error.
- **Archiving an account with a non-zero balance**: allowed. The account simply drops out of active balances/Net Worth from that point forward; nothing about its historical transactions changes.
- **Attempting to log a new transaction against an archived account**: must be blocked with a clear message directing the user to unarchive the account first or choose a different one.
- **Editing an account that has existing transactions**: allowed for every field, including type — changing an account's type does not retroactively alter any transaction that already references it.
- **Very large or precise balances**: input must be validated against the supported monetary precision (two decimal places); values exceeding the supported range are rejected with a clear error rather than silently truncated.
- **Interest rate out of a sane range** (e.g. negative, or above 100%): flagged with a validation message rather than silently accepted, since a typo here (e.g. "425" instead of "4.25") is a realistic user error.
- **Zero accounts**: a brand-new user with no accounts sees an explicit empty state prompting them to add their first account, not a blank or broken screen.
- **Deleting the only account a user has**: allowed (it becomes archived, not destroyed), but the app must clearly communicate that all transaction-dependent features will show empty states until a new account exists.

## Definition of Done

- All 7 account types can be created, edited, archived, and unarchived end to end.
- Archiving never deletes transaction history; verified by an account with existing transactions being archived and its transactions remaining fully visible/reportable elsewhere in the app.
- Net Worth and other aggregates correctly exclude archived accounts and correctly apply the balance sign convention (assets add, credit card liabilities subtract).
- Empty state (zero accounts) and loading skeletons are implemented, consistent with the patterns established in this phase for reuse by later phases.
- Validation errors (missing name, missing type, malformed balance/interest rate) are surfaced clearly to the user, not as raw errors.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (no cross-user account access), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Phase 0 authentication (a signed-in user) — already delivered.
- None of Accounts' own functionality depends on Transactions or Categories, but it is a hard prerequisite for both: a user cannot log a Transaction without at least one Account, and the Dashboard cannot compute Net Worth without Account data.

## Success Metrics

- Percentage of new users who add at least one account within their first session (activation).
- Average number of accounts per active user (a proxy for how completely users are modeling their real financial life in the app).
- Time-to-first-account (should be low friction — a short form, not a wizard).
- Error/validation-failure rate on account save (should trend toward zero as the form is refined).
- Archive/unarchive usage with no reported data-loss incidents (i.e., users trust that archiving is safe, not destructive).
