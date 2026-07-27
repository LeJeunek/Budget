# Phase 4a Performance Follow-Up Review — New AI Feature Frontend (Scoped Delta)

**Reviewer:** Performance Engineer
**Scope:** the four new AI-feature frontend components (`budget-advisor-card.tsx`,
`monthly-summary-card.tsx`, `spending-insights-widget.tsx`, the four
`financial-health-score/components/*.tsx` files), the new
`financial-health-score/page.tsx`, and the modified `budgeting/page.tsx`,
`(dashboard)/page.tsx`, `analytics/page.tsx` data-fetch wiring. A delta
against `docs/performance/phase-4a-review.md` (backend, APPROVE), not a
re-review of that document's scope.

**Recommendation: APPROVE with follow-ups.** No blocking defect, but two
MEDIUM-HIGH and one MEDIUM finding turn previously-dormant backend cost
(flagged in the prior review as theoretical/unexercised, since nothing called
these functions) into real, measurable per-request cost now that the
frontend actually calls them on every page load.

---

## Findings

### 1. MEDIUM-HIGH — Budgeting page: advisor read path re-fetches data the page already has, on every load, cache hit or not

`getBudgetAdvisorRecommendations` (`src/features/budgeting/server/advisor.ts:385-397`)
unconditionally calls `getBudgetMonth` + `getBudgetHealthScore` (~8 DB queries)
**before** checking `BudgetAdvisorCache` — duplicating work
`budgeting/page.tsx`'s own `Promise.all` already did one line above, and
paying it again even when the cache row already exists. Also: `/budgeting`
has no `loading.tsx`/`<Suspense>` boundary, so a cache-miss's up-to-8s
LLM generation (`INTERACTIVE_TIMEOUT_MS`) blocks the entire page's HTML,
including already-resolved data, from streaming.

**Estimated impact:** +8 avoidable DB queries on every cache-hit view; up to
+8s TTFB on first-view-per-month.

### 2. MEDIUM-HIGH — Analytics page: Spending Insights doubles six metric computations on every load, cache hit or not

`gatherInsightCandidates` (`src/features/analytics/server/insights.ts:446`)
runs — and independently recomputes `getCategoryTrends`, `getTopMerchants`,
`getLargestPurchases`, `getSubscriptionCandidates`, `getDailySpendingHeatmap`,
`getSavingsGrowth` — **before** the `spendingInsightsCache` read at line 451.
`analytics/page.tsx`'s own `Promise.all` already computes all six directly
for its charts. Compounds the prior review's own Finding 3
(`getSavingsGrowth`'s O(months) per-month query loop): a multi-year "All
Time" user now triggers that cost twice per page load.

**Estimated impact:** ~2x DB query volume for 6 of 12 Analytics metrics on
every load; worst case roughly doubles an already-flagged expensive path.

### 3. MEDIUM — Dashboard page: Financial Health Score redundantly recomputes Budget Adherence

`gatherBudgetAdherenceComponent` (`src/features/financial-health-score/server/service.ts:206-209`)
calls `getBudgetHealthScore` again, duplicating the Dashboard page's own
already-fetched `budgetHealthScore`. Smaller than Findings 1/2 (one extra
call, ~4 queries) and inherent to this feature's deliberately-uncached,
live-recompute design (Feature 5 DoD: reuse Budget Health Score's logic
verbatim, never re-derive it) — but still an avoidable duplicate fetch when
a caller already has the figure.

### 4. LOW-MEDIUM — `router.refresh()` after local state update repeats the already-accepted pattern, now on heavier pages

All three new client cards update local state with the fresh response, then
still call `router.refresh()` — re-running the entire hosting page's
`Promise.all` batch. Same class of cost the prior backend review's Finding 4
already accepted (`transaction-table.tsx`), now on three more surfaces,
landing on pages made heavier by Findings 1-3.

### 5. LOW — `getSummaryHistory` has no limit/pagination

Same class of gap as the already-accepted `getPendingSuggestions` finding —
practically bounded (~1 row/month), accepted as documented, not a near-term
concern.

---

## Confirmed fine (checked directly, no issue found)

- Every new fetch with no data dependency correctly joins its page's
  existing `Promise.all` (Dashboard's four new calls, Analytics' insights
  call, the new health-score page's three calls). Budgeting's sequential
  advisor fetch is a genuine data dependency (needs `budgetMonth`'s result
  to gate itself), not an oversight — its cost profile is the problem
  (Finding 1), not its placement.
- `financial-health-score-history-chart.tsx` is purely presentational —
  history data passed as a prop, no client-side re-fetch.
- None of the four new components repeat `transaction-table.tsx`'s inline-
  function/object-literal re-render mistake.
- `MonthlySummaryCard`'s history `Dialog` fetches eagerly server-side by
  deliberate, documented choice — the DOM itself still lazily mounts.
- Correct Server/Client component boundaries (only the recharts sparkline
  is `"use client"`); no bundle-size regression (reuses the already-bundled
  `recharts` chunk).
- All AI-generated text renders as plain text nodes everywhere (no
  `dangerouslySetInnerHTML`, no markdown pipeline).

---

## Disposition

Findings 1 and 2 (MEDIUM-HIGH) are being fixed before Phase 4a's final
sign-off: reorder each function's cache-row check to run before its
expensive data-gathering step, so the common cache-hit path pays none of
this cost (cache-miss path is unaffected — it already needed the same data
to generate). Finding 3 will be addressed the same way if it can be done
without complicating `getFinancialHealthScore`'s signature for its other
caller; otherwise accepted as documented, low-cost overhead. Findings 4-5
are accepted, consistent with the prior backend review's identical framing
of their root-cause patterns.
