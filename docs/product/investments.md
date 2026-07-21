# Product Spec — Investments (Phase 3a)

## User Story
As a FinanceOS user, I want to break my investment, retirement, and crypto accounts down into their individual holdings — stocks, ETFs, 401k/IRA positions, crypto — see each one's current value and gain or loss, how my money is allocated across asset types and sectors, how my portfolio has grown over time, and any dividend income it's generated, so I understand what I actually own instead of a single balance number that tells me nothing about performance or risk.

## Business Value
Since Phase 1, an Investment, Retirement, or Crypto Account has only ever shown a single, manually-entered current value (per `accounts.md` AC1/AC7) — useful for Net Worth, useless for understanding performance, diversification, or risk concentration. This feature is the highest-complexity piece of Phase 3a specifically because it introduces real portfolio analysis (allocation, sector concentration, gain/loss, growth over time) on top of what was previously a single number — which is exactly why the Roadmap sequences it first among 3a's backend implementation passes, to surface complexity while there's still schedule slack. It closes the second-largest remaining gap in the user's net worth picture (the first being Debt, this feature's sibling spec) and gives users the kind of "do I actually understand my own money" clarity that a single account balance never could.

**Binding scope note (do not relitigate):** per the Roadmap, this feature is manual entry only — there is no live market data feed, no automatic price lookup, and no ticker-symbol validation against a real market. That decision was made explicitly for the v1 arc and is out of scope to reopen here; every acceptance criterion below is written against that constraint.

## Acceptance Criteria

### Portfolio structure
1. A user's investments are organized under their existing Investment, Retirement, or Crypto Accounts (per `accounts.md`) as containers — e.g. "Fidelity 401k," "Robinhood," "Coinbase." A user setting up their first holding is not required to leave this feature and go create an Account first; the flow to add a holding offers to create the appropriate container Account inline if one doesn't already exist yet (same result, no separate "two places to do the same thing" confusion).
2. Within a container, a user can add a **holding**: a **name/description** (required, free text — e.g. "Apple Inc.," "Vanguard S&P 500 ETF," "Bitcoin" — not required to match a real ticker symbol, since there is no live data to validate against), an **asset type** (required, one of: Stock, ETF, Mutual Fund, Bond, Crypto, Retirement Fund, Other), a **sector** (required for Stock/ETF/Mutual Fund; optional/not applicable for Crypto/Bond/Other — one of a fixed list such as Technology, Healthcare, Financials, Energy, Consumer, Real Estate, Industrials, Other, mirroring the Categories spec's "fixed list plus Other/Uncategorized fallback" pattern), a **cost basis** (required — the total amount originally invested/paid for this holding), and a **current value** (required — the holding's present-day worth, manually entered and kept up to date by the user, exactly as Investment/Retirement/Crypto Account balances are described today).
3. **Deliberately excluded from a holding**: share count and per-share price. Requiring both would force a "quantity × price = value" reconciliation that adds data-entry friction without adding real product value here, and it would recreate exactly the temptation the "manual entry only" decision was meant to close off — once a share count and price exist, the next request is always "auto-fetch the current price," which is explicitly out of scope. Cost basis and current value alone are sufficient for every gain/loss, allocation, and growth calculation in this spec.
4. A user can edit a holding's name, asset type, sector, cost basis, or current value at any time. Every time a holding's **current value** is edited, the system retains a timestamped record of the update (previous value, new value, date) — this history is what populates the historical growth chart (AC7); it is not the same mechanism as the separate, backend-only Net Worth Snapshot job described in the Roadmap, which captures aggregate net worth only, not per-holding detail.
5. A user can mark a holding as **Closed** (e.g. a position was fully sold or a crypto asset fully cashed out) rather than deleting it, consistent with the archive-only pattern used by Accounts, Bills, and Goals — its historical value updates, gain/loss, and dividend history remain intact and reachable, but it drops out of the active portfolio overview and current allocation breakdowns.

