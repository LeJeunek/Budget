# Bug Report: Unarchiving a Debt Payoff goal bypasses the "one active goal per Debt" exclusivity rule

## Severity
**High** — violates a binding, explicitly stated product invariant (financial-goals.md: "At most one active Debt Payoff Financial Goal per Debt at a time") with real user-facing consequences (two redundant/conflicting progress bars for the same debt, ambiguous "which goal is real" state), and the violation is trivially reachable through completely normal UI usage (archive, create, unarchive — no edge-case timing or malicious input required).

## Component
`src/features/financial-goals/server/actions.ts` — `unarchiveFinancialGoal`
`src/features/financial-goals/server/service.ts` — `assertDebtNotAlreadyLinkedToActiveGoal` (the guard that is *not* invoked on this path)

## Summary
`createFinancialGoal`'s `DEBT_PAYOFF` branch correctly enforces "at most one active goal per Debt" via `assertDebtNotAlreadyLinkedToActiveGoal`, run inside a transaction. However, `unarchiveFinancialGoal` never calls this guard at all (confirmed both by reading the code and by a live, real Server-Action-level reproduction below). This means a completely ordinary sequence — archive goal A for Debt X, create a new goal B for the same Debt X (correctly allowed, since A is archived), then unarchive A again — results in **two simultaneously active `DEBT_PAYOFF` goals tracking the same Debt**, which is exactly the state the spec says must never happen ("two goals watching the same underlying number would just show two redundant progress bars for one fact").

This is not a hypothetical: the code comment in `service.ts` (`unarchiveFinancialGoal`'s JSDoc) explicitly acknowledges this exact scenario and declares it "an unusual but not explicitly forbidden state" — but the product spec's Edge Cases section frames the underlying rule as a *at all times* invariant, not a create-time-only check, and the Definition of Done explicitly calls out that "the Debt Payoff type's one-active-goal-per-Debt exclusivity rule is verified" as a release-gating requirement. A rule that can be silently defeated by Archive -> Create -> Unarchive is not actually enforced.

## Reproduction Steps (verified via real Server Action calls against a live database — not just code reading)
Test performed via `createFinancialGoal` / `archiveFinancialGoal` / `unarchiveFinancialGoal`, the actual exported Server Actions, called end-to-end with a mocked authenticated session (real Prisma writes, real guard logic, real transaction):

1. Create a `Debt` (e.g. a Credit Card, balance $500).
2. Call `createFinancialGoal({ type: "DEBT_PAYOFF", name: "Goal 1", linkedDebtId: debt.id })` — succeeds.
3. Call `createFinancialGoal({ type: "DEBT_PAYOFF", name: "Goal 2", linkedDebtId: debt.id })` again — correctly **rejected**: `"This debt is already being tracked by an active goal: \"Goal 1\"..."`.
4. Call `archiveFinancialGoal({ id: goal1.id })` — succeeds.
5. Call `createFinancialGoal({ type: "DEBT_PAYOFF", name: "Goal 3", linkedDebtId: debt.id })` — correctly **succeeds** (Goal 1 is archived, so this is legitimately allowed per spec).
6. Call `unarchiveFinancialGoal({ id: goal1.id })` — **succeeds** (`{"success":true, ...}`), with **no exclusivity check at all**.
7. Query `financialGoal` rows for this Debt with `archivedAt: null`:

```
[
  {"id":"cmrvahbvt0005up74gv20h2ub","name":"Payoff Card - Goal 1"},
  {"id":"cmrvahc8p0007up74o5hjr1yc","name":"Payoff Card - Goal 3 (after archiving first)"}
]
```

Both goals are now simultaneously active against the same Debt.

## Expected Behavior
Per financial-goals.md's Type 1 section ("At most one active Debt Payoff Financial Goal per Debt at a time... A user can archive the first goal and create a new one if they want to restart tracking") and Edge Cases ("Attempting to create a second active Debt Payoff goal for a Debt that already has one: rejected with a clear message pointing at the existing goal"), the system should never end up in a state with two simultaneously active `DEBT_PAYOFF` goals for the same Debt, regardless of the sequence of operations (create/archive/unarchive) used to get there. `unarchiveFinancialGoal` should either (a) re-run the same exclusivity guard and reject the unarchive with a clear message pointing at the currently-active goal, or (the Product Owner may instead choose) explicitly document and design an alternate resolution — but silently allowing the violation with no guard at all is not a resolution.

## Actual Behavior
`unarchiveFinancialGoal` unconditionally restores the goal to active (`archivedAt: null`) with zero exclusivity check, producing two simultaneously active goals for one Debt.

## Real-World Impact
- The Financial Goals list will show two progress bars for the same underlying Debt balance, which is explicitly the confusing "redundant" UX the spec's Type 1 exclusivity rule was designed to prevent.
- Both goals independently compute `isCompleted`/`percentPaidOff` from the *same* live `effectiveBalance`, but each has its own, different `startingBalance` anchor (captured at each goal's own creation time) — so the two "redundant" progress bars will typically show **different percentages** for the same debt, which is materially confusing/untrustworthy, not just cosmetically duplicated.
- Reachable via completely ordinary UI actions (Archive -> Create -> Unarchive), not a contrived edge case or malicious input — any user who archives and later un-archives a Debt Payoff goal while a replacement goal exists will hit this.

## Suggested Owner
Backend Engineer (Financial Goals module) — `src/features/financial-goals/server/actions.ts`'s `unarchiveFinancialGoal`, and/or a Product Owner decision on the intended resolution (reject the unarchive vs. some other explicit rule), per financial-goals.md's Type 1 section.
