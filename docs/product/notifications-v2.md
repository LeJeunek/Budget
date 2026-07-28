# Product Spec — Notifications v2 (Phase 4b)

This document covers Notifications v2, the second of Phase 4b's two independent domains (Reports, `reports.md`, is the other — dispatchable in parallel per `roadmap.md`'s Phase 4b milestone 1). It is a **product** spec: it does not select an email delivery provider and does not design the `Notification` model's schema extension — both are the Solution Architect + Database Architect's joint 4b architecture pass. Two constraints from the roadmap's Phase 4b CTO kickoff pass are binding on everything below:

1. **"Large purchase" and "low balance" are deterministic, numeric-threshold comparisons only** — zero connection to Spending Insights' AI-selected "notable merchant spend" logic (Phase 4a, `ai-features.md` Feature 4). The two surfaces may show overlapping information to a user (a large purchase might appear in both a notification and, separately, an insight); that overlap is expected and not a defect.
2. Any narrative text this feature ever includes (the Monthly Summary trigger's linked content) is a **verbatim reuse of `MonthlySummary.narrative`**, never independently composed — Notifications v2, like Reports, introduces zero new `lib/ai/` call sites.

## Scope Resolution: Weekly vs. Monthly Summary Notification (resolved here, Product Owner, per the Roadmap's Phase 4b CTO kickoff pass)

The Roadmap's original wording lists "weekly/monthly summary" as a single trigger type, but flagged this explicitly as an ambiguity for this spec to resolve, not decided in advance: monthly has a real, already-built data source; weekly does not.

**Decision: "Monthly Summary" is the only summary-notification trigger type in Phase 4b. "Weekly Summary" is dropped from this phase's scope — not silently, but explicitly, with the reasoning below — and is a legitimate candidate for its own future spec if real usage data later shows demand for a tighter cadence.**

**Reasoning:**

1. **No existing data source for "weekly."** 4a's `MonthlySummary` cron job (`app/api/cron/monthly-summary/route.ts`) already exists, is already reviewed, and already produces exactly the content a monthly notification needs to link to. Nothing in this codebase — not the Dashboard, not Analytics, not any Phase 4a feature — computes a weekly aggregate of anything. A "weekly summary" notification would have nothing real to notify about.
2. **Building it would violate this phase's own scoping, twice over.** Phase 4b is scoped, both by the original 4a/4b split rationale ("a monthly PDF report and a low-balance email are just aggregation + rendering/delivery, not intelligence") and by this phase's binding constraints above, to introduce zero new `lib/ai/` call sites and zero new computation engines. A weekly trigger needs either (a) a brand-new weekly numeric aggregation job — a new feature with its own data model and its own edge cases (partial first week, "not enough data yet," etc.), unbudgeted anywhere in this phase — or (b) a brand-new weekly AI-narrated summary, which is a second `lib/ai/` call site and a direct violation of constraint 2 above. Neither is "just wire up a notification"; both are a new feature wearing a notification's clothing.
3. **No validated demand yet, unlike Monthly.** Monthly Summary is a shipped, reviewed 4a feature with a real Dashboard card users already see; wiring a notification to it is a genuinely small, additive step. Weekly would mean building an entirely new content surface from scratch on spec, with no product evidence today that users want a cadence tighter than monthly.
4. **This is not a permanent door-close.** If the Success Metrics below (adoption/engagement with the Monthly Summary notification) later show real appetite for a tighter cadence, Weekly Summary earns its own full Product Owner spec at that time — deciding its own shape (numeric digest vs. AI-narrated, its own persisted model or not) — the same way Financial Goals (broad) was deliberately kept out of Savings Goals until it justified its own spec (`financial-goals.md`'s Boundary section).

## User Story
As a FinanceOS user, I want to be notified — in the app and, if I choose, by email — when I hit a financial goal, make an unusually large purchase, an account balance gets low, or my monthly recap is ready, so I find out about things that matter to me without having to go looking for them, extending the proactive nudges Notifications v1 already gave me for budgets and bills.

## Business Value
Notifications v1 (Phase 2, `calendar-and-notifications.md`) proved that a nudge closes the loop between a feature existing and a user actually acting on it — a budget-exceeded or bill-due alert is what made those two features feel like the app was "watching out for" the user, rather than a passive ledger. This phase extends that same proven pattern to four new moments the app can now detect but previously had no way to surface proactively: Financial Goals (3b) shipped with its own notifications explicitly deferred to this phase (`financial-goals.md` AC7: "Financial Goals notifications ... are out of scope for this phase — Notifications v2 is Phase 4"); Monthly Summaries (4a) generate real content every month with no push mechanism pointing users to it; and two new deterministic guardrails — large purchase, low balance — give users the "something happened right now" reassurance a finance app's most fundamental alerting category represents. This phase also adds email as a delivery channel for the first time, reaching a user even when they aren't in the app at all.

## Extending, Not Replacing, Notifications v1
Notifications v2 builds on the existing Phase 2 `Notification` model and in-app infrastructure — the persistent inbox/indicator, mark-read/dismiss behavior, and strict per-user scoping (`calendar-and-notifications.md` Notifications v1 AC1–5) are unchanged and continue to apply to every trigger type, old and new. What this phase adds:
- Four new trigger types (Goal Achieved, Large Purchase, Low Balance, Monthly Summary), detailed below.
- A notification-preferences settings surface, which did not exist in v1 (v1's two triggers were always-on, with no per-type configurability).
- A new delivery channel — email — available across **every** trigger type, including v1's original two (Budget Exceeded, Bill Due/Late), not just the four new ones. This is a deliberate decision, stated explicitly here rather than left ambiguous: since a per-trigger-type preferences screen has to be built regardless, extending it to cover v1's existing triggers is a small, natural consequence of that work, not scope creep — treating the original two triggers as "second-class" (in-app only, forever) inside a screen that's otherwise about per-trigger channel choice would be a confusing, arbitrary inconsistency for the user.

## New Trigger Types

### Trigger: Goal Achieved
Reads Financial Goals' (Phase 3b, `financial-goals.md`) existing completion state — no new computation, no independently-maintained "achieved" flag. The trigger condition is **per goal type**, since each type's own completion criterion already differs:

- **Debt Payoff**: fires the moment the linked Debt's balance reaches $0 and the goal auto-completes (`financial-goals.md` Type 1).
- **Net Worth / Savings Target**: fires the moment the measured value (Total Net Worth, or the user's selected Account subset) meets or exceeds the target and the goal auto-completes (Type 2).
- **Savings Rate Target**: fires the moment the rolling 3-month average meets or exceeds the target and the goal auto-completes (Type 3).

#### Acceptance Criteria
1. Fires exactly once per goal, at the moment that goal transitions from active to Completed — never on subsequent views/reads of a goal that is already Completed.
2. The notification links to that goal's detail view.
3. Scoped strictly to the authenticated user's own goals.
4. A goal archived before ever reaching its completion criterion never fires this trigger (there is no completion event to notify about).

#### Edge Cases
- **A Financial Goal that was already Completed before this feature ships**: does **not** retroactively fire a notification. This is a deliberate, explicit decision, distinct from Notifications v1's own precedent for a bill already Late when that feature first shipped (which *does* still surface a notification, `calendar-and-notifications.md` Notifications v1 edge case). The difference: a Late bill is an ongoing, currently-true, actionable state (the bill is still unpaid right now) — surfacing it is useful regardless of when the feature launched. A goal reaching Completed is a one-time past event; announcing "you paid off your debt!" for something that actually happened months before this feature existed would be confusing, not useful, and could misrepresent recency to the user.
- **Multiple goals complete on the same day**: each gets its own, independent notification — no bundling or suppression required.
- **A goal is unarchived after being archived while still short of its target, and later reaches completion**: fires normally, exactly like any other active goal reaching its criterion — the earlier archive period has no bearing on this trigger.

---

### Trigger: Large Purchase (deterministic, per binding constraint 1)
A single expense transaction (or an individual split line item) whose amount meets or exceeds a threshold.

#### Acceptance Criteria
1. Applies to expense (money-out) transactions and split line items, using each line item's own amount — **never** a split-parent row, whose `amount` is purely informational (`transactions.md` AC14), the same exclusion Transaction Auto-Categorization already established for its own suggestion logic (`ai-features.md` Feature 1, AC8).
2. Fires once per qualifying transaction, at the moment it is recorded (manual entry or CSV import) or edited such that it newly crosses the threshold.
3. Evaluated purely as a transaction-amount comparison against the threshold — no call into Spending Insights, Analytics, or any AI-generated logic, per binding constraint 1.
4. A single, user-level threshold applies (not per-account or per-category), with a system-proposed default the user can change at any time. **The exact default dollar amount is a proposed starting point for the architecture/backend pass, not a fixed product mandate** — unlike the Financial Health Score's baked-in scoring bands, this threshold is user-adjustable at any time and never presented to the user as an authoritative, unchangeable number, so it does not require the same level of upfront rigor.
5. Editing a transaction's amount after creation is re-evaluated against the threshold: if it now newly qualifies, the trigger fires (once); if a transaction that already triggered a notification is later edited below the threshold, the earlier notification is not retroactively deleted, but no further notification fires for that transaction.
6. Deleting a transaction after its notification has already fired does not retroactively delete the notification (mirrors Notifications v1's own "dismissing/resolving doesn't retroactively delete a notification" precedent, `calendar-and-notifications.md` Notifications v1 edge cases).

#### Edge Cases
- **A CSV import bringing in many large historical transactions at once**: this trigger fires only for transactions dated within a recent window of when they are recorded (e.g. within the last several days) — a bulk import of old historical transactions does not flood the user with a burst of notifications for purchases from months or years ago. The exact window length is an architecture-pass detail; the product requirement is that a large historical backfill must not read as a wall of "just now" alerts.
- **A merchant name or transaction note containing adversarial/injected text**: has zero bearing on this trigger, since it only ever reads the transaction's numeric `amount` field — there is no text-parsing or AI involvement of any kind here, so this concern (which matters for 4a's AI features) is structurally inapplicable to this deterministic trigger.
- **A transaction just under the threshold**: no notification; there is no "close to the threshold" partial-credit behavior.
- **A split-parent transaction row**: never evaluated directly, per AC1.

---

### Trigger: Low Balance (deterministic, per binding constraint 1)
An eligible account's balance drops below a threshold.

**Eligible account types**: Checking, Savings, and Cash only. Credit Card is explicitly excluded — its balance represents money owed, not money available, so "low balance" is a backwards concept for it, and there is no credit-limit field on `Account` (per `accounts.md` AC1) to compute a "near your limit" equivalent instead. Investment, Retirement, and Crypto are also excluded — balance movement there reflects manually-entered portfolio value, not a cash-flow risk the way it does for a spending account, so alerting on it would misrepresent market fluctuation as a "low balance" emergency.

#### Acceptance Criteria
1. Applies only to non-archived Checking, Savings, and Cash accounts.
2. A user sets one global default low-balance threshold, and may optionally override it per individual eligible account (since "low" for a primary checking account is a very different number than "low" for a rarely-used cash account). **As with Large Purchase, the specific default dollar amount is a proposed starting point for the architecture pass, not a binding product number.**
3. Fires once when an account's balance transitions from at-or-above its threshold to below it (a "crossing" event) — not repeatedly on every subsequent check while the balance remains low, mirroring Notifications v1's own "one active over-budget notification per category per month" anti-spam precedent (`calendar-and-notifications.md` Notifications v1 edge case), adapted here to a crossing model since a balance isn't scoped to a calendar month the way a budget category is.
4. Re-arms once the balance recovers back to at-or-above the threshold — a later drop below it again fires a new notification.
5. Evaluated against any change to the account's balance, regardless of source (a transaction, an edit to an existing transaction, a CSV import, or a manual account-balance edit) — purely a numeric comparison, no AI involvement, per binding constraint 1.
6. Scoped strictly to the authenticated user's own accounts.

#### Edge Cases
- **An account already below its threshold at the moment this feature ships, or at the moment the account is first created**: still fires. Unlike Goal Achieved, this is a deliberate, opposite decision: a low balance is an ongoing, currently-true, actionable state (the risk exists right now, today), not a one-time past event — this mirrors Notifications v1's own precedent that a bill already Late when the feature first shipped still surfaces a notification (`calendar-and-notifications.md` Notifications v1 edge case), rather than Goal Achieved's no-retroactive-fire rule above.
- **Rapid oscillation near the threshold** (multiple transactions crossing back and forth on the same day): one notification per crossing is acceptable behavior, not a defect requiring additional debounce beyond the crossing rule itself.
- **A balance that goes deeply negative in one large transaction**: a single notification fires at the first crossing below the threshold, not one per additional dollar of further decline.
- **An account is archived while its balance is below the threshold**: archived accounts are excluded from monitoring entirely (per AC1) — no further notifications fire for it while archived, and unarchiving re-evaluates it fresh against the current threshold.

---

### Trigger: Monthly Summary (scope resolved above — monthly only)
A thin notify-and-link wrapper around 4a's existing `MonthlySummary` generation (`ai-features.md` Feature 3) — no new computation, no narrative composed by this feature.

#### Acceptance Criteria
1. Fires once per user, once per calendar month, when that month's `MonthlySummary` row exists **with a non-null `narrative`** (i.e. generation actually succeeded) — this can only happen after the month has fully closed, per Feature 3's own generation cadence (AC1–3).
2. The notification/email links to the Dashboard's recap card, or the summary history view, for that month.
3. If generation did not succeed for a given month (no row exists yet, or the row's `narrative` is null), no notification fires for that month. This is not treated as a missed or delayed notification — there is nothing yet to link to, consistent with Feature 3's own "Summary not available for [Month]" degraded state.
4. Any narrative text this trigger's notification or email surfaces is the **exact, verbatim** `MonthlySummary.narrative` text — never a new paraphrase, summary-of-the-summary, or independently composed message. A generic wrapper line (e.g. "Your July recap is ready") plus a link satisfies this trigger on its own; if an email body includes any of the narrative itself, it must be the persisted text exactly as stored, per binding constraint 2.

#### Edge Cases
- **A user's first, partial month of usage**: if that month's `MonthlySummary` has a real (non-null) narrative, per Feature 3's own partial-month handling, the notification fires normally — no special-casing beyond what Feature 3 already resolved.
- **A user manually triggers Feature 3's optional "regenerate this summary" action** for an already-summarized month (`ai-features.md` Feature 3 edge case): does **not** re-fire the Monthly Summary notification — the notification already fired once for that month; regeneration updates the content of an existing row, it is not a new "ready" event.

## Email Delivery Channel

A new delivery channel added to the existing `Notification` model, available across every trigger type — the two carried over from Notifications v1 (Budget Exceeded, Bill Due/Late) and the four new ones above.

### Acceptance Criteria
1. **Email delivery is off by default for every trigger type, for every user, at launch.** An explicit, per-trigger-type opt-in is required before FinanceOS sends any email for that trigger. This is the first email FinanceOS has ever sent for anything (per the Roadmap's own note: "no email-sending infrastructure of any kind today"); defaulting to on would put financial content in a user's inbox without their explicit consent — a product-level restatement of the CTO's PII/data-egress framing for this exact channel, not just a security-review checklist item.
2. A single notification-preferences screen lists every trigger type (Budget Exceeded, Bill Due/Late, Goal Achieved, Large Purchase, Low Balance, Monthly Summary Ready), each with two independent toggles: **In-App** and **Email**.
3. In-App defaults to **on** for all six trigger types, preserving Notifications v1's existing always-on behavior for its original two triggers; a user may turn In-App off for any trigger type they don't want to see, a small, natural extension of the preferences screen this phase introduces (v1 had no such per-type control).
4. Email defaults to **off** for all six trigger types, per AC1, and is only ever enabled by an explicit user action.
5. Every notification email includes a clear, working way to manage or disable that email type going forward (an unsubscribe or "manage notification preferences" link) — the specific mechanics (e.g. one-click unsubscribe tokens) are left to the architecture pass and the Security Architect's dedicated email-content review (Risk #17), but the product requirement — every email is self-service manageable — is stated here as non-negotiable.
6. Email content includes only the same data already shown in the equivalent in-app notification (which category, which goal, which account, which amount) — never raw account numbers or any data beyond what the in-app version already displays, the same data-minimization discipline every other feature in this product is held to, restated here because email is this product's first new data-egress surface beyond the app itself.
7. A failure to deliver an email (a bounce, a provider outage) never affects or blocks the in-app notification for that same event — in-app delivery is the reliable baseline and functions completely independently of email's success or failure.

### Edge Cases
- **A trigger fires while a user has both In-App and Email enabled for that type**: both channels deliver from the same underlying event; the two are independent per AC7 and never double-fire within a single channel.
- **A user disables In-App for a trigger type but leaves Email enabled**: allowed — email becomes their only channel for that trigger type.
- **A user with no verified email address, or whose email delivery is otherwise unavailable at the account level**: In-App continues to function normally and completely unaffected; the exact account-level email/verification story (a Better Auth-adjacent concern) is outside this spec's scope and flagged for the architecture pass.
- **A high-frequency user for Large Purchase or Low Balance** (e.g. someone who spends heavily or keeps a consistently low balance): no additional cross-trigger debounce beyond what each trigger's own crossing/recency rule already specifies; if this proves noisy in real usage, the fix is adjusting default thresholds, not a new suppression mechanism this spec would need to define preemptively.

## Definition of Done
- All four new trigger types are verified, by test against fixture data, to fire correctly and exactly once per qualifying event: a goal's completion transition, a transaction amount crossing the large-purchase threshold, an account balance crossing the low-balance threshold, and a `MonthlySummary` row being generated with a non-null narrative.
- Large Purchase and Low Balance are verified, by test, to have **no code path** that touches Spending Insights or any `lib/ai/` call — pure, deterministic numeric comparisons, verified by construction rather than convention, the same bar the AI Budget Advisor's own read-only verification set (`ai-features.md` Feature 2 Definition of Done).
- The Monthly Summary trigger is verified, by test, to never independently generate or paraphrase narrative content, to link only to the exact persisted `MonthlySummary.narrative`, and to never fire when that row's narrative is null.
- Retroactive-firing behavior is verified per trigger, matching each one's own stated rule: Goal Achieved does **not** fire for goals already Completed before this feature ships; Low Balance **does** fire for an account already below threshold at launch or at account creation; Large Purchase does **not** flood notifications for a bulk historical CSV import.
- The notification-preferences screen is verified to independently gate In-App (default on) and Email (default off) for all six trigger types (the two carried over from Notifications v1 plus the four new ones).
- Email delivery failure is verified, by test, to have zero effect on in-app delivery for the same event.
- Cross-user notification/email leakage is verified to be impossible by any request path (extends Notifications v1's own existing bar).
- Meets the release-level bar defined in the Project Charter: tests passing, **Security Architect review** (cross-user notification leakage, plus — new to this phase — email content/PII exposure and unsubscribe/preference compliance per Risk #17), Performance Engineer review (deterministic trigger checks remain cheap and near-instant, explicitly not gated behind any AI-latency-bounded path, per binding constraint 1's own reasoning), documentation, and CTO/architecture sign-off.

## Dependencies
- Notifications v1 / the existing `Notification` model and in-app inbox (Phase 2): this phase extends, and does not replace, both.
- Financial Goals (Phase 3b): source of the Goal Achieved trigger's completion state, for all three goal types.
- Transactions (Phase 1): source of the Large Purchase trigger's transaction-amount data.
- Accounts (Phase 1): source of the Low Balance trigger's balance data.
- Automatic Monthly Summaries (Phase 4a, `ai-features.md` Feature 3): source of the Monthly Summary trigger; read-only, per binding constraint 2 — this feature introduces no `lib/ai/` dependency of its own and requires no AI Engineer involvement.
- Email delivery provider (Solution Architect + Backend Engineer's 4b architecture pass): not selected in this document.

## Success Metrics
- Percentage of active users who opt into email for at least one trigger type (adoption of the new channel).
- Per-trigger-type click-through rate from a notification (either channel) to the relevant page (a goal's detail view, a transaction, an account, the monthly recap).
- Rate at which users adjust their Large Purchase or Low Balance default threshold shortly after receiving a notification from it (a high adjustment rate signals the proposed default is miscalibrated for real usage, the same recalibration signal the Financial Health Score's own provisional thresholds were flagged for).
- Adoption and click-through of the Monthly Summary trigger specifically — the leading signal for whether a future Weekly Summary spec would be justified (see the Scope Resolution above).
- Zero reported incidents of cross-user notification or email leakage.
- Zero reported incidents of an email notification containing data beyond what its equivalent in-app notification already displays.