### Performance and allocation
6. For each holding and for each container, the system computes and displays **gain/loss**: current value minus cost basis, shown as both a dollar amount and a percentage. Dividend income (AC8) is never folded into this figure — gain/loss reflects value change only, matching the Roadmap's explicit separation of "gain/loss" and "dividend income" as two distinct scope items.
7. A user can view a **historical growth chart**, per holding and aggregated at the portfolio level, built from the timestamped value-update history described in AC4. A holding with only its initial value recorded (never updated since creation) shows a clear single-point/"not enough history yet" state, not a broken or empty chart.
8. A user can log **dividend income** received against a specific holding: an amount and a date. The system aggregates and displays total dividend income per holding, per container, and portfolio-wide, and over a selected time period (e.g. year to date). See the boundary note below distinguishing this from Recurring Income's "dividends" income type.
9. A user can view **allocation** two ways: **asset-type allocation** (percentage of total portfolio value in Stock vs. ETF vs. Crypto vs. Bond, etc.) and **sector allocation** (percentage of total portfolio value by sector, with an "Other" bucket for holdings without a sector, e.g. Crypto/Bond/Other asset types), both computed from current value across all active (non-Closed) holdings.
10. A user can view a **portfolio overview**: total current value, total gain/loss, and total dividend income across every active holding in every Investment/Retirement/Crypto container, as well as broken down per container.

## Edge Cases

- **A holding with current value below cost basis**: shown plainly as a negative gain/loss (unrealized loss), in red or an equivalent clear negative-value treatment — never hidden, floored at zero, or flagged as an error.
- **A holding with no sector applicable** (Crypto, Bond, Other): included in sector allocation's "Other/Not Applicable" bucket rather than breaking the allocation breakdown or being silently excluded from the total.
- **Zero holdings in a container, or zero containers at all**: a clear empty state prompting the user to add their first holding, not a blank or broken portfolio overview.
- **A Closed holding**: excluded from current allocation, portfolio overview totals, and the "active" list, but its historical gain/loss, dividend income, and value-history remain fully viewable in a separate "Closed holdings" view — mirroring how archived Accounts retain their transaction history.
- **Very large or very small cost basis/current value** (e.g. a $5 crypto position alongside a $400,000 401k): validated against the same monetary precision rules as Accounts; allocation percentages must still render legibly for very small holdings rather than a sliver that's impossible to read or interact with.
- **Editing current value to the same value it already was**: still recorded as a value-history entry (a "confirmed no change" data point), so the growth chart reflects that the user did check in on that date, not a gap in history.
- **A dividend logged on a Closed holding**: allowed (dividends can arrive after a position is closed, e.g. a final distribution) — it still counts toward that holding's and the portfolio's total dividend income.
- **Negative cost basis or negative current value entered**: rejected with a validation error, same as Accounts' balance/interest-rate validation pattern.
- **A user with only one container and one holding**: allocation views still render sensibly (100% in a single asset type/sector) rather than looking broken with "only one slice."

## Definition of Done

- Holdings can be created, edited, and marked Closed within any Investment/Retirement/Crypto container, including inline container creation for a user with no existing container.
- Gain/loss, dividend income, asset-type allocation, and sector allocation all compute correctly across mixed active/Closed holdings and across multiple containers.
- Historical growth chart renders correctly from value-update history, including the single-data-point and no-history-yet states.
- Meets the release-level bar defined in the Project Charter: tests passing (including gain/loss and allocation-percentage calculation correctness against fixture data), Security Architect review (holdings and dividend records scoped strictly to the authenticated user), Performance Engineer review (allocation/growth calculations remain responsive with a realistic number of holdings and a long value-update history), documentation, and CTO/architecture sign-off.

## Dependencies

