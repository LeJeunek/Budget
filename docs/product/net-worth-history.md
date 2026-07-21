# Product Spec — Net Worth History Chart (Phase 3b)

## User Story
As a FinanceOS user, I want to see how my net worth has actually changed over time — not just what it is right now — so I can tell whether I'm genuinely getting ahead financially or just looking at a single number with no context for whether it's trending up, down, or flat.

## Business Value
Since Phase 1, the Dashboard's Net Worth stat card has only ever shown a single point-in-time figure (`dashboard-overview.md` AC1). A number with no trend is unsatisfying and, worse, untrustworthy — a user paying down debt and growing their portfolio has no way to *see* that progress today, only to remember it or take it on faith. This chart is the payoff of a decision made a full phase earlier: the Net Worth Snapshot job has been quietly capturing data since the moment Phase 3a's Debt/Investment aggregation went live (`roadmap.md` Risk #10), specifically so this chart wouldn't launch empty. Per the Roadmap's Phase 3b build order, this ships first — smallest scope, highest visual payoff, and the only 3b feature whose data has already been accumulating in the background. Getting this one right (in particular, handling the sparse-history reality honestly rather than pretending it isn't there) sets the tone for how the rest of the Analytics suite treats "still building history" states.

## Scope Decisions (resolved here, Product Owner)

- **Snapshot cadence: once per calendar day, per user.** This wasn't nailed down by the Phase 3a architecture pass (`api-contracts.md`'s Net Worth Snapshot section explicitly left "the actual cadence" as "a product/ops call, not an architecture one") but it directly determines what "30/90/365 days" means as a chart range, so it's resolved here: **daily**, matching the schema's existing `@@unique([userId, capturedDate])` idempotency guard.
- **Breakdown depth: two components, not three.** `NetWorthSnapshot` (per `er-diagram.md`) stores exactly `totalAccountBalance` and `totalUnlinkedDebtLiability` per day — it does **not** store a separate historical investment-only total, because Investment/Retirement/Crypto `Account.balance` is folded into the ordinary account-balance sum via Investments' derived-balance write-back (`Architecture.md`'s Phase 3a design). A three-way historical split (cash/bank vs. investments vs. debt) is **explicitly out of scope for this chart** — building it would require a new snapshot field capturing history no row before that field's introduction would ever have, and the Roadmap's own "smallest scope, highest visual payoff" framing for this milestone argues against it. The breakdown this chart offers is **Assets** (`totalAccountBalance` — includes cash, investments, everything non-debt) vs. **Debt** (`totalUnlinkedDebtLiability`). This may be revisited in a later phase if real usage specifically asks for an investment-only historical line; it is a deliberate "not this release" decision, not an oversight.

## Acceptance Criteria

1. The Dashboard shows a **Net Worth History chart**, plotting one point per day of captured `NetWorthSnapshot` data, with the net worth value on the y-axis and date on the x-axis.
2. A **time range selector** offers four options: **30 Days, 90 Days, 1 Year, All Time**. Selecting a range filters the chart to snapshots within that window; it never hides or disables an option based on how much history actually exists (a confusing greyed-out control is worse than a range that simply shows the same sparse data as a shorter one).
3. **Default range on load**: if the user's earliest snapshot is less than 90 days old, the chart defaults to **All Time** (so a new-to-this-feature user immediately sees everything that exists, rather than a mostly-empty 90-day window with a handful of points crowded at one edge). Once the user has 90 or more days of history, the default becomes **90 Days**.
4. **Sparse-history state**: for any user whose full history spans fewer than 14 days, the chart renders whatever points exist (even a single point, shown as a single dot/flat marker, never a broken or blank chart) alongside a clear, non-blocking message — e.g. "Building your net worth history — N days tracked so far. Check back daily to see your trend take shape." This is expected, temporary, and informational, not an error state.
5. **Breakdown toggle**: a user can switch the chart from its default single **Net Worth** line to a breakdown view showing **Assets** and **Debt** as two additional series (e.g. two lines, or a single stacked/combo view), sourced from the same snapshot rows already being read — no additional query concept, no separate historical investment line (see Scope Decisions above).
6. **Hover/inspect**: hovering or tapping a point on the chart shows that day's exact date and value(s) (net worth alone, or all three figures when the breakdown view is active).
7. **Legibility across all ranges**: the chart must remain readable at every range option, including **All Time** for a long-tenured user with a year or more of daily points — a busy year of daily dots must not become an unreadable smear of overlapping markers; whatever level of point-thinning or grouping is needed to keep it legible at longer ranges is a Solution Architect/Frontend Lead implementation decision, but the user-facing outcome (a readable trend line at every range, with no manual zooming required to make sense of it) is binding.
8. **Gaps in captured history** (e.g. a missed cron invocation on a given day) are handled by simply not plotting a point for that day and connecting the surrounding points — never by fabricating an interpolated value for the missing day and never by breaking the chart's line.
9. **"As of" labeling**: since the most recent snapshot may be from earlier the same day (or the previous day, depending on cron timing), the chart's most recent point is labeled with the date it represents (e.g. "as of Jul 21") rather than implied to be a live, real-time figure — it is expected, and not a bug, if a user has since added a transaction or edited an account balance and the current Dashboard Net Worth stat card shows a slightly different number than the chart's latest point.
10. All chart data is scoped strictly to the authenticated user's own snapshot history.

