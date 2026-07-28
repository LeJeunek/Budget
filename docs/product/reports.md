# Product Spec — Reports (Phase 4b)

This document covers Reports, one of the two independent domains in Phase 4b (Notifications v2, `notifications-v2.md`, is the other — the two are dispatchable in parallel per `roadmap.md`'s Phase 4b milestone 1, unlike 4a's five features, which shared one technical foundation and had to be spec'd as a single document).

This is a **product** spec. It does not select a PDF rendering library, does not decide synchronous-vs-scheduled generation, and does not design any schema — those are the Solution Architect + Database Architect's joint 4b architecture pass, bounded by the CTO's stated constraints in `roadmap.md`'s Phase 4b kickoff section. Two constraints from that kickoff pass are binding on everything below and are not revisited here:

1. **Reports must never call `lib/ai/` directly.** The only narrative text anywhere in this feature is the Monthly report's optional, verbatim, read-only reuse of the already-generated, already-reviewed `MonthlySummary.narrative` (Phase 4a, `ai-features.md` Feature 3) — never independently regenerated, and simply omitted (not faked, not replaced with a placeholder apology) when that row's narrative is null. Every other report type is 100% numeric/tabular; none of the six report types has any narrative content of its own.
2. **Every report's numeric/tabular content is independently sourced from the same existing Dashboard/Analytics/Debt/Investment/Budget/Recurring-Income services every other feature already reads from — never from `MonthlySummary.citedFigures`.** That JSON blob is scoped narrowly to what one specific narrative happens to mention (the top 1–2 categories, one largest purchase) and is nowhere near complete enough to serve as a report's data source for any of the six report types, including the Monthly report itself.

## User Story
As a FinanceOS user, I want to generate and download a PDF report of my financial activity — for a specific month, a specific year, or a custom date range — covering income, spending, cash flow, debt, investments, and (for the Monthly report) a plain-language recap of how the month went, so I have a self-contained document I can save, print, hand to an accountant, or review outside the app, instead of screenshotting dashboard pages or manually re-typing numbers elsewhere.

## Business Value
Every number in a FinanceOS report already exists somewhere in the app today — the Dashboard, Analytics, Debt Tracker, Investments, Budgeting. What doesn't exist is a way to take that data *out* of the app in a durable, shareable, presentable form. Per the Roadmap's own framing of this phase's goal, this is the first time a user's financial data leaves the app boundary in a controlled way — a downloadable file a user can archive for their own records, forward to a tax preparer or a partner, or keep for a period after they've stopped actively using the app. This is a distinct value proposition from every prior phase, all of which were about *seeing* data inside the product, never about producing something that exists independently of it.

## Cross-Cutting Product Requirements (apply to all six report types)

1. **Scoped strictly to the authenticated user's own data, always.** No report can be generated or fetched for another user's data by any means, including guessing an identifier for a previously generated report file. This is the same standing bar every domain in this product has been held to since Phase 1, restated here because Reports is the first feature that produces a downloadable artifact rather than only an in-app view — an artifact is one more thing that must not leak.
2. **No independently duplicated numbers.** A figure appearing on a report must match, exactly, the equivalent figure already shown elsewhere in the app for the same period (Dashboard, Analytics, Debt Tracker, Investments, Budgeting, Recurring Income) — the same "single source of truth" discipline this product has held itself to since Financial Goals (Risk #12) and reaffirmed through the Financial Health Score and Monthly Summaries. No report recomputes a metric with new logic just because it's being rendered into a PDF instead of a webpage.
3. **No report generates or paraphrases narrative text of its own.** The Monthly report's optional narrative section (see Report 1 below) is the *only* narrative content across all six report types, and it is a verbatim, read-only lookup of an already-persisted row — never newly composed. Every other report type is exclusively numeric and tabular, by design, per binding constraint 1 above.
4. **A report reflects a live snapshot at generation time, not a persisted, permanent artifact the way `MonthlySummary` is.** Regenerating the same report for the same period a week later may show different numbers if the user has since edited a transaction, added an account, or logged a dividend — this is expected and correct, not a bug, and is a deliberate, stated difference from Monthly Summary's own "generated once, persisted, never silently regenerated" model (`ai-features.md` Feature 3). A report is a document the user actively requests on demand from always-current data, not an automatically scheduled, once-per-period artifact.
5. **Every report clearly states its own type, its covered date range/period, and its generation date/time**, so a user who downloads the same period's report twice, weeks apart, can tell which copy is more current.
6. **A generation failure is honest and recoverable.** If a report cannot be produced (a transient failure, a timeout), the user sees a plain, non-technical message and can retry — never an infinite spinner, a silently corrupted file, or a partially rendered document presented as complete.

## Requesting and Downloading a Report (applies to all six types)

### Acceptance Criteria
1. A user can select a report type from the six defined below, then select the period that report type requires (see each report type's own period-selection rule), then request generation.
2. The UI shows a clear in-progress state while a report is being produced.
3. Once generation completes, the user can download the resulting PDF file. This requirement is written to hold under either a synchronous ("click, wait, get a file") or an asynchronous/scheduled ("click, get notified when it's ready, download from a persistent location") generation approach — that choice is the Solution Architect's, not decided here (see the Roadmap's own note that 4a's proven cron pattern is an available fallback shape if synchronous generation can't fit Vercel's execution-time limits with an acceptably light PDF renderer). Whichever approach is chosen, a user must never lose a completed report by simply navigating away from the page before it finishes.
4. Regenerating a report for a period already generated is always allowed and always reflects current data (per Cross-Cutting Requirement #4) — there is no product requirement to cache or reuse a prior generation's output as though it were the only valid answer for that period.
5. A user can never request or retrieve a report scoped to another user's data, under any circumstance, by any request path.

### Edge Cases
- **A user requests a period before their account existed, or before any of their accounts/transactions existed**: the report generates successfully and shows the relevant "no data for this period" state for each report type (defined per type below), never an error.
- **A user requests a future period that hasn't started yet** (e.g. next month, next year): not offered as a selectable option in the period picker; if requested anyway (e.g. a stale UI state), the system responds with a plain "this period hasn't happened yet" message rather than generating an empty or fabricated report.
- **Generation takes longer than expected**: the in-progress state remains honest and does not silently time out into a broken or half-rendered file.
- **A user requests the same report/period twice in quick succession**: both requests succeed independently (no special deduplication requirement); this is a minor UX/cost concern for the architecture pass, not a correctness requirement.

## Report Types

### Boundary: Yearly Report vs. Tax Summary Report
These two report types cover an overlapping calendar-year window and share some inputs (income by source, expenses by category), so the distinction is stated explicitly, the same discipline `financial-goals.md` used to distinguish itself from `savings-goals.md`: the **Yearly Report** is the comprehensive, whole-picture annual document — net worth, budget discipline, debt, investments, trends — the yearly sibling of the Monthly Report. The **Tax Summary Report** is deliberately narrower and reference-oriented: income and expense totals a user might hand to a tax preparer, explicitly disclaimed as *not* tax advice and *not* a substitute for actual tax categorization (this product has no concept of tax-deductible categories, filing status, or tax-form line mapping — inventing one here would be a new, unreviewed feature, not a reporting concern). A user wanting the full annual picture uses the Yearly Report; a user preparing for tax season uses the Tax Summary Report; the two are not redundant.

---

### 1. Monthly Report
**Period selection**: a single calendar month, past or current. Selecting the current, in-progress month is allowed and is clearly labeled "month to date," mirroring the Dashboard's own MTD labeling convention (`dashboard-overview.md` AC2/AC3).

**Contents**:
- Header: the covered month/year, with an explicit "month to date" flag if the current month was selected.
- Monthly Income, Monthly Expenses, Cash Flow, and Savings Rate for the month (Dashboard's existing monthly figures).
- Net Worth at the start and end of the month, and the change between them (Net Worth Snapshot history).
- Spending by Category for the month, including the Uncategorized bucket (Dashboard/Analytics Expense Distribution).
- Budget vs. Actual for the month, if the user had at least one category allocation set that month (Budgeting) — this section is omitted entirely (not shown as a blank table) for a month with no budget set, mirroring `budgeting.md`'s own "no budget was set this month" read-only-history state.
- **Narrative section**: the verbatim text of that month's `MonthlySummary.narrative`, if it exists — this can only exist for a fully closed month, since `MonthlySummary` is never generated for the current in-progress month (`ai-features.md` Feature 3, AC3). The section is simply omitted, with no placeholder or apology text, when the narrative doesn't exist (not yet generated, generation failed, or the current month was selected) — every numeric section above renders in full regardless, per Cross-Cutting Requirement #3.

**Edge Cases**:
- **Current month selected**: labeled "month to date" throughout; no narrative section is possible or expected.
- **A month with zero transactions recorded**: the income/expense/spending sections state plainly that no activity was recorded, rather than a blank table; the net worth section still renders from whatever account data exists.
- **A user's very first, partial month of usage**: the report generates from whatever activity actually occurred, same partial-month handling Monthly Summary itself already established (`ai-features.md` Feature 3 edge case) — if that month's `MonthlySummary` narrative exists (including a partial-month one), it's included exactly as-is.
- **`MonthlySummary` exists for the month but its narrative is null** (generation failed for that month, per Feature 3's own degraded state): the narrative section is omitted, identically to the "not yet generated" case — the report never distinguishes "failed" from "not yet run" to the user, since neither has anything to show.

---

### 2. Yearly Report
**Period selection**: a single calendar year, past or current (current year clearly labeled "year to date").

**Contents**:
- Annual Income, Expenses, Cash Flow, and Savings Rate, aggregated across the year's months.
- Net Worth at the start and end of the year, and the change between them (Net Worth Snapshot history / Net Worth History).
- A monthly trend of Income vs. Expense across the year (mirroring the Dashboard's Monthly Trends chart, extended to a full calendar year).
- Category Trends for the year (Analytics).
- Top Merchants and Largest Purchases for the year (Analytics).
- Budget vs. Actual across every month in the year that had at least one allocation set (Analytics' multi-month metric) — months with no budget set are simply excluded from this section, not shown as zeroed rows.
- Debt summary: each active debt's current balance, interest rate, minimum payment, and payoff date, as of report generation (Debt Tracker) — explicitly a current-state snapshot, not a "paid this year" historical figure, since Debt Tracker does not track historical monthly interest actually paid.
- Investment summary: portfolio value, cumulative gain/loss, dividend income received during the year, and allocation, as of report generation (Investments).
- Recurring income summary: active income streams and their received-vs-expected activity for the year, if the user has any set up (Recurring Income / Analytics Income Sources).

**Edge Cases**:
- **Current year selected**: labeled "year to date" throughout.
- **A year with zero activity across the board**: an explicit no-data report state, not a blank or broken document.
- **A section with nothing applicable** (a user with no debts, or no investments): that section is omitted with a plain one-line note (e.g. "No debts tracked"), not an empty table presented as if data existed and was zero.
- **A year that predates the user's account**: full no-data state, same as any other report type's out-of-range period.

---

### 3. Tax Summary Report
**Period selection**: a single calendar year, past or current-to-date. FinanceOS has no fiscal-year concept — tax years in this report are calendar years only. Selecting the current, incomplete year is allowed but is clearly labeled as year-to-date and incomplete.

**Disclaimer**: every generated Tax Summary Report prominently displays a disclaimer stating that it is a reference summary of the user's own tracked FinanceOS data — it is **not** tax advice, does not calculate any tax owed or deductibility, and does not map any figure to a specific tax form or line, since this product does not model tax categories, deductibility, or filing status anywhere in its data.

**Contents**:
- Total income for the year, broken down by Recurring Income type/source, including the "Untracked/Other" residual bucket for money-in activity not associated with any tracked income stream (Analytics Income Sources/Income Growth).
- Total expenses for the year, broken down by category, including Uncategorized (Analytics Yearly Spending / Expense Distribution) — presented as a plain reference list for the user's own review, never pre-classified as deductible or non-deductible.
- Investment dividend income received during the year, portfolio-wide and per holding (Investments AC8).
- Investment gain/loss, as of report generation, labeled clearly as **cumulative since acquisition** rather than a "this year" or "realized" figure — this product does not track tax-lot detail, sale events, or realized-vs-unrealized gain (`investments.md`'s explicit Out of Scope), so no report can honestly claim a realized-this-year number that doesn't exist anywhere in the data.

**Edge Cases**:
- **A year with zero income and zero expenses**: explicit no-data state.
- **A user with no investments**: the dividend/gain-loss section is omitted with a plain note, not a zeroed table.
- **The disclaimer is always present**, regardless of how much or how little data the report contains — it is never conditionally hidden.

---

### 4. Income Report
**Period selection**: reuses Analytics' existing shared reporting-period presets (This Year, Last 12 Months, Year-to-Date, All Time, per `analytics.md` AC2), **plus a custom start/end date range** — a deliberate, minor extension beyond Analytics' own period control, called out explicitly rather than silently assumed, since a report a user might hand to a third party or archive often needs an exact range (e.g. "Jan 15 – Mar 20") that doesn't align with any of Analytics' four presets.

**Contents**:
- Total income for the selected period, trended by month (Analytics Income Growth).
- By-source breakdown, including the "Untracked/Other" bucket (Analytics Income Sources).
- A list of individual received income occurrences/events within the period, for users with Recurring Income streams set up (Recurring Income receipt history).

**Edge Cases**:
- **A user with no Recurring Income streams set up at all**: the report still shows total income for the period (entirely in the "Untracked/Other" bucket, sourced from money-in transaction activity) with a plain note that no income sources are individually tracked yet — not an error, not an empty report.
- **Zero income in the selected period**: explicit no-data state.

---

### 5. Expense Report
**Period selection**: same shared presets-plus-custom-range control as the Income Report.

**Contents**:
- Total expenses for the selected period, trended by month (Analytics Yearly Spending / Category Trends).
- By-category breakdown, including Uncategorized (Analytics Expense Distribution).
- Top Merchants for the period (Analytics).
- Largest Purchases for the period (Analytics).

**Edge Cases**:
- **Zero expenses in the selected period**: explicit no-data state.
- **A period predating the user's first transaction**: explicit no-data state, not an error.

---

### 6. Cash Flow Report
**Period selection**: same shared presets-plus-custom-range control as the Income and Expense Reports.

**Contents**:
- Income, Expenses, and Net Cash Flow trended by month across the selected period.
- Cumulative net cash flow across the entire period.
- Savings Rate trended by month across the period, using the same "a month with $0 income is excluded from the average rather than treated as 0%" handling already established by the Dashboard and Analytics (`dashboard-overview.md` AC6, `analytics.md` edge cases).

**Edge Cases**:
- **A month within the range with $0 income**: excluded from the Savings Rate trend/average per existing precedent, but still shown as its own data point in the plain Income/Expense/Cash Flow trend (which has no divide-by-zero concern).
- **Zero activity across the entire selected period**: explicit no-data state.

## Definition of Done
- All six report types generate correctly against realistic fixture data, each covering: a full period with real activity, a partial/current (month-to-date or year-to-date) period, and a zero-activity period.
- The Monthly report's narrative section is verified, by test, to display verbatim when `MonthlySummary.narrative` exists for that month, to be cleanly omitted (no placeholder text) when null, and to never be independently generated or altered — a test verifies there is no code path anywhere in report generation capable of calling `lib/ai/`, the same "verified by construction, not convention" bar established by the AI Budget Advisor's own Definition of Done (`ai-features.md` Feature 2).
- Every numeric figure across all six report types is verified, by test against fixture data, to match the equivalent figure already shown elsewhere in the app (Dashboard, Analytics, Debt Tracker, Investments, Budgeting, Recurring Income) for the same period — zero tolerance for a disagreeing number, the same correctness bar Monthly Summaries, Spending Insights, and the Financial Health Score are all held to.
- A test verifies that no code path in report generation reads from `MonthlySummary.citedFigures` for any report type's numeric content, per binding constraint 2.
- Cross-user report generation and retrieval are verified to be blocked by every request path, including a report previously generated for another user.
- Every "no data for this period" state defined per report type above is verified to render as an explicit, honest empty state rather than a blank, broken, or misleadingly-zeroed document.
- Meets the release-level bar defined in the Project Charter: tests passing, **Security Architect review** (report/download authorization — a user must never be able to generate or fetch another user's report), Performance Engineer review (PDF generation cost/latency, per Risk #5), documentation, and CTO/architecture sign-off.

## Dependencies
- Dashboard Overview v1, Analytics, Debt Tracker, Investments, Budgeting, Recurring Income, Net Worth Snapshot history (all live): the exclusive numeric/tabular source of truth for all six report types.
- Automatic Monthly Summaries (Phase 4a, `ai-features.md` Feature 3): the exclusive, read-only source of the Monthly Report's optional narrative section, per binding constraint 1. Reports has no dependency on `lib/ai/` itself and no AI Engineer involvement.
- PDF generation library and synchronous-vs-scheduled generation approach (Solution Architect's 4b architecture pass): not selected in this document.

## Success Metrics
- Number of reports generated per active user per month, and which of the six report types is used most/least (informs whether all six are pulling their weight, or whether some deserve deprioritization in a future revision).
- Percentage of generation requests that result in an actual download (signal of whether the generation experience is fast/reliable enough not to be abandoned mid-request).
- Zero reported incidents of a report figure disagreeing with the equivalent Dashboard/Analytics/Debt/Investments/Budgeting figure for the same period.
- Zero reported incidents of a user generating or accessing another user's report.