- Accounts (Phase 1): Investment, Retirement, and Crypto Account types already exist; the Account-linkage question below must be resolved by the Database Architect before backend implementation begins (Risk #9) — this spec defines the product behavior each option implies, not the schema.
- Dashboard Overview v1 (Phase 1): Net Worth's existing definition must be extended to include total current value across all active holdings (asset, added — same sign convention already used for Investment/Retirement/Crypto Account balances today). This is the Roadmap's "Net Worth aggregation update" milestone; this spec does not build that update, but the requirement is stated here for whoever does.
- Recurring Income (Phase 3a, sibling spec): see the boundary note below — dividend income appears in both specs with a deliberately different meaning; both specs cross-reference this same explanation.

## Success Metrics

- Percentage of users with an Investment/Retirement/Crypto Account who add at least one holding (adoption/completeness of the net worth picture).
- Average number of holdings per user who has added at least one (signal of real portfolio detail vs. a single token entry).
- Frequency of current-value updates per holding over time (does the feature stay accurate, or go stale after initial setup — directly affects the trustworthiness of the growth chart and Net Worth).
- Percentage of users who view allocation or historical growth at least once per month (adoption of the feature's differentiating value, not just the balance list).
- Zero reported discrepancies between portfolio overview totals and a manual recalculation from individual holdings (same correctness bar as the Dashboard spec).

## Product Requirements for the Account-Linkage Decision (input for the Database Architect — not decided here)

Per `roadmap.md`'s Phase 3a section and Risk #9, the same Account-linkage question raised for Debt Tracker applies here, with an important difference: Investment, Retirement, and Crypto Account **types already exist** and already carry a manually-entered current-value balance (per `accounts.md` AC7) — there is no missing-type asymmetry here the way there is for Debt's loan/mortgage types.

- **The real decision here is narrower than "link or don't link."** Because "portfolio overview... allocation... sector allocation... dividend income" (Roadmap, Phase 3a scope) cannot be represented by a single `Account.balance` figure, a new child-level `Holding` model is required regardless of how the container is modeled. The open question is only: is the container the existing `Account` row, or a new, parallel "Investment" container model?
- **Product Owner's recommendation:** grow the existing Account as the container (do not introduce a second, parallel container concept for something that already exists as Investment/Retirement/Crypto Account types), but change what `Account.balance` *means* the moment a user adds at least one holding to it: once a container has one or more active holdings, that Account's balance should become a **derived, read-only value** — the sum of its holdings' current values — rather than a second, independently-entered number. This mirrors the precedent already set by `BillOccurrence`'s optional Transaction link (`bills.md`, resolved 2026-07-19: "a linked occurrence's paid amount always reflects its linked Transaction's amount... read live via the join, never copied") and avoids the exact "two independently-maintained numbers can drift" problem Savings Goals was designed around.
- **This is an explicit, deliberate opt-in per container, not automatic for every existing Investment/Retirement/Crypto Account the day this feature ships.** A user's existing "Fidelity 401k" Account keeps behaving exactly as it does today (single manually-entered balance, no holdings) until the user takes the deliberate action of adding a holding to it — at which point that Account's balance behavior changes to derived-from-holdings, and the user is told so clearly (e.g. "this account's balance is now calculated from its holdings below").
- As with Debt Tracker, this section states the product behavior each option implies so the Database Architect can design against real requirements; the Database Architect may reach a different, better-justified schema shape, but should treat "no second, independently-maintained balance number for the same container" as a hard product constraint.

## Boundary: Investments' "Dividend Income" vs. Recurring Income's "Dividends" (resolved here, Product Owner)

The Roadmap lists "dividend income" under both this feature and the sibling Recurring Income spec. This is not a conflict — the two track the same real-world cash from two different, complementary angles, and both are needed:

- **Investments' dividend income** (AC8 above) is **performance-record-keeping**, scoped to a specific holding: "this ETF paid $340 in dividends this year," used for that holding's/portfolio's own income and total-return context.
- **Recurring Income's "Dividends" income type** (see `recurring-income.md`) is a **forward-looking recurring income stream** the user optionally sets up to represent their overall expected cash inflow (e.g. "~$500/quarter"), feeding the user's whole-household income picture the same way Salary or Rental Income do.

**These are deliberately not merged or auto-linked in this phase.** A dividend logged against a holding does not automatically create or update a Recurring Income entry, and vice versa. Reasons: (1) Investments' dividend logging is inherently historical/event-based (received on date X, amount Y, from holding Z), while Recurring Income's streams are forward-looking expectations, not necessarily 1:1 with individual receipt events; (2) a diversified portfolio may generate dividends from many holdings that a user thinks of as a single conceptual "dividend income" line for planning purposes — auto-linking per-holding would either force an artificial one-stream-per-holding mapping or a lossy aggregation neither spec is set up to define cleanly today. A user who wants both views simply maintains each independently, the same way Bills' optional Transaction-linking was made optional rather than mandatory specifically to avoid forcing a rigid relationship. This boundary may be revisited post-v1 if real usage shows users want the two connected.

## Out of Scope for Phase 3a

- Live price feeds, ticker validation, automatic dividend detection, or any market-data API integration — manual entry only, per the Roadmap's explicit v1 decision.
- Tax-lot tracking, cost-basis-per-share, wash-sale rules, or any tax-reporting-grade accounting — this feature is for portfolio visibility, not tax preparation (Reports/tax summaries are a distinct, later Phase 4 concern).
- Any "investment growth" Financial Goal type — that is Phase 3b's territory per the Roadmap's 3a/3b boundary (Risk #13), if it is ever added there at all.