## Edge Cases

- **Zero snapshots yet** (a brand-new user who signs up after Phase 3b ships but hasn't had an account for even one full day yet): a clear empty state — "Your net worth history will start appearing here once you've had at least one account for a day" — not a blank chart or an error.
- **Exactly one snapshot**: rendered as a single point, not a broken line chart with nothing to draw between two coordinates.
- **Negative net worth** (heavy debt): plotted plainly on a y-axis that extends below zero, exactly like the existing Dashboard Net Worth card already displays negative figures — never clipped at zero or hidden.
- **A single-day net worth swing** (e.g. a large debt payoff, or a big one-time deposit): shown plainly as a visible jump/drop in the line — never smoothed or clipped to make the trend look artificially gradual.
- **A past snapshot's numbers never change**, even if a future phase extends the Net Worth formula itself (e.g. adds a new asset/liability category) — per the Database Architect's design (`er-diagram.md`, Phase 3a design note #6: "each row is a frozen statement of what the formula produced on this day"). If the formula is ever extended, the chart may show a visible "step" on the day that change ships. This is expected and correct, not a bug to chase down.
- **Selecting a longer range (e.g. 1 Year) than the user actually has history for**: shows exactly the history that exists (e.g. three weeks' worth) with the sparse-history messaging from AC4 rather than padding the chart with fabricated empty months.
- **Breakdown toggle with $0 debt**: renders correctly as a flat zero line for the Debt series, not an error or a missing series.

## Definition of Done

- Chart renders correctly across zero, one, few (sparse), and many (a year-plus) data-point scenarios, including every range selector option.
- Default-range logic (AC3) and sparse-history messaging (AC4) both verified against fixture data representing a just-shipped user and a long-tenured user.
- Breakdown toggle (Assets vs. Debt) computes and renders correctly, including a $0 debt case and a negative-net-worth case.
- Date-range boundary calculations (30/90/365-day windows, computed in UTC, consistent with this codebase's existing UTC-date convention) are covered by tests, not just eyeballed.
- Meets the release-level bar defined in the Project Charter: tests passing (including range-boundary and breakdown-math correctness), Security Architect review (snapshot history scoped strictly to the authenticated user), Performance Engineer review (per Risk #11 — a year-plus of daily points must remain a responsive query and render), documentation, and CTO/architecture sign-off.

## Dependencies

- **Net Worth Snapshot data** (Phase 3a, backend-only, already live and accumulating per Risk #10's mitigation) — this chart is a pure read layer over that existing table; no new data-capture work is requested by this spec.
- **Debt Tracker and Investments** (Phase 3a): indirectly, in that they're already folded into the two snapshot components (`totalAccountBalance`, `totalUnlinkedDebtLiability`) this chart reads — no additional integration work with either feature is required here.
- **Dashboard Overview v1's existing Net Worth stat card** (Phase 1): this chart is a companion to, not a replacement for, that existing card; the two must visually agree (see AC9's "as of" labeling for the one legitimate, expected case where they can momentarily differ).

## Success Metrics

- Percentage of users who view the Net Worth History chart at least once per month (adoption of the feature's core value — trend visibility, not just a static number).
- Percentage of sessions where a user switches the time range selector or the breakdown toggle at least once (does the interactive depth actually get used, not just the default view).
- Zero reported discrepancies between the chart's most recent point and the Dashboard's Net Worth stat card, outside the explicitly expected "as of" same-day-edit case (AC9).
- Qualitative signal: users citing the chart (in support/feedback channels) as the reason they noticed real financial progress — the same kind of trust-building outcome the Dashboard spec's own success metrics track for its stat cards.
