# Product Spec — Debt Tracker (Phase 3a)

## User Story
As a FinanceOS user, I want to track every debt I owe — credit cards, personal/auto loans, student loans, and my mortgage — with its balance, interest rate, and minimum payment, see a realistic payoff date and how much interest I'll pay if I only ever pay the minimum, and compare a snowball vs. avalanche strategy for paying them off faster, so my net worth picture is finally complete and I have an actual plan for becoming debt-free instead of a vague sense of "I owe money in a few places."

## Business Value
Accounts (Phase 1) already shows a Credit Card's current balance, but a balance alone answers "what do I owe right now," not "when will this be gone and what will it cost me to get there." Debt is also the single largest gap in FinanceOS's Net Worth number today — a user with a mortgage and student loans has been seeing an artificially high Net Worth since Phase 1 because those liabilities aren't modeled anywhere. Closing that gap is both a trust issue (an inflated Net Worth is a wrong number, not just an incomplete one) and a motivation issue (per the Roadmap's Phase 3a goal: "what's owed... [is] no longer missing from the dashboard"). The snowball/avalanche comparison is this feature's differentiator over "just a list of balances" — it turns tracking into a plan, the same way Savings Goals (Phase 2) turned a balance into a target. This feature is also the load-bearing prerequisite for Phase 3b's "pay off debt" Financial Goal type (see `roadmap.md`, Phase 3b) — no debt-payoff goal integration is in scope here; Debt Tracker only needs to exist as a complete, stable data source for 3b to build on.

## Acceptance Criteria

