# Product Spec — Recurring Income (Phase 3a)

## User Story
As a FinanceOS user, I want to set up every source of income I expect to receive — my salary, a side hustle, dividends, rental income, bonuses — with how much and how often, see what's expected to come in and whether it's actually shown up yet, so I have a forward-looking picture of my income the same way Bills already gives me a forward-looking picture of what I owe.

## Business Value
Since Phase 1, the Dashboard's "Monthly Income" figure has only ever been a backward-looking total (per `dashboard-overview.md` AC2: "the sum of all money-in transactions dated within the current calendar month to date") — accurate, but reactive; it tells a user what already arrived, not what to expect. Bills (Phase 2) proved the value of a forward-looking, source-by-source view on the expense side (the Upcoming list, per `bills.md` AC9); this feature is its direct mirror on the income side, and reuses the recurring-schedule pattern Bills already established for exactly this reason (per `bills.md`'s own Business Value note: "its recurring-schedule modeling establishes a pattern later phases can extend... recurring income"). It also directly unblocks Phase 3b's Analytics suite — "income growth," "income sources," and "savings growth" (per `roadmap.md`'s Phase 3 rationale) are only computable once income is tracked by source and schedule, not just as an undifferentiated sum of money-in transactions. This feature produces that structured data; Analytics is what turns it into insight, in the next phase.

## Acceptance Criteria

### Setting up an income stream
1. A user can create a recurring income stream with: a **name** (required, e.g. "Acme Corp Salary," "Etsy Shop," "Rental — 123 Main St," "Annual Performance Bonus"), an **income type** (required, one of: Salary, Side Hustle, Dividend, Rental, Bonus, Other — used for source-level reporting), and a **schedule** (required, one of: weekly, biweekly, monthly, quarterly, annually — the same recurring-schedule set already established in the Bills spec — **or** Irregular/One-off, a new option for income that has no fixed cadence).
2. For any schedule other than Irregular/One-off, an **expected amount** is required (the typical/planned amount per occurrence, which may differ from what's actually received — see Edge Cases, mirroring Bills' variable-amount treatment). For Irregular/One-off streams, no expected amount is required or shown, since by definition there's no fixed cadence or planned figure to compare against; the user simply logs individual amounts as they're received.
3. Once created, a scheduled (non-Irregular) stream generates its next expected occurrence automatically, the same lazy, on-read generation Bills already uses — a user does not need to manually re-create "Salary" every pay period.
4. A user can view a list of all their active income streams, each showing name, type, schedule, expected amount (where applicable), and next expected date (where applicable).
5. A user can edit a stream's name, type, schedule, or expected amount at any time. Edits to amount or schedule apply to future occurrences only; they do not retroactively change an occurrence already marked received.
6. A user can archive an income stream they no longer receive (e.g. a side hustle that's wound down, a rental property that's sold), which stops generating future expected occurrences without deleting its receipt history. An archived stream can be unarchived, resuming occurrence generation from that point forward.

