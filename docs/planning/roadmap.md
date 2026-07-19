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

---

## Phase 1 — Core MVP: Accounts, Transactions, Basic Dashboard
**Goal:** a user can add accounts, enter/import transactions, and see a real dashboard built from their own data. This is the load-bearing phase — the data model here (accounts, transactions, categories) underpins every later phase.

In scope:
- **Accounts**: create/edit/delete accounts of every type (checking, savings, credit card, cash, investment, retirement, crypto); balance, institution, interest rate, color
- **Transactions**: table with date/merchant/category/amount/account/notes/tags; search, sort, pagination, filters; manual add/edit/delete; CSV import; split transactions; notes. (Receipt attachment can slip to Phase 2 if storage integration adds risk — Architect's call.)
- **Categories**: the fixed starter category list (Housing, Utilities, Transportation, Food, Entertainment, Shopping, Healthcare, Insurance, Investments, Savings, Misc) seeded automatically per user and protected from rename/delete; users can add/rename/recolor/delete their own custom categories on top of that set. (Scope note, 2026-07-19: this is a small, scoped CRUD surface — bulk merge, icons, ordering, and org-wide admin controls are still Phase 4. See `docs/architecture/api-contracts.md`'s Categories section for the resolved contract.)
- **Dashboard Overview v1**: Net Worth, Monthly Income, Monthly Expenses, Remaining Budget (once budgeting exists — see Phase 2, so this may show "no budget set" state), Cash Flow, Savings Rate; charts: Spending by Category, Income vs Expense, Monthly Trends
- **Global search v1**: transactions + accounts only (expand scope in later phases)
- Loading skeletons, toast notifications, basic responsive polish (established as patterns here, reused everywhere after)

Out of scope (deferred to later phases): budgeting allocations, goals, bills, debt tracker, investments portfolio, AI, notifications, calendar, PDF reports, admin features, bulk edit UI (can follow once table is stable).

**Hand-off:** Solution Architect designs Phase 1 folder structure, module boundaries, and API contracts next. Database Architect then extends the schema with Account, Transaction, Category, Tag models.

---

## Phase 2 — Budgeting, Goals, Bills
**Goal:** a user can plan a month, save toward something, and never miss a bill.

In scope:
- **Budgeting**: monthly planner per category, allocated/spent/remaining, progress bar, percentage used, over-budget indicator; Dashboard's "Remaining Budget" and "Budget Health Score" go live
- **Savings Goals**: goal CRUD, current progress, estimated completion, monthly contributions, remaining amount, progress visualization
- **Bills**: recurring bill CRUD, due dates, recurring schedule, paid/late status, upcoming list
- **Calendar v1**: bills + paydays only (recurring transactions/budget reset/goals can extend this later)
- **Notifications v1**: budget exceeded, bill due (in-app only; email/push is a Phase 4+ decision)
- Receipt attachment (if deferred from Phase 1) lands here with file storage (UploadThing) wired up

**Hand-off:** Solution Architect + Database Architect extend schema with Budget, BudgetCategory, Goal, Bill models before implementation starts.

---

## Phase 3 — Debt, Investments, Recurring Income, Analytics
**Goal:** the full financial picture — what's owed, what's invested, what's coming in — plus the analytics depth that makes the dashboard genuinely useful.

In scope:
- **Debt Tracker**: credit cards/loans/student loans/mortgage; balance, interest rate, minimum payment, payoff date, total interest remaining, snowball vs avalanche comparison
- **Investments**: portfolio overview (stocks, ETFs, 401k, IRA, crypto), current value, gain/loss, allocation, historical growth, sector allocation, dividend income (manual entry, not live market data feeds — that's a v2 decision)
- **Recurring income tracking**: salary, side hustles, dividends, rental income, bonuses
- **Financial Goals (broad)**: pay off debt / save $X / increase savings rate — completion tracking, distinct from Savings Goals' single-target model
- **Analytics** (full suite): yearly spending, category trends, income growth, savings growth, net worth growth/history, daily spending heatmap, expense distribution, budget vs actual, top merchants, largest purchases, income sources, subscription cost detection
- Net Worth History chart on Dashboard goes live (needs debt + investments to be meaningful)

This is the largest phase — the Architect should evaluate splitting Debt/Investments from Analytics into 3a/3b if the CTO's later scalability review flags it as too large for one review cycle.

**v1 ships at the end of this phase**, per the Charter's success definition.

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
**Phase 0 is ready for the Solution Architect.** Hand this roadmap and the Charter to the `solution-architect` agent to produce the initial repo skeleton design (folder structure, naming conventions, module boundaries) for Phase 0 + the Phase 1 domain shape, so the Database Architect can model `User`, `Account`, `Transaction`, `Category` immediately after.
