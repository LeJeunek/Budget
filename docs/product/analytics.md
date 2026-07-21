# Product Spec — Analytics Suite (Phase 3b)

## User Story
As a FinanceOS user, I want a dedicated place to actually analyze my financial history — not just see this month's numbers, but understand my spending patterns, my income trends, my budget discipline, and the recurring charges quietly draining my accounts — so the data I've spent months entering and categorizing finally answers questions the Dashboard's stat cards were never designed to answer.

## Business Value
Every prior phase has been about capturing data faithfully (Phase 1's Transactions/Accounts, Phase 2's Budgeting/Goals/Bills, Phase 3a's Debt/Investments/Recurring Income) or presenting a single current snapshot of it (the Dashboard). Analytics is the first feature whose entire purpose is retrospective insight — patterns, trends, and comparisons across time — which is exactly why the Roadmap sequences it after 3a rather than alongside it: several of its most valuable metrics are only meaningful once income, debt, and investment data actually exists to analyze. This is also, per the Roadmap, the phase that "closes out v1" — Analytics is what turns "a place I dutifully enter my financial data" into "a place that tells me something about myself I didn't already know," which is the difference between a system of record and a product a user chooses to keep using.

## Data-Dependency Split (binding on backend build order, per `roadmap.md`)

The 12 metrics split into two backend passes based on what data they require — **not** an arbitrary size cut. Two of the four Pass 2 metrics (Income Growth, Savings Growth) look, at first glance, like they could be built from Phase 1/2 data alone; the reasoning below explains why they genuinely can't be *without duplicating an existing chart*, which is the real dependency.

### Pass 1 — needs only Phase 1/2 data (Transaction, Category, Budget)
Yearly Spending, Category Trends, Expense Distribution, Budget vs. Actual, Top Merchants, Largest Purchases, Daily Spending Heatmap.

### Pass 2 — needs Phase 3a's new models (Recurring Income, Investments, Debt)
Income Growth, Income Sources, Savings Growth, Subscription Cost Detection.

**Why Income Growth and Savings Growth are genuinely Pass 2, not just grouped there for scheduling convenience:**
- The Dashboard's existing Monthly Trends chart (`dashboard-overview.md` AC9) already plots raw income-over-time from Phase 1 data. An "Income Growth" metric that only re-plotted that same total would be pure duplication with zero new value. Its actual differentiator — a by-source breakdown (Salary vs. Side Hustle vs. Dividend vs. Rental vs. Bonus vs. Other, trended over time) — is only possible once Recurring Income's structured, typed data exists (per `recurring-income.md`'s own Business Value note: income growth and sources are "only computable once income is tracked by source and schedule, not just as an undifferentiated sum of money-in transactions"). That structured dependency is what makes this Pass 2, not a scheduling preference.
- Similarly, the Dashboard already computes a single month's Savings Rate (`dashboard-overview.md` AC6). Trending that same figure over time using only Phase 1/2 data would conflate a genuine behavior change (spending less / earning more) with incidental market appreciation of the user's investments — a user whose portfolio happened to gain value this month would look like they "saved more" even if their actual income-minus-expenses behavior didn't change at all. Netting that out requires Investments' gain/loss data (`investments.md` AC6), which didn't exist before Phase 3a. That's the real dependency, not just "it sounds financial so it goes with the other financial-data features."

**Subscription Cost Detection is a data-dependency exception, flagged here rather than silently glossed over:** the detection heuristic defined below (see its own section) runs entirely against `Transaction` data — Phase 1. It does **not** require Recurring Income, Debt, or Investments in any way. It is grouped into Pass 2 by the Roadmap's own explicit build-order sequencing (keeping Pass 1 scoped to "pure historical aggregation over data that's existed since Phase 1/2" and Pass 2 as "the pass introducing new pattern-detection logic," conceptually alongside the recurring-cadence modeling Recurring Income introduced in 3a), not because its data genuinely depends on 3a. This is called out explicitly so the Solution Architect doesn't waste time hunting for a hidden 3a dependency that isn't there.

### The 12th metric: Net Worth Growth/History
Covered entirely by its own dedicated spec, `net-worth-history.md`, per the Roadmap's build order (it ships first, as its own milestone, not as an Analytics-suite line item). It is listed here only for completeness of the full 12-metric enumeration; this document does not re-specify it.

## Acceptance Criteria

### Shared behavior across the Analytics page
1. A single **Analytics** area presents all eleven metrics in this document (the twelfth lives on the Dashboard per the note above), each as its own self-contained card/section — not a single monolithic report a user must scroll past unrelated metrics to reach the one they want.
2. A shared **reporting period control** (e.g. This Year, Last 12 Months, Year-to-Date, All Time) applies to every metric that has a time dimension; a metric with no meaningful "period" (e.g. Top Merchants defaults to all-time unless filtered) states its own default plainly.
3. Every metric degrades gracefully and independently when its own underlying data is insufficient — one metric showing "not enough data yet" must never block or blank out the ten others.
4. Every spending-based metric in this document (Yearly Spending, Category Trends, Expense Distribution, Budget vs. Actual, Top Merchants, Largest Purchases, Daily Spending Heatmap) uses the exact same definition of an "expense transaction" the Dashboard and Budgeting already use — no new, parallel definition of what counts as spending is introduced here.
5. All data is scoped strictly to the authenticated user's own transactions/accounts/goals/debts/income.

### Pass 1 metrics
6. **Yearly Spending**: total expenses per calendar year, shown across all years the user has data for, so a multi-year user can see whether their overall spending is trending up or down year over year.
7. **Category Trends**: for each category, total spending per month (or year, depending on the selected reporting period) across time, so a user can see e.g. "Groceries has crept up the last four months" rather than only ever seeing this month's category breakdown (which the Dashboard already provides).
8. **Expense Distribution**: a breakdown of the selected period's total spending by category (functionally the same shape as the Dashboard's existing Spending by Category chart, but analyzable across a user-selected period rather than fixed to the current month), including an "Uncategorized" bucket, consistent with the Dashboard's own existing handling.
9. **Budget vs. Actual**: for each month in the selected period, each category's allocated amount (from Budgeting) against its actual spend, shown across multiple months at once (rather than Budgeting's own one-month-at-a-time planner view) so a user can spot categories that are chronically over- or under-budget rather than just this month's.
10. **Top Merchants**: the merchants (grouped by normalized merchant name) with the highest total spend within the selected period, ranked, with each merchant's total and transaction count.
11. **Largest Purchases**: the individual highest-amount expense transactions within the selected period, listed with date, merchant, category, and amount.
12. **Daily Spending Heatmap**: a calendar-style view where each day's color intensity reflects that day's total spending relative to the user's own typical daily spending, so patterns like "I always spend heavily on weekends" or "the 1st and 15th of the month are consistently high" become visible at a glance.

