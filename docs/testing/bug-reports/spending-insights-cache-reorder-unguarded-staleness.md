# Bug Report: `getSpendingInsights`'s cache-hit-first reorder can surface indefinitely-stale insights on the Analytics page — Spending Insights has no page-level gate equivalent to Budgeting's, so the "accepted" edge case is actually live, not dead code

## Severity
**Medium** — not a crash, but a data-integrity/trust issue: previously-generated AI insight text (citing a specific merchant, subscription, or category figure) can keep rendering on every Analytics page view long after the underlying data that justified it has changed, with no visual staleness indicator, and the reorder specifically removed the one check that used to catch this on every view.

## Component
`src/features/analytics/server/insights.ts` — `getSpendingInsights` (cache-hit-first reorder, its own doc comment lines 434-458)
`src/app/(dashboard)/analytics/page.tsx` line 127 (unconditional call site, no gate)
Compare: `src/features/budgeting/server/advisor.ts` — `getBudgetAdvisorRecommendations` (identical reorder, doc comment lines 377-393) vs. `src/app/(dashboard)/budgeting/page.tsx` lines 88-94 (`hasBudgetedCategory`/`showBudgetAdvisor` gate)

## Summary
Both `advisor.ts`'s `getBudgetAdvisorRecommendations` and `insights.ts`'s `getSpendingInsights` received the identical Phase 4a performance reorder: the cache-row lookup now runs *before* the function's own "not enough data" structural safety net (zero budgeted categories / fewer than `MIN_CANDIDATES_TO_ATTEMPT` candidates). Both functions' own doc comments explicitly accept the same consequence: a cache row created when the safety-net check passed will now be returned as-is even if that check would fail today, since a cached result is "already treated as stable regardless of later changes elsewhere."

For **Budget Advisor**, this consequence is actually unreachable in production: `getBudgetAdvisorRecommendations` has exactly one call site (`budgeting/page.tsx`), and that call site only invokes the function at all when `showBudgetAdvisor` (`budgetMonth.isEditable && hasBudgetedCategory`) is true — computed from a **fresh** `getBudgetMonth` fetch on every request. If a month's budgeted-category count has genuinely dropped to zero, the page never calls the function in the first place, so the cache-hit-first reorder's "return stale cached data instead of unavailable" path can never be exercised through the UI today.

**Spending Insights has no analogous gate.** `analytics/page.tsx` calls `getSpendingInsights(user.id, period)` **unconditionally**, every page load, regardless of how many live candidates currently exist for that period — there is no `hasEnoughCandidates`-style pre-check mirroring Budgeting's `hasBudgetedCategory`. This means the "accepted" staleness the doc comment describes is not a dead/theoretical edge case here — it is the **live, default behavior** any time a period's candidate set shrinks below `MIN_CANDIDATES_TO_ATTEMPT` after a cache row already exists (e.g. a flagged subscription gets cancelled/un-flagged, a large purchase ages out of a rolling window, a category trend reverses) — which, per this feature's own cache design, has no expiry: only an explicit "Refresh" click (rate-limited to once per 4 hours, `MIN_REFRESH_INTERVAL_MS`) ever re-attempts generation once a row exists.

## Reproduction Steps
1. User has, for a given `SpendingInsightsPeriod` (e.g. `DASHBOARD_DEFAULT`/`LAST_12_MONTHS`), enough candidates to clear `MIN_CANDIDATES_TO_ATTEMPT` (2) — e.g. one flagged subscription (`buildSubscriptionCandidates`) plus one large purchase (`buildLargestPurchaseCandidates`).
2. Visit `/analytics`. `getSpendingInsights` finds no existing cache row, gathers candidates, passes the `MIN_CANDIDATES_TO_ATTEMPT` check, generates, and persists a `SpendingInsightsCache` row citing that subscription and purchase by name/amount.
3. User un-flags/dismisses that subscription (Analytics' own "Undismiss"/dismiss affordance, `getDismissedSubscriptionMerchants`) and the large purchase transaction ages out of the window (or is deleted/re-categorized as a transfer). Live candidates for this exact period now number fewer than 2 (e.g. 0 or 1).
4. Reload `/analytics` (a completely ordinary page view — no explicit "Refresh" click). `getSpendingInsights` runs: the `existing` cache-row lookup (line 474-477) finds the row from step 2 and returns `cacheRowToResult(existing)` immediately (line 478-480) — `gatherInsightCandidates` and the `MIN_CANDIDATES_TO_ATTEMPT` check are never reached.
5. The widget renders the same stale insights from step 2, citing the now-dismissed subscription and the no-longer-relevant purchase, with no indication anything changed. This persists on every subsequent ordinary page view indefinitely.

## Expected Behavior
Given this feature's own edge-case framing ("insufficient history for any meaningful comparison... not enough data yet"), and given Budget Advisor's sibling feature received an explicit page-level gate specifically to prevent this exact reorder side effect from ever reaching a real user, Spending Insights should either (a) receive an analogous page-level gate re-deriving "does this period currently have enough live signal" before calling `getSpendingInsights` at all, or (b) the reorder's doc comment should not claim parity with Budget Advisor's "accepted, judgment call" framing — the two features are not actually protected symmetrically today, despite the comment's explicit "Same reasoning applies to `insights.ts`'s `getSpendingInsights`" cross-reference.

## Actual Behavior
Spending Insights silently displays indefinitely-stale, AI-generated financial claims about data that may no longer exist or no longer be true, on every ordinary page view, with the only recovery path being a manual "Refresh" click the user has no prompt to make (nothing in the UI indicates the content might be outdated) and which is itself gated by a 4-hour cooldown even if clicked.

## Suggested Owner
Backend Engineer / AI Engineer, `src/features/analytics/server/insights.ts` and `src/app/(dashboard)/analytics/page.tsx` (the missing gate), or Solution Architect to reconcile whether the two features' doc comments should actually claim identical risk acceptance given they are not identically mitigated.
