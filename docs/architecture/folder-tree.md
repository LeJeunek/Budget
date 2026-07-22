# FinanceOS — Folder Tree (Phase 0 + Phase 1 + Phase 2 + Phase 3a + Phase 3b + Phase 4a foundation)

Phase 0/1 files are listed concretely below, unchanged from the original design. Phase 2 additions are listed in their own section. Phase 3a additions (Debt Tracker, Investments, Recurring Income, Net Worth aggregation update, Net Worth Snapshot job) are listed in their own section further down. Phase 3b additions (Net Worth History chart, Analytics, Financial Goals) are listed in their own section. Phase 4a additions (`lib/ai/` plus all five AI features: Transaction Auto-Categorization, AI Budget Advisor, Automatic Monthly Summaries, Spending Insights, Financial Health Score) are listed in the final section, per `docs/product/ai-features.md` and `docs/architecture/ai-features-design.md`.

```
Budget/
├── .claude/
│   └── agents/                      # role subagent definitions (done)
├── docs/                            # planning/architecture/etc. docs (this tree)
├── prisma/
│   ├── schema.prisma                # Database Architect
│   └── seed.ts                      # Database Architect
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # root layout: theme provider, fonts
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx            # unauthenticated layout (no sidebar)
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # authenticated shell: sidebar + top nav
│   │   │   ├── page.tsx              # Dashboard Overview (Phase 1)
│   │   │   ├── accounts/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [accountId]/page.tsx
│   │   │   └── transactions/
│   │   │       └── page.tsx
│   │   └── api/
│   │       ├── auth/[...all]/route.ts   # Better Auth handler
│   │       ├── accounts/route.ts
│   │       └── transactions/
│   │           ├── route.ts
│   │           └── import/route.ts       # CSV import endpoint
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn primitives (button, input, dialog, etc.)
│   │   └── shared/
│   │       ├── data-table/           # generic TanStack Table wrapper
│   │       ├── stat-card.tsx
│   │       ├── progress-ring.tsx
│   │       ├── sidebar.tsx
│   │       ├── top-nav.tsx
│   │       ├── theme-toggle.tsx
│   │       └── loading-skeleton.tsx
│   │
│   ├── features/
│   │   ├── accounts/ … transactions/ … dashboard/ … categories/    # Phase 1 — unchanged
│   │   ├── budgeting/ … goals/ … bills/ … notifications/           # Phase 2 — see below
│   │   ├── debt/ … investments/ … recurring-income/                # Phase 3a — see below
│   │   ├── analytics/                 # Phase 3b — see below
│   │   ├── financial-goals/           # Phase 3b — see below
│   │   └── financial-health-score/    # Phase 4a — NEW module, see below
│   │
│   ├── lib/
│   │   ├── db.ts                     # Prisma singleton
│   │   ├── auth.ts                   # Better Auth instance + getCurrentUser()
│   │   ├── api-response.ts           # { success, data } | { success, error } helper
│   │   ├── utils.ts                  # cn(), formatCurrency(), formatDate()
│   │   └── ai/                       # Phase 4a — NOW POPULATED, see below (was reserved/empty)
│   │
│   └── tests/
│       ├── integration/              # Integration Test Engineer — reserved
│       └── e2e/                      # E2E Test Engineer — reserved
│
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Notes (Phase 0/1, unchanged)

- `src/` is used (not root-level `app/`) to keep config files uncluttered at the repo root as the project grows.
- Route groups `(auth)` and `(dashboard)` split layouts without affecting URL structure.
- `features/<domain>/components/` holds domain-aware composed UI (knows about Account/Transaction types, may call hooks); `components/shared/` holds domain-agnostic building blocks only.
- Every `features/<domain>/server/*.ts` file must call `getCurrentUser()` from `lib/auth.ts` and scope every Prisma query by that user's ID — this is the concrete implementation of risk register item #4.

---

## Phase 2 additions

Four new feature modules (`budgeting`, `goals`, `bills`, `notifications`), plus a receipts addendum to `transactions`, and `lib/uploadthing.ts` + its Route Handler.

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── budgeting/page.tsx        # ?month=YYYY-MM searchParam
│   │   ├── goals/
│   │   │   ├── page.tsx
│   │   │   └── [goalId]/page.tsx
│   │   └── bills/
│   │       ├── page.tsx
│   │       └── [billId]/page.tsx
│   │
│   └── api/
│       ├── goals/route.ts
│       ├── bills/route.ts
│       ├── notifications/route.ts
│       └── uploadthing/
│           ├── core.ts
│           └── route.ts
│
├── components/shared/month-navigator.tsx
│
├── features/
│   ├── transactions/                 # Phase 2 adds receipts.ts + receipt components
│   ├── budgeting/{server/{service.ts, actions.ts, validation.ts}, types.ts, components/}
│   ├── goals/{server/, types.ts, hooks/use-goals.ts, components/}
│   ├── bills/{server/{service.ts, occurrence.ts, actions.ts, validation.ts}, types.ts, hooks/, components/}
│   └── notifications/{server/, types.ts, hooks/, components/}
│
└── lib/uploadthing.ts
```

---

## Phase 3a additions

Three new feature modules (`debt`, `investments`, `recurring-income`), two new shared `lib/` utilities (`recurrence.ts`, `transaction-link-guard.ts`), touches to `bills/server/occurrence.ts` and `bills/server/actions.ts`, an addition to `dashboard` (`snapshot.ts` + extended `getNetWorth`), and `api/cron/net-worth-snapshot`.

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── debt/page.tsx             # (as-built path — see note below)
│   │   ├── investments/
│   │   │   ├── page.tsx
│   │   │   └── [holdingId]/page.tsx  # (as-built: keyed by holdingId — see note below)
│   │   └── income/
│   │       ├── page.tsx
│   │       └── [streamId]/page.tsx
│   │
│   └── api/
│       ├── debts/route.ts
│       ├── investments/route.ts
│       ├── income/route.ts
│       └── cron/net-worth-snapshot/route.ts
│
├── features/
│   ├── debt/{server/{service.ts, actions.ts, validation.ts}, payoff-math.ts, types.ts, hooks/, components/}
│   ├── investments/{server/{service.ts, actions.ts, validation.ts}, types.ts, hooks/, components/}
│   ├── recurring-income/{server/{service.ts, occurrence.ts, actions.ts, validation.ts}, types.ts, hooks/, components/}
│   └── dashboard/server/snapshot.ts  # NEW this phase; service.ts UPDATED (getNetWorth)
│
└── lib/
    ├── recurrence.ts
    └── transaction-link-guard.ts
```

**As-built note (2026-07-21, reconciled against the live repo):** the routes actually implemented are `app/(dashboard)/debt/page.tsx` (singular) and `app/(dashboard)/investments/[holdingId]/page.tsx` (keyed by the child `Holding`'s id, not the container `Account`'s id as this document originally sketched). Both are naming/routing details that don't change any module-boundary or data-flow decision in Architecture.md — flagged here only so this document matches the as-built repo rather than silently drifting from it, the same category of correction already applied to `docs/database/er-diagram.md`'s Phase 1 "DebtDetail" note.

### Rationale notes (unchanged from the original Phase 3a design)

- `debt`, `investments`, `recurring-income` are three separate feature modules, not folded into one "Phase 3a" module — same reasoning as Phase 2's Budgeting/Goals/Bills split.
- `payoff-math.ts` breaks the "pure logic lives under `server/`" precedent deliberately — see Architecture.md's isomorphic pure-calculation-file convention.
- `lib/transaction-link-guard.ts` exists specifically to avoid a circular feature-level dependency between `bills` and `recurring-income`.
- The Net Worth Snapshot job is added to the existing `features/dashboard/` module, not a new module — no data of its own beyond a snapshot row of numbers Dashboard already computes.

---

## Phase 3b additions

Two new feature modules (`analytics`, `financial-goals`), one new shared `lib/` utility (`merchant-normalization.ts`), one addition to the existing `dashboard` module (`net-worth-history.ts` + its Route Handler + its hook), and no changes required to any Phase 1/2/3a file beyond the new read-only cross-domain function calls already documented in api-contracts.md (`investments.service.getGainLossForPeriod`, `recurring-income.service.getActualReceivedIncomeBySource`, and confirming `debt.service.getDebtById`'s archived-inclusive behavior).

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                  # UPDATED: Dashboard gains the Net Worth History chart
│   │   │                             #   (features/dashboard/components/net-worth-history-chart.tsx)
│   │   ├── analytics/
│   │   │   └── page.tsx              # UPDATED (was a Phase-0-era placeholder stub — see note below):
│   │   │                             #   ?period=this-year|last-12-months|year-to-date|all-time
│   │   │                             #   searchParam; composes all 11 metric cards, each its own
│   │   │                             #   <Suspense> boundary (AC3's "one metric's insufficient
│   │   │                             #   data must never block the other ten")
│   │   └── financial-goals/
│   │       ├── page.tsx              # list (active + Completed + archived toggle), mirrors
│   │       │                         #   goals/page.tsx's existing shape
│   │       └── [goalId]/page.tsx     # goal detail: edit, progress (per-type view), archive
│   │
│   └── api/
│       └── dashboard/
│           └── net-worth-history/
│               └── route.ts          # GET ?range= — the one new Dashboard Route Handler this
│                                     #   phase, used only by use-net-worth-history.ts for
│                                     #   range-selector refetch after initial load
│
├── features/
│   ├── dashboard/                    # existing Phase 1 module — Phase 3b adds:
│   │   ├── server/
│   │   │   └── net-worth-history.ts  # NEW: getNetWorthHistory(userId, range), resolveDefaultRange(userId)
│   │   ├── hooks/
│   │   │   └── use-net-worth-history.ts  # NEW: TanStack Query, range-toggle refetch,
│   │   │                             #   same shape as use-debts.ts's includeArchived toggle
│   │   └── components/
│   │       └── net-worth-history-chart.tsx  # NEW: Client Component — range selector +
│   │                                 #   breakdown toggle (pure client-side view switch,
│   │                                 #   no extra fetch — see api-contracts.md AC5)
│   │
│   ├── analytics/
│   │   ├── server/
│   │   │   ├── period.ts             # PURE (no Prisma): resolveReportingPeriodRange(period, now).
│   │   │   │                         #   Stays under server/, not feature-root — nothing client-side
│   │   │   │                         #   calls it directly (contrast with payoff-math.ts); the shared
│   │   │   │                         #   reporting-period selector triggers a searchParam navigation,
│   │   │   │                         #   not a client-side recompute of this function.
│   │   │   ├── spending-trends.ts    # getYearlySpending, getCategoryTrends (Pass 1)
│   │   │   ├── expense-breakdown.ts  # getExpenseDistribution, getTopMerchants, getLargestPurchases (Pass 1)
│   │   │   ├── budget-comparison.ts  # getBudgetVsActual (Pass 1) — the one Pass-1 file with an
│   │   │   │                         #   outbound cross-domain call (budgeting.service.getBudgetMonth)
│   │   │   ├── spending-heatmap.ts   # getDailySpendingHeatmap (Pass 1)
│   │   │   ├── income-analytics.ts   # getIncomeGrowth, getIncomeSources (Pass 2) — calls
│   │   │   │                         #   recurring-income.service.getActualReceivedIncomeBySource
│   │   │   ├── savings-growth.ts     # getSavingsGrowth (Pass 2) — calls dashboard.service
│   │   │   │                         #   .getMonthlySummary (per month) and investments.service
│   │   │   │                         #   .getGainLossForPeriod
│   │   │   ├── subscriptions.ts      # getSubscriptionCandidates, getActiveSubscriptionAnnualizedTotal
│   │   │   │                         #   (Pass 2) — Prisma-touching orchestration + dismissal filtering
│   │   │   ├── subscription-detection.ts  # PURE: the merchant-grouping/interval/amount-tolerance
│   │   │   │                         #   detection algorithm. No Prisma. Stays under server/ (not
│   │   │   │                         #   feature-root) — see the period.ts note above; unit-tested
│   │   │   │                         #   against fixture arrays exactly like payoff-math.ts.
│   │   │   ├── actions.ts            # dismissSubscriptionCandidate  [Phase 4a ADDS: refreshSpendingInsights]
│   │   │   ├── insights-schema.ts    # Phase 4a — NEW, see Phase 4a section below
│   │   │   ├── insights.ts           # Phase 4a — NEW, see Phase 4a section below
│   │   │   └── validation.ts         # ReportingPeriodSchema, DismissSubscriptionCandidateSchema
│   │   ├── types.ts                  # ReportingPeriod, SubscriptionCandidate, SubscriptionStatus, etc.
│   │   │                             #   [Phase 4a ADDS: SpendingInsight]
│   │   └── components/
│   │       ├── reporting-period-select.tsx  # the one Client Component this module needs
│   │       │                         #   (triggers router.push with the new searchParam)
│   │       ├── yearly-spending-chart.tsx
│   │       ├── category-trends-chart.tsx
│   │       ├── expense-distribution-chart.tsx
│   │       ├── budget-vs-actual-table.tsx
│   │       ├── top-merchants-list.tsx
│   │       ├── largest-purchases-list.tsx
│   │       ├── spending-heatmap.tsx
│   │       ├── income-growth-chart.tsx
│   │       ├── income-sources-chart.tsx
│   │       ├── savings-growth-chart.tsx
│   │       ├── subscription-list.tsx  # includes the per-row dismiss button (Server Action)
│   │       └── spending-insights-widget.tsx  # Phase 4a — NEW, see Phase 4a section below
│   │                                  # (no hooks/ folder this phase — no client refetch need, see
│   │                                  #   Architecture.md's Server/client boundary section)
│   │
│   └── financial-goals/
│       ├── server/
│       │   ├── service.ts            # getFinancialGoals, getFinancialGoalById — calls
│       │   │                         #   debt.service.getDebtById, dashboard.service.getNetWorth,
│       │   │                         #   dashboard.server/net-worth-history.ts.getNetWorthHistory,
│       │   │                         #   accounts.service.getAccounts, dashboard.service
│       │   │                         #   .getMonthlySummary (x3, rolling average) — see
│       │   │                         #   Architecture.md's full call list. Also owns the private
│       │   │                         #   Debt Payoff exclusivity check (no shared lib/ guard needed).
│       │   ├── actions.ts            # createFinancialGoal, updateFinancialGoal,
│       │   │                         #   archiveFinancialGoal, unarchiveFinancialGoal —
│       │   │                         #   deliberately NO contribution/progress-logging action (AC6)
│       │   └── validation.ts         # CreateFinancialGoalSchema (discriminated union on type),
│       │                             #   UpdateFinancialGoalSchema (excludes type, per AC1)
│       ├── types.ts                  # FinancialGoal, FinancialGoalType, MeasurementBasis,
│       │                             #   FinancialGoalWithProgress (discriminated on type)
│       │                             # (no hooks/ folder this phase — plain Server Component list,
│       │                             #   same shape as goals/page.tsx, no toggle-refetch need)
│       └── components/
│           ├── debt-payoff-goal-form.tsx
│           ├── net-worth-savings-goal-form.tsx
│           ├── savings-rate-goal-form.tsx
│           ├── financial-goal-list.tsx
│           └── financial-goal-card.tsx  # renders the per-type progress view differently —
│                                        #   a 0–100% bar for Debt Payoff/Net Worth types, a plain
│                                        #   "14% → target 20%" two-figure display for Savings Rate
│                                        #   (per the spec's explicit "not a fill bar" decision)
│
└── lib/
    └── merchant-normalization.ts     # NEW: normalizeMerchantName(raw) — pure, shared by Top
                                       #   Merchants and Subscription Cost Detection. See
                                       #   Architecture.md for why this is a separate function from
                                       #   transactions/server/import.ts's own private, stricter
                                       #   CSV-dedup normalization, not a merge of the two.
```

**As-built note:** `app/(dashboard)/analytics/page.tsx` already exists in the repo as a Phase-0-era placeholder stub (a static "Coming in Phase 3" message, wired up only so Sidebar navigation doesn't 404) — this phase's implementation **replaces that stub's contents**, it is not a new route file.

### Rationale notes

- **`analytics` and `financial-goals` are two separate feature modules, not one "Phase 3b" module** — same reasoning as every prior phase's domain-split (Phase 2's Budgeting/Goals/Bills, Phase 3a's Debt/Investments/Recurring Income): each is independently ownable, independently reviewable, and per the Roadmap's own Phase 3b build order, built in sequence (Analytics Pass 1, Pass 2, then Financial Goals) rather than as one monolith.
- **The Net Worth History chart is added to the existing `features/dashboard/` module, not a new `features/net-worth-history/` module** — identical reasoning to why the Phase 3a snapshot job lives inside `dashboard/` rather than its own module: it has no data of its own beyond reads over a table Dashboard already owns, and its one new Route Handler exists purely to serve Dashboard's own range selector, not a new domain.
- **`features/analytics/server/` is split into 9 files by shared query shape, not 1 giant file or 11 single-metric files** — see Architecture.md's "Analytics module structure" section for the full reasoning (file-size discipline, avoiding duplicated period-resolution boilerplate, isolating the one Pass-1 file with an outbound cross-domain call).
- **`subscription-detection.ts` is pure but stays under `server/`, not at the feature root** — it breaks from `payoff-math.ts`'s isomorphic placement precedent deliberately, because (unlike Debt's strategy comparison) no Client Component ever needs to call it directly for instant recompute; detection always happens server-side as part of a Server Component's initial read. Purity earns unit-testability, not automatically the feature-root placement — that placement rule is specifically about client-callability.
- **Neither `analytics` nor `financial-goals` gets a `hooks/` folder this phase** — flagged explicitly (not a gap): Analytics' shared filter is a searchParam-driven Server Component re-render (same mechanism as Budgeting's month-navigator), and Financial Goals has no toggle-and-refetch need analogous to `includeArchived` on a client-cached list. Both patterns are already fully covered by mechanisms this codebase established in Phase 1/2; neither needs a new one invented for it.
- **No changes to `features/bills/`, `features/notifications/`, or `features/goals/` (Savings Goals) in Phase 3b** — confirmed, per api-contracts.md's explicit notes in each of those sections above.

---

## Phase 4a additions

Per `docs/product/ai-features.md` and `docs/architecture/ai-features-design.md`. One new shared `lib/` module (`lib/ai/`, populating what was previously a reserved/empty directory), touches to four existing feature modules (`transactions`, `budgeting`, `dashboard`, `analytics`), and **one new feature module** (`financial-health-score` — see Architecture.md's "Financial Health Score: module placement resolution" for the full reasoning behind this being a new module rather than a `dashboard/` extension).

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                  # UPDATED: Dashboard gains the Financial Health Score summary
│   │   │                             #   card, the most-recent Monthly Recap card, and (per AC5)
│   │   │                             #   the Spending Insights widget's Dashboard placement
│   │   ├── transactions/
│   │   │   └── page.tsx              # UPDATED: inline suggestion badges + accept/reject; a
│   │   │                             #   batch-review list scoped to a just-completed import (AC7)
│   │   ├── budgeting/
│   │   │   └── page.tsx              # UPDATED: gains the read-only Advisor card (current month only)
│   │   ├── analytics/
│   │   │   └── page.tsx              # UPDATED: gains the Spending Insights widget
│   │   ├── monthly-recap/
│   │   │   ├── page.tsx              # NEW: browsable history of past monthly summaries (AC5)
│   │   │   └── [month]/page.tsx      # NEW: one month's full recap detail
│   │   └── financial-health-score/
│   │       └── page.tsx              # NEW: dedicated detail view — 4-component breakdown,
│   │                                 #   historical trend sparkline, optional narrative (AC8)
│   │
│   └── api/
│       └── cron/
│           ├── categorize-transactions/route.ts        # NEW — Feature 1 automatic path
│           ├── monthly-summary/route.ts                 # NEW — Feature 3
│           └── financial-health-score-snapshot/route.ts # NEW — Feature 5: snapshot capture +
│                                                          #   narrative generation, one invocation
│       # (no new SESSION-authenticated Route Handler this phase — every on-demand generate/
│       #   refresh path is a Server Action; see Architecture.md's Server/client boundary section)
│
├── features/
│   ├── transactions/                 # existing Phase 1 module — Phase 4a adds:
│   │   └── server/
│   │       ├── categorization-schema.ts  # NEW — AI-owned: dynamic per-request Zod enum over the
│   │       │                         #   user's own real category IDs (ai-features-design.md §4.2)
│   │       ├── categorization.ts     # NEW — AI-owned: prompt assembly (via lib/ai/prompts/
│   │       │                         #   build-prompt.ts), calls lib/ai/generate-structured-output.ts,
│   │       │                         #   persists to the suggestion/audit-trail table (Database
│   │       │                         #   Architect's schema, per ai-features-design.md §7). NEVER
│   │       │                         #   writes Transaction.categoryId (§4.4's structural rule).
│   │       └── actions.ts            # UPDATED: adds acceptCategorySuggestion, rejectCategorySuggestion
│   │                                 #   (ordinary, non-AI Server Actions — reuse the existing
│   │                                 #   category-assignment path), requestCategorySuggestion
│   │                                 #   (the manual "reconsider" path, calls categorization.ts)
│   │
│   ├── budgeting/                    # existing Phase 2 module — Phase 4a adds:
│   │   └── server/
│   │       ├── advisor-schema.ts     # NEW — AI-owned
│   │       ├── advisor.ts            # NEW — AI-owned: reads getBudgetMonth's existing output only
│   │       │                         #   (never recomputes it); owns its own (userId, month)-keyed
│   │       │                         #   refresh-cache row (schema TBD, Database Architect); zero
│   │       │                         #   Prisma WRITE access to Budget/BudgetCategory (Feature 2 DoD)
│   │       └── actions.ts            # UPDATED: adds refreshBudgetAdvisor
│   │
│   ├── dashboard/                    # existing Phase 1 module — Phase 4a adds:
│   │   └── server/
│   │       ├── monthly-summary-schema.ts  # NEW — AI-owned
│   │       ├── monthly-summary.ts    # NEW — AI-owned: cron-triggered only; reads Dashboard's
│   │       │                         #   monthly aggregates, Net Worth History, and Analytics'
│   │       │                         #   Category Trends/Largest Purchases; persists once per
│   │       │                         #   user/month, never regenerated automatically (AC2)
│   │       └── service.ts            # UPDATED: adds getFinancialHealthScoreCard(userId), a thin
│   │                                 #   pass-through mirroring getBudgetHealthScoreCard exactly
│   │
│   ├── analytics/                    # existing Phase 3b module — Phase 4a adds (see the Phase 3b
│   │   │                             #   tree above for exact insertion points):
│   │   └── server/
│   │       ├── insights-schema.ts    # NEW — AI-owned
│   │       ├── insights.ts           # NEW — AI-owned: reads existing Analytics metric functions
│   │       │                         #   only; owns its own (userId, reportingPeriod)-keyed
│   │       │                         #   refresh-cache row (schema TBD, Database Architect)
│   │       └── actions.ts            # UPDATED: adds refreshSpendingInsights
│   │
│   └── financial-health-score/       # NEW MODULE — see Architecture.md's module-placement
│       │                             #   resolution for why this is its own module, not a
│       │                             #   `dashboard/` extension
│       ├── server/
│       │   ├── service.ts            # NEW — Backend Engineer's deterministic 4-component formula:
│       │   │                         #   getFinancialHealthScore(userId), getLatestNarrative(userId).
│       │   │                         #   Calls debt.service, recurring-income.service, budgeting
│       │   │                         #   .service.getBudgetHealthScore (reused verbatim), dashboard
│       │   │                         #   .service.getNetWorth / net-worth-history.ts. ZERO import
│       │   │                         #   of lib/ai/ — the score itself has no AI dependency at all.
│       │   ├── snapshot.ts           # NEW — Backend Engineer: the periodic, cron-triggered,
│       │   │                         #   idempotent-per-user-per-day capture job (AC7), mirroring
│       │   │                         #   dashboard/server/snapshot.ts's proven pattern. Calls
│       │   │                         #   service.ts for the score, THEN calls health-score-
│       │   │                         #   narrative.ts below IN THE SAME invocation (per
│       │   │                         #   ai-features-design.md §6) and persists both together.
│       │   ├── health-score-narrative-schema.ts  # NEW — AI-owned sibling file (not inside
│       │   │                         #   service.ts — per the Phase 4a AI-owned sibling-file
│       │   │                         #   convention in Architecture.md)
│       │   └── health-score-narrative.ts  # NEW — AI-owned: grounds strictly in the four already-
│       │                             #   computed component values + their prior-snapshot delta;
│       │                             #   never imported by service.ts (structural degradation
│       │                             #   guarantee — the score renders identically regardless of
│       │                             #   this file's outcome)
│       ├── types.ts                  # NEW: FinancialHealthScoreBreakdown, FinancialHealthScoreLabel
│       │                             #   (no hooks/ folder — no client toggle/refetch need; the
│       │                             #   trend sparkline has no interactive range selector per spec)
│       └── components/
│           ├── financial-health-score-card.tsx        # Dashboard summary card
│           └── financial-health-score-breakdown.tsx   # detail-view: 4-component breakdown +
│                                                        #   trend sparkline + narrative (visually
│                                                        #   distinguished per Cross-Cutting Req #3)
│
└── lib/
    └── ai/                            # NEW MODULE — AI Engineer, per ai-features-design.md §2.
        │                             #   Cross-feature infrastructure, not a feature module — see
        │                             #   Architecture.md's Guiding Pattern section.
        ├── client.ts                  # THE ONLY file importing @ai-sdk/anthropic / reading
        │                             #   ANTHROPIC_API_KEY. Exports fastModel, reasoningModel.
        ├── generate-structured-output.ts  # THE reusable "prompt → validated object" call —
        │                             #   every one of the five features' AI-owned files calls
        │                             #   this, and only this, to reach the model.
        ├── types.ts                   # AiFeatureResult<T>, AiFailureReason, GroundingData
        ├── prompts/
        │   └── build-prompt.ts        # instruction/untrusted-data delimiter framing (§4.1) —
        │                             #   every feature-specific prompt builder calls this
        ├── verify-grounding.ts         # anti-fabrication check for narrative features (§4.3)
        ├── rate-limit.ts               # canRefreshNow(lastGeneratedAt, minIntervalMs), batch-
        │                             #   size cap constant (§6)
        └── redact.ts                   # merchant/notes/category-name sanitization before prompt
                                       #   interpolation (data minimization, §4.1's data flowing in)
```

### Rationale notes

- **`lib/ai/` populates what was a reserved, empty directory since Phase 0** — no path change, just population. It is cross-feature infrastructure (like `lib/recurrence.ts`/`lib/merchant-normalization.ts`), never a feature module — see Architecture.md's Guiding Pattern section for the full "why not a feature" reasoning and the acyclicity guarantee (features import `lib/ai/`; `lib/ai/` never imports a feature).
- **Four of the five features add files to their own existing module (`transactions`, `budgeting`, `dashboard`, `analytics`) — only the Financial Health Score gets a new module (`financial-health-score`).** This is a deliberate, reasoned distinction, not an inconsistency: the first four are narration layers *on top of* data that module already owns end-to-end (Transactions already owns categorization, Budgeting already owns its own numbers, Dashboard already owns its monthly aggregates, Analytics already owns its 11 metrics); the Health Score is a **new, cross-domain deterministic computation** reading across four *other* domains, with its own persisted historical table and its own dedicated detail route — structurally identical to why Financial Goals earned its own module in Phase 3b rather than being folded into an existing one. See Architecture.md's full module-placement resolution.
- **Every AI-generation file lives in its own new file(s), never merged into that feature's existing `service.ts`/`actions.ts`** — the Phase 4a "AI-owned sibling-file convention," per Architecture.md's Guiding Pattern section: AI-generation code's failure mode (network-dependent, non-deterministic, must return `AiFeatureResult<T>`) is fundamentally different from the rest of a feature's deterministic Prisma code, so it earns its own file the same way `subscription-detection.ts` earned its own file within Analytics in Phase 3b.
- **No AI-generation file lives at any feature's root as a `-math.ts`-style isomorphic pure module.** None of the five features has a client-instant-recompute requirement (unlike Debt's strategy comparison) — every AI call is a bounded, rate-limited round trip by design, so every one of these files correctly stays under `server/`, per the isomorphic-pure-calculation-file convention's own placement rule (client-callability, not purity, is the test).
- **Schema/prompt file naming is standardized as `<concern>-schema.ts` (AI structured-output Zod schema) plus `<concern>.ts` (the orchestration file that builds the prompt and calls `lib/ai/`)** — see naming-standards.md's new Phase 4a conventions section for why `-schema.ts` is reserved specifically for AI-structured-output schemas and kept distinct from each feature's existing `validation.ts` (ordinary Server-Action input validation).
- **No new `hooks/` folder is added to any of the five features.** Every on-demand action (refresh, reconsider) is a Server Action followed by `revalidatePath`, the same mutation flow every other domain in this app already uses — none of the five features has a Net-Worth-History-style client-side toggle-and-refetch requirement. See Architecture.md's Server/client boundary section.
- **Three new cron Route Handlers, zero new session-authenticated ones.** `app/api/cron/categorize-transactions/`, `app/api/cron/monthly-summary/`, and `app/api/cron/financial-health-score-snapshot/` all follow `net-worth-snapshot`'s already-established shared-secret/plain-JSON exception pattern exactly — this is the third, fourth, and fifth instance of that pattern, not three new ones invented independently.
- **`app/(dashboard)/monthly-recap/` and `app/(dashboard)/financial-health-score/` are the only two brand-new top-level routes this phase** — Transactions/Budgeting/Analytics/Dashboard's existing pages are updated in place, not given new routes, since their AI features are additive widgets/cards on pages that already exist.
