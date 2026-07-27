# Phase 4a Performance Review — AI Features

**Reviewer:** Performance Engineer
**Scope:** all five `generateStructuredOutput` call sites and their timeout
bounds; DB-touching gatherer functions for each feature's prompt input; all
four cron routes' scaling behavior; `ReasoningModelCallLog`/`rate-limit.ts`
query cost under growth; the Transaction Auto-Categorization frontend
surface; caching correctness of the three cache-read paths
(`getBudgetAdvisorRecommendations`, `getSpendingInsights`,
`getMostRecentSummary`).

This is the second gate in the Phase 4a review sequence (Security Architect
[APPROVE, see `docs/security/phase-4a-review.md`] → **Performance Engineer**
→ Bug Hunter → Release Manager).

**Recommendation: APPROVE**, with one HIGH finding fixed during this gate
(see below) and four lower-severity findings accepted as documented
follow-ups, consistent with this project's single-user/small-team
deployment target.

---

## Findings

### 1. HIGH — Categorization cron per-user starvation (FIXED during this gate)

`generateAutomaticSuggestionsForUser` (`src/features/transactions/server/categorization.ts`)
had no cap on how many `CATEGORIZATION_BATCH_SIZE`-sized batches it would
process for one user within a single cron invocation. A user with a large
enough backlog (e.g. a 2,000-row CSV import → 50 batches) could alone
consume the entire `app/api/cron/categorize-transactions/route.ts`
`maxDuration = 60` budget before the sequential per-user loop in
`generateAutomaticSuggestionsForAllUsers` ever reached the next user —
starving every user after it in `db.user.findMany`'s iteration order, and
doing so again on every subsequent invocation since the undrained backlog
stays first in line every time.

**Fix (commit `6fe8f01`):** added `MAX_BATCHES_PER_USER_PER_INVOCATION = 1`
(`src/lib/ai/rate-limit.ts`), derived against the worst-case `2 ×
CRON_TIMEOUT_MS` = 40s a single batch call can take once the single retry
`generate-structured-output.ts` performs is accounted for — no larger cap
value can be justified against the 60s ceiling. The existing "no PENDING
suggestion yet" eligibility filter already carries any capped-out remainder
forward to the next invocation, so no new cursor/offset persistence was
needed. New `selectBatchesForInvocation` pure helper, unit-tested directly
for partial-processing and starvation-prevention (`categorization.test.ts`).

### 2. MEDIUM-HIGH — Retry doubling tightens the real cron time budget beyond what §6's timeout constants suggest (accepted, documented)

`generate-structured-output.ts`'s single retry (per §3's spec — correct as
implemented) means any `CRON_TIMEOUT_MS = 20_000` call site can legitimately
take up to 40s before degrading to `"unavailable"`, not the 20s the constant
name implies. This is now explicitly accounted for in Finding 1's fix
(`MAX_BATCHES_PER_USER_PER_INVOCATION`'s own derivation uses the doubled
40s, not the nominal 20s), but the same doubling applies to every other
cron-path `generateStructuredOutput` call (Monthly Summaries, the Health
Score narrative) — worth keeping in mind for any future cron-budget
reasoning, not a defect in the retry contract itself.

**Status:** accepted as documented context for Finding 1's fix; no
additional code change required at this deployment's scale.

### 3. MEDIUM — `getSavingsGrowth`'s per-month query loop scales with account age, not transaction count (accepted, flagged as a fast-follow)

`src/features/analytics/server/savings-growth.ts` issues 3 DB round trips
per calendar month in the requested period, fired concurrently. Spending
Insights' `"DASHBOARD_DEFAULT"`/`"LAST_12_MONTHS"` period resolves to 36
concurrent queries for this one metric alone; `"ALL_TIME"` scales to
O(account-age-in-months) — a 5-year user's All Time refresh fires ~180
concurrent queries for this metric, contending for Prisma's small default
connection pool alongside Spending Insights' other five metrics running at
the same time. This candidate-gathering phase also runs before
`INTERACTIVE_TIMEOUT_MS` starts (that timeout only bounds the model call,
not the gathering step), so its latency isn't currently bounded by the
feature's own stated interactive-timeout budget.

**Recommendation:** collapse the per-month loop into a single `groupBy`
query, the same technique `getDailySpendingHeatmap` already uses for its own
per-day bucketing — an O(months) → O(1 query) win, most valuable on the
"All Time, multi-year user" case where it currently scales worst.

**Status:** not fixed in this gate (no user-visible defect at today's scale
— this is a genuine multi-year-account slow path, not a correctness issue);
flagged for a follow-up pass.

### 4. MEDIUM — Full transaction-table re-render on every single suggestion accept/reject/reconsider (accepted, flagged as a fast-follow)

`transaction-table.tsx`'s `columns` `useMemo` depends on
`suggestionsByTransactionId`/`requestingSuggestionIds`, both of which get a
new reference on every accept/reject/reconsider action (compounded by
`router.refresh()` producing a new `pendingSuggestions` prop every time) —
so a change scoped to one row currently re-renders every visible row's
cells (~175 cell re-renders at the 25-row default page size). Not
perceptibly janky today; an easily-avoidable O(rows × columns) amplification
for what should be an O(1) update.

**Status:** not fixed in this gate; flagged for a follow-up pass (move the
suggestion lookup to a row-scoped `meta`/context read instead of a
column-dependency array entry).

### 5. LOW — `getPendingSuggestions` has no limit/pagination (accepted, pre-existing gap)

Returns every `PENDING` suggestion for a user unfiltered on every
Transactions page load — unbounded growth risk only if a user repeatedly
imports without ever reviewing suggestions. Not a concern at today's scale;
already flagged in `categorization.ts`'s own doc comment as a
Database-Architect artifact gap (the missing import-batch filter), not new
to this review.

---

## Confirmed fine (checked, no issue found)

- **Timeout bounds (§6) correctly vary by call context** at every one of the
  five `generateStructuredOutput` call sites — interactive paths get 8s,
  cron/batch paths get 20s, with no deviation found anywhere.
- **No N+1 (per-row) query patterns** in any DB-touching gatherer reviewed
  (`insights.ts`'s six metric calls, `financial-health-score/service.ts`'s
  four component gatherers, `monthly-summary.ts`'s `gatherMonthlySummaryData`)
  — all bounded fan-outs, not scaled by transaction count. Finding 3 above is
  the one exception, and it scales with months-in-period, not row count.
- **Cron scaling is otherwise reasonable** for the stated single-user/
  small-team deployment — all four cron routes are O(users) DB round trips
  with sequential per-user loops; no accidental O(users × transactions) DB
  query pattern found anywhere.
- **`ReasoningModelCallLog`'s two indexes keep `checkReasoningModelRateLimit`'s
  `count()` queries fast regardless of table growth** — both queries filter
  on a rolling 24h `createdAt` window, so query cost stays proportional to
  rows written in the last 24 hours, not total table size. The Security
  review's flagged missing retention job remains a storage/cost concern, not
  a query-latency one.
- **Caching correctness confirmed by direct inspection**: `getBudgetAdvisorRecommendations`,
  `getSpendingInsights`, and `getMostRecentSummary` all return early from a
  cache-row read before ever reaching `generateStructuredOutput`; none
  regenerates on a cache hit.
- **No bundle-size regression** from Phase 4a's frontend surface — no client
  component imports anything from `lib/ai/`; `suggestion-badge.tsx` only
  pulls in already-bundled UI primitives and icons.
- **Narrative-safety/grounding check cost is negligible** at any realistic
  scale — bounded narrative fields, simple non-backtracking regexes, small
  fixture arrays.
