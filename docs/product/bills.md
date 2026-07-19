# Product Spec — Bills (Phase 2)

## User Story
As a FinanceOS user, I want to track my recurring bills — like my mortgage, electric, water, internet, insurance, and subscriptions like Netflix and Spotify — with their due dates and a running paid/late status, and see an upcoming list, so I always know what's coming due and never get blindsided by a missed payment.

## Business Value
Missed recurring payments carry real financial cost (late fees, service interruptions, credit score impact) and real anxiety cost (the low-grade stress of not being sure whether something got paid). A clear, trustworthy bills list turns that uncertainty into a checkable fact — one of the most tangible day-to-day value propositions a personal finance app can offer, distinct from Budgeting's month-level planning and Savings Goals' forward-looking motivation. This feature also directly feeds this phase's Calendar v1 and Notifications v1 (see the combined Calendar & Notifications spec), and its recurring-schedule modeling establishes a pattern later phases can extend (recurring transactions, recurring income).

## Acceptance Criteria

### Setting up a bill
1. A user can create a recurring bill with: a **name** (required, e.g. "Netflix," "Mortgage"), an **expected amount** (required — the typical/planned amount, which may differ from the actual amount paid for variable bills like Electric or Water; see Edge Cases), a **due date** (the next/first occurrence), a **recurring schedule** (required, one of: weekly, biweekly, monthly, quarterly, annually), and optionally a **category** (per the Categories spec, for grouping and reporting purposes).
2. Once created, the bill generates its next occurrence automatically based on the recurring schedule — a user does not need to manually re-create "Netflix" every month.
3. A user can view a list of all their active bills, each showing name, expected amount, next due date, and recurring schedule.
4. A user can edit a bill's name, expected amount, due date, recurring schedule, or category at any time. Edits to amount or schedule apply to future occurrences only; they do not retroactively change the status or amount of an occurrence already marked paid.
5. A user can deactivate (archive) a bill they no longer pay (e.g. a cancelled subscription), which stops generating future occurrences without deleting its payment history. An archived bill can be reactivated, which resumes generating occurrences from that point forward.

