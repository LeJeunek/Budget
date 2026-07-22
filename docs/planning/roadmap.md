# FinanceOS — Roadmap

Phases are sequential. Each phase must be feature-complete, tested, reviewed, and approved (per Release Manager checklist) before the next phase's features are architected. A phase is not "AI features" or "polish" scattered throughout — it is a vertical slice a user could actually use.

---

## Phase 0 — Foundation
**Goal:** empty repo → deployable skeleton with auth and a database, nothing else.

- Next.js 15 App Router project scaffold, TypeScript, Tailwind, shadcn/ui installed
- PostgreSQL provisioned (local dev via Docker; hosted for staging)
- Prisma initialized, connected, `User` model only
- Better Auth wired up: email login + Google OAuth
- Base app shell: sidebar layout, top nav, dark/light theme toggle, responsive breakpoints (no feature content yet)
- CI-equivalent local checks: typecheck, lint, test runner configured
- Deployment target decided and a "hello world" deploy verified

**Explicitly excluded:** any financial data model, any dashboard content.

**Owners:** CTO (this doc) → Solution Architect (project skeleton + folder structure) → Database Architect (User model only) → Backend Engineer (auth wiring) → Frontend Lead (shell layout).

**Status: done.**

---

## Phase 1 — Core MVP: Accounts, Transactions, Basic Dashboard
**Goal:** a user can add accounts, enter/import transactions, and see a real dashboard built from their own data. This is the load-bearing phase — the data model here (accounts, transactions, categories) underpins every later phase.

In scope:
- **Accounts**: create/edit/delete accounts of every type (checking, savings, credit card, cash, investment, retirement, crypto); balance, institution, interest rate, color
- **Transactions**: table with date/merchant/category/amount/account/notes/tags; search, sort, pagination, filters; manual add/edit/delete; CSV import; split transactions; notes.
- **Categories**: the fixed starter category list seeded automatically per user and protected from rename/delete; users can add/rename/recolor/delete their own custom categories on top of that set.
- **Dashboard Overview v1**: Net Worth, Monthly Income, Monthly Expenses, Cash Flow, Savings Rate; charts: Spending by Category, Income vs Expense, Monthly Trends
- **Global search v1**: transactions + accounts only
- Loading skeletons, toast notifications, basic responsive polish

**Hand-off:** Solution Architect designs Phase 1 folder structure, module boundaries, and API contracts next. Database Architect then extends the schema with Account, Transaction, Category, Tag models.

**Status: done.**

---

## Phase 2 — Budgeting, Goals, Bills
**Goal:** a user can plan a month, save toward something, and never miss a bill.

In scope:
- **Budgeting**: monthly planner per category, allocated/spent/remaining, progress bar, percentage used, over-budget indicator; Dashboard's "Remaining Budget" and "Budget Health Score" go live
- **Savings Goals**: goal CRUD, current progress, estimated completion, monthly contributions, remaining amount, progress visualization
- **Bills**: recurring bill CRUD, due dates, recurring schedule, paid/late status, upcoming list
- **Calendar v1**: bills + paydays only (paydays deferred in practice — see Phase 2's product spec — because Recurring Income didn't exist as a domain until Phase 3a; Calendar v1 shipped bills-only)
- **Notifications v1**: budget exceeded, bill due (in-app only)
- Receipt attachment, with file storage (UploadThing) wired up

**Hand-off:** Solution Architect + Database Architect extend schema with Budget, BudgetCategory, Goal, Bill, Receipt models before implementation starts.

**Status: done.**

---

## Phase 3 — Debt, Investments, Recurring Income, Analytics

### CTO decision (2026-07-20): split into Phase 3a and Phase 3b

Phase 3 as originally scoped bundles four data-owning domains (Debt, Investments, Recurring Income, broad Financial Goals) with a 12-metric Analytics suite in a single review cycle. Splitting it is the right call, for three concrete reasons rather than just "it's big":

