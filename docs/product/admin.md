# Product Spec — Admin (Phase 4c)

This document covers Admin, one of Phase 4c's three domains (Calendar v2 and User Customization are spec'd separately, dispatched in parallel per `roadmap.md`'s Phase 4c milestone 1). It is a **product** spec: it does not choose the admin-authorization mechanism (a `role` field, a permissions table, Better Auth's own `admin` plugin), does not design the DB-backed system-category-template model, and does not decide feature flags' storage/evaluation architecture — all three are the Solution Architect + Database Architect's joint 4c architecture pass, per `roadmap.md`'s Phase 4c CTO kickoff pass (2026-07-29). Where this document says "an admin can," the *how* is deliberately left to that pass.

This spec covers six capabilities: Admin Access Control, View Users, Audit Logs, Feature Flags, Manage Categories (the starter template), and Seed Demo Data.

## Scope Carried Over from the CTO Kickoff Pass (binding, not revisited here)

These are already decided in `roadmap.md`'s Phase 4c kickoff pass and `docs/planning/risk-register.md` rows #18, #25, #26, #27 — restated here so this spec is self-contained, not re-litigated:

1. **A single flat privilege tier.** An account either has the `ADMIN` tier or it doesn't (`USER`/`ADMIN`, or an equivalent binary distinction). There is no per-resource permission system and no tiered admin roles (e.g. no "read-only support staff" tier) in this phase.
2. **No self-service admin-role-assignment UI.** Granting or revoking the `ADMIN` tier is an operational action the team performs directly against the database (a seed script or a direct update) — it is never a button, form, or endpoint reachable through the product itself. "View users" in this spec means *read* access to the account list, not a role-management console.
3. **The authorization mechanism is not this spec's call.** Whatever the Solution Architect/Database Architect choose, it must serve the single-flat-tier scope above — this spec describes only what an admin needs to see and do.
4. **Zero new `lib/ai/` call sites.** None of the six capabilities below generate, call, or depend on AI-generated content — the Audit Log capability *surfaces* records of AI feature usage that 4a/4b already produce, it does not itself call an AI model.
5. **"Manage categories" here means the global starter-category template** (what every new signup is seeded with) — a distinct concept from Phase 1's already-shipped per-user custom-category CRUD (`categories.md`). This capability never touches a user's own already-seeded or already-customized `Category` rows.

## User Story

As a member of the FinanceOS team operating this product, I want a small, internal-only area of the app where I can see who's using it, review what its automated features (AI, reports, email) have actually been doing, quickly disable a misbehaving feature, keep the starter category set current, and refresh the demo account for a sales call or screenshot — all without needing direct database access or an engineer's help for routine operational tasks.

## Business Value

Every prior phase built something an end user directly benefits from. Admin is the first phase that exists for the team running FinanceOS rather than for its end users — and it earns its place precisely because the product now has real operational surface area to manage: a growing, unknown-sized user base (View Users); two newly-shipped, first-of-their-kind AI and data-egress features whose behavior the team should be able to see and, if needed, quickly disable (Audit Logs, Feature Flags); a starter-category default that today can only be changed by an engineer editing code and redeploying (Manage Categories); and a demo account that today can only be refreshed from a command line (Seed Demo Data). None of this is speculative — every capability below closes a real, already-identified gap in how the team can currently operate FinanceOS day to day, rather than anticipating a future need.

---

## Capability 1: Admin Access Control

### User Story
As a member of the FinanceOS team, I want an internal area of the app that ordinary users can never reach, discover, or be shown any trace of, so that operational tooling stays completely separate from the consumer product every regular user experiences.

### Business Value
Admin introduces this codebase's first-ever privilege tier and its first authorization-bypass risk surface beyond "wrong user, right role" (Risk #18). Getting this boundary right is the precondition for every other capability in this document — none of View Users, Audit Logs, Feature Flags, Manage Categories, or Seed Demo Data is meaningful if a non-admin can reach it.

