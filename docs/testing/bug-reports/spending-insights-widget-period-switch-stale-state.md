# Bug Report: Switching the Analytics reporting period does not update Spending Insights — widget keeps showing the previously-mounted period's insights under the new period's tab

## Severity
**High** — deterministic (no race/timing needed to reproduce), directly reachable from the primary Analytics page UI with zero special conditions, and produces factually-wrong AI-attributed content: insight text/figures/merchant names for one reporting period displayed while the UI's own period selector and page context claim a different period.

## Component
`src/features/analytics/components/spending-insights-widget.tsx` (`SpendingInsightsWidget`)
Rendered from: `src/app/(dashboard)/analytics/page.tsx` line 156 (`<SpendingInsightsWidget period={period} initialResult={spendingInsights} />`)
Period control: `src/features/analytics/components/reporting-period-selector.tsx` (`ReportingPeriodSelector`)

## Summary
`SpendingInsightsWidget` seeds its displayed result via `const [result, setResult] = useState(initialResult)` (line 76). `useState`'s argument is only used to initialize state on the component's **first** render — it is never re-applied when a **new** `initialResult` prop arrives on a subsequent render of the same component instance.

`ReportingPeriodSelector.handlePeriodChange` (lines 50-61) changes the period via `router.push(\`${pathname}?${params.toString()}\`)` — a client-side (soft) navigation to the same `/analytics` route with a different `?period=` search param. This re-runs the `AnalyticsPage` Server Component with the new `period`, producing a fresh `spendingInsights` result (a different `SpendingInsightsCache` row entirely, since that cache is keyed by `(userId, period)` — see `src/features/analytics/server/insights.ts` lines 279-301). React reconciles the returned tree against the existing one: `SpendingInsightsWidget` is the same component type at the same position, and **no `key` prop is passed** at its call site (`analytics/page.tsx` line 156), so React treats it as an update to the **existing instance**, not a remount. The instance's `result` state therefore is never re-seeded from the new `initialResult` prop — only the `period` prop itself updates (used correctly by `handleRefresh`'s `PERIOD_TO_KEBAB[period]` lookup, but not to reconcile displayed data).

Net effect: the insights list rendered on screen after switching periods is whatever was generated for the period active when the widget first mounted, mislabeled under the newly-selected period tab, until the user manually clicks the widget's own "Refresh" button (which calls `refreshSpendingInsights` scoped to the *current* `period` prop and does correctly call `setResult`).

## Reproduction Steps
1. Visit `/analytics` with the default period (e.g. `?period=last-12-months`, "Last 12 Months" tab active). Ensure this period has enough candidates to produce at least 2 insights (Feature 4 AC1), e.g. a flagged subscription and a category trend change specific to that window.
2. Confirm the widget shows insights consistent with "Last 12 Months" (e.g. an insight naming a merchant/category whose trend only holds over that window).
3. Click the "This Year" (or any other) tab in `ReportingPeriodSelector`.
4. Observe the URL updates to `?period=this-year` and the rest of the Analytics page's metrics (charts, tables) all re-render with "This Year" data, per that page's own `Promise.all`-fetched props.
5. Observe the Spending Insights widget: it still displays the **exact same insights** that were shown in step 2 for "Last 12 Months" — not regenerated, not re-fetched, not even re-rendered with the new period's cached row, despite the widget having no loading state and giving no indication the data is stale.
6. Switch tabs again (e.g. back to "Last 12 Months" or to "All Time") — the displayed insights never change no matter how many times the period tab is switched, only the URL/page's other charts do.
7. Click the widget's own "Refresh" button once — only now does it correctly fetch/display insights for whichever period tab is currently selected.

## Expected Behavior
Switching the shared reporting-period control (Analytics AC2: "Drives every period-aware metric on this page at once") should update every period-aware metric, including Spending Insights, to reflect the newly selected period — matching how every other metric on the same page (Category Trends, Budget vs. Actual, the heatmap, etc.) already behaves correctly on period switch, since those are plain Server-Component-rendered props with no local `useState` shadowing them.

## Actual Behavior
Spending Insights is the one metric on the Analytics page that silently freezes at whichever period was active on first page load/mount, misrepresenting itself as reflecting the currently-selected period tab. A user has no way to tell the insights are stale short of manually clicking "Refresh" (which they have no reason to do, since nothing on screen indicates staleness) or noticing the insight text doesn't match the other period-scoped charts on the same page.

## Suggested Owner
Frontend Lead / Feature owner of `src/features/analytics/components/spending-insights-widget.tsx` — the fix boundary is either resetting local state when `period` changes (e.g. `useEffect` syncing `result` to `initialResult` when `period` changes, or passing `key={period}` at the `analytics/page.tsx` call site to force a remount on period switch) — implementation left to that owner per this role's read-only mandate.
