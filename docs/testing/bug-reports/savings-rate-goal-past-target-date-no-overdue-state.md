# Bug Report: Savings Rate Target goal with a past `targetDate` has no "overdue" signal — silently indistinguishable from a goal with plenty of time left

## Severity
**Low** — no crash, no nonsensical numeric value, and not explicitly required by the spec's Edge Cases (which is silent on this exact case). Filed as a UX-completeness gap per the dispatching task's explicit ask to check this scenario, not as a functional defect.

## Component
`src/features/financial-goals/server/validation.ts` — `SavingsRateTargetGoalSchema` / `optionalDateOnlySchema` (no future-date constraint)
`src/features/financial-goals/server/progress-math.ts` — `isSavingsRateTargetComplete` (never reads `targetDate` at all)
`src/features/financial-goals/components/financial-goal-card.tsx` — `SavingsRateProgress` (renders no date-related state)

## Summary
`SAVINGS_RATE_TARGET`'s `targetDate` is optional and, per validation, may be **any** valid date string — including one already in the past at creation time. Neither the creation schema nor `updateFinancialGoal`'s handling rejects or flags this. Once created, `targetDate` is stored but **never read anywhere in the progress/completion computation** (`computeRollingSavingsRateAverage` / `isSavingsRateTargetComplete` take no date argument at all), and the card/detail UI (`SavingsRateProgress`) doesn't render `targetDate` or any "overdue" state either.

The net effect: a goal created with, e.g., `targetDate: "2020-01-01"` behaves and displays **identically** to a goal with a target date years in the future, or no target date at all — showing only the plain "14% → target 20%" figure with no indication the self-set deadline has already elapsed.

## Reproduction Steps (verified via the real `createFinancialGoal` action against a live database)
1. Call `createFinancialGoal({ type: "SAVINGS_RATE_TARGET", name: "Old rate goal", targetPercent: 20, targetDate: "2020-01-01" })`.
2. Result: `{"success":true, "data": {..., "targetPercent":20, "targetDate":"2020-01-01T00:00:00.000Z", ...}}` — accepted with no validation error.
3. Read it back via `getFinancialGoalById`: `{"currentRollingAverageRate":null, "isCompleted":false, ...}` — identical shape/behavior to a goal with a future or absent target date; `targetDate` is present on the raw record but has no bearing on, and no visible relationship to, the computed progress fields.

## Expected vs. Actual Behavior
- **Expected** (per the dispatching task's own framing, since the product spec's Edge Cases are silent on this specific case): some sensible signal that the user's self-set deadline has already passed, distinguishing "on track with time left" from "target date already elapsed, still short of goal" — even a simple "target date has passed" indicator would resolve the ambiguity.
- **Actual**: no such signal exists anywhere in the computed `FinancialGoalWithProgress` shape or the card UI. A user cannot tell, from the app itself, whether their chosen target date is still ahead of them or long gone.

## Real-World Impact
Low — the goal doesn't break, misreport a percentage, or falsely claim completion. The impact is purely informational: a user who set an aggressive/past target date gets no feedback that the date itself has lapsed, only ever seeing the plain rate-vs-target comparison. This is a minor trust/clarity gap, not a functional defect, and may be an intentional scope decision (the product spec never lists "reject a past target date" as a requirement, unlike the explicit "target above 100% or below 0%: rejected" rule it does state for the percentage field).

## Suggested Owner
Product Owner (to decide whether this deserves an explicit "overdue" state, given the spec is silent on it) — if resolved, implementation would land with the Frontend Lead/UI Component Engineer (`financial-goal-card.tsx`) and possibly the Backend Engineer for a computed `isOverdue`-style field.