### Acceptance Criteria
1. Exactly one privilege distinction exists app-wide: an authenticated account either holds the `ADMIN` tier or it doesn't — no intermediate tiers, no per-capability grants, per the carried-over scope above.
2. Every admin screen and every admin action (viewing users, viewing audit logs, toggling a feature flag, editing the starter category template, triggering demo-data seeding) requires the acting account to hold the `ADMIN` tier at the moment of the request — checked on every request, never only when a nav link happens to be rendered.
3. An ordinary user's product experience contains no visible trace that an admin area exists at all: no nav link, no menu entry, no in-app copy referencing it.
4. A non-admin user who navigates directly to an admin URL — typed, bookmarked, shared, or guessed — is redirected to their own Dashboard. No error message confirms an admin-only area exists at that address, and no admin content renders even momentarily before the redirect.
5. Granting or revoking the `ADMIN` tier happens entirely outside the shipped product (a seed script or a direct database update), per the carried-over scope above — there is no UI path anywhere in the product that changes a user's tier.
6. An admin account retains full, ordinary access to its own personal FinanceOS data (accounts, transactions, budgets, etc.), exactly as any user would — the `ADMIN` tier only adds capabilities; it never changes or restricts the admin's own personal-finance experience.

### Edge Cases
- **An admin's session persists after their `ADMIN` tier is revoked** (e.g. a direct database update mid-session): the very next request to any admin route/action is blocked, evaluated live — never honored on stale session data captured at login.
- **A non-admin obtains a direct deep link to a specific admin record** (e.g. another user's detail row) from some outside source: blocked by the same per-request check as AC2 — a specific deep link carries no more access than browsing to the admin section generally.
- **The only `ADMIN` account is deactivated or deleted**: no "last admin standing" guard is required in this phase — re-provisioning an admin is the same operational action as the original grant (AC5). Flagged here rather than silently assumed away, since a zero-admin state leaves the team unable to reach any Admin capability through the product until they intervene at the database directly.
- **An admin views the ordinary product as themselves**: sees only their own data everywhere outside the dedicated Admin area. The `ADMIN` tier never grants a "view as" or impersonation capability over another user's financial data — no such capability appears anywhere in this document.

---

## Capability 2: View Users

### User Story
As an admin, I want to see who has signed up for FinanceOS and get a basic read on account activity, so the team can answer real operational questions (how many users do we have, does an account exist for a support inquiry, is signup working) without querying the production database directly.

### Business Value
Today the only way to answer "how many people signed up this week" or "does user X's account exist" is a direct, unaudited database query — one that requires database credentials and carries its own risk. A read-only, in-product user list turns that into a safe, self-service, and (per Capability 3) loggable action.

### Acceptance Criteria
1. An admin can view a list of every registered account, showing at minimum: email address, display name, signup date, email-verification status, and a last-active signal derived from that account's most recent session activity.
2. The list supports search (by email or name) and pagination, mirroring the same search/pagination bar already established for Transactions (`transactions.md`) — the view must remain usable as the user base grows.
3. This view never displays a password, a session token, an OAuth access/refresh token, or any other credential/secret for any account, under any circumstance — account metadata only.
4. This view never displays another user's financial data (accounts, transactions, balances, budgets, goals, etc.) — View Users is strictly account-directory information, not a window into a user's financial life.
5. This capability is read-only: no action reachable from this view modifies a user's account, financial data, or tier (tier changes happen outside the product entirely, per Capability 1 AC5).

### Edge Cases
- **A user with zero sessions** (e.g. an account that has never returned since signup): shows a plain "no activity yet" indicator, not an error or a blank field.
- **A very large user base**: search and pagination (AC2) must keep the view responsive rather than loading every account row at once.
- **A search by partial or differently-cased email/name**: matches case-insensitively and by substring, consistent with this product's existing search conventions (e.g. Transactions' merchant search).
- **A user signed up via Google OAuth vs. email/password**: both appear in the same list with the same fields; the sign-up method is not a required display field, though the architecture pass may choose to surface it.

---

## Capability 3: Audit Logs

### User Story
As an admin, I want to see a history of the significant actions FinanceOS's AI, reporting, and notification features have actually taken, so the team has ongoing visibility into what the automated parts of the product are doing, instead of reconstructing it from raw database rows after the fact.