### Tracking status
6. Each individual occurrence of a bill (e.g. "Netflix — August") has its own status, automatically computed as: **Upcoming** (due date is in the future), **Due Today**, **Late** (due date has passed and it has not been marked paid), or **Paid**.
7. A user can mark a specific occurrence as paid one of two ways (**resolved, CTO, 2026-07-19** — see the former open question below): recording the actual amount paid and date paid directly (no Transaction involved), **or** linking the occurrence to an existing Transaction the user has already logged/imported (the occurrence's paid amount/date are taken from that Transaction, not entered separately). Linking is optional, not required, and can be done at the time of marking paid or added afterward. A linked occurrence's paid amount always reflects its linked Transaction's amount — if that Transaction is later edited, the occurrence's recorded paid amount updates to match. Marking one occurrence paid (linked or not) has no effect on any other occurrence's status.
8. A user can un-mark an occurrence that was mistakenly marked paid, returning it to its computed Upcoming/Due Today/Late status. Un-marking a linked occurrence removes the link (the Transaction itself is untouched) rather than deleting the Transaction.
9. A user can view an **upcoming list**: every active bill's next unpaid occurrence, sorted by due date, so the user can see at a glance what's coming due soonest across every bill.
10. A user can view a bill's payment history (past occurrences and whether each was paid on time, paid late, or missed).

## Edge Cases

- **Variable-amount bills** (Electric, Water, etc. that change month to month): the expected amount is a planning estimate only; the actual amount recorded when marking an occurrence paid may differ, and the difference is not treated as an error.
- **Marking an occurrence paid after its due date has passed**: allowed; it is recorded as "paid late" in history (distinct from "paid on time"), rather than reclassified as if it had never been late.
- **Deleting a bill that has payment history**: bills follow the same archive-only pattern as Accounts (per the Accounts spec) rather than a hard delete — a bill with any payment history can be archived, never permanently deleted, so historical "did I pay this" records are never lost.
- **A bill with no category assigned**: allowed; it simply doesn't participate in category-level reporting until one is assigned.
- **Changing a bill's recurring schedule mid-stream** (e.g. a subscription that changes from monthly to annual billing): future occurrences follow the new schedule from the point of the edit forward; past occurrences are untouched.
- **Two bills with the same name** (e.g. two similar subscriptions, or a duplicate entry mistake): allowed, no uniqueness enforcement — same rationale as duplicate account names in the Accounts spec.
- **A bill whose due date has passed by a long time with no activity** (e.g. the user stops using the app for months): each unmarked occurrence in the gap is shown as Late in history, not silently skipped or auto-marked paid.
- **Zero bills**: a user with no bills sees a clear empty state prompting them to add their first bill, not a blank screen.
- **Linking an occurrence to a Transaction already linked to a different bill occurrence**: rejected — a Transaction can back at most one bill occurrence, to prevent one real payment silently satisfying two different bills.
- **Linking an occurrence to a Transaction from a different account than the bill's own no-account-requirement**: allowed without restriction — bills themselves are not tied to a specific account in this spec (a user may pay a bill from any account), so any of the user's own transactions may be linked.
- **The linked Transaction is later deleted**: the bill occurrence's link is cleared and it reverts to its computed Upcoming/Due Today/Late status (i.e. effectively un-paid) rather than retaining a stale paid amount from a Transaction that no longer exists.

## Definition of Done

- Bill CRUD (create, edit, archive/reactivate) works end to end; recurring occurrences generate correctly for every supported schedule (weekly, biweekly, monthly, quarterly, annually).
- Occurrence-level status (Upcoming/Due Today/Late/Paid) computes correctly, including the paid-late-vs-paid-on-time distinction in history.
- Upcoming list and per-bill payment history both render correctly against real, varied data (mixed paid/late/upcoming occurrences across several bills).
- Meets the release-level bar defined in the Project Charter: tests passing (including recurrence-generation correctness for every schedule type and date-boundary edge cases), Security Architect review (bills scoped strictly to the authenticated user), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Categories (Phase 1): a bill's optional category depends on the existing category list.
- Accounts (Phase 1): follows the same archive-only (never hard-delete) pattern established there.
- Calendar v1 and Notifications v1 (Phase 2): both are built directly on top of Bills' due-date and status data — see the combined Calendar & Notifications spec.
- Transactions (Phase 1): **resolved (CTO, 2026-07-19)** — a bill occurrence may optionally link to an existing Transaction (AC7). This is how a paid bill flows into Budgeting's Spent totals and the Dashboard (see the Budgeting spec's Dependencies section) — there is no separate bill-aware spend calculation anywhere else in the product; linking is the single mechanism.
- File storage (UploadThing), wired up this phase per the Roadmap: shared infrastructure with Transactions' receipt attachment addendum, though Bills itself does not require an attachment feature in this initial scope (not requested by the Roadmap for Phase 2 Bills).

## Success Metrics

- Percentage of active users who add at least one recurring bill (adoption).
- Percentage of bill occurrences marked Paid before their due date passes (the core promise of the feature — are users actually staying ahead of due dates, or still going Late).
- Reduction in Late-status occurrences over a user's first few months of using the feature (behavior change signal).
- Upcoming-list view frequency (is it being checked as a habitual "what's due" reference, similar to the Dashboard).

## Resolved (CTO, 2026-07-19)

1. **Bill payments vs. Transactions/Budget** — resolved as Option B from the original three: optional linking to an existing Transaction (AC7). Rejected Option A (fully separate) because it forces silent double-entry or Budget/Dashboard blind spots; rejected Option C (auto-create a Transaction) because of the CSV-import double-counting risk it introduces with no clean dedup story. Option B requires no new spend-calculation logic anywhere — a linked payment is simply a Transaction like any other.
2. **Recurring schedule granularity** — weekly/biweekly/monthly/quarterly/annually is confirmed as the full Phase 2 set. An arbitrary custom "every N days" schedule is out of scope for this phase; revisit only if a real need surfaces.