### Tracking receipt
7. Each occurrence of a scheduled stream has its own status, automatically computed as: **Upcoming** (expected date is in the future), **Expected Today**, **Not Yet Received** (expected date has passed and it hasn't been marked received — deliberately not labeled "Late," since a delayed paycheck or dividend is not the user's fault or something urgent to fix, unlike a late bill payment), or **Received**.
8. A user can mark an occurrence received one of two ways, the same optional-linking pattern already resolved for Bills (`bills.md` AC7, resolved 2026-07-19): recording the actual amount and date received directly, **or** linking the occurrence to an existing money-in Transaction the user has already logged/imported (the occurrence's received amount/date are taken from that Transaction). Linking is optional, not required. A linked occurrence's received amount always reflects its linked Transaction's amount — if that Transaction is later edited, the occurrence updates to match; if the Transaction is deleted, the occurrence's link clears and it reverts to its computed Upcoming/Not-Yet-Received status.
9. A user can un-mark an occurrence that was mistakenly marked received, returning it to its computed status. Un-marking a linked occurrence removes the link (the Transaction itself is untouched).
10. A user can view an **expected upcoming income** total: the sum of each active stream's next occurrence amount within a selected period (e.g. this month), clearly labeled as an estimate based on expected amounts — distinct from, and never merged with, the Dashboard's "Monthly Income" figure, which remains actual-transaction-based and unchanged by this feature. This mirrors Bills' Upcoming list, giving income the same forward-looking view expenses already have.
11. For **Irregular/One-off** streams, a user logs individual income events directly (amount and date received) without a generated schedule of expected occurrences; each logged event can optionally link to an existing Transaction, same as scheduled streams' occurrences.
12. A user can view a stream's receipt history (past occurrences/logged events, whether each was received on time, received late relative to its expected date, or is still outstanding).

## Edge Cases

- **Variable-amount income** (commission-based salary, a side hustle with fluctuating monthly sales, rental income with an occasional late tenant): the expected amount is a planning estimate only; the actual amount recorded when marking an occurrence received may differ, and the difference is not treated as an error — same treatment as Bills' variable-amount edge case.
- **Marking an occurrence received after its expected date has passed**: allowed; recorded as received-late-relative-to-expected in history, distinct from received-on-time, without any negative framing (see AC7's "Not Yet Received," not "Late").
- **A truly one-time bonus that will likely never recur** (e.g. a signing bonus): modeled as an Irregular/One-off stream with a single logged event — the user isn't forced into inventing a fake recurring schedule for something that only happened once.
- **An annual bonus that does recur but varies wildly in amount year to year**: modeled as a scheduled (Annual) stream, using the same variable-amount tolerance as any other scheduled stream — the expected amount is just a rough planning figure, not a hard constraint.
- **Deleting an income stream with receipt history**: streams follow the same archive-only pattern as Accounts/Bills/Goals — a stream with any receipt history can be archived, never permanently deleted.
- **Two streams with the same name** (e.g. two side hustles both loosely called "Freelance"): allowed, no uniqueness enforcement — same rationale as duplicate account/bill names elsewhere in the product.
- **Linking an occurrence/logged event to a Transaction already linked to a different income occurrence, or to a Bill occurrence**: rejected — a single Transaction can back at most one recurring-item occurrence across the whole product, preventing one real deposit from silently satisfying two different tracked expectations.
- **A stream whose expected date has passed by a long gap with no activity** (e.g. the user stops checking in for months): each unmarked occurrence in the gap shows as Not Yet Received in history, not silently skipped or auto-marked received.
- **Zero income streams**: a user with none sees a clear empty state prompting them to add their first stream, not a blank screen.
- **Irregular stream with zero logged events yet**: shown as an explicit "nothing logged yet" state, not an error or a misleading $0 total folded into other totals.

## Definition of Done

- Stream CRUD (create, edit, archive/unarchive) works end to end for all six income types and both scheduled and Irregular/One-off cadences.
- Occurrence generation works correctly for every supported schedule (weekly, biweekly, monthly, quarterly, annually), mirroring Bills' proven recurrence-generation logic.
- Occurrence-level status (Upcoming/Expected Today/Not Yet Received/Received) computes correctly, including the received-late-vs-on-time distinction in history.
- Optional Transaction-linking works end to end, including the cross-feature exclusivity rule (a Transaction cannot back both an income occurrence and a bill occurrence).
- Expected-upcoming-income total renders correctly and is verified as clearly distinct from, and never double-counted into, the Dashboard's existing Monthly Income figure.
- Meets the release-level bar defined in the Project Charter: tests passing (including recurrence-generation correctness for every schedule type, mirroring the Bills spec's bar), Security Architect review (income streams scoped strictly to the authenticated user), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Transactions (Phase 1): optional occurrence-to-Transaction linking (AC8) is how a received income event can be reflected consistently wherever Transactions already feed the Dashboard — no separate income-aware calculation exists anywhere else in the product, exactly matching how Bills' optional linking works with Budgeting's Spent total (per `bills.md`/`budgeting.md`'s resolved Dependencies).
- Bills (Phase 2): shares its recurring-schedule concept and lazy occurrence-generation pattern; the Database Architect should decide whether to share the underlying schedule/occurrence model between Bills and Recurring Income or keep them parallel — noted here as an implementation consideration, not a product requirement, since it has no user-facing effect either way.
- Dashboard Overview v1 (Phase 1): Monthly Income remains unchanged by this feature (see AC10) — this feature adds a new, separate "expected upcoming income" surface rather than modifying the existing stat card.
- Investments (Phase 3a, sibling spec): see the boundary note in `investments.md` distinguishing Investments' per-holding dividend income from this feature's "Dividend" income type — both specs cross-reference the same explanation; no further action needed here beyond that shared understanding.
- Phase 3b Analytics ("income growth," "income sources," per `roadmap.md`): depends on this feature's data existing and being structured by source/type; no analytics computation is in scope here.

## Success Metrics

- Percentage of active users who add at least one recurring income stream (adoption).
- Average number of income streams per user who has added at least one (signal of how completely users are modeling real income diversity — one salary vs. several sources).
- Percentage of occurrences marked Received within a reasonable window of their expected date (are streams staying accurate and actively maintained, or set up once and abandoned — mirrors the Bills success-metric pattern).
- Usage rate of the expected-upcoming-income view (is it being checked as a habitual forward-looking reference, similar to Bills' Upcoming list).
- Zero reported incidents of a single Transaction being double-counted across an income occurrence and a bill occurrence.

## Out of Scope for Phase 3a

- Any income-based budgeting or spending-limit logic (e.g. "don't budget more than my expected income") — Budgeting (Phase 2) remains expense-allocation-only per its existing spec; integrating income into budget planning is not requested by the Roadmap for this phase.
- Analytics computation ("income growth," "income sources") — this feature only produces the structured data; the analysis itself is explicitly Phase 3b scope per the Roadmap's 3a/3b boundary (Risk #13).
- Tax withholding, gross-vs-net salary breakdowns, or payroll-deduction modeling — income streams track what actually arrives (net, as deposited), not payroll mechanics.
