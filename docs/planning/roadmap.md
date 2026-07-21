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
- **Calendar v1**: bills + paydays only
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

---

## Phase 4 — AI Features, Reports, Notifications v2, Customization, Admin
**Goal:** the differentiators and the operational tooling.

In scope:
- **AI**: transaction auto-categorization, AI budget advisor, automatic monthly summaries, spending insights, Financial Health Score (0–100)
- **Reports**: PDF generation (monthly, yearly, tax summary, income, expense, cash flow)
- **Notifications v2**: goal achieved, large purchase, low balance, weekly/monthly summary; email delivery
- **Calendar v2**: recurring transactions, budget reset
- **User customization**: themes, currency display, custom categories, dashboard layout/widgets, accent colors
- **Admin**: seed demo data, manage categories, view users, audit logs, feature flags

Each AI feature requires a Security Architect review (prompt injection via transaction/merchant text is a real risk — flagged in the risk register) before release.

---

## Phase 5 — Motion & Craft Pass
**Goal:** "software someone would pay for."

- Number counters, chart transitions, smooth page transitions, expandable cards — applied as a dedicated pass across all existing screens, not bolted on per-feature
- Full accessibility pass (E2E Engineer + manual review)
- Full responsive audit: desktop/tablet/mobile, collapsible sidebar, bottom navigation on mobile

This phase is deliberately last: polishing screens that are still changing structurally in Phases 1–4 would be wasted or re-done work.

---

## Immediate next step
**Phase 3a is ready for the Product Owner.** Dispatch specs for Debt Tracker, Investments, and Recurring Income (can be parallel-dispatched — independent domains, same pattern as Phase 2's Budgeting/Goals/Bills). Flag the Account-linkage schema question (see Phase 3a section above) for the Database Architect's design pass once specs land — do not let the Product Owner or an implementing agent guess at that decision.