### Business Value
Phase 4a and 4b each passed a review gate specifically because they introduced this product's first AI decisions and its first data leaving the app boundary (a downloaded report, a sent email) — surfaces the team already agreed deserved elevated scrutiny once, at release. An audit log turns that one-time review confidence into an ongoing, checkable record, and per the Roadmap's own sequencing rationale (mirroring Risk #10's "don't build the empty-history feature first" reasoning), it launches with real events already to show, since 4a and 4b are both already live.

### Acceptance Criteria
1. The audit log surfaces, at minimum, these already-happening event types:
   - **AI feature usage**: each Transaction Auto-Categorization suggestion generated (both the automatic and user-initiated "reconsider" paths), each AI Budget Advisor / Monthly Summary / Spending Insights / Financial Health Score narrative generation attempt, including whether it succeeded or degraded gracefully (per `ai-features.md`'s cross-cutting degradation requirement).
   - **Report generation**: each PDF report generated (type, period, requesting user, timestamp), per `reports.md`.
   - **Notification/email sends**: each notification email attempted, and whether it succeeded or failed, per `notifications-v2.md`'s email-delivery behavior.
   - **Category suggestion accept/reject decisions**: called out specifically as a subset of AI feature usage, since it's the concrete "is this feature actually helping" signal the team most wants a fast, filterable view of.
2. Each audit entry shows, at minimum: what happened (event type), which user it concerns, when it happened, and its outcome (success, failure, accepted, rejected, or degraded, as applicable) — enough for an admin to answer "did this run, and what happened" without raw database access.
3. The audit log is filterable by at least event type and date range — e.g. an admin can view only email-send failures from the last week, or only category-suggestion rejections, rather than scrolling one unfiltered feed.
4. The audit log never displays the underlying financial figures those events concern beyond what's needed to identify the event (e.g. "a Monthly Report was generated for July 2026" is sufficient) — it is not a second window into a user's raw transactions or balances.
5. This capability is scoped to these product-generated event types; it is not, in this phase, a generic log of every read/write across the app (it does not, for example, log every manual transaction edit) — the value here comes specifically from the AI/report/notification surfaces 4a/4b just shipped, not a blanket audit-everything requirement.
6. Audit log entries, once recorded, are never editable or deletable by anyone through the product's own UI, including by an admin — a product-level statement supporting the tamper-resistance the Security Architect's 4c review gate is specifically asked to verify (Risk #18); the underlying immutability mechanism is an architecture decision.
7. Scoped strictly to admin access — no non-admin surface anywhere exposes this log, even for a user's own events.

### Edge Cases
- **An AI feature call fails or degrades gracefully**: still produces a log entry showing the failure/degraded outcome, not silence — the log should show the AI provider having a bad afternoon, not just successes.
- **A very high-volume event type** (e.g. a large CSV import generating many category suggestions at once): the log view must remain usable via AC3's filtering, not overwhelmed by one user's bulk activity.
- **An event concerns a since-deleted user or since-deleted underlying record** (a transaction, a category, a goal): the log entry still displays, with the deleted reference shown plainly (e.g. "category suggestion for a transaction that no longer exists") rather than erroring or disappearing — this is a historical record and doesn't get deleted along with the thing it refers to.
- **Pre-existing 4a/4b history at the moment Admin ships**: wherever the underlying data already persists it (category suggestions, notification email status), the audit log should be able to show that history retroactively, not only events from the moment Admin itself launches — see the Dependencies section for the one event type (report generation) where no such persisted history currently exists to backfill from.

---

## Capability 4: Feature Flags

### User Story
As an admin, I want a small set of switches that can turn off a whole category of product behavior — for example, all AI features, or all outbound email — quickly and without a code deploy, so the team has a fast, low-risk way to respond if one of those surfaces misbehaves in production.

### Business Value
FinanceOS's two newest, highest-risk surfaces — 4a's AI features and 4b's email delivery — are exactly the kind of capability a team wants a fast kill switch for post-launch, per the Roadmap's own recommendation. This reduces time-to-mitigate for an incident from "ship a hotfix" to "flip a switch."

**Architectural framing note, restated but not decided here:** the Roadmap's CTO kickoff pass recommends the architecture pass weigh feature flags as a small, standalone cross-cutting primitive usable anywhere in the app, rather than scoping it as merely one more Admin-owned screen. This spec describes the capability an admin needs; it takes no position on whether the implementation is Admin-owned or a shared primitive Admin happens to have a screen for.

### Acceptance Criteria
1. An admin can view the current on/off state of every defined feature flag, and toggle each one, from a single screen.
2. At minimum, one flag exists for each of these two kill-switch scenarios, since they are this product's newest, highest-risk surfaces:
   - An **AI features** flag that, when off, disables all of 4a's AI-generated content app-wide (auto-categorization suggestions, budget advisor, monthly summaries, spending insights, and the Financial Health Score's narrative layer) while leaving every non-AI part of the product — including the Health Score's own deterministic numeric formula — fully functional.
   - An **email delivery** flag that, when off, disables all outbound notification email app-wide while leaving in-app notifications fully functional.
   The exact mechanism/granularity (one umbrella flag per domain vs. one flag per individual AI feature) is an architecture-pass decision; this spec states the product-level need, not the final flag list.
3. Toggling a flag off degrades the affected surface using that surface's own already-defined graceful-degradation behavior (AI features off looks exactly like "AI provider unavailable" per `ai-features.md`; email off looks exactly like the email-failure behavior already required by `notifications-v2.md` AC7) — a flag is never a new, separately-designed broken state.
4. A flag change takes effect promptly, within normal request handling — not requiring a deploy or a meaningful propagation delay, since faster-than-a-deploy response is the entire point.
5. Flag state changes are themselves an admin action worth recording — see Capability 3 (which flag, old/new state, which admin, when).
6. Toggling a flag off never deletes, corrects, or otherwise mutates already-generated content (an already-shown AI suggestion, an already-sent email) — it only affects behavior going forward.

### Edge Cases
- **A flag is toggled off mid-operation** (e.g. an AI batch job is running when the AI flag flips off): the in-flight operation may complete or be gracefully cut short, but must not corrupt data or crash — it degrades using the same "AI unavailable" path as AC3, not a new failure mode.
- **All flags on (the default, healthy state)**: no change to ordinary product behavior — flags only matter once toggled off.
- **A flag is toggled off and immediately back on**: no residual "stuck off" state; behavior returns to normal immediately, per AC4.
- **A future feature wants its own flag**: this spec enumerates only the two flags called out in AC2; it does not define a process for registering new flags going forward — see Open Questions below.

---

## Capability 5: Manage Categories (Starter Template)

### User Story
As an admin, I want to edit the fixed set of starter categories every new signup receives, so the team can improve that default set — add a category real usage shows is commonly missing, fix a color, reorder the list — without needing an engineer to change code and redeploy for every adjustment.

### Business Value
The starter set (`DEFAULT_CATEGORIES`, `src/features/categories/default-categories.ts`) is currently a compiled TypeScript constant that only an engineer can change, and every change requires a full deploy — not a real content-editing workflow. Making it admin-editable turns the team's evolving sense of "a good default category set" into something they can act on directly, the same operational-agility value View Users provides for account visibility.

**Explicit disambiguation, restated from the Roadmap:** this is *not* the per-user custom-category CRUD Phase 1 already shipped (`categories.md`). A user's own categories — the system-seeded copies plus any custom ones they've added — are entirely separate rows the user owns; this capability never touches them. It edits only the global template new signups are seeded from going forward.

### Acceptance Criteria
1. An admin can view the full current starter-category template as an ordered list, each entry showing its name and color.
2. An admin can add a new entry (name + color), governed by the same case-insensitive name-uniqueness and reasonable-max-length validation `categories.md` already establishes for a user's own custom categories.
3. An admin can edit an existing entry's name and/or color.
4. An admin can reorder entries — the display order new users will see their starter categories in — via drag-and-drop or an equivalent explicit action.
5. An admin can remove an entry.
6. The template can never be reduced to zero entries — mirroring `categories.md`'s own "the system categories always remain as a floor" principle, applied here to the template itself: removing the last remaining entry is blocked with a clear explanation.
7. **A template change takes effect for signups from that point forward only. It is never applied retroactively to any user who has already signed up.** An existing user's already-seeded categories — including ones they may have since renamed, recolored, or deleted, per their own rights under `categories.md` — are entirely unaffected by any later template edit. This is a deliberate resolution, stated explicitly rather than left ambiguous: an admin edit reaching into and silently altering rows a user already owns (and may have already customized) would violate this product's standing per-user-data discipline (Risk #4) and would be a surprising, unwanted side effect a routine template tweak should never cause.
8. Template changes are themselves an admin action worth recording — see Capability 3 (which field changed, old/new value, which admin, when).

### Edge Cases
- **An admin edits the template while a signup is in progress** (a race): the new user's seeding uses whatever the template contains at the moment their signup hook runs — no requirement to lock or queue signups around a template edit; this is the same tolerance already implicit in today's hardcoded constant, which also could only ever reflect whatever was currently deployed.
- **An admin removes an entry that many existing users' already-seeded categories are named after**: those existing users are entirely unaffected, per AC7 — only future signups no longer receive that entry.
- **An admin renames an entry**: only changes what future signups see; never propagated to existing users' already-seeded rows, per AC7 — it is a rename of the template, not a mass rename of a category across every user.
- **A duplicate name added to the template**: rejected with the same case-insensitive uniqueness rule as AC2.

---

## Capability 6: Seed Demo Data

### User Story
As an admin, I want to trigger a refresh of FinanceOS's existing showcase demo account with realistic, good-looking sample data, so the team can demo or screenshot the app without needing an engineer to run a script from the command line every time.

### Business Value
`prisma/seed-showcase.ts` (run via `npm run seed:showcase`) already exists and already does exactly this work end to end — accounts, transactions, recurring income, budgeting, bills, debt, investments, goals, net worth history, every AI-feature cache — for one dedicated account, `showcase@lkbudget.demo`. The gap this capability closes is purely operational: today, refreshing the demo account requires someone with local repo access and database credentials to run a command-line script. Exposing a trigger for it inside Admin lets any admin — including someone on sales or marketing, not just an engineer — refresh the demo account before a call or a screenshot session.

### Explicit Scope Resolution (per Risk #26, decided here rather than left implicit)

**This capability seeds one and only one fixed, dedicated demo account (`showcase@lkbudget.demo`) — never an arbitrary or admin-chosen target — *and* is restricted to non-production environments only. Both guardrails apply together, not either/or.**

Reasoning:
1. Scoping to the fixed demo account alone, without an environment restriction, would still leave a real risk: this trigger is a repeatable, on-demand, full-account delete-and-recreate action sitting behind a UI button. A mistake, a compromised admin session, or a future change that widens it to accept a target parameter would then have live-production blast radius for what's meant to be a harmless demo-refresh convenience.
2. Restricting to non-production alone, without pinning the target account, would still leave a real risk in staging/dev: an admin screen that accepts or infers *which* user to seed is exactly the "unbounded data-generation vector" Risk #26 warns about, even outside production — it invites scope creep toward "seed data for any user," a fundamentally more dangerous capability than "refresh the one known demo account."
3. Together, these two guardrails mean the worst case of any misuse is: the existing showcase account gets reset and refilled with fresh sample data, in an environment that was never serving real users — the exact same blast radius the script already has today when an engineer runs it manually by hand, no larger.

### Acceptance Criteria
1. An admin sees a single action ("Refresh Demo Data" or equivalent) with no target/user selection of any kind — no field, dropdown, or parameter lets an admin choose which account to seed. The action always operates on exactly the fixed `showcase@lkbudget.demo` account.
2. This action is available and functions only in non-production environments (development, staging/preview). In a production environment, the action is not shown at all — not merely disabled — consistent with Capability 1 AC3's "no visible trace" principle applied here.
3. Triggering the action re-runs the same idempotent delete-and-recreate behavior `seed-showcase.ts` already implements (existing showcase data is fully replaced, not appended to) — this capability exposes/triggers that existing script; it does not reimplement or duplicate its data-generation logic.
4. The admin sees a clear confirmation before triggering (this is destructive to the demo account's current data) and a clear success/failure result after it completes.
5. This action is itself an admin action worth recording — see Capability 3 (which admin, when, success or failure).

### Edge Cases
- **The action is triggered while someone else is actively using the demo account for a live demo or call**: the refresh proceeds and replaces the in-progress demo's data out from under them — no requirement to lock or queue around a concurrent demo session in this phase; this is an accepted, known limitation of a single shared demo account, not a defect this spec requires solving.
- **The script fails partway through** (e.g. a transient database error): the admin sees a clear failure message per AC4 rather than a silent partial refresh; whether a failed run leaves the account partially reset or safely rolled back is an implementation detail — the product requirement is that failure is reported honestly, never hidden.
- **Someone attempts to reach this action's underlying endpoint directly, bypassing the UI, in a production environment**: blocked at the server, not merely hidden client-side, per Capability 1 AC2's "checked on every request" discipline.
- **A future need to seed a different kind of demo scenario** (not the one existing showcase account): out of scope here — this capability is scoped exactly to today's one existing script; a genuinely new demo-data need earns its own spec/script, not a silently expanded version of this trigger.

---

## Definition of Done

- Non-admin access to every admin route/action, across all six capabilities, is verified by test to be blocked or redirected — no capability reachable without the `ADMIN` tier, checked per request, not just at nav-render time.
- View Users is verified, by test against the full user-record shape (not just the fields this spec lists), to never expose a password, session token, or OAuth token.
- Audit log entries are verified, by test against fixture data, to be recorded for every event type in Capability 3 AC1, each with correct outcome, timestamp, and user attribution, and to be immutable through the product's own UI.
- Feature flags are verified, by test, to produce exactly the same degraded-state behavior their affected surface already defines (`ai-features.md`'s degradation states when AI is off; `notifications-v2.md` AC7's failure-independent in-app behavior when email is off) — never a new, separately-designed broken state.
- Manage Categories is verified, by test, to affect only future signups — an existing user's already-seeded categories are unaffected by any template edit — and the template is verified to never be reducible to zero entries.
- Seed Demo Data is verified, by test, to (a) never accept or infer a target other than the fixed showcase account, and (b) be entirely unreachable — UI and underlying endpoint — in a production environment.
- Cross-user data leakage via any admin view (View Users, Audit Logs) is verified to be impossible by any request path, extending Risk #4's standing bar to this phase's admin-side views per Risk #18.
- Meets the release-level bar defined in the Project Charter: tests passing, Security Architect review (privilege escalation is this phase's headline focus per Risk #18, plus audit-log tamper-resistance and feature-flag access control), Performance Engineer review, documentation, and CTO/architecture sign-off.

## Dependencies

- The admin authorization mechanism (Solution Architect + Database Architect's 4c pass, per Risk #18) — every capability above depends on it existing before any Admin backend work starts.
- The DB-backed system-category-template model (Solution Architect + Database Architect's 4c pass, per Risk #25) — Capability 5 cannot be implemented against the current hardcoded `DEFAULT_CATEGORIES` constant read by `src/lib/auth.ts`'s signup hook.
- `prisma/seed-showcase.ts` / `npm run seed:showcase` (already exists) — Capability 6 exposes and triggers this script; it is not reimplemented.
- 4a's AI features (`ai-features.md`) and their existing data (category suggestions, monthly summary generation, spending insights, financial health score narrative generation) — source of Capability 3's AI-usage audit entries and Capability 4's AI kill-switch behavior.
- 4b's Reports (`reports.md`) and Notifications v2 (`notifications-v2.md`, including its email-delivery status tracking) — source of Capability 3's report-generation and email-send audit entries, and Capability 4's email kill-switch behavior.
- **Genuine gap, flagged for the architecture pass rather than assumed solved:** Reports (4b) currently has no persisted record of when a report was generated — it is an on-demand rendering with no stored generation-event row (`reports.md`). Capability 3's report-generation audit entries need the Database Architect to decide whether to add a lightweight generation-event log as part of 4c's schema pass, since there is no existing row to surface for this one event type the way there already is for the other three (category suggestions, notification email status, and — pending the architecture pass's own design — feature flag/template change history).
- Better Auth's `Session` model (existing, Phase 0) — source of Capability 2's "last active" signal.

## Success Metrics

- Time from an incident being noticed to the relevant feature flag being toggled off — a direct measure of whether the kill-switch capability delivers its intended value (fast mitigation without a deploy).
- Number of starter-category-template edits made through the admin UI after launch, against zero in the product's entire history before it — a direct measure of whether this capability replaces the "engineer edits a constant and redeploys" workflow it exists to remove.
- Number of demo-data refreshes triggered through the admin UI versus through the command line — adoption of the self-service trigger over the original script-only workflow.
- Zero reported incidents of a non-admin reaching any admin route or action.
- Zero reported incidents of View Users or Audit Logs exposing a credential/secret, or another user's financial data, through any admin view.

## Open Questions

These are genuine ambiguities this spec surfaces but does not resolve — flagged rather than silently decided:

1. **Audit log retention.** No retention or expiration policy is defined anywhere in this spec, the Roadmap, or the risk register for how long audit log entries (or the underlying rows they surface, e.g. category suggestions) are kept. This is a real product and storage-growth question — indefinite retention vs. a rolling window — that affects the Database Architect's schema design. Needs a decision before or during the 4c architecture pass, not left implicit as "forever."
2. **Feature-flag governance.** This spec defines two initial flags (AI features, email delivery) but does not define a process for when a *future* feature should register its own flag — is that an ad hoc Admin-team decision each time, or does a future feature's own Definition of Done get a standing "register a flag if a kill switch is warranted" bullet? Not resolved here; flagged for the CTO alongside the standalone feature-flag-primitive framing already recommended in `roadmap.md`.
3. **"Last active" definition.** This spec requires a last-active signal (Capability 2, AC1) derived from session activity, but does not define precisely what counts as "active" (most recent session creation vs. renewal vs. some other signal) — left to the architecture pass, noted here so it isn't invented without a stated definition.