1. **Real dependency chain, not just size.** Analytics' most meaningful metrics (net worth growth/history, income growth, income sources, subscription cost detection) and the Dashboard's Net Worth History chart are only meaningful once Debt, Investments, and Recurring Income data exists. Architecting Analytics before that data model is settled risks designing against a moving target — the same class of risk the schema-narrowness concern in Risk #1 already warns about. Building Analytics second, on a stable 3a data model, is lower-risk than building it concurrently.
2. **Review-cycle size.** Phase 2 already showed that three parallel independent domains (Budgeting/Goals/Bills) plus one dependent one (Notifications) was near the practical ceiling for a single clean review cycle before things start slipping (session-limit interruptions, doc-conflict discovery mid-implementation). Phase 3 as originally scoped is four independent domains *plus* a 12-item analytics suite — meaningfully larger than Phase 2. Splitting keeps each sub-phase's Product Owner → Architect → Database Architect → Backend → Frontend → Review pipeline at a size this team has already proven it can execute cleanly.
3. **Charter's "demoable increment" principle.** The Charter requires each phase produce a usable, demoable increment, not just a checkpoint. "Debt + Investments + Recurring Income" is itself a complete, demoable increment (a user's full net worth and income picture becomes accurate). "Analytics + broad Financial Goals + Net Worth History" is a distinct, later increment (insight and analysis *on top of* data that already exists). Forcing both into one un-splittable phase would mean nothing ships until both are done.

The split follows the natural data-dependency line: **3a produces the data, 3b produces the insight.** Financial Goals (broad) is placed in 3b rather than 3a because one of its three goal types — "pay off debt" — is blocked on 3a's Debt Tracker; it's also conceptually closer to the tracking/completion layer 3b represents than to the raw data-entry layer 3a represents.

The 3a/3b boundary is binding, per Risk #6/#13 — no feature moves across it without CTO approval.

---

## Phase 3a — Debt, Investments, Recurring Income
**Goal:** the user's net worth and income picture becomes complete and accurate — what's owed and what's invested are no longer missing from the dashboard.

In scope:
- **Debt Tracker**: credit cards/loans/student loans/mortgage; balance, interest rate, minimum payment, payoff date, total interest remaining, snowball vs avalanche comparison
- **Investments**: portfolio overview (stocks, ETFs, 401k, IRA, crypto), current value, gain/loss, allocation, historical growth, sector allocation, dividend income (manual entry, not live market data feeds — that remains a post-v1 decision)
- **Recurring income tracking**: salary, side hustles, dividends, rental income, bonuses
- **Net Worth aggregation update**: extend the existing Phase 1 `getNetWorth` dashboard service to include Debt liabilities and Investment values (the chart itself stays off until 3b — see below)
- **Net Worth Snapshot capture (backend only, no UI)**: begin periodically recording net worth (and its Debt/Investment/Account components) as soon as this data exists. This does **not** wait for 3b's Net Worth History chart — if snapshotting only starts when the chart is built, the chart launches with an empty history and is useless for months. See Risk #10.