### Pass 2 metrics
13. **Income Growth**: total actual-received income per month (or year), trended over time, with an optional by-source overlay (Salary, Side Hustle, Dividend, Rental, Bonus, Other — Recurring Income's existing type taxonomy) built from Recurring Income's actual-received data (`IncomeOccurrence`/`IrregularIncomeEvent` amounts, never the forward-looking "expected" figures, which `recurring-income.md` AC10 already keeps deliberately distinct from any actual/historical total). Money-in activity never associated with any tracked income stream is still included in the overall total (so the trend line stays complete and comparable to pre-3a history) but shown in an explicit "Untracked/Other" bucket within the by-source breakdown, rather than silently folded into one of the six named types or silently dropped.
14. **Income Sources**: for the selected period, the share of total actual-received income attributable to each Recurring Income type, shown as a proportion breakdown (e.g. "70% Salary, 20% Rental, 10% Side Hustle") — the same "Untracked/Other" residual bucket as above applies here too.
15. **Savings Growth**: the trend, over the selected period, of the user's actual month-by-month savings — computed as actual income minus actual expenses, **with any investment holdings' gain/loss for that same period (`investments.md` AC6) subtracted out** so unrealized market appreciation is never counted as "savings behavior." This is deliberately a different, richer number than simply re-plotting the Dashboard's existing Savings Rate month to month; it answers "did I actually set more money aside," not "did my portfolio happen to go up."
16. **Subscription Cost Detection**: see its own section below — this is new detection logic, not a display of data any other feature already models.

## Subscription Cost Detection — Heuristic Definition

Subscriptions are expenses, not income, and are deliberately **not** built on Recurring Income (which is income-side only, per that spec's own scope) or on Bills (which requires the user to have manually set up each bill — a subscription-detection feature exists precisely to surface recurring charges the user *hasn't* manually tracked anywhere). This is standalone pattern-detection logic against `Transaction` data only.

- **Candidate grouping**: expense transactions are grouped by normalized merchant name (case/whitespace/common-suffix normalized, e.g. "NETFLIX.COM" and "Netflix" treated as the same merchant).
- **Pattern requirement**: within a merchant group, a subsequence of at least **three** transactions is required, each spaced at a roughly consistent interval (weekly, monthly, quarterly, or annually, allowing a reasonable tolerance window per interval — e.g. "monthly" tolerates 28–34 days between charges) **and** at a roughly consistent amount (an exact match, or within a small tolerance band, e.g. ±10%, to allow for a subscription's price increase without treating it as a different, unrelated charge). Two matching transactions are explicitly **not** enough to flag a subscription — a one-off repeat purchase from the same store (e.g. two unrelated grocery runs) must not falsely trigger detection; three or more at a consistent cadence is the minimum bar for genuine confidence.
- **Price-change handling**: if a merchant's charge amount shifts and then stays consistent at the new amount for its own run of qualifying charges, it is treated as the same subscription continuing at an updated price (e.g. a streaming service's plan going from $9.99 to $12.99), not two separate detected subscriptions.
- **Detected subscription fields**: merchant name, average/most-recent amount, detected interval, first-detected charge date, most-recent charge date, and estimated annualized cost.
- **Status**: **Active** (a charge has landed within roughly 1.5x the detected interval of the last one) vs. **Possibly Cancelled** (the next expected charge date has passed with no matching transaction since) — never a hard, definitive claim, since this is pattern inference against transaction data, not a direct integration with any subscription provider.
- **User override**: because this is inherently probabilistic (e.g. a weekly coffee-shop habit could pattern-match the same shape as a genuine subscription), a user can dismiss a detected item as "not a subscription," after which that merchant is excluded from future detection for that user. This is the feature's primary defense against false positives, not a nice-to-have.
- **Total cost surface**: alongside the individual list, a running total of estimated combined annualized subscription cost across all currently Active detected subscriptions, so the value proposition ("here's what your subscriptions are actually costing you per year, in one place") is visible without the user manually adding each one up.

## Edge Cases

- **Fewer than 3 qualifying charges from any merchant**: no subscriptions detected at all; a clear "no subscriptions detected yet" empty state, not an empty chart presented as if analysis had actually run and found nothing.
- **A merchant name that varies more than normalization can reconcile** (e.g. a payment processor showing as a generic descriptor one month and the actual merchant name the next): may fail to group correctly and simply won't be detected — an acknowledged limitation of transaction-data-only detection, not a bug to chase to 100% accuracy this phase.
- **A user with fewer than 2 months of transaction history**: Yearly Spending, Category Trends, Budget vs. Actual (multi-month), Income Growth, and Savings Growth all show an explicit "not enough history yet" state for themselves individually (per AC3), while metrics that don't need multi-period history (Expense Distribution, Top Merchants, Largest Purchases, Daily Spending Heatmap for the available period) still render normally.
- **A category deleted after being budgeted against in a past month** (per `categories.md`'s existing deletion behavior, transactions retain a `null` categoryId): Category Trends and Budget vs. Actual show that history under the same "Uncategorized" treatment the Dashboard already uses, rather than silently dropping those past months' data.
- **Investments' gain/loss data unavailable for a given period** (e.g. a user with no holdings at all): Savings Growth simply uses $0 as the gain/loss adjustment for that period rather than erroring — functionally identical to plain income-minus-expenses for a user who has no investments to distinguish from.
- **A month with zero income** (feeding Income Growth/Savings Growth): excluded from any average/rate calculation for that month rather than divided-by-zero or shown as a misleading 0%, consistent with the Dashboard's own existing Savings Rate edge-case handling.
- **Very large transaction volume/history** (a multi-year power user): every metric must remain responsive; per Risk #11, whether this requires materialized/cached aggregates rather than always-live queries is the Solution Architect's/Performance Engineer's decision, not scoped here.

## Definition of Done

- All 11 metrics in this document render correctly against realistic fixture data, including each one's own "not enough data" state.
- Yearly Spending, Category Trends, Budget vs. Actual, Income Growth, Income Sources, and Savings Growth are all covered by tests verifying correct aggregation across month/year boundaries (financial-math-adjacent correctness bar, matching the Debt Tracker/Investments/Savings Goals specs' own precedent).
- Subscription Cost Detection's heuristic is covered by tests against fixture transaction data proving: the 3-occurrence minimum is enforced (no false positive on 2 matches), a price change is correctly treated as a continuation rather than a new subscription, and the Active/Possibly Cancelled status transition is correct.
- Savings Growth's investment-gain-adjustment math is verified against fixture data including a $0-holdings user and a user with both gains and losses in the same period.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (every metric scoped strictly to the authenticated user), Performance Engineer review (per Risk #11 — query/aggregation load at realistic data volumes, and whether materialized aggregates are needed), documentation, and CTO/architecture sign-off.

## Dependencies

- **Transactions, Categories, Budgeting** (Phase 1/2): required for every Pass 1 metric.
- **Recurring Income** (Phase 3a): required for Income Growth's and Income Sources' by-source breakdown.
- **Investments** (Phase 3a): required for Savings Growth's gain/loss adjustment.
- **Debt Tracker** (Phase 3a): not a direct dependency of any metric in this document (Debt-related trend analysis is Net Worth History's territory, per that spec).
- **Net Worth History chart**: ships first per the Roadmap's build order; this document assumes it already exists as the home for the 12th metric, and does not duplicate it.

## Success Metrics

- Percentage of active users who visit the Analytics area at least once per month (adoption of the feature as a genuine habit, not a one-time curiosity click).
- Which individual metrics get viewed most/least, to inform any future prioritization within the suite.
- Percentage of users who dismiss at least one false-positive Subscription Cost Detection result (signals real-world detection accuracy, and whether the override mechanism is actually needed as often as expected).
- Correlation between viewing Budget vs. Actual (multi-month) and subsequent changes in budget allocation behavior (does multi-month visibility change planning behavior, not just awareness).
- Zero reported incidents of an Analytics figure disagreeing with the equivalent Dashboard/Budgeting/Recurring Income figure it's derived from, for the same period (the same single-source-of-truth trust bar every prior phase's specs have held).
