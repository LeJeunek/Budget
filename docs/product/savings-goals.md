# Product Spec — Savings Goals (Phase 2)

## User Story
As a FinanceOS user, I want to create savings goals — like an Emergency Fund, a Vacation, a Car, a House, or a Gaming PC — set a target amount, log my contributions toward each one, and see my progress and an estimated completion date, so that saving toward something specific feels concrete and motivating instead of an abstract number sitting in an account.

## Business Value
Budgeting (this phase's sibling spec) is about controlling spend; Savings Goals is its positive counterpart — giving users something to work toward, not just something to avoid. Progress bars and completion estimates are a proven motivational pattern in personal finance products, and multiple concurrent goals (e.g. saving for a house down payment while also building an emergency fund) reflect how people actually think about their money, rather than treating "savings" as one undifferentiated pile. This feature also establishes the single-target progress-tracking pattern that Phase 3's broader Financial Goals feature (debt payoff, savings-rate targets — distinct from this feature per the Roadmap) will extend, so getting the core mechanics right here avoids rework later.

## Acceptance Criteria

1. A user can create a savings goal with: a **name** (required, e.g. "Emergency Fund"), a **target amount** (required), and optionally a **target date** (when they'd like to reach it) and a **planned monthly contribution** amount (how much they intend to set aside each month).
2. A user can view a list of all their goals, each showing: name, target amount, current progress (amount saved so far), remaining amount (target minus current progress), and a progress visualization (e.g. a progress bar or ring showing percent complete).
3. A user can log a contribution to a goal at any time: an amount and a date, which adds to that goal's current progress. Contributions, logged manually, are the **only** mechanism by which current progress increases — a goal does not link to an Account or derive progress from any account balance (**resolved, CTO, 2026-07-19**: manual contribution log only, to avoid two independently-maintained numbers, account balance and goal progress, drifting or double-counting against each other).
4. A user can edit a goal's name, target amount, target date, and planned monthly contribution at any time; current progress is unaffected by editing these fields — only adding or removing contributions changes progress.
5. A user can delete a contribution they logged in error; current progress recalculates accordingly.
6. A user can archive a goal (**resolved, CTO, 2026-07-19**: archive-only, never a hard delete — matching the pattern already established for Accounts and Bills) whether or not it has been Completed, which removes it from the default active-goals list without deleting its contribution history. An archived goal can be unarchived, restoring it to the active list. Archiving a goal has no effect on its contribution history or completion status — it is purely a visibility action, the same as archiving an Account.
7. **Estimated completion**: if the goal has a planned monthly contribution amount set, the system estimates a completion date as (remaining amount ÷ planned monthly contribution), expressed as a month/year. If no planned monthly contribution is set but the user has logged at least two contributions, the system estimates a completion date using the user's average actual contribution rate over the life of the goal. If neither is available, the system shows an explicit "not enough data yet to estimate" state rather than a misleading date or a divide-by-zero error.
8. A goal whose current progress reaches or exceeds its target amount is automatically marked **Completed** and visually distinguished from active goals (e.g. a separate section or a clear badge), without requiring the user to manually close it out.
9. A user can view a goal's individual contribution history (list of logged contributions with date and amount) as part of that goal's detail view.

## Edge Cases

- **Contribution that overshoots the target**: allowed; the goal is marked Completed and the overage is shown plainly (e.g. "$50 over your $1,000 target") rather than capped or rejected.
- **Editing the target amount downward on a Completed goal** (e.g. lowering a $5,000 target to $3,000 after saving $4,000): the goal remains Completed since current progress still meets or exceeds the new target.
- **Editing the target amount upward on a Completed goal**: the goal reverts to Active if current progress no longer meets the new target.
- **Negative or non-numeric target amount, or a negative contribution amount**: rejected with a validation error.
- **Goal with a target date in the past at creation time, or one that passes while the goal is still incomplete**: allowed, but visually flagged (e.g. "target date passed") rather than silently ignored — this is informational, not a hard failure.
- **Zero contributions logged, no planned monthly contribution set**: shown as 0% progress with the "not enough data yet to estimate" completion state, not an error.
- **Deleting a goal's only contribution**: allowed; the goal returns to 0% progress rather than being deleted or breaking.
- **Very large target amounts or several active goals at once**: the goals list remains usable and legible (no arbitrary cap on number of goals is required in this phase, but layout must not break with several goals in progress simultaneously).

## Definition of Done

- Goal CRUD (create, edit, archive, unarchive) and contribution logging (add, delete) work end to end.
- Current progress, remaining amount, percent complete, and estimated completion all compute correctly across the scenarios above, including the "not enough data" and auto-Completed states.
- Progress visualization renders correctly at 0%, partial, exactly 100%, and over 100% (overshoot) progress.
- Meets the release-level bar defined in the Project Charter: tests passing (including completion-estimate calculation correctness), Security Architect review (goals and contributions scoped strictly to the authenticated user), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- Phase 0 authentication — a signed-in user is required, same as every other domain.
- No functional dependency on Accounts or Transactions (**resolved, CTO, 2026-07-19** — a goal and its contributions are tracked fully independently, no Account linkage), but it ships in the same phase and release cycle as Budgeting and Bills.

## Success Metrics

- Percentage of active users who create at least one savings goal (adoption).
- Average number of active goals per user who has created at least one (signal of how the feature is actually used — one big goal vs. several concrete ones).
- Percentage of goals that reach Completed status over time (does the feature actually help people finish what they start).
- Contribution logging frequency (are users returning monthly to log progress, or setting a goal once and abandoning it).
- Zero reported incidents of lost contribution history from goal edits or deletions.

## Resolved (CTO, 2026-07-19)

1. **Goal ↔ Account linkage** — resolved against linkage: goals track progress purely through manually logged contributions, fully independent of Accounts. `docs/database/migration-strategy.md`'s Phase 2 note (which loosely implied a Goal→Account reference) has been corrected to match.
2. **Delete vs. archive** — resolved in favor of archive-only, matching Accounts and Bills (AC6 above).