**Open schema question — for the Database Architect, not decided here:** the `Account` model already has a `type` discriminator covering `CREDIT_CARD`/`INVESTMENT`/`RETIREMENT`/`CRYPTO`. The Database Architect must decide and document whether Debt and Investments are:
(a) new models (`Debt`, `Investment`/`Holding`) that reference an existing `Account` of the matching type, or
(b) standalone models independent of `Account`, or
(c) some hybrid (e.g., an `Account` remains the ledger-balance record, a linked `Debt`/`Investment` record holds the type-specific fields — interest rate, payoff schedule, holdings, allocation — that don't belong on the generic `Account` model).
This decision directly affects how straightforward the Net Worth aggregation update and 3b's Analytics queries will be — resolve it once, explicitly, before backend implementation starts (Risk #9).

**Milestones (build order and why):**
1. **Product Owner specs** for Debt Tracker, Investments, Recurring Income — independent domains, can be dispatched in parallel (same pattern as Phase 2's Budgeting/Goals/Bills).
2. **CTO resolution pass** for any cross-doc conflicts the specs surface (established pattern from every prior phase — resolve directly rather than letting an implementing agent guess).
3. **Solution Architect + Database Architect**, one combined pass covering all three domains — this is where the Account-linkage question above gets decided and documented in `docs/database/`.
4. **Backend implementation, front-loaded by complexity:** Investments first, as its own dedicated pass (it is the most complex piece — valuation, allocation, gain/loss, historical growth, dividend income — surfacing problems here first while there's still schedule slack). Then Debt Tracker and Recurring Income in parallel (both independent of Investments and of each other).
5. **Net Worth aggregation update** (extends Phase 1's dashboard service) — depends on both Debt and Investments being complete.
6. **Net Worth Snapshot job** goes live — depends on step 5.
7. **Frontend** for Debt, Investments, Recurring Income (Frontend Lead, same domain-component pattern established in Phase 1/2).
8. **Full 3a review gate**: Security Architect (financial data sensitivity — same standing concern as Risk #4, now covering debt/investment balances), Performance Engineer (portfolio/payoff calculations), Bug Hunter, full live end-to-end browser verification against real data, Release Manager sign-off. **3b's architecture does not start until this gate is passed**, per this roadmap's own phase-gate rule.

**Status: done.**

---

## Phase 3b — Analytics, Net Worth History, Financial Goals
**Goal:** turn the now-complete data picture into insight — this is what makes the dashboard genuinely useful, and it closes out v1.

In scope:
- **Net Worth History chart** on the Dashboard goes live (snapshot data has been accumulating since the end of 3a)
- **Analytics** (full suite): yearly spending, category trends, income growth, savings growth, net worth growth/history, daily spending heatmap, expense distribution, budget vs actual, top merchants, largest purchases, income sources, subscription cost detection
- **Financial Goals (broad)**: pay off debt / save $X / increase savings rate — completion tracking, distinct from Savings Goals' single-target model. Product Owner must explicitly define the boundary between this and the existing Savings Goal model before schema work begins (Risk #12).

**Milestones (build order and why):**
1. **Product Owner spec pass**, grounded in 3a's now-live schema, covering Net Worth History, the full Analytics list, and Financial Goals (broad) — including the explicit SavingsGoal-vs-FinancialGoal boundary call-out above.
2. **Solution Architect + Database Architect**: Analytics is primarily a read/query layer over existing data (Transaction, Category, Budget, plus 3a's Debt/Investment/Recurring Income and the new Net Worth Snapshot) — the Architect must decide whether raw aggregation queries are sufficient or whether materialized/cached aggregates are needed given Risk #11. Schema work for the new `FinancialGoal` model happens here too.
3. **Build order:**
   a. **Net Worth History chart** first — smallest scope, highest visual payoff, and its data has already been accumulating since 3a shipped.
   b. **Analytics suite**, split into two backend passes to keep review-cycle size manageable (mirroring the reasoning behind the 3a/3b split itself): **Pass 1** — metrics derivable from data that has existed since Phase 1/2 (yearly spending, category trends, expense distribution, budget vs actual, top merchants, largest purchases, daily spending heatmap). **Pass 2** — metrics that depend on 3a's new models (income growth, income sources, savings growth, subscription cost detection).
   c. **Financial Goals (broad)** last — the smallest of the three 3b components, and its debt-payoff goal type depends on 3a's Debt Tracker, which is already live by this point.
4. **Full 3b review gate**: Security Architect, Performance Engineer (analytics query load, per Risk #11), Bug Hunter, full live end-to-end browser verification, Release Manager sign-off.

**v1 ships at the end of Phase 3b**, per the Charter's success definition (see the 2026-07-20 correction note in `project-charter.md`).

**Status: done. v1 shipped — see `docs/release/v0.1.0-notes.md` and `v0.1.0-checklist.md`.**

---

## Phase 4 — AI Features, Reports, Notifications v2, Customization, Admin

### CTO decision (2026-07-21): split into Phase 4a, 4b, 4c

Phase 4 as originally scoped bundles six technically distinct domains — AI/LLM integration, PDF generation, notification infrastructure + email delivery, calendar UI, theming/customization, and admin tooling — into one review cycle. This is a materially different, more *heterogeneous* mix than Phase 3's four data-domains-plus-analytics: Phase 3's pieces were all variations on "model and surface financial data," whereas Phase 4's pieces don't share a common technical shape at all. Splitting is the right call, for three concrete reasons:

1. **Risk-profile isolation, not just size.** AI is the one domain in this phase with a standing, explicit, per-feature Security Architect review requirement (Risk #2 — prompt injection via user-controlled transaction/merchant text) and it is also the *first LLM integration this codebase has ever had* — there is no existing pattern for prompt construction, structured-output validation, or third-party-model data handling to build on. Bundling it into the same review cycle as, say, accent-color theming would either dilute the scrutiny the AI work specifically needs, or force low-risk cosmetic work to wait behind a slower, higher-scrutiny review pipeline it doesn't need. Isolating it into its own sub-phase (4a) lets the AI-specific review pattern (design-stage security pass *and* pre-release security pass — see 4a milestones) get the dedicated attention Risk #2 calls for, without holding up the rest of Phase 4.
2. **A second, distinct risk-profile grouping: new external data-egress surfaces.** Reports (PDF generation) and Notifications v2 (email delivery) are grouped together (4b) because both are, for the first time in this codebase, features that take a user's financial data *outside the app boundary* — a PDF file a user downloads and may forward, an email sent through a third-party transactional-email provider. Neither depends on the AI work in 4a (a monthly PDF report and a low-balance email are just aggregation + rendering/delivery, not intelligence), but both require a net-new external service dependency (a PDF renderer, an email provider) that doesn't exist in this codebase yet, and both deserve their own Security Architect review pass focused on that egress surface (unauthorized report generation for another user's data, email content/PII exposure) — a materially different review focus than AI's prompt-injection concern. Grouping these two together, and only these two, keeps that review focused.
3. **Dependency-order and review-cycle-size argument for the third group.** Calendar v2, Customization, and Admin (4c) share no new external dependency and no elevated security posture on their own *except* Admin, which introduces this codebase's first-ever privilege tier (no `role`/admin concept exists on `User` today) and therefore its first authorization-bypass risk surface beyond "wrong user, right role." Admin is grouped with the two lower-risk domains rather than isolated further because (a) three sub-phases is already a meaningful increase in process overhead for one phase and a fourth would push past what Phase 2/3's proven cadence supports, and (b) Admin's audit-log feature is materially more useful, and more demoable, built *after* 4a and 4b ship — there is little to audit in an app with no AI decisions, no report downloads, and no email sends yet. Sequencing Admin last, as part of 4c, means its audit log launches with real events to show instead of an empty log — the same "don't build the empty-history feature first" reasoning Risk #10 already established for the Net Worth Snapshot job.

The 4a → 4b → 4c boundaries are binding, same as 3a/3b (Risk #6/#13, extended to Phase 4 below as Risk #16): no feature moves across a boundary without CTO approval. Each gate is sequential — 4b's architecture does not start until 4a's review gate passes, and 4c's does not start until 4b's does — consistent with this roadmap's standing phase-gate rule and with how 3a/3b was actually run.

**Two stale cross-doc scope items resolved here, before Product Owner work starts** (same pattern as the AI-insight/v1-bar correction in `project-charter.md` and the SavingsGoal/FinancialGoal boundary in 3b):

- **"Custom categories" is removed from 4c's User Customization scope.** Phase 1 already shipped full per-user custom category CRUD (add/rename/recolor/delete on top of the protected starter set) — see `docs/product/categories.md`, confirmed live in `src/features/categories/`. The original Phase 4 bullet list predates that spec's resolution and is now a stale duplicate. Nothing is lost: if a genuinely new categories capability surfaces later (e.g., category icons, nesting/grouping), it gets its own spec at that time, not folded silently into "customization."
- **Admin's "manage categories" is a distinct feature from the above, and must be spec'd as such.** Read literally, it plausibly means an admin-level capability to edit the *global starter-category template* every new user is seeded with (the 11 system categories), not a user's own custom categories. Product Owner must state this explicitly in the Admin spec rather than leave it ambiguous, since the two are easy to conflate given the naming collision.
- **Calendar v2 should explicitly pick up paydays**, not just "recurring transactions, budget reset" as currently worded. Calendar v1's product spec explicitly deferred paydays because Recurring Income didn't exist yet as a domain ("deferred to whenever Phase 3's recurring income feature ships and can be layered onto this same calendar view at that point" — `docs/product/calendar-and-notifications.md`). Recurring Income shipped in 3a. Product Owner should treat paydays as in-scope for Calendar v2 even though the current roadmap bullet doesn't name it, so this deferred item isn't silently dropped.

---

## Phase 4a — AI Features
**Goal:** the dashboard gets its first genuinely "smart" layer — a standalone, demoable increment on its own (auto-categorized transactions, a budget advisor, monthly summaries, spending insights, a financial health score) that does not depend on anything else in Phase 4.

In scope:
- **Transaction auto-categorization**: suggest a category for uncategorized (or newly imported) transactions, with user review/override — never silently overwrite a user's own categorization
- **AI budget advisor**: recommendations against the existing Budgeting data (Phase 2)
- **Automatic monthly summaries**: natural-language recap of the month's financial activity
- **Spending insights**: pattern-level observations surfaced to the user (e.g. unusual spending, trend call-outs)
- **Financial Health Score (0–100)**: see the open scope question below before this is spec'd

**Cross-cutting technical decision flagged, not made here:** which LLM/AI provider and integration approach to use. This codebase has **no existing AI/LLM integration of any kind** — this is a foundational choice, not an implementation detail, and it is the Solution Architect's (working jointly with the AI Engineer, per that role's charter) to make as part of 4a's architecture pass, not the CTO's to pick unilaterally. The CTO is, however, setting binding constraints on that choice, consistent with "approve architecture" and "review scalability":
  - Structured/validated output only — every model response must be parseable against a Zod schema before it touches the database or is trusted by any other service (already required by Risk #2's mitigation; restated here because it constrains provider choice, e.g. providers with reliable JSON/tool-call modes are strongly preferred over freeform text parsing).
  - Minimize what's sent to the third-party model — transaction/merchant text is the minimum necessary for categorization/insights; no sending full account numbers, auth tokens, or unrelated users' data. This is a data-privacy constraint on the integration design, not just a security-review checklist item.
  - The integration must be swappable — isolate provider-specific calls behind a single module boundary in `lib/ai/` (per the AI Engineer's existing role charter) so a future provider change is a contained swap, not a rewrite. Avoids vendor lock-in becoming a long-term maintainability problem.
  - Cost/latency must be bounded and observable — no unbounded per-request fan-out (e.g. one model call per transaction on every page load); caching/batching strategy is an architecture-pass decision, not an afterthought.

**Open scope question — for the Product Owner to resolve in the spec, not decided here:** is the Financial Health Score an LLM-computed judgment, or a deterministic formula over existing Analytics/Debt/Budget data (debt-to-income, savings rate, budget adherence, net worth trend) with an optional AI-generated narrative layered on top? This materially changes module ownership — a deterministic score is primarily Backend Engineer's extension of existing Analytics services with AI Engineer only adding narration text, whereas an LLM-computed score puts the AI Engineer in the critical path for a number users will treat as authoritative. Resolve this explicitly before the Solution Architect pass, the same way Risk #12 required an explicit boundary call before 3b's `FinancialGoal` schema work began.

**Milestones (build order and why):**
1. **Product Owner spec pass** for all five AI features. Unlike 3a's three fully independent domains, these five share one technical foundation and one review theme (they are not independently dispatchable in the same sense) — spec them as one cohesive "AI Features" document set, but resolve the Financial Health Score scope question above as part of this pass, before architecture.
2. **Solution Architect + AI Engineer joint architecture pass**: resolve the LLM provider/approach question within the constraints above; define `lib/ai/` module boundaries, prompt structure, and Zod structured-output schemas; define rate-limiting/cost-control strategy; define fallback behavior when the model is unavailable or returns invalid output (the product must degrade gracefully, not break). Database Architect determines whether new tables are needed (e.g. a suggestion/audit trail for auto-categorization, a historical `FinancialHealthScore` snapshot table analogous to 3a's Net Worth Snapshot).
3. **Design-stage Security Architect review**, before backend implementation starts — a refinement of Risk #2's mitigation specifically for this sub-phase: because this is the first AI feature ever built here, review the prompt-injection defense and structured-output validation plan at the design stage, not only at the final pre-release gate, to avoid costly rework if the defense pattern needs to change.
4. **Backend implementation, foundation-first:** transaction auto-categorization first — it establishes the reusable prompt/structured-output/Zod-validation pattern the other four features build on. The remaining four follow in whatever dependency order the architecture pass determines (e.g. if the Health Score consumes Spending Insights or Budget Advisor output, it is built last).
5. **Frontend** for all five surfaces (Frontend Lead + UI Component Engineer): categorization review/override UI, budget advisor card, monthly summary view, insights widget, health score display.
6. **Full 4a review gate**: Security Architect (final pre-release review per Risk #2 — prompt injection, structured-output validation, no unnecessary data sent to the model), Performance Engineer (LLM latency/cost, caching), Bug Hunter, full live end-to-end browser verification, Release Manager sign-off. **4b's architecture does not start until this gate passes.**

---

## Phase 4b — Reports & Notifications v2
**Goal:** a user's financial data can leave the app in controlled, useful ways for the first time — a downloadable PDF report, and notifications that reach them by email, not just in-app.

In scope:
- **Reports**: PDF generation — monthly, yearly, tax summary, income, expense, cash flow
- **Notifications v2**: new trigger types (goal achieved, large purchase, low balance, weekly/monthly summary) extending the existing Phase 2 `Notification` model and in-app infrastructure; new delivery channel — email

**Cross-cutting technical decisions flagged, not made here** (both are the Solution Architect's to resolve during 4b's architecture pass — the CTO is setting the constraints that bound each choice):
  - **PDF generation library.** This codebase deploys to a serverless target (Vercel, per Phase 0's deployment decision). Headless-browser-based PDF rendering (e.g. a full Chromium instance) carries real constraints in that environment — cold-start latency, function size limits, execution-time limits — that a lighter, non-browser JS-native renderer would not. The Solution Architect must weigh this deployment constraint explicitly against rendering fidelity needs (charts/tables in the reports) when choosing an approach; this is a scalability concern (Risk #5) as much as a library pick.
  - **Email delivery provider.** This codebase has **no email-sending infrastructure of any kind today** — not even for auth (Better Auth's email verification, if used, and this feature are both greenfield). This is a foundational choice (transactional email provider, API keys/secrets management, deliverability, unsubscribe/preference handling for compliance) that the Solution Architect makes jointly with the Backend Engineer, within a constraint the CTO is setting now: financial-content emails (balances, summaries) are itself a new data-egress surface and must be scoped by the same "no cross-user leakage" discipline as every other feature (Risk #4), plus a new **Security Architect review focused specifically on email content** (see Risk #17 below) before release.

**Milestones (build order and why):**
1. **Product Owner spec pass** for Reports and Notifications v2 — two related but independent domains (both consume already-existing data; neither depends on 4a), dispatchable in parallel, same pattern as 3a's independent domains.
2. **CTO resolution pass** for any cross-doc conflicts the specs surface (standing pattern).
3. **Solution Architect + Database Architect** combined pass: resolves the PDF library and email provider questions above within their stated constraints; extends the `Notification` model/enum for the new trigger types; designs the email-sending module boundary (kept separate from `lib/ai/` and from the PDF renderer — three independent concerns, not one grab-bag utility module).
4. **Backend implementation:** PDF report generation first (no dependency on the email provider decision), then Notifications v2's new triggers and the email delivery channel.
5. **Frontend**: report download/export UI, notification preference settings (which triggers, which channels).
6. **Full 4b review gate**: Security Architect (report/download authorization — a user must never be able to generate or fetch another user's report; email content/PII exposure and unsubscribe compliance), Performance Engineer (PDF generation cost/latency per Risk #5), Bug Hunter, full live end-to-end browser verification, Release Manager sign-off. **4c's architecture does not start until this gate passes.**

---

## Phase 4c — Calendar v2, Customization, Admin
**Goal:** the app becomes something a user can make feel like their own, and the team gets the operational tooling to run it — closing out Phase 4.

In scope:
- **Calendar v2**: recurring transactions, budget reset, and paydays (see the scope-completeness note above — paydays were deferred from Calendar v1 pending Recurring Income, which shipped in 3a)
- **User customization**: themes, currency display, dashboard layout/widgets, accent colors (custom categories excluded — see the resolved stale-scope note above)
- **Admin**: seed demo data, manage categories (the global starter-category template — see the resolved scope note above), view users, audit logs, feature flags

**Cross-cutting technical decision flagged, not made here:** the shape of admin authorization. No `role`/permission concept exists on `User` today — this is a net-new, foundational authorization tier for the app, not a detail to be improvised inside an Admin feature spec. The Solution Architect and Database Architect must decide the mechanism (a `role` field on `User`, a separate `AdminUser`/permissions table, etc.) as its own explicit, reviewed milestone — the same discipline Risk #9 required for 3a's Account-linkage decision — before any Admin backend work starts.

**Recommendation for the Solution Architect's consideration (not a mandate):** since Admin's feature-flag capability could plausibly have been useful to gate 4a's AI rollout or 4b's email delivery if either needed to be disabled quickly post-launch, the architecture pass should consider whether a minimal, standalone feature-flag primitive is worth building as a small cross-cutting utility rather than being scoped as "just another Admin screen" — it may be useful sooner and more broadly than the rest of Admin.

**Milestones (build order and why):**
1. **Product Owner spec pass** for Calendar v2, Customization, and Admin — three domains, dispatchable in parallel (Calendar v2 and Customization are genuinely independent of each other and of Admin; Admin's audit-log spec should explicitly reference what 4a/4b now produce that's worth auditing, per the dependency reasoning above).
2. **CTO resolution pass** for any cross-doc conflicts (standing pattern).
3. **Solution Architect + Database Architect** combined pass: resolves the admin authorization-shape question above; designs Calendar v2's extension of the existing calendar view; designs the Customization preference model (likely a new per-user settings/preferences table, given no such model exists yet).
4. **Backend implementation, sequenced:** Admin's authorization layer first (it is a prerequisite for every other Admin capability — view users, audit logs, feature flags, manage categories all need it), then Calendar v2 and Customization in parallel (both independent of Admin and of each other).
5. **Frontend**: Calendar v2 view updates, Customization settings UI (theme/currency/layout/accent), Admin dashboard screens.
6. **Full 4c review gate**: Security Architect (admin authorization is the headline concern here — privilege escalation, audit-log tamper-resistance, feature-flag access control), Performance Engineer, Bug Hunter, full live end-to-end browser verification, Release Manager sign-off.

**Phase 4 is complete when 4c's review gate passes.**

---

## Phase 5 — Motion & Craft Pass
**Goal:** "software someone would pay for."

- Number counters, chart transitions, smooth page transitions, expandable cards — applied as a dedicated pass across all existing screens, not bolted on per-feature
- Full accessibility pass (E2E Engineer + manual review)
- Full responsive audit: desktop/tablet/mobile, collapsible sidebar, bottom navigation on mobile

This phase is deliberately last: polishing screens that are still changing structurally in Phases 1–4 would be wasted or re-done work.

---

## Immediate next step
**Phase 4a is ready for the Product Owner.** Dispatch a single "AI Features" spec pass covering transaction auto-categorization, AI budget advisor, automatic monthly summaries, spending insights, and the Financial Health Score. The Product Owner must explicitly resolve the Financial Health Score scope question (deterministic formula vs. LLM-computed — see Phase 4a above) as part of this spec, before the Solution Architect + AI Engineer architecture pass begins. Do not let the Product Owner or an implementing agent guess at the LLM provider/approach — that is flagged for the architecture pass, within the constraints Phase 4a states above. 4b (Reports & Notifications v2) and 4c (Calendar v2, Customization, Admin) do not get architected until 4a's review gate passes.
