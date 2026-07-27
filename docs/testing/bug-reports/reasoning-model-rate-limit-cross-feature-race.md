# Bug Report: Cross-feature `reasoningModel` daily rate limit can be exceeded by more than the "small margin" its own accepted-risk note claims — reproduced and quantified

## Severity
**Low** (matches the Security Architect's own risk rating in `docs/security/phase-4a-review.md` Finding 1 — a soft cost/quota protection, not a security boundary, and consistent with this app's single-user/small-team deployment target). Filed here per this gate's brief specifically asking to independently confirm reproducibility and quantify the margin, since the existing writeup describes it only qualitatively ("exceeded... by a small margin").

## Component
`src/lib/ai/rate-limit.ts` — `checkReasoningModelRateLimit` / `recordReasoningModelCall`
Called from: `src/features/budgeting/server/advisor.ts`, `src/features/dashboard/server/monthly-summary.ts`, `src/features/analytics/server/insights.ts`, `src/features/financial-health-score/server/health-score-narrative.ts`

## Summary
`checkReasoningModelRateLimit` (a `count()` read) and `recordReasoningModelCall` (an `insert`) are two independent, sequential statements — by design, per the file's own header comment. Every one of the four `reasoningModel`-backed features calls `checkReasoningModelRateLimit` once, independently, before its own per-key `claimGenerationSlot`, and calls `recordReasoningModelCall` only after its own `generateStructuredOutput` attempt completes. Two (or more) *different* features' generation attempts for the *same user*, fired close enough together, can all read the same pre-attempt count before any of them has recorded its own call, so all of them pass the check — even when doing so pushes the user's actual daily count past `REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY` (8).

This is already documented as an accepted risk (Security review Finding 1), but that writeup frames it around "two different cache keys" for the same feature (e.g. two browser tabs open to two different Budget Advisor months) and describes the overage only as "a small margin." This report confirms, with a deterministic reproduction, that:
1. The race is exactly as real across two **different features** (e.g. a Budget Advisor refresh and a Monthly Summary regenerate for the same user, fired together) as within one feature's two cache keys — nothing about the mechanism is feature-specific.
2. The margin is **not** capped at "+1" — it scales linearly with however many distinct `reasoningModel` call sites happen to race at once. With 4 concurrently-racing calls (all four features happening to be triggered for the same user at once — plausible today via one manual refresh/regenerate action overlapping the daily `financial-health-score-snapshot` cron's own narrative-generation attempt for that same user), the user's daily count was pushed to **11** against a cap of **8** — three over, not one.

## Reproduction Steps
Verified with `vitest`, mocking `@/lib/db`'s `reasoningModelCallLog.count`/`.create` with an in-memory array (this codebase has no integration-test database, per `rate-limit.test.ts`'s own stated convention, so the persistence layer is faithfully modeled rather than exercised against real Postgres):

1. Seed `ReasoningModelCallLog` with 7 rows for `userId` within the rolling 24h window (`REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY - 1`).
2. Fire two independent `checkReasoningModelRateLimit(userId, now)` calls concurrently via `Promise.all` — standing in for Budget Advisor's and Monthly Summary's own independent call sites both being triggered for the same user at the same instant. Both resolve `{ allowed: true }` (both see count = 7, both compute `7 < 8`).
3. Fire the two corresponding `recordReasoningModelCall(userId, <feature>, now)` calls concurrently (mirroring each feature's own `generateAndPersist` calling this exactly once, after its own model attempt).
4. Final count for `userId`: **9** — one over the documented cap of 8.
5. Repeat with 4 concurrent features (Advisor, Monthly Summary, Insights, Health Score narrative) racing the same way against the same 7-call seed: final count is **11** — three over the cap, confirming the overage scales with the number of concurrently-racing call sites rather than being bounded at "+1".

## Expected Behavior
Per `rate-limit.ts`'s own documented intent, no more than `REASONING_MODEL_MAX_CALLS_PER_USER_PER_DAY` (8) `reasoningModel` calls should be attributable to one user within a rolling day (absent the already-accepted narrow race). The realistic worst-case overage bound implied by the existing accepted-risk note ("a small margin... the number of distinct cache keys a user can plausibly open at once") should hold regardless of whether the racing calls come from one feature's several cache keys or from several *different* features' own independent call sites.

## Actual Behavior
The overage is not bounded by anything specific to one feature or one cache key — it is bounded only by however many of the four independent `reasoningModel` call sites happen to race for the same user at the same moment, which can plausibly be all four (a user manually refreshing a card while the daily snapshot cron's narrative step is also mid-flight for them). Confirmed the resulting count can reach 11 against a cap of 8 in this scenario, not merely 9.

## Suggested Owner
No fix requested here — this is being filed to close the loop on the Security review's own "accepted risk" note with concrete reproduction/magnitude data, per this gate's brief. If a fix is ever prioritized, `docs/security/phase-4a-review.md`'s own recommended remediation (move the count-then-claim into a single `SELECT ... FOR UPDATE`-style transaction or a Postgres advisory lock keyed per user) is the correct owner path — Backend Engineer / AI Engineer, `src/lib/ai/rate-limit.ts`.
