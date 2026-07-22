# Product Spec — AI Features (Phase 4a)

This document covers all five Phase 4a features as one cohesive spec, per `roadmap.md`'s framing that they "share one technical foundation and one review theme" rather than being independently dispatchable domains (unlike 3a's three parallel domains). Each feature below still gets its own full User Story / Business Value / Acceptance Criteria / Edge Cases / Definition of Done / Dependencies / Success Metrics, matching every prior phase's spec pattern (`financial-goals.md`, `debt-tracker.md`).

This is a **product** spec. It does not select an LLM/AI provider, does not design `lib/ai/`'s module boundaries, and does not specify prompt text or Zod schemas — those are the Solution Architect + AI Engineer's joint architecture pass, bounded by the CTO's stated constraints in `roadmap.md`'s Phase 4a section. Where this document says "the system suggests/generates/computes," the *how* (which model, what prompt, what caching strategy) is deliberately left to that pass.

## Cross-Cutting Product Requirements (apply to all five features below)

These are stated once here, and then restated as a concrete edge case within each feature's own Edge Cases section per this phase's review requirement — not left to be inferred generically.

1. **Graceful degradation is mandatory, everywhere, always.** Per Risk #2, every AI-dependent surface in this product must have a defined, non-broken appearance when the AI provider is unavailable, times out, or returns output that fails structured-output validation. The product-level rule is simple and consistent across all five features: **the rest of the page must always keep working**, and the affected surface shows a plain, honest, non-technical message (e.g. "Insights aren't available right now") with no error stack, no broken layout, and no silent infinite loading spinner. A user must never be blocked from viewing their own Dashboard, Budgeting, or Transactions data because an AI feature failed.
2. **No fabricated figures, ever.** Every number an AI-generated feature references (a dollar amount, a percentage, a date, a category name) must be traceable to a number this product already computes elsewhere (Dashboard, Budgeting, Analytics, Debt Tracker, Recurring Income). None of these five features is a new computation engine; four of the five (Advisor, Summaries, Insights, and the Health Score's narrative layer) are a narration layer *on top of* existing computed data. Only the Health Score's numeric formula itself performs new computation, and it is deterministic arithmetic, not an AI judgment (see its dedicated section below).
3. **AI-generated content is visually distinguished from computed facts.** Anywhere AI-authored text appears (a suggestion, an advisor recommendation, a summary paragraph, an insight callout, a Health Score narrative), the UI marks it as AI-generated (a small label/icon is sufficient) so a user never mistakes a generated sentence for a verified, audited number the way they'd treat a Dashboard stat card. This keeps user trust calibrated correctly: numbers are facts, narratives are assistance.
4. **Data minimization is a product requirement, not just a technical one.** No feature in this document requires sending a user's full transaction history, account numbers, or another user's data to a third-party model to function. Each feature's Acceptance Criteria below states plainly what data it actually needs (e.g. auto-categorization needs a merchant string and a category list, not an account balance).
5. **Untrusted text stays untrusted.** Per Risk #2, merchant names, transaction notes, and user-authored category/debt/goal names are all treated as untrusted input wherever they flow into an AI feature. The product-level containment rule, restated per feature below: AI output is always constrained to a closed, safe set of possibilities (an existing category ID, a number derived from existing data) — never free-form instructions the AI "decides" to act on, and never an action taken automatically on the user's data without an explicit accept step (see Feature 1).

---

## Feature 1: Transaction Auto-Categorization

### User Story
As a FinanceOS user, I want the app to suggest a category for transactions I haven't categorized yet — especially right after a CSV import dumps in a hundred new rows — so I don't have to manually categorize every single transaction by hand, while still having the final say over every categorization myself.

### Business Value
Uncategorized transactions quietly undermine every downstream feature that depends on categories: the Dashboard's Spending by Category chart, Budgeting's Spent totals, and Analytics' Category Trends all show an "Uncategorized" bucket that's really just unfinished user work. CSV import (Phase 1) already assigns a category automatically only when the file's own category text happens to match an existing category name exactly (`transactions.md` AC20) — everything else lands as Uncategorized and stays that way until a user manually fixes it. Auto-categorization directly reduces that backlog, and per the Categories spec's own tracked metric ("percentage of transactions left permanently Uncategorized"), this is the first feature aimed squarely at improving a number the product has been measuring since Phase 1.

### Product Rule: When a Suggestion Is Offered, and How It's Accepted or Rejected

This is the load-bearing rule for this feature, stated once here so every acceptance criterion below can simply reference it.

- **Automatic suggestions are offered only for transactions that are currently Uncategorized** — never never for a transaction that already has a category, whether that category was set manually by the user, set by a prior accepted suggestion, or set automatically by CSV import's exact-name match. This is the concrete mechanism behind the roadmap's "never silently overwrite a user's own prior categorization" requirement: the system simply never generates an automatic suggestion for a transaction that isn't Uncategorized, so the "silently overwrite" failure mode is structurally impossible for the automatic path, not just policy-blocked.
- **A "reconsider" path exists, but it is user-initiated, not automatic.** Any transaction — including one that's already categorized — can have the user explicitly request "Suggest a category" (e.g. a small action in the transaction's row/detail view). This covers the case of a user who categorized something quickly and wants a second opinion, without the system ever pushing an unsolicited suggestion onto a transaction the user already made a decision about.
- **Accepting** a suggestion sets the transaction's category to the suggested one. From that moment on, it is functionally identical to any manually-categorized transaction (including for the purposes of the rule above — it will not be automatically re-suggested).
- **Rejecting** a suggestion leaves the transaction Uncategorized and dismisses that specific suggestion; the system does not immediately re-offer the same suggestion for the same transaction. A user may still use the manual "suggest a category" action on it again later (e.g. after adding more transaction history that might change the outcome).
- **Suggestions never auto-apply.** There is no configuration or setting in this phase that categorizes transactions without an explicit user accept action, for any transaction, ever.

