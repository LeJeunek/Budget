# Product Spec — Financial Goals (Phase 3b)

## User Story
As a FinanceOS user, I want to set high-level financial milestones — pay off a specific debt, reach an overall savings/net-worth number, or push my savings rate to a target percentage — and have the app automatically track my progress against data it already knows about, so I have something bigger to aim for than a single-purpose savings bucket, without having to manually update anything myself.

## Boundary: Financial Goals vs. Savings Goals (resolved here, Product Owner, per Risk #12)

This is this spec's most important decision and is made explicitly, before any acceptance criteria, per Risk #12's own framing ("Product Owner must define the explicit boundary... before Database Architect schema work begins").

**Decision: Financial Goal is a new, distinct model. `SavingsGoal` (Phase 2) is not generalized, extended, or touched by this feature.**

**Reasoning:**

1. **The two models track progress through fundamentally different mechanisms, and merging them would break a mechanism that was deliberately, carefully decided.** `savings-goals.md` resolved (2026-07-19) that a Savings Goal's progress is driven *exclusively* by manually logged `GoalContribution` rows — explicitly *not* derived from any Account balance, specifically to avoid two independently-maintained numbers drifting or double-counting against each other. Every Financial Goal type this spec defines is the mirror opposite: none of them are ever manually contributed to. Each one's progress is *read live* from a number the app already computes automatically elsewhere (a Debt's balance, the existing Net Worth calculation, the existing Savings Rate calculation). Folding these into `SavingsGoal` would force that model to grow a second, automatic, read-only progress mode sitting alongside its existing manual-contribution mode — reintroducing, inside one model, the exact "which number is the real one" ambiguity the original manual-only decision was written specifically to prevent. Two clean, single-responsibility models are safer than one model with two incompatible progress-tracking strategies bolted together.
2. **The two features answer different questions, not the same question at different scales.** A Savings Goal is a purpose-built bucket the user is *consciously setting money aside toward* — "I am saving $400/month specifically for a vacation," a deliberate, ongoing act of allocation the user performs and logs. A Financial Goal is a milestone the user *watches against their existing financial state* — "tell me when my mortgage hits $0," "tell me when my net worth crosses $50,000," "tell me when my savings rate holds at 20%." Nothing is contributed to a Financial Goal; it is a target painted onto data that's already being tracked in full elsewhere in the product (Debt Tracker, the Dashboard's Net Worth, the Dashboard's Savings Rate).
3. **This keeps both features' UX honest and non-competing.** A "Savings Goals" list stays exactly what it already is: named buckets with a contribution log and a completion estimate based on either a stated plan or actual contribution pace. A "Financial Goals" list is a different, smaller list: milestones that require zero data entry after creation and simply update themselves. A user should never wonder "do I log a contribution here, or does this one track itself" — the two lists never present the same interaction model, so there is no genuine risk of user-facing duplication despite both being "goal" concepts, addressing Risk #12's actual concern directly.
4. **Generalizing `SavingsGoal` was considered and rejected as unjustified churn on a shipped, reviewed feature.** The alternative — adding a discriminated "progress source" to `SavingsGoal` (manual contributions, or linked-Debt, or linked-Net-Worth, or linked-Savings-Rate) — would touch an already-implemented, already-review-gated Phase 2 feature for a benefit (one model instead of two) that doesn't outweigh the cost (re-litigating a resolved, CTO-approved design decision, and risking regressions in a feature with no functional need to change).

**What this means concretely, stated once here so it doesn't need repeating in every acceptance criterion below:** every Financial Goal type in this spec is **read-only against its source data** — it never introduces a second, independently-maintained number for a debt balance, a net worth figure, or a savings rate. This follows the exact "read live, never copied" precedent already established across this codebase (`Debt`'s optional Account link, Investments' derived Account balance, Bills'/Recurring Income's optional Transaction link) rather than inventing a new pattern.

## Business Value
Savings Goals (Phase 2) proved that giving users something concrete to work toward, with visible progress, is motivating. But it only covers one shape of goal: a single earmarked pile of money with a fixed target. It has no way to represent "I want to be debt-free," "I want to hit a specific net worth," or "I want to save a higher percentage of what I earn" — all of which are common, real financial aspirations that don't fit the single-target-bucket model at all. Financial Goals closes that gap using data the app has been faithfully collecting since Phase 1 (income/expenses) and Phase 3a (debt, net worth) — the user does no new data entry to use this feature beyond naming their goal and picking a target; the app already knows the rest. This is also, per the Roadmap, the last piece of the v1 arc closing out — it's what turns "FinanceOS tracks my finances" into "FinanceOS tells me if I'm on track."

## The Three Goal Types

### Type 1 — Pay Off a Specific Debt
- A user creates a Financial Goal of type **Debt Payoff**, selecting one of their existing, active (non-archived, not already Paid Off) Debts from Debt Tracker as its target. No new debt data is entered here — this goal simply watches an existing `Debt` record.
- At creation, the system captures the linked Debt's current `effectiveBalance` as the goal's **starting balance** — a fixed anchor, not recomputed later — so progress can be expressed as "how much of the balance that existed when I started this goal have I paid off," independent of the debt's balance continuing to fluctuate for reasons unrelated to this goal (e.g. new credit card charges, per `debt-tracker.md`'s own edge case for linked-Account debts).
- **Progress** = `(startingBalance − currentEffectiveBalance) / startingBalance`, expressed as a percentage, computed at read time from the Debt's live `effectiveBalance` — never a separately maintained number.
- **Completion**: automatically marked Completed the moment the linked Debt's balance reaches $0 (mirroring Debt Tracker's own auto-Paid-Off detection, `debt-tracker.md` AC9) — no manual close-out step.
- **At most one active Debt Payoff Financial Goal per Debt at a time** — a Debt already being tracked by an active goal cannot be selected for a second, simultaneous goal, since two goals watching the same underlying number would just show two redundant progress bars for one fact. A user can archive the first goal and create a new one if they want to restart tracking.