### Setting up a debt
1. A user can create a debt with: a **name** (required, e.g. "Chase Sapphire," "Federal Direct Loan," "Home Mortgage"), a **debt type** (required, one of: Credit Card, Personal Loan, Auto Loan, Student Loan, Mortgage, Other), a **current balance** (required, the amount currently owed, entered as a positive number), an **interest rate / APR** (required — unlike Accounts' optional `interestRate`, this field is required here because every payoff calculation in this feature depends on it), and a **minimum payment** (required, the minimum monthly payment currently due).
2. A user can view a list of all their non-archived debts, each showing name, type, current balance, interest rate, minimum payment, and computed payoff date (see AC4).
3. A user can edit any field on an existing debt at any time. Editing balance, interest rate, or minimum payment immediately recalculates that debt's payoff projections; it does not retroactively change any past month's recorded history.

### Payoff projections (per debt)
4. For each debt, the system computes and displays, assuming only the minimum payment is made going forward and no new charges are added: a **payoff date** (month/year debt reaches $0) and **total interest remaining** (total interest that will accrue between now and payoff at that pace).
5. For **Credit Card** debts specifically, the payoff date and total interest remaining are labeled as an estimate that assumes no new purchases are added to the balance going forward (revolving credit realistically keeps changing; installment debt types — loan/student loan/mortgage — do not carry this caveat, since their balance only decreases via payment).

### Snowball vs. avalanche comparison
6. A user can enter one **extra monthly payment amount** (optional, defaults to $0) representing money available above and beyond all debts' combined minimum payments, to be put toward faster payoff.
7. Given that extra amount, the system computes and displays two payoff strategies side by side, each showing: total time to debt-free (across all active debts) and total interest paid across all debts under that strategy:
   - **Snowball**: extra payment applied to the debt with the smallest current balance first; once that debt is paid off, its former minimum payment plus the extra amount rolls onto the next-smallest balance, and so on.
   - **Avalanche**: same rolling mechanism, but ordered by highest interest rate first instead of smallest balance first.
8. The comparison presents both strategies' numbers plainly (time to debt-free, total interest paid, and the payoff order of debts under each) without declaring one "better" — avalanche is mathematically optimal for minimizing interest, snowball is a recognized behavioral/motivational approach, and the choice between them is the user's, not the app's.

### Managing debts
9. A debt whose balance reaches $0 is automatically marked **Paid Off** and visually distinguished from active debts, without the user needing to manually close it out (same pattern as Savings Goals' auto-Completed state).
10. A user can archive a debt (soft delete, same pattern as Accounts/Bills/Goals), removing it from the active list and from the snowball/avalanche comparison and Net Worth going forward, without deleting its history. An archived debt can be unarchived.

## Edge Cases

- **Minimum payment less than accruing monthly interest** (negative amortization — the debt would never be paid off at that pace): the payoff date and total interest remaining show a clear "this debt won't pay itself off at the current minimum payment" warning instead of an infinite loop, a nonsensical far-future date, or a calculation error.
- **$0 extra payment entered for the snowball/avalanche comparison**: both strategies produce identical results, since there's no shared extra-payment pool to reallocate between debts when everyone is only ever paying their own minimum — the comparison view must make this plain (e.g. "add an extra payment amount to see how each strategy differs") rather than implying a meaningless "avalanche wins" when both numbers are actually equal.
- **0% interest rate** (e.g. a promotional-period credit card or 0% financing): payoff math must handle this without dividing by zero or misbehaving — it's simply a debt that reduces by minimum payment alone with no interest accrual.
- **A debt paid off mid-strategy** (in the snowball/avalanche projection): its former minimum payment correctly rolls onto the next targeted debt in that strategy's order for the remainder of the projection.
- **Only one active debt**: the snowball/avalanche comparison still functions and simply shows identical payoff dates/interest for both strategies (no reordering is possible with a single debt) rather than erroring or hiding the comparison.
- **Interest rate edited on a variable-rate loan or adjustable mortgage**: treated as the new constant rate for all future projections from that point forward (a simplifying, clearly-labeled assumption); past months' recorded balances are not recalculated.
- **A linked debt's underlying Account balance increases** (new credit card purchases posted as transactions) — see the Account-linkage section below: this is expected, normal behavior for revolving credit, not an error state, and payoff projections simply recompute from the new, higher balance.
- **Zero debts**: a user with no debts sees a clear, positive empty state ("no debt tracked — nice!" or similar), not a blank or broken screen.
- **Very high number of debts** (e.g. a dozen credit cards and loans): the list and the snowball/avalanche comparison remain legible and usable; no arbitrary cap is required in this phase, but layout must not break.
- **Archiving a debt that still has a nonzero balance** (e.g. the user stops tracking it, doesn't mean it's paid off): allowed — archiving is a visibility action only, distinct from Paid Off, exactly as Accounts distinguishes "archived" from "zero balance."

## Definition of Done

- Debt CRUD (create, edit, archive, unarchive) works end to end for all six debt types.
- Per-debt payoff date and total interest remaining compute correctly at minimum-payment-only pace, including the negative-amortization warning state and the 0%-interest case.
- Snowball and avalanche projections compute correctly across multiple debts with a nonzero extra payment, including correct minimum-payment roll-up as each debt in the order is paid off, and correctly show identical results when extra payment is $0.
- Paid Off auto-detection and archive/unarchive both work end to end.
- Meets the release-level bar defined in the Project Charter: tests passing (including amortization/payoff-date calculation correctness — this is a financial-math-heavy feature and deserves the same fixture-data rigor as the Dashboard and Budgeting specs), Security Architect review (debts scoped strictly to the authenticated user), Performance Engineer review (payoff/comparison calculations remain responsive with realistic numbers of debts), documentation, and CTO/architecture sign-off.

## Dependencies

- Accounts (Phase 1): the Account-linkage question below must be resolved by the Database Architect before backend implementation begins (Risk #9); this spec defines the product behavior each option implies, not the schema.
- Dashboard Overview v1 (Phase 1): Net Worth's existing definition ("the sum of all non-archived account balances," per `dashboard-overview.md` AC1) must be extended to subtract the sum of all active (non-archived, non-Paid-Off) debts' current balances. This is the Roadmap's "Net Worth aggregation update" milestone — this spec does not build that update, but the requirement is: **total active debt balance is a liability, subtracted, same sign convention as Credit Card accounts already use.**
- Phase 3b Financial Goals ("pay off debt" goal type, per `roadmap.md`): depends on this feature being complete and stable; no work toward that goal type is in scope here.

## Success Metrics

- Percentage of users with a Credit Card, loan, or mortgage account who add at least one corresponding debt (adoption/completeness of the net worth picture).
- Average number of debts tracked per user who has added at least one.
- Percentage of users who set a nonzero extra payment amount and view the snowball/avalanche comparison at least once (does the feature's differentiating value get used, not just the balance list).
- Reduction in aggregate tracked debt balance over time for returning users (does the feature correlate with users actually paying debt down faster).
- Zero reported incidents of incorrect payoff-date or total-interest math (this is a trust-critical financial calculation, same bar as the Dashboard's correctness metric).

## Product Requirements for the Account-Linkage Decision (input for the Database Architect — not decided here)

Per `roadmap.md`'s Phase 3a section and Risk #9, whether Debt Tracker introduces standalone records or extends the existing `Account` model is the Database Architect's decision, made in the combined Solution Architect + Database Architect pass (Milestone 3). What follows is the **product behavior** each option implies, so that decision is made against real requirements rather than a guess.

**Important asymmetry to design against:** the existing `Account.type` enum (per `accounts.md` AC1) covers Checking, Savings, Credit Card, Cash, Investment, Retirement, Crypto — there is **no existing Account type for Personal Loan, Auto Loan, Student Loan, or Mortgage.** Credit Card is the *only* debt type with a natural existing Account counterpart today. Whatever the Database Architect decides, three of this feature's four non-credit-card debt types have no pre-existing Account row to potentially link to — they will be newly created records regardless.

- **Option A — grow the existing Account.** A Credit Card Account gains debt-specific fields directly (minimum payment, computed payoff date, computed total interest remaining) and becomes debt-tracked automatically or via a toggle. For this to cover loans/student loans/mortgages too, the `Account.type` enum itself would need new values added — a change to the existing, already-shipped Accounts feature (Phase 1), not something native to Debt Tracker.
- **Option B — fully standalone `Debt` records, independent of Account.** A user creates a Debt entry directly within this feature, regardless of debt type, with no relationship to any existing Account. For a Credit Card already tracked as an Account, this produces two independently-maintained balance numbers for the same real-world card — exactly the drift/double-counting risk Savings Goals was explicitly designed to avoid (per `savings-goals.md`'s resolved note on why goals don't link to Account balances). That precedent argued for *no* linkage there because a goal's progress and an account's balance are conceptually different numbers; a debt's balance and a credit card account's balance are not — they are the same number, so keeping them independent risks them silently disagreeing.
- **Option C — hybrid, optional linking (Product Owner's recommendation).** A `Debt` record is the primary object for every debt type, since that's the only option that works uniformly for all four non-credit-card types without touching the Account schema. For debt types that *do* have an existing Account counterpart today (Credit Card), the user is offered an explicit, deliberate action — e.g. "Link to an existing account" during Debt creation — to connect the new Debt record to their existing Credit Card Account, the same optional-linking pattern already established and CTO-approved for Bills↔Transaction (`bills.md` AC7, resolved 2026-07-19: "linking is optional, not required... can be done at the time of marking paid or added afterward"). When linked, the Debt's balance is read live from the linked Account (never independently re-entered or copied), so there is exactly one balance number, not two. When not linked (the default for loan/student loan/mortgage, and available for Credit Card too if a user doesn't want a full Account for it), the Debt's balance is manually maintained by the user directly on the Debt record, the same way Account balances are manually maintained today for Investment/Retirement/Crypto types.

  This satisfies the "deliberate action, not automatic panel injection" framing directly: a user's existing "Chase Credit Card" Account does not silently sprout a debt-tracking panel the day this feature ships — the user explicitly chooses to either link an existing account or enter a debt manually, the same explicit choice already familiar from Bills.

This section is guidance, not a schema decision — the Database Architect may reach a different, better-justified conclusion, but should treat the `Debt`-per-type requirement above (loans/student loans/mortgage have no Account counterpart) as a hard product constraint, not a detail to be resolved implicitly during implementation.

## Out of Scope for Phase 3a

- Any "pay off debt" goal/target/completion-tracking UI — that is Phase 3b's Financial Goals feature, per the Roadmap's explicit 3a/3b boundary (Risk #13). This feature only needs to exist and be stable for 3b to build on.
- Live interest-rate feeds or credit bureau data — all fields are manually entered and maintained by the user, consistent with the Charter's exclusion of any live external financial data integration for the entire v1 arc.