### Acceptance Criteria
1. A newly imported (CSV) or manually entered transaction that lands as Uncategorized becomes eligible for an automatic category suggestion; the suggestion becomes visible to the user without requiring them to take any action to request it (the underlying generation trigger/timing — real-time vs. batched shortly after import — is an architecture decision within the CTO's cost/latency-bounding constraint, not specified here).
2. A suggestion is always one of the user's own existing categories (a system starter category or one of their own custom categories) — the feature never invents a new category name or suggests creating a new category. Category creation remains a manual user action per `categories.md`.
3. A suggestion is shown inline (e.g. a "Suggested: Groceries" badge on the transaction row/detail) with clear Accept and Reject actions, distinct from the transaction's actual (currently unset) category field.
4. Accepting a suggestion sets the transaction's category immediately, matching the same underlying category-assignment behavior as a manual edit (`transactions.md` AC9) — this feature does not introduce a second, parallel categorization mechanism.
5. Rejecting a suggestion clears the visible suggestion and leaves the transaction Uncategorized; per the Product Rule above, the same suggestion is not immediately re-offered automatically for that transaction.
6. A user can manually request a fresh suggestion ("Suggest a category") for any transaction, including ones that are already categorized (the "reconsider" path) — this action never changes the transaction's category on its own; it only surfaces a new suggestion for the user to accept or ignore.
7. After a CSV import that leaves multiple rows Uncategorized, the user can review and accept/reject suggestions across that batch without navigating to each transaction individually one at a time (e.g. a review list scoped to that import's newly Uncategorized rows).
8. Split transactions: a suggestion may apply to an individual split line item that has no category set, using that line item's own merchant/amount context; it is never offered for a split-parent row, whose `amount` is purely informational (`transactions.md` AC14).
9. Suggestions are scoped strictly to the authenticated user's own transactions and categories — never generated using or against another user's data.

### Edge Cases
- **AI provider unavailable, times out, or returns output that fails structured validation**: no suggestion is shown for the affected transaction(s); the transaction simply displays as Uncategorized, exactly as it would if this feature didn't exist. A user who explicitly requests a suggestion (the manual "reconsider" action) and hits this case sees a plain, non-blocking message ("Couldn't generate a suggestion right now — try again later"), not an error page or a stuck loading state. The transaction table, filters, and every other Transactions function remain fully usable throughout.
- **Low-confidence suggestion**: the system is not required to surface a suggestion at all if it cannot produce one it has reasonable confidence in — a transaction with no suggestion shown is simply Uncategorized, the same as if generation had never run, rather than showing a guess likely to be wrong.
- **A merchant name (or transaction note) containing embedded/adversarial instructions** (e.g. text designed to look like an instruction rather than a merchant name): treated as inert, untrusted display text. Per the Cross-Cutting Product Requirements above, the only possible output of this feature is one of the user's own existing category IDs — there is no way for adversarial input to cause any other outcome (no arbitrary text output, no action beyond proposing a category, nothing written to the database without an explicit user accept).
- **The suggested category is deleted between suggestion generation and the user viewing/accepting it**: the suggestion is invalidated and the transaction shows as plain Uncategorized with no suggestion, rather than allowing acceptance of a category that no longer exists.
- **A user with only the 11 system starter categories and no custom categories**: suggestions still work normally against that set.
- **A very large CSV import (hundreds of rows, many Uncategorized)**: the review experience (AC7) must remain usable for a large batch — a bulk accept-all/reject-all affordance or a scrollable per-row review list, not a one-transaction-at-a-time-only flow that would be impractical at volume. The exact call-volume/batching strategy behind this is an architecture concern (per the CTO's "no unbounded per-request fan-out" constraint), not specified here.
- **A user rejects the same category suggestion repeatedly across many transactions from the same merchant**: no product requirement to suppress future suggestions for that merchant in this phase (that kind of merchant-level "don't suggest this again" memory, if desired, is a future enhancement, not required for Phase 4a) — each transaction's suggestion/rejection is independent.

### Definition of Done
- Accept/reject flow works end to end and is verified, by test, to never write a category to a transaction without an explicit accept action.
- Automatic suggestions are verified, by test, to never be generated for a transaction that already has a category set (the core "never silently overwrite" rule), while the manual "reconsider" action is verified to work on already-categorized transactions.
- Suggestion output is verified, by test with adversarial fixture merchant/notes text, to always resolve to either a valid existing category ID belonging to the requesting user, or no suggestion at all — never an arbitrary string, a new category, or another user's category.
- The AI-unavailable/timeout/invalid-output path is verified to leave the transaction table fully functional with no broken UI state.
- Split-line-item suggestion behavior is verified separately from split-parent exclusion.
- Meets the release-level bar defined in the Project Charter: tests passing, **design-stage and pre-release Security Architect review** (prompt-injection handling per Risk #2, structured-output validation, category-ID-only output boundary), Performance Engineer review (batch suggestion generation cost/latency), documentation, and CTO/architecture sign-off.

### Dependencies
- Transactions (Phase 1): the feature only ever acts on existing Transaction rows and their merchant/notes fields.
- Categories (Phase 1): suggestions are drawn exclusively from the user's own existing category list (system + custom); this feature has no ability to create categories.
- CSV Import (Phase 1): the primary source of newly-Uncategorized batches this feature targets.
- `lib/ai/` provider integration (Solution Architect + AI Engineer's 4a architecture pass): this feature establishes the reusable prompt/structured-output/validation pattern the other four features build on, per the roadmap's stated build order.

### Success Metrics
- Percentage of newly-Uncategorized transactions that receive a suggestion the user accepts within 30 days (adoption and accuracy signal together).
- Suggestion rejection rate (signal of categorization quality; a rising rejection rate over time would indicate the suggestion quality needs attention).
- Percentage reduction in the "percentage of transactions left permanently Uncategorized" metric already tracked by `categories.md`, measured before vs. after this feature's release.
- Zero reported incidents of a transaction's category being changed without an explicit user accept action.

---

## Feature 2: AI Budget Advisor

### User Story
As a FinanceOS user looking at my Budgeting page, I want a short, plain-language read on how my month is actually going against my plan — which categories need attention, whether I'm overall on track — so I get a quick, digestible read on my budget discipline without having to mentally compare a dozen rows of Allocated/Spent/Remaining myself.

### Business Value
Budgeting (Phase 2) already gives a user every number they need (per-category Allocated/Spent/Remaining, the Budget Health Score), but reading a full table of a dozen-plus categories and forming a judgment about "what actually matters this month" is real cognitive work the raw numbers don't do for the user. Per the roadmap's own framing, this is explicitly a **read-only insight layer on top of existing Budgeting data**, not a new computation and not a conversational feature — the value is turning numbers the user could already see into 2–3 plain sentences highlighting what's actually worth their attention this month.

### What This Looks Like (concrete UI surface)
A **read-only advisor card** on the Budgeting page (current month view only — see Edge Cases for past months), showing **1 to 3 short recommendations**, each 1–2 sentences, each grounded in that month's actual Allocated/Spent/Remaining figures already shown elsewhere on the same page. This is explicitly **not** a chat interface: there is no free-form text input for the user to ask the advisor questions in this phase. The only user interaction is viewing the card, optionally refreshing it, and optionally collapsing/dismissing it.

### Acceptance Criteria
1. The advisor card appears on the Budgeting page for the current month once the user has at least one category with an allocation set for that month — mirroring the same "zero allocations" gating already established for the Dashboard's Budget Health Score (`budgeting.md` AC12).
2. The card shows between 1 and 3 recommendations. Each recommendation is a short natural-language statement plus, where applicable, a concrete suggestion (e.g. "Dining is at 92% of its allocation with 9 days left in the month — consider slowing down there for the rest of the month," or "Entertainment has $80 unused this month while Groceries is $60 over — you could reallocate some of that buffer next month").
3. Every recommendation is traceable to actual Allocated/Spent/Remaining figures for that month, visible elsewhere on the same Budgeting page — the advisor never references a number that isn't independently derivable from that same page's data.
4. There is no conversational/follow-up question input in this phase; the only user actions available are viewing, an explicit "Refresh recommendations" action, and collapsing/dismissing the card (a UI display preference, not a data-deleting action).
5. The card only ever surfaces on the **current, editable month** (per `budgeting.md` AC3's past/current/future month distinction) — past months are read-only history and do not get fresh advisor recommendations generated against them.

### Edge Cases
- **AI provider unavailable, times out, or returns unusable output**: the card shows "Budget advice isn't available right now" with a retry action; the rest of the Budgeting page (the full category table, allocations, Budget Health Score) renders and functions completely normally regardless.
- **Zero categories with an allocation set for the current month**: the advisor card does not render at all (same empty-state pattern as the Budget Health Score's own "no budget set" placeholder), rather than attempting to generate advice from nothing.
- **Every budgeted category is comfortably within allocation, nothing notably over/under**: the card shows a plain, positive, low-urgency message (e.g. "You're on track across all your budgeted categories this month") rather than manufacturing a negative-sounding recommendation where none is warranted.
- **A recommendation would require a number not shown elsewhere on the page**: not allowed — the advisor is strictly a narrative layer over Budgeting's existing Allocated/Spent/Remaining/Budget-Health-Score data; if a recommendation can't be grounded in that data, it isn't shown.
- **A custom category name (or the notes/merchant text underlying a category's Spent total) contains adversarial/injected text**: treated as inert, untrusted text; the advisor is strictly read-only against Budgeting data — it has no ability to write, edit, or reallocate a budget on the user's behalf under any circumstance, regardless of what any input text says.
- **A user with exactly one budgeted category**: the advisor still functions using just that category's data; no minimum category count is required.
- **Recommendations that would be identical to what the Budget Health Score band already conveys**: acceptable — some overlap in message ("you're doing well overall") is expected and not treated as a defect; the advisor's value is the specific, worded call-out (which category, by how much), not novelty for its own sake.

### Definition of Done
- The card renders the correct number of recommendations (1–3) and every recommendation is verified, by test against fixture Budgeting data, to reference only figures that match that same fixture data exactly — no fabricated numbers.
- The zero-allocation empty state and the all-categories-on-track positive state are both verified.
- The AI-unavailable path is verified to leave the rest of the Budgeting page fully functional.
- A test verifies the advisor has no code path capable of writing to Budget/BudgetCategory data — it is read-only, by construction, not just by convention.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (prompt-injection handling, no write capability), Performance Engineer review (refresh cost/caching), documentation, and CTO/architecture sign-off.

### Dependencies
- Budgeting (Phase 2): the sole data source for every recommendation; this feature has no data model of its own beyond generated recommendation text and its refresh/cache state.
- Transaction Auto-Categorization (this document, Feature 1): establishes the reusable AI/structured-output pattern this feature reuses, per the roadmap's stated build order.

### Success Metrics
- Percentage of active Budgeting users who view the advisor card at least once per month (adoption).
- Refresh-action usage rate (signal that users return to check updated advice, not just see it once and ignore it).
- Correlation between viewing a recommendation about a specific category and a subsequent allocation change or reduced spend in that category the following month (does the advice change behavior, the same outcome-focused bar Budgeting itself is held to).
- Zero reported incidents of an advisor recommendation citing a figure that disagrees with the Budgeting page's own displayed numbers for the same month.

---

## Feature 3: Automatic Monthly Summaries

### User Story
As a FinanceOS user, I want a short, plain-language recap of how my last month went — income, spending, savings, and anything notable — generated automatically once the month closes, so I get the "so what" of a month's activity without having to piece it together myself from the Dashboard and Analytics.

### Business Value
The Dashboard already shows a user's current-month numbers, and Analytics lets a user dig into history, but neither one hands a user a finished, readable narrative of "how did last month go" — a user has to do that synthesis themselves. A monthly recap is a natural, low-effort re-engagement moment (a reason to open the app at the start of a new month) and, per this document's cross-cutting requirement, it must never contradict a number the user can already see on the Dashboard or Analytics for that same month — it is a narration of already-computed facts, not a second source of truth.

### What This Summarizes, Exactly
The summary is grounded **strictly** in figures this product already computes for a completed calendar month, sourced from the same services the Dashboard and Analytics already use — no new aggregation is introduced for this feature:
- Monthly Income, Monthly Expenses, Cash Flow, and Savings Rate for that month (the Dashboard's own existing monthly aggregates).
- The change in Net Worth over that month (using the Net Worth Snapshot history from Phase 3a — the same data source Net Worth History's chart already uses).
- The top 1–2 spending categories by amount or by notable change (sourced from Analytics' existing Category Trends / Expense Distribution — not recomputed here).
- Optionally, the single largest individual purchase of the month (sourced from Analytics' existing Largest Purchases metric).

### When It's Generated, and Where It's Surfaced
Generated as a **monthly batch job**, mirroring the Net Worth Snapshot precedent from Phase 3a (`roadmap.md`'s Risk #10 reasoning) rather than as a live, on-demand computation: once a calendar month closes, a summary is generated for that just-completed month, once per user per month, and **persisted** — it is not regenerated on every view, so the same text is shown every time that month's recap is opened (the same non-recompute permanence Net Worth Snapshot already established). The most recent completed month's summary is surfaced as its own card on the Dashboard (e.g. "Your July Recap"); a full history of every past month's summary is browsable elsewhere (e.g. alongside Analytics), each entry read-only once generated.

### Acceptance Criteria
1. A natural-language summary is generated once for each calendar month, after that month has fully closed, for every active user, grounded strictly in the data listed above.
2. The generated summary is persisted and does not regenerate on each view; the same text displays every time that month's recap is opened, for as long as the summary exists.
3. The current, in-progress month never has a generated summary — only fully closed months are summarized, mirroring Budgeting's own past-vs-current-month distinction (`budgeting.md` AC3).
4. The most recently completed month's summary is surfaced on the Dashboard as its own card.
5. A history of all past monthly summaries is browsable by the user.
6. Every number referenced in a summary's text matches, exactly, the equivalent figure already shown on the Dashboard or Analytics for that same month — zero tolerance for a contradicting figure, the same trust bar Analytics' own spec holds itself to for its relationship with the Dashboard.

### Edge Cases
- **AI provider unavailable, times out, or returns unusable output at the scheduled generation time**: the batch job's retry policy is an architecture decision, but if generation ultimately does not succeed for a given month, the Dashboard/history shows an explicit "Summary not available for [Month]" state for that month — never a blank space, a broken card, or a silently missing month with no explanation.
- **A user's very first month of usage, especially if they signed up mid-month**: if that partial month has any transaction activity, a summary is generated for the activity that actually occurred, explicitly noting it covers a partial month rather than implying a full month passed. If the user signs up after that month's batch job has already run, no summary is fabricated for the days they weren't present; their summary history begins with their first fully-closed month.
- **A month with zero transactions recorded at all**: the summary explicitly states no activity was recorded for that month, not a fabricated narrative or a blank/empty entry presented as if generation had failed.
- **A month with an unusually large one-time event** (e.g. a large transfer, a big investment gain/loss affecting Net Worth change): the summary narrates the number exactly as computed elsewhere (e.g. "your net worth changed by $X this month") without speculating on causes the underlying data doesn't actually support.
- **Retroactive edits to a transaction dated within an already-summarized past month** (e.g. the user corrects a two-months-ago transaction after that month's summary already generated): the persisted summary text is **not** automatically regenerated — this is an accepted, stated limitation mirroring this product's existing "past months are not retroactively recalculated" precedent (Debt Tracker, Investments). A user-triggered "regenerate this summary" action may optionally be offered so this isn't a permanent dead end, but automatic silent regeneration is out of scope.
- **A merchant name referenced in the "largest purchase" or "top category" callout contains adversarial/injected text**: treated as inert, untrusted display text; the summary generation process only ever narrates numeric/categorical data already computed by the Dashboard/Analytics services — it has no ability to take any action or output anything beyond narrative text about that data.

### Definition of Done
- Summary content is verified, by test against fixture Dashboard/Analytics data, to reference only figures that match that fixture data exactly for the same month — no fabricated numbers, checked the same way Feature 2's advisor is checked.
- The once-per-closed-month, persisted-not-regenerated generation behavior is verified.
- The partial-first-month and zero-activity-month states are both verified.
- The "Summary not available for [Month]" degraded-state path is verified to display correctly and not block any other part of the Dashboard or history view.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (no cross-user data in generation, prompt-injection handling for merchant/category text), Performance Engineer review (this is a batch job, not a per-page-view cost — verify it stays that way), documentation, and CTO/architecture sign-off.

### Dependencies
- Dashboard Overview v1 (Phase 1): Monthly Income/Expenses/Cash Flow/Savings Rate are this feature's primary grounding data.
- Net Worth Snapshot history (Phase 3a): required for the Net Worth change figure.
- Analytics (Phase 3b — Category Trends, Expense Distribution, Largest Purchases): required for the top-category and largest-purchase callouts; this feature does not recompute any of these, it only narrates their existing output.
- Transaction Auto-Categorization (this document, Feature 1): establishes the reusable AI/structured-output pattern this feature reuses.

### Success Metrics
- Percentage of active users who view their monthly recap within 7 days of it becoming available (adoption as a habitual re-engagement moment).
- Percentage of months for which a summary was successfully generated vs. shown as "not available" (technical reliability signal, mirrors CSV import's own tracked success-rate metric).
- Zero reported incidents of a monthly summary's stated figures disagreeing with the Dashboard's or Analytics' own figures for the same month.

---

## Feature 4: Spending Insights

### User Story
As a FinanceOS user, I want to be shown a handful of specific, notable observations about my spending patterns — not just raw charts I have to interpret myself — so that something like "you're spending 20% more on Dining than your usual" surfaces on its own instead of requiring me to notice it by scanning Analytics.

### Business Value
Analytics (Phase 3b) already computes rich pattern-level data — Category Trends, Top Merchants, Subscription Cost Detection, the Daily Spending Heatmap, Savings Growth — but a user has to actively browse each metric to notice anything unusual. Spending Insights is explicitly an AI **narrative layer on top of Analytics' already-computed data**, per the roadmap's framing — it selects and phrases the 2–4 most notable observations from data that already exists, rather than computing anything new.

### Concrete Example Insight Types
Each of the following is grounded in an Analytics metric that already exists — this feature only selects which ones are worth surfacing this period and phrases them in plain language:
- **Category trend call-out**: "Spending in Dining is up 20% this month compared to your 3-month average" (sourced from Category Trends).
- **Notable merchant spend**: "Your highest single spend this period was $340 at [Merchant]" (sourced from Largest Purchases) or "You spent more at [Merchant] than anywhere else this period" (sourced from Top Merchants).
- **Multi-month trend**: "Groceries spending has increased for 3 months in a row" (sourced from Category Trends' multi-month series).
- **Subscription change**: "A new recurring charge was detected: ~$15/month at [Merchant]" or "[Merchant]'s subscription looks possibly cancelled — no charge has landed in a while" (sourced from Subscription Cost Detection's Active/Possibly Cancelled status).
- **Day-of-week/date pattern**: "You tend to spend noticeably more on weekends" (sourced from the Daily Spending Heatmap).
- **Savings behavior**: "You saved more this period than your recent average, even after accounting for investment gains" (sourced from Savings Growth).

### Acceptance Criteria
1. An Insights widget presents between 2 and 4 concise, natural-language observations per refresh, each grounded in and traceable to a specific existing Analytics metric — never a computation introduced only for this feature.
2. Each insight names the concrete figure it's based on (a percentage, a dollar amount, a merchant/category name) rather than a vague statement with no backing number.
3. Insights prioritize what's most notable for the current period (largest percentage change, largest dollar swing, a newly-detected or newly-possibly-cancelled subscription) rather than a fixed list that always covers the same categories regardless of what actually happened.
4. A user can refresh insights on demand, at a rate bounded by the architecture pass's cost/latency constraints (exact limit is not a product-level decision).
5. Insights respect the same reporting-period control Analytics already defines (`analytics.md`'s shared "reporting period control") when surfaced on the Analytics page; when surfaced on the Dashboard, they default to the current month vs. the prior comparable period — no separate, competing period concept is introduced.

### Edge Cases
- **AI provider unavailable, times out, or returns unusable output**: the widget shows "Insights aren't available right now"; the rest of the Dashboard/Analytics page renders and functions completely normally.
- **Insufficient history for any meaningful comparison** (e.g. a brand-new user with less than a month of data): the widget shows "not enough data yet for insights," mirroring Analytics' own established per-metric "not enough data" precedent, rather than an empty or fabricated insight.
- **All underlying metrics show unremarkable, flat activity**: the widget shows a plain, low-key neutral/positive message ("no unusual spending patterns this period") rather than manufacturing an insight out of noise.
- **A specific source metric has nothing to report** (e.g. Subscription Cost Detection currently shows zero detected subscriptions for this user): that metric is simply skipped as an insight source for this refresh — the widget is not shown as broken, it just draws its 2–4 insights from whichever source metrics do have something notable to say.
- **Two insights appear to point in different directions** (e.g. "Dining is up 20%" alongside "you saved more than usual overall"): both are shown; they can both be true simultaneously since they're independently sourced from different Analytics metrics — the feature does not suppress one to avoid an apparent contradiction.
- **A category or merchant name contains adversarial/injected text**: treated as inert, untrusted display text; insight generation only ever produces narrative phrasing of numeric data Analytics already computed — it never takes instructions from, or takes any action based on, category/merchant/notes text content.

### Definition of Done
- Every insight rendered in a test scenario is verified to trace to an actual Analytics figure present in fixture data — no fabricated numbers, same correctness bar as Features 2 and 3.
- The not-enough-data and all-flat-activity states are both verified.
- The AI-unavailable path is verified to leave the rest of the Dashboard/Analytics page fully functional.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (prompt-injection handling for merchant/category text), Performance Engineer review (refresh caching/cost, since this reads across multiple Analytics metrics per refresh), documentation, and CTO/architecture sign-off.

### Dependencies
- Analytics (Phase 3b — Category Trends, Top Merchants, Largest Purchases, Subscription Cost Detection, Daily Spending Heatmap, Savings Growth): the exclusive data source for every insight; this feature computes nothing new.
- Transaction Auto-Categorization (this document, Feature 1): establishes the reusable AI/structured-output pattern this feature reuses.

### Success Metrics
- Percentage of active users who view the Insights widget at least once per month (adoption).
- Refresh-action usage rate.
- Percentage of surfaced insights that lead to a click-through into the underlying Analytics metric (relevance signal — does an insight make a user want to dig deeper).
- Zero reported incidents of an insight's stated figure disagreeing with the Analytics metric it's sourced from.

---

## Feature 5: Financial Health Score (0–100)

### Scope Resolution: Deterministic Formula, Not an LLM-Computed Judgment

This is this document's most important decision and is made explicitly, before its acceptance criteria, per Risk #14's framing ("Product Owner must resolve this explicitly in the 4a spec, before the Solution Architect + AI Engineer architecture pass"), mirroring how `financial-goals.md` resolved the SavingsGoal/FinancialGoal boundary before schema work began.

**Decision: the Financial Health Score is a deterministic formula, computed server-side from existing Analytics/Debt/Budget/Recurring-Income data — never an LLM judgment. An optional AI-generated narrative may accompany the score, explaining it in plain language, but the narrative never determines, adjusts, or overrides the numeric score itself.**

This mirrors a precedent already shipped and trusted in this exact product: the Dashboard's **Budget Health Score** (`budgeting.md` AC12, CTO-resolved 2026-07-19) is itself a deterministic 0–100 formula with banded labels. The Financial Health Score is this score's broader, whole-picture sibling — not a new kind of number with a fundamentally different trust model.

**Reasoning:**

1. **A direct, already-trusted precedent exists in this exact product.** The Budget Health Score already ships as a deterministic 0–100 score with banded labels (Good/Fair/Needs attention), reviewed and live since Phase 2. Users already treat that number as authoritative. Introducing a second "Health Score" — same shape, same 0–100 range — that is instead an LLM's judgment would create an inconsistent trust model within one product: two numbers that look identical to a user but have fundamentally different reliability guarantees, with no way for the user to tell which is which just by looking at them.
2. **A number users will treat as authoritative must be reproducible and auditable.** This is the same "financial-math correctness bar" every prior phase's percentage/score feature has been held to — Debt Tracker's payoff-date math, the Budget Health Score's own formula, Savings Growth's investment-adjusted calculation, Financial Goals' progress percentages. Every one of those is a pure function of stored data, testable against fixture data with one, single correct answer. An LLM-computed score cannot make that same guarantee: identical input data could plausibly produce a different score on a different day or model version, which is an unacceptable property for a number a user might track over time, screenshot, or make a financial decision against.
3. **Every candidate input the CTO named is already a hard, computed number in this codebase today.** Debt-to-income is derivable from Debt Tracker's minimum payments and Recurring Income's actual-received income; savings rate is already computed by the Dashboard/Analytics; budget adherence **is** the existing Budget Health Score, verbatim; net worth trend is already derivable from the Net Worth Snapshot history. There is no genuine subjective judgment left for an LLM to resolve here — using a model to "decide" a score that arithmetic already fully determines would be strictly worse on every axis: slower, costlier, non-reproducible, and adding zero information the formula didn't already provide.
4. **This assigns module ownership cleanly, exactly along the line the roadmap itself drew.** Score computation becomes Backend Engineer's natural extension of the already-existing Analytics/Debt/Budget services — a pure function over data those services already expose. The AI Engineer's role is scoped to what AI genuinely adds value at here: turning a set of already-correct numbers into a well-written, personalized explanatory paragraph ("your score dropped 8 points this month, mainly because Dining ran over budget — see below"), the exact same narrative-layer-on-top pattern already established for Monthly Summaries (Feature 3) and Spending Insights (Feature 4) above. This keeps the AI Engineer out of the critical path for the number itself.
5. **Graceful degradation (Risk #2) is satisfied in the strongest possible way.** Because the score is pure arithmetic with zero AI dependency, it is *always* computable and *always* displays correctly, with or without the AI provider being available at all. Only the optional narrative can ever fail — and when it does, the score and its breakdown are entirely unaffected. This is the single strongest degradation guarantee among all five Phase 4a features, precisely because of this decision.
6. **Naming/adjacency risk, flagged explicitly (mirroring how `financial-goals.md` addressed the SavingsGoal/FinancialGoal naming-adjacency risk):** this product will now have **two** distinctly named "Health Score" surfaces — the existing **Budget Health Score** (one input, 25% weight, into the number below) and this new, broader **Financial Health Score**. The UI must label these distinctly and make the relationship explicit (e.g. the Financial Health Score's breakdown view shows "Budget Adherence" as one of its four labeled components, reusing the Budget Health Score's own number, not a re-derived one) — this is a stated product requirement (see AC3 below), not left ambiguous the way the roadmap explicitly warned against for Admin's "manage categories" naming collision.

### The Formula

Four equally-weighted components, each individually 0–100, averaged into a final 0–100 score:

1. **Debt-to-Income (25%)** — *(resolved, CTO, 2026-07-22 — see "Resolved" section below)*: ratio of total monthly minimum debt payments (sum of active, non-archived Debts' minimum payments, per `debt-tracker.md`) to total actual monthly income (Recurring Income's actual-received total for the period, per `recurring-income.md`). Scored 100 at a ratio ≤ 15%, declining linearly to 0 at a ratio ≥ 50%, floored at 0 beyond that. A user with zero active debts scores 100 on this component (no debt burden) rather than "undefined."
2. **Savings Rate (25%)** — *(resolved, CTO, 2026-07-22)*: the Dashboard/Analytics' existing savings-rate calculation, evaluated as a rolling 3-month average (the same noise-smoothing convention already established by Financial Goals' Savings Rate Target type, `financial-goals.md` Type 3) rather than a single volatile month. Scored 100 at a rolling rate ≥ 20%, 0 at a rolling rate ≤ 0%, linear between.
3. **Budget Adherence (25%)** — *(resolved, CTO, 2026-07-22)*: the existing Budget Health Score's **Final Score**, reused verbatim from `budgeting.md` AC12 — this component is never independently recomputed with new logic, per the "single source of truth" discipline already established throughout this product (the same discipline Financial Goals' Boundary section required for Debt/Net-Worth/Savings-Rate figures).
4. **Net Worth Trend (25%)** — *(resolved, CTO, 2026-07-22 — corrected from the original proposal; see "Resolved" section below for why)*: change in total Net Worth over the trailing 3 months, using the existing Net Worth Snapshot history (Phase 3a/3b), expressed **as a percentage of trailing 3-month total actual income** (Recurring Income) rather than as a percentage of the starting Net Worth balance. Scored 100 at ≥ +15% of trailing 3-month income, 50 at 0%, 0 at ≤ -15% of trailing 3-month income or worse, linear between. (This ±15%-of-income threshold is provisional pending recalibration against real fixture/production data during 4a's review gate — see the Resolved section.)

**Final score** = round(average of whichever components are computable — see undefined-component handling below).

**Banded label**: reuses the identical bands and labels the Budget Health Score already established — 70–100 "Good", 40–69 "Fair", 0–39 "Needs attention" — for consistency across the product's two Health Score surfaces, per point 6 above. *(Resolved, CTO, 2026-07-22 — see the "Resolved" section at the end of this document: the 25/25/25/25 weighting and these bands are approved as proposed; only the Net Worth Trend component's normalization was corrected.)*

**Undefined-component handling**: a component is undefined (not zero) when its own prerequisite data doesn't exist yet — no income data at all (Debt-to-Income), fewer than 3 qualifying months of income/expense history (Savings Rate, mirroring Financial Goals' own precedent), zero categories with an allocation set this month (Budget Adherence, mirroring Budget Health Score's own "undefined" state), or fewer than 3 months of Net Worth Snapshot history (Net Worth Trend). When one or more components are undefined, the Final Score is the average of only the defined components, and the UI states plainly which component(s) are missing and why (e.g. "Score based on 3 of 4 factors — add income tracking for a more complete score"). If **zero** components are computable (a brand-new user with no data anywhere), no numeric score is shown at all — an explicit "not enough data yet" empty state, never a misleading 0.

### Acceptance Criteria
1. The Financial Health Score is a 0–100 number, computed per the formula above, displayed with its banded label (Good/Fair/Needs attention).
2. The score's four individual component values are displayed alongside the total, each clearly labeled (Debt-to-Income, Savings Rate, Budget Adherence, Net Worth Trend), so the score is self-explanatory from its breakdown alone even with no AI narrative present.
3. The "Budget Adherence" component is visually and textually tied back to the existing Budget Health Score (e.g. "Budget Adherence (same as your Budget Health Score)") to satisfy the naming-adjacency requirement in Reasoning point 6 above.
4. Undefined-component handling works exactly as specified above — partial scores are clearly annotated, and a total absence of computable components shows the "not enough data yet" empty state rather than any number.
5. An optional AI-generated narrative accompanies the score once it is computed, explaining in plain language what's driving it, grounded strictly in the four already-computed component values and their change from the prior period (e.g. "your score dropped 8 points this month, mainly because Dining ran over budget") — the narrative never references a figure not already present in the four components.
6. The narrative is visually distinguished from the deterministic score/breakdown (per this document's Cross-Cutting Product Requirement #3) and its presence/absence never affects whether the score itself displays.
7. A user can view a historical trend of their own past scores (a simple trend line/sparkline), generated on a periodic snapshot cadence mirroring the Net Worth Snapshot precedent from Phase 3a (the exact snapshot mechanism/frequency is an architecture decision, not specified here — **resolved, CTO, 2026-07-22: this requirement stands as written; see "Resolved" section below**).
8. The score is surfaced on the Dashboard (a summary card) and on a dedicated detail view showing the full four-component breakdown, the historical trend, and the narrative.

### Edge Cases
- **AI provider unavailable, times out, or returns unusable output (narrative only)**: the score, its banded label, and its four-component breakdown display fully and correctly regardless — only the narrative section shows "Explanation isn't available right now" (or is simply omitted). This is the one Phase 4a feature where the *numeric* half of the surface has zero AI dependency at all, so this degradation path can never affect the score.
- **Zero computable components** (brand-new user): "not enough data yet" empty state, no numeric score shown, per the formula's own undefined-handling rule.
- **Some but not all components computable**: score computed from the defined subset, clearly annotated as partial, per AC4.
- **Components pointing in different directions** (e.g. high debt-to-income alongside an excellent savings rate): the score still averages normally — no special-casing. Surfacing a mixed picture honestly is the entire point of averaging four independent factors, the same principle the Budget Health Score's own category-vs-overall weighting already established for this product.
- **Net Worth Trend heavily skewed by a one-time event** (a large deposit, a large investment gain or loss in the trailing 3 months): scored the same as any other net worth movement — this is a stated, deliberate simplification. Unlike Analytics' Savings Growth metric (which explicitly nets out investment gain/loss to isolate behavior), the CTO's four named inputs for this score explicitly include "net worth trend" as a raw trend, not a behavior-adjusted one; this is flagged here as an intentional scope choice, not an oversight.
- **The score changes materially within the same day** (e.g. right after a large debt payment or a budget reallocation): the score recomputes at next read from live data, same as the Budget Health Score, Debt Tracker, and Financial Goals precedent — it is not delayed by any batch job; only the historical snapshot/trend line has its own separate, periodic cadence.
- **A category, debt, or goal name referenced anywhere in the narrative's underlying data contains adversarial/injected text**: treated as inert, untrusted display text; the narrative generation process only ever narrates the four already-computed numeric component values and their deltas — it has no ability to take instructions from, or alter, any underlying data.

### Definition of Done
- All four component formulas are verified against fixture data, including each one's own undefined-state trigger (zero income, fewer than 3 qualifying savings-rate months, zero budget allocations, fewer than 3 months of Net Worth Snapshot history).
- The Final Score aggregate is verified for the all-four-defined case and for every combination of one or more components being undefined.
- Banded label thresholds are verified at their boundaries (e.g. exactly 70, exactly 40).
- The Budget Adherence component is verified to be read directly from the existing Budget Health Score computation, never independently reimplemented (the same "zero independently-duplicated numbers" bar Financial Goals' own Definition of Done required).
- The narrative-unavailable path is verified, by test, to never affect the numeric score, its breakdown, or the page's overall rendering.
- Meets the release-level bar defined in the Project Charter: tests passing (the financial-math correctness bar above), Security Architect review (scoped strictly to the authenticated user; narrative-generation input data minimized per the CTO's data-minimization constraint), Performance Engineer review, documentation, and CTO/architecture sign-off — **including explicit CTO sign-off on this spec's proposed numeric thresholds/weights**, mirroring the Budget Health Score's own explicitly CTO-resolved precedent (**resolved, CTO, 2026-07-22 — see "Resolved" section below**).

### Dependencies
- Debt Tracker (Phase 3a): required for the Debt-to-Income component.
- Recurring Income (Phase 3a): required for the actual-income figure behind Debt-to-Income.
- Dashboard/Analytics Savings Rate & Savings Growth (Phase 1/3b): required for the Savings Rate component.
- Budgeting's existing Budget Health Score (Phase 2): reused verbatim for the Budget Adherence component, never reimplemented.
- Net Worth Snapshot history (Phase 3a/3b): required for the Net Worth Trend component.
- The optional narrative depends on the 4a AI provider integration (Solution Architect/AI Engineer's architecture pass); the score itself has **zero** AI dependency.

### Success Metrics
- Correlation between a score drop and subsequent user activity in the affected area (e.g. does a Debt-to-Income drop correlate with the user visiting Debt Tracker afterward).
- Percentage of users who open the full breakdown/detail view vs. only ever seeing the Dashboard summary card.
- Percentage of scores computed with all four components defined vs. a partial subset (signals how much of the user base has fully adopted the underlying features this score depends on).
- Zero reported incidents of any component figure disagreeing with the equivalent Budget Health Score/Debt/Analytics figure shown elsewhere in the app.

---

## Open Questions for CTO Resolution (before the Solution Architect + AI Engineer pass begins)

1. **Explicit sign-off on the Financial Health Score's proposed numeric thresholds and weighting** (25/25/25/25 split; the specific debt-to-income, savings-rate, and net-worth-trend threshold bands proposed above). This spec proposes concrete numbers so the Solution Architect/Backend Engineer have something precise to build and test against, the same way `budgeting.md`'s Budget Health Score formula was proposed by Product and then explicitly CTO-resolved before implementation. These thresholds are a product judgment call, not a technical one, and deserve the same explicit sign-off. — **see "Resolved (CTO, 2026-07-22)" below.**
2. **Whether the Financial Health Score's historical snapshot (AC7) shares a table/mechanism with Phase 3a's `NetWorthSnapshot`, or needs its own new model** — flagged in the roadmap as a Database Architect decision, restated here only because it affects whether this spec's "historical trend" requirement is cheap (reuse) or requires new schema (a `FinancialHealthScoreSnapshot`-shaped table). This document takes no position on which; it only requires that a historical trend be user-visible somehow. — **see "Resolved (CTO, 2026-07-22)" below.**
3. **Whether a suggestion/audit trail table is required for Transaction Auto-Categorization** (e.g. to support future reporting on suggestion-acceptance rates, or to satisfy a future Security Architect requirement for traceability of what an AI system suggested vs. what a user actually did) — flagged in the roadmap as a Database Architect decision; this spec's Success Metrics assume acceptance/rejection rates are measurable somehow, but does not mandate a specific persistence mechanism for that measurement. — **see "Resolved (CTO, 2026-07-22)" below.**

## Resolved (CTO, 2026-07-22)

1. **Financial Health Score weighting and bands** — approved as proposed, with one required correction to the Net Worth Trend component before the Solution Architect/Backend Engineer build against it.
   - **25/25/25/25 equal weighting** across Debt-to-Income, Savings Rate, Budget Adherence, and Net Worth Trend — **approved as proposed.** Unlike the Budget Health Score's deliberately asymmetric 60/40 split (justified there by a specific failure mode the weighting needed to surface — "within budget overall but badly over in one category"), these four components are independent, peer-level dimensions of financial health with no analogous asymmetry argument on the table. Equal weighting is the right default here: it's the simplest formula that's still defensible, and it keeps the score easy for a user to reconstruct from its own displayed breakdown, which AC2 already requires.
   - **Debt-to-Income bands** (100 at ratio ≤ 15%, 0 at ratio ≥ 50%, linear between) — **approved as proposed.** Consistent with conventional debt-to-income guidance and internally consistent with how this score's other income-relative component (Net Worth Trend, corrected below) is now normalized.
   - **Savings Rate bands** (100 at rolling rate ≥ 20%, 0 at ≤ 0%, linear between) — **approved as proposed.**
   - **Budget Adherence** — **approved as proposed** (reused verbatim from the existing, already-resolved Budget Health Score; there are no new thresholds here to sign off on).
   - **Banded labels** (70–100 Good, 40–69 Fair, 0–39 Needs attention) — **approved as proposed**, reusing the Budget Health Score's own bands verbatim, consistent with this document's own naming-adjacency reasoning (Feature 5, Reasoning point 6).
   - **Net Worth Trend — not approved as originally written; corrected.** Scoring a percentage change in Net Worth against the trailing 3-month *starting Net Worth balance* has a sign-inversion bug whenever that starting balance is zero or negative: an improvement from, say, -$50,000 to -$40,000 computes as (−40,000 − (−50,000)) ÷ (−50,000) = a *negative* 20%, scored as decline, and a decline from -$50,000 to -$60,000 computes as a *positive* 20%, scored as improvement — exactly backwards in both directions. This isn't a rare corner case for this particular score: negative or near-zero Net Worth is a realistic, common state for exactly the higher-debt-to-income users the Debt-to-Income component already exists to flag, so left uncorrected this would misscore a meaningful share of the user base in the wrong direction on one of four equally-weighted components. **Correction:** normalize Net Worth Trend the same way Debt-to-Income is already normalized — against trailing 3-month total actual income (Recurring Income), not against the starting Net Worth balance. Formula: (Net Worth change over trailing 3 months) ÷ (trailing 3-month total actual income), scored 100 at ≥ +15% of trailing income, 50 at 0%, 0 at ≤ -15% of trailing income or worse, linear between. This removes the division-by-Net-Worth entirely (so the sign-inversion bug cannot occur regardless of starting balance), keeps the formula internally consistent with Debt-to-Income's own income-relative denominator, and requires no data beyond what Recurring Income already provides — no new dependency introduced. Unlike the other three bands above, treat the specific ±15%-of-income threshold as provisional: recalibrate it against real fixture/production data during 4a's review gate if it proves too tight or too loose, and note that recalibration in the release documentation when it happens.
   - Everything else in the formula — the "average of defined components only" aggregation, and the "zero components computable → no numeric score, explicit empty state" rule — is **approved as specified**, no changes.

2. **Financial Health Score historical trend mechanism (AC7)** — the product requirement stands as written; no softening needed, and I'm not overriding the Database Architect's actual schema call, which remains theirs per the roadmap. AC7 only requires that a user can see a historical trend of their own past scores — it does not require any particular table shape — and that requirement is fully feasible: Phase 3a already proved the exact mechanism this needs (a periodic, cron-triggered, idempotent-per-user-per-day snapshot capture, per `NetWorthSnapshot`), so nothing about AC7 introduces new technical risk. For the record, and as a steer rather than a mandate: reusing the literal `NetWorthSnapshot` table for this is unlikely to be the right answer. That table is narrow and purpose-built — three Net-Worth-specific `Decimal` columns, and a schema docstring that frames it as belonging conceptually to Net Worth, not as a generic "periodic score snapshot" utility. Bolting four unrelated score-component columns and a total onto it would conflate two different concepts under one table, which cuts against this codebase's own established practice of building a new, purpose-built table when a concept is genuinely new rather than overloading an existing one (e.g. `DismissedSubscriptionMerchant` was built standalone rather than folded into `Notification`). The roadmap itself already anticipated this outcome — Phase 4a's milestone 2 explicitly names "a historical `FinancialHealthScore` snapshot table analogous to 3a's Net Worth Snapshot" as the expected shape — so a new sibling table, reusing the proven *pattern* (cron-triggered, idempotent capture) rather than the same rows, is my expectation. The Database Architect may reach a different, better-justified conclusion during the architecture pass; if so, document the reasoning the same way the 3a Account-linkage decision was documented. Either way, AC7 is a reasonable requirement to hold them to exactly as written.

3. **Suggestion/audit-trail table for Transaction Auto-Categorization** — also stands as written, and here persistence isn't optional — it's load-bearing for the spec's own Success Metrics, so this is a confirmation, not a softening. "Percentage of newly-Uncategorized transactions that receive a suggestion the user accepts within 30 days" and "suggestion rejection rate" cannot be computed after the fact from `Transaction.categoryId` alone: that column only reflects a transaction's current, final category, with no memory of a suggestion that was shown and rejected (which, per AC5, leaves the transaction Uncategorized with no other trace at all) and no way to distinguish, once time has passed, "categorized via an accepted suggestion" from "categorized manually." Some row-level record of a suggestion's lifecycle (generated → shown → accepted/rejected, with timestamps) is required for these metrics to be measurable at all, not merely useful for future reporting. This mirrors the precedent already established for `DismissedSubscriptionMerchant` — a small, purpose-built table recording a durable fact about an otherwise-ephemeral, computed-at-read-time concept, rather than a JSON blob or an ad hoc reuse of an unrelated model. I'm not specifying the table's exact shape (columns, retention policy, or whether it also satisfies the Security Architect's separate traceability interest noted in the original Open Question) — that detail is the Database Architect's design call — but confirming the underlying product requirement is reasonable, cheaply achievable with a small table, and should not be watered down to "best-effort, unmeasured" in this spec.