### Type 2 — Reach a Net Worth / Savings Target
- A user creates a Financial Goal of type **Net Worth / Savings Target**, with a name and a target dollar amount, and chooses what that target is measured against: either **(a) Total Net Worth** (the same live figure the Dashboard's Net Worth card and Net Worth History chart already compute) or **(b) a user-selected subset of their non-archived Accounts** (e.g. only checking/savings, deliberately excluding investments and debt, for a user who wants to track pure liquid savings rather than their whole net worth picture).
- **Progress** = current measured value (Total Net Worth, or the live sum of the selected Accounts' balances) against the target amount, computed at read time — never a manually logged contribution.
- **Completion**: automatically marked Completed once the measured value meets or exceeds the target, same "recompute every read" convention as Savings Goals' and Debt's own completion detection.
- **Historical trend**: when measuring Total Net Worth, this goal type may optionally show a mini trend line reusing the existing Net Worth Snapshot history (`net-worth-history.md`) toward the target. When measuring a custom Account subset, no comparable historical series exists (`NetWorthSnapshot` only stores the aggregate total, not a per-user-chosen subset) — this goal type shows only its current, live value in that case, not a fabricated or partial trend line. This is a stated constraint, not a bug.
- **Multiple goals of this type are allowed simultaneously**, including two goals both measuring Total Net Worth with different target amounts (e.g. "$30k for a house down payment" and "$200k for financial freedom") — unlike the Debt Payoff type, tracking the same underlying figure toward two different milestones is a normal, non-duplicative use case, not a redundant one.

### Type 3 — Reach a Savings Rate Target
- A user creates a Financial Goal of type **Savings Rate Target**, specifying a target percentage (e.g. 20%) and, optionally, a target date.
- **Progress source**: reuses the Dashboard's existing Savings Rate calculation ((Income − Expenses) ÷ Income) exactly, never a separately computed rate — but a single calendar month's rate is noisy (one large one-off expense can crater a month's percentage without reflecting any real change in behavior), so this goal type evaluates a **rolling 3-month average** of that same underlying calculation rather than the latest single month.
- **Completion**: automatically marked Completed once the rolling 3-month average meets or exceeds the target. Because 3 months of income/expense history are needed to even evaluate this, a goal created by a user with fewer than 3 qualifying months shows an explicit "not enough data yet" state (mirroring Savings Goals' own precedent for its estimated-completion state) rather than a misleading or zero'd-out percentage.
- **A month with $0 income** within the averaging window is excluded from the average rather than counted as 0%, consistent with the Dashboard's own existing Savings Rate edge-case handling; if every month in the window is excluded this way, the goal falls back to "not enough data."
- **Progress display**: because a percentage-based target isn't guaranteed to move only upward the way a dollar balance is, this goal type is **not** shown as a conventional 0–100% fill bar implying inevitable forward progress. It instead shows the current rolling-average rate plainly next to the target (e.g. "14% → target 20%"), so a rate that temporarily moves backward is represented honestly rather than as a shrinking progress bar that reads like a failure state.

## Acceptance Criteria

1. A user can create a Financial Goal of any of the three types above; the **type is fixed at creation** — editing a goal's type after creation is not supported (a user who wants a different type archives the current goal and creates a new one), since each type's target configuration and data source are fundamentally different shapes, not variations of one form.
2. A user can view a list of all their active Financial Goals, mixed across types, each showing: name, type (clearly labeled/badged), target, current computed status/progress, and — where applicable — an "on track" / "not enough data" / Completed indicator.
3. A user can edit a goal's name, its target amount/percentage, and (for the Net Worth/Savings Target type) its measurement basis (Total Net Worth vs. a specific Account subset) at any time; edits take effect at the next read/recompute, with no retroactive rewriting of past progress.
4. A user can archive a Financial Goal (soft delete, matching the archive-only pattern used by every other domain in this product — Accounts, Bills, Savings Goals, Debt), whether or not it has reached Completed, without losing its configuration. An archived goal can be unarchived.
5. A goal that meets its type's completion criterion is automatically marked **Completed** and visually distinguished from active goals, without the user needing to manually close it out — same pattern as Savings Goals and Debt Tracker.
6. No Financial Goal type ever exposes a manual "log a contribution/update" action — this is the defining, resolved distinction from Savings Goals (see Boundary section above); if a user wants to log a manual contribution toward a purpose-built target, Savings Goals remains the correct feature for that.
7. Financial Goals notifications (e.g. "you just paid off a debt," "you hit your net worth target") are **out of scope for this phase** — Notifications v2 is Phase 4 per the Roadmap; this spec only requires the goal states themselves to be correctly computed and visible on the Financial Goals list/detail views.

## Edge Cases

- **A linked Debt's balance increases after the goal was created** (e.g. new charges on a linked credit card): progress does not go negative — if the current balance exceeds the starting balance, progress is shown as 0% with a plain note that the balance has increased since the goal began, not a negative percentage or a broken bar.
- **A linked Debt is archived (but not Paid Off) while its Financial Goal is still active**: the goal's progress calculation freezes at its last-known value and displays a clear "linked debt was archived" state; it cannot auto-complete unless the Debt is unarchived or the goal is archived.
- **A Net Worth/Savings Target goal measured against deeply negative net worth**: shown plainly as a large negative distance to target, the same "never hide a negative number" convention the Dashboard already follows — no special-cased messaging beyond that.
- **Editing a Net Worth/Savings Target goal's Account-subset selection after creation**: allowed at any time; recalculates live at the next read using the newly selected subset, with no attempt to reconstruct what progress "would have been" under the old subset historically.
- **A Savings Rate goal with a target above 100% or below 0%**: rejected with a validation error — not a meaningful target.
- **A brand-new user creating a Savings Rate goal with no income/expense history yet**: shows "not enough data yet — check back after a few months of activity," not an error or a misleading 0%.
- **Zero Financial Goals**: a clear empty state prompting the user to create their first one, distinguishing this list from the separate Savings Goals list so the two features don't read as duplicates of each other even when both are empty.
- **Archiving an already-Completed Financial Goal**: allowed, same as Savings Goals' own precedent.
- **Attempting to create a second active Debt Payoff goal for a Debt that already has one**: rejected with a clear message pointing at the existing goal, per this spec's Type 1 exclusivity rule.

## Definition of Done

- CRUD (create, edit, archive, unarchive) works end to end for all three goal types.
- Progress and completion computation is verified against fixture data for each type, including: the balance-increased-after-creation case (Type 1), the custom-Account-subset case with no historical trend (Type 2), and the rolling-3-month-average and "not enough data" states (Type 3).
- Every type's progress is verified to be read live from its existing source (`Debt`, the Dashboard's Net Worth calculation, the Dashboard's Savings Rate calculation) with zero independently-duplicated numbers anywhere in the implementation — this is the feature's core correctness bar, directly resolving Risk #12's duplication concern.
- The Debt Payoff type's one-active-goal-per-Debt exclusivity rule is verified.
- Meets the release-level bar defined in the Project Charter: tests passing (including the financial-math coverage above, matching the bar set by Savings Goals' and Debt Tracker's own Definition of Done sections), Security Architect review (goals scoped strictly to the authenticated user, and to Debts/Accounts the same user actually owns), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- **Debt Tracker** (Phase 3a, live): required for the Debt Payoff goal type.
- **Dashboard's existing Net Worth calculation and Net Worth Snapshot history** (Phase 1 / Phase 3a): required for the Net Worth/Savings Target goal type.
- **Dashboard's existing Savings Rate calculation** (Phase 1): required for the Savings Rate Target goal type.
- **Savings Goals** (Phase 2): no functional dependency in either direction — the two features coexist as deliberately separate, non-competing surfaces per this spec's Boundary section.
- **Accounts** (Phase 1): required for the Net Worth/Savings Target goal type's optional Account-subset measurement basis.

## Success Metrics

- Adoption per goal type (which of the three gets used most, informing whether any deserves more product investment later).
- Completion rate per goal type over time (does the feature actually help users reach the milestones they set, the same outcome-focused metric Savings Goals and Debt Tracker both track).
- Whether creating a Financial Goal correlates with faster subsequent debt reduction, net worth growth, or savings rate improvement for that user (does the goal drive real behavior change, not just passive tracking).
- Zero reported incidents of a Financial Goal's displayed progress disagreeing with the Debt/Net-Worth/Savings-Rate figure it's derived from, shown elsewhere in the app — the same single-source-of-truth trust bar held throughout this product.
- Percentage of users who have at least one Financial Goal *and* at least one Savings Goal simultaneously, with no reported confusion between the two in feedback channels (a direct, ongoing check that Risk #12's boundary is holding up in practice, not just on paper).
