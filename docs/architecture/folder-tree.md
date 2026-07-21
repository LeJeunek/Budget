# FinanceOS — Folder Tree (Phase 0 + Phase 1 + Phase 2 + Phase 3a + Phase 3b)

Phase 0/1 files are listed concretely below, unchanged from the original design. Phase 2 additions are listed in their own section. Phase 3a additions (Debt Tracker, Investments, Recurring Income, Net Worth aggregation update, Net Worth Snapshot job) are listed in their own section further down. Phase 3b additions (Net Worth History chart, Analytics, Financial Goals) are listed in the final section, now that `docs/product/{net-worth-history,analytics,financial-goals}.md` are resolved.

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
│   │   └── financial-goals/           # Phase 3b — see below
│   │
│   ├── lib/
│   │   ├── db.ts                     # Prisma singleton
│   │   ├── auth.ts                   # Better Auth instance + getCurrentUser()
│   │   ├── api-response.ts           # { success, data } | { success, error } helper
│   │   ├── utils.ts                  # cn(), formatCurrency(), formatDate()
│   │   └── ai/                       # Phase 4 — reserved, empty
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
│   │   │   ├── actions.ts            # dismissSubscriptionCandidate
│   │   │   └── validation.ts         # ReportingPeriodSchema, DismissSubscriptionCandidateSchema
│   │   ├── types.ts                  # ReportingPeriod, SubscriptionCandidate, SubscriptionStatus, etc.
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
│   │       └── subscription-list.tsx  # includes the per-row dismiss button (Server Action)
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
