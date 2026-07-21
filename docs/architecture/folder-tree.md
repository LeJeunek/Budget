# FinanceOS — Folder Tree (Phase 0 + Phase 1 + Phase 2 + Phase 3a)

Phase 0/1 files are listed concretely below, unchanged from the original design. Phase 2 additions are listed in their own section. Phase 3a additions (Debt Tracker, Investments, Recurring Income, Net Worth aggregation update, Net Worth Snapshot job) are listed in their own section further down, now that `docs/product/{debt-tracker,investments,recurring-income}.md` are resolved. Phase 3b folders remain reserved placeholders (Solution Architect will detail them when that phase is designed).

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
│   │   ├── accounts/
│   │   │   ├── server/
│   │   │   │   ├── service.ts
│   │   │   │   ├── actions.ts
│   │   │   │   └── validation.ts     # Zod schemas
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   │   └── use-accounts.ts   # TanStack Query hook
│   │   │   └── components/           # domain-specific composed UI (account card, account form)
│   │   │       ├── account-form.tsx
│   │   │       └── account-card.tsx
│   │   ├── transactions/
│   │   │   ├── server/
│   │   │   │   ├── service.ts
│   │   │   │   ├── actions.ts
│   │   │   │   ├── import.ts         # CSV parsing/dedup logic
│   │   │   │   └── validation.ts
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   │   └── use-transactions.ts
│   │   │   └── components/
│   │   │       ├── transaction-table.tsx
│   │   │       ├── transaction-form.tsx
│   │   │       └── import-dialog.tsx
│   │   ├── dashboard/
│   │   │   ├── server/
│   │   │   │   └── service.ts        # aggregation queries: net worth, income/expense, cash flow
│   │   │   ├── types.ts
│   │   │   └── components/
│   │   │       ├── net-worth-chart.tsx
│   │   │       ├── spending-by-category-chart.tsx
│   │   │       └── income-vs-expense-chart.tsx
│   │   ├── categories/               # small module: consumed by transactions, dashboard,
│   │   │   ├── server/                # and budgeting — not owned by any one of them.
│   │   │   │   ├── service.ts        # See api-contracts.md's 2026-07-19 CTO scope correction.
│   │   │   │   ├── actions.ts
│   │   │   │   └── validation.ts
│   │   │   ├── types.ts
│   │   │   └── components/
│   │   │       ├── category-form.tsx
│   │   │       └── category-list.tsx
│   │   ├── budgeting/                 # Phase 2 — see "Phase 2 additions" below
│   │   ├── goals/                     # Phase 2 — see "Phase 2 additions" below
│   │   ├── bills/                     # Phase 2 — see "Phase 2 additions" below (Phase 3a touches
│   │   │                              # occurrence.ts and actions.ts — see "Phase 3a additions" below)
│   │   ├── notifications/             # Phase 2 — see "Phase 2 additions" below
│   │   ├── debt/                      # Phase 3a — see "Phase 3a additions" below
│   │   ├── investments/               # Phase 3a — see "Phase 3a additions" below
│   │   └── recurring-income/          # Phase 3a — see "Phase 3a additions" below
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
│   │   ├── budgeting/
│   │   │   └── page.tsx              # ?month=YYYY-MM searchParam
│   │   ├── goals/
│   │   │   ├── page.tsx              # list (active + completed + archived toggle)
│   │   │   └── [goalId]/page.tsx     # goal detail: progress, edit, contribution history (AC9)
│   │   └── bills/
│   │       ├── page.tsx              # ?view=list|calendar&month=YYYY-MM
│   │       └── [billId]/page.tsx     # bill detail: edit, occurrence/payment history (AC10)
│   │
│   └── api/
│       ├── goals/route.ts            # GET only — client refetch wrapper, mirrors api/accounts/route.ts
│       ├── bills/route.ts            # GET only — client refetch wrapper, mirrors api/accounts/route.ts
│       ├── notifications/route.ts    # GET only — list + unread count; triggers ensureNotifications()
│       └── uploadthing/
│           ├── core.ts               # FileRouter definition (the `receiptUploader` endpoint)
│           └── route.ts              # GET/POST handlers via UploadThing's createRouteHandler(core)
│
├── components/
│   └── shared/
│       └── month-navigator.tsx       # domain-agnostic prev/current/next month control
│
├── features/
│   ├── transactions/                 # existing Phase 1 module — Phase 2 adds receipts only
│   │   ├── server/
│   │   │   ├── receipts.ts           # attachReceipt, removeReceipt, getReceiptsForTransaction
│   │   │   └── actions.ts            # UPDATED: deleteTransaction now also purges attached receipt files
│   │   ├── types.ts                  # UPDATED: adds `Receipt` type on the transaction-detail shape
│   │   └── components/
│   │       ├── receipt-uploader.tsx
│   │       └── receipt-list.tsx
│   │
│   ├── budgeting/
│   │   ├── server/
│   │   │   ├── service.ts            # getBudgetMonth, getBudgetHealthScore, getBudgetMonthSummary
│   │   │   ├── actions.ts            # setCategoryAllocation
│   │   │   └── validation.ts
│   │   ├── types.ts
│   │   └── components/
│   │       ├── budget-planner-table.tsx
│   │       ├── budget-category-row.tsx
│   │       ├── budget-summary-cards.tsx
│   │       └── budget-health-score-badge.tsx
│   │
│   ├── goals/
│   │   ├── server/
│   │   │   ├── service.ts            # getGoals, getGoalById, progress/estimate calc (read-time derived)
│   │   │   ├── actions.ts            # createGoal, updateGoal, archiveGoal, unarchiveGoal, addContribution, deleteContribution
│   │   │   └── validation.ts
│   │   ├── types.ts
│   │   ├── hooks/
│   │   │   └── use-goals.ts
│   │   └── components/
│   │       ├── goal-form.tsx
│   │       ├── goal-card.tsx
│   │       ├── contribution-form.tsx
│   │       └── contribution-history-list.tsx
│   │
│   ├── bills/
│   │   ├── server/
│   │   │   ├── service.ts            # bill CRUD, getUpcomingOccurrences, getBillById, markOccurrencePaid,
│   │   │   │                         #   linkOccurrenceToTransaction, unmarkOccurrencePaid, getCalendarMonth
│   │   │   ├── occurrence.ts         # PURE: status computation. UPDATED in Phase 3a — its cadence-math
│   │   │   │                         #   (next-due-date-per-schedule) is extracted out to lib/recurrence.ts;
│   │   │   │                         #   this file keeps only computeStatus and calls the shared functions.
│   │   │   ├── actions.ts            # createBill, updateBill, archiveBill, unarchiveBill, markOccurrencePaid,
│   │   │   │                         #   linkOccurrenceToTransaction (UPDATED in Phase 3a — now also calls
│   │   │   │                         #   lib/transaction-link-guard.ts before creating the link),
│   │   │   │                         #   unmarkOccurrencePaid
│   │   │   └── validation.ts
│   │   ├── types.ts                  # Bill, BillOccurrence, OccurrenceStatus
│   │   ├── hooks/
│   │   │   └── use-bills.ts
│   │   └── components/
│   │       ├── bill-form.tsx
│   │       ├── bill-list.tsx
│   │       ├── upcoming-bills-list.tsx
│   │       ├── occurrence-history-table.tsx
│   │       ├── mark-paid-dialog.tsx
│   │       └── bill-calendar.tsx
│   │
│   └── notifications/
│       ├── server/
│       │   ├── service.ts            # ensureNotifications, getNotifications
│       │   ├── actions.ts            # dismissNotification, markNotificationRead, markAllRead
│       │   └── validation.ts
│       ├── types.ts
│       ├── hooks/
│       │   └── use-notifications.ts
│       └── components/
│           └── notification-bell.tsx
│
└── lib/
    └── uploadthing.ts
```

---

## Phase 3a additions

Three new feature modules (`debt`, `investments`, `recurring-income`), two new shared `lib/` utilities (`recurrence.ts`, `transaction-link-guard.ts`), two touched Phase 2 files (`bills/server/occurrence.ts`, `bills/server/actions.ts` — see the inline notes above), one addition to the existing `dashboard` module (`snapshot.ts` + the extended `getNetWorth`), and one new kind of Route Handler (`api/cron/net-worth-snapshot`).

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── debts/
│   │   │   ├── page.tsx              # list + snowball/avalanche strategy comparison
│   │   │   └── [debtId]/page.tsx     # debt detail: edit, projection detail
│   │   ├── investments/
│   │   │   ├── page.tsx              # portfolio overview + container list
│   │   │   └── [accountId]/page.tsx  # container detail: holdings list, allocation, growth chart
│   │   └── income/
│   │       ├── page.tsx              # income stream list + expected-upcoming-income total
│   │       └── [streamId]/page.tsx   # stream detail: edit, occurrence/receipt history
│   │
│   └── api/
│       ├── debts/route.ts            # GET only — client refetch wrapper, mirrors api/accounts/route.ts
│       ├── investments/route.ts      # GET only — client refetch wrapper (includeClosed toggle)
│       ├── income/route.ts           # GET only — client refetch wrapper (includeArchived toggle)
│       └── cron/
│           └── net-worth-snapshot/
│               └── route.ts          # POST — shared-secret-authenticated, called by an external
│                                      #   scheduler (Vercel Cron/GitHub Actions/equivalent — a
│                                      #   DevOps/deployment-target decision, not made here). See
│                                      #   api-contracts.md's Net Worth Snapshot section for the
│                                      #   auth contract; this is the first Route Handler in the
│                                      #   codebase not gated by an authenticated browser session.
│
├── features/
│   ├── debt/
│   │   ├── server/
│   │   │   ├── service.ts            # getDebts, getDebtById, getTotalActiveDebtBalanceForNetWorth
│   │   │   │                         #   (excludes debts linked to an Account — see Architecture.md's
│   │   │   │                         #   Net Worth double-counting note)
│   │   │   ├── actions.ts            # createDebt, updateDebt, archiveDebt, unarchiveDebt,
│   │   │   │                         #   linkDebtToAccount / unlinkDebtFromAccount (present only if
│   │   │   │                         #   the Database Architect's chosen shape supports linking)
│   │   │   └── validation.ts         # CreateDebtSchema, UpdateDebtSchema, ExtraPaymentSchema
│   │   ├── payoff-math.ts            # PURE, isomorphic (no Prisma, no "use server"/"use client" —
│   │   │                             #   safe to import from either a Server Component or a Client
│   │   │                             #   Component): computeAmortization, compareSnowballAndAvalanche.
│   │   │                             #   Lives at the feature root, not under server/, specifically so
│   │   │                             #   strategy-comparison.tsx (below) can call it directly for
│   │   │                             #   instant client-side recompute — see Architecture.md's
│   │   │                             #   isomorphic pure-calculation-file convention.
│   │   ├── types.ts                  # Debt, DebtType, DebtWithProjection, StrategyComparisonResult
│   │   ├── hooks/
│   │   │   └── use-debts.ts          # mirrors use-accounts.ts exactly (includeArchived toggle refetch)
│   │   └── components/
│   │       ├── debt-form.tsx
│   │       ├── debt-list.tsx
│   │       ├── debt-card.tsx         # shows Paid Off state distinctly (AC9)
│   │       ├── extra-payment-input.tsx
│   │       └── strategy-comparison.tsx  # Client Component; imports ../payoff-math.ts directly,
│   │                                    #   recomputes on every extra-payment keystroke, no round-trip
│   │
│   ├── investments/
│   │   ├── server/
│   │   │   ├── service.ts            # getContainers (reads Accounts), getHoldingsForContainer,
│   │   │   │                         #   getHoldingById, getPortfolioOverview, getAllocation
│   │   │   │                         #   (asset-type + sector), getGrowthHistory
│   │   │   ├── actions.ts            # createHolding (offers inline container creation via
│   │   │   │                         #   accounts.actions.createAccount — AC1), updateHolding
│   │   │   │                         #   (records a value-history entry on every current-value
│   │   │   │                         #   edit, AC4; also triggers the derived-balance write-back
│   │   │   │                         #   onto the container Account — see Architecture.md),
│   │   │   │                         #   closeHolding, logDividend
│   │   │   └── validation.ts         # CreateHoldingSchema, UpdateHoldingSchema, LogDividendSchema
│   │   ├── types.ts                  # Holding, AssetType, Sector, HoldingValueHistoryEntry,
│   │   │                             #   DividendEntry, PortfolioOverview, AllocationBreakdown
│   │   ├── hooks/
│   │   │   └── use-holdings.ts       # includeClosed toggle refetch, same shape as use-accounts.ts
│   │   └── components/
│   │       ├── holding-form.tsx
│   │       ├── holding-list.tsx
│   │       ├── container-card.tsx    # shows "this account's balance is now calculated from its
│   │       │                         #   holdings below" messaging once a container has ≥1 holding
│   │       ├── allocation-chart.tsx  # asset-type + sector, composes Recharts (same lib as Dashboard)
│   │       ├── growth-chart.tsx      # per-holding + portfolio-level, handles single-data-point state
│   │       ├── dividend-log-form.tsx
│   │       └── portfolio-overview-cards.tsx  # composes components/shared/stat-card.tsx
│   │
│   └── recurring-income/
│       ├── server/
│       │   ├── service.ts            # getIncomeStreams, getStreamById (+ history),
│       │   │                         #   getExpectedUpcomingIncome
│       │   ├── occurrence.ts         # PURE: computeStatus (Upcoming/Expected Today/Not Yet
│       │   │                         #   Received/Received) + ensureOccurrencesGenerated, mirroring
│       │   │                         #   Bills' proven lazy on-read generation exactly; imports its
│       │   │                         #   cadence math from lib/recurrence.ts (shared, not duplicated).
│       │   │                         #   Irregular/One-off streams skip generation entirely (AC11).
│       │   ├── actions.ts            # createIncomeStream, updateIncomeStream, archiveIncomeStream,
│       │   │                         #   unarchiveIncomeStream, markOccurrenceReceived,
│       │   │                         #   linkOccurrenceToTransaction (calls
│       │   │                         #   lib/transaction-link-guard.ts before linking — see
│       │   │                         #   Architecture.md's cross-feature exclusivity note),
│       │   │                         #   unmarkOccurrenceReceived, logIrregularIncomeEvent
│       │   └── validation.ts
│       ├── types.ts                  # IncomeStream, IncomeType, IncomeSchedule, IncomeOccurrence,
│       │                             #   IncomeOccurrenceStatus, IrregularIncomeEvent
│       ├── hooks/
│       │   └── use-income-streams.ts # includeArchived toggle refetch, same shape as use-bills.ts
│       └── components/
│           ├── income-stream-form.tsx
│           ├── income-stream-list.tsx
│           ├── upcoming-income-list.tsx
│           ├── mark-received-dialog.tsx      # includes the optional transaction-link picker
│           └── occurrence-history-table.tsx  # composes components/shared/data-table
│
├── features/dashboard/                # existing Phase 1 module — Phase 3a adds Net Worth
│   ├── server/                        #   aggregation calls and the snapshot writer
│   │   ├── service.ts                 # UPDATED: getNetWorth now also calls
│   │   │                              #   debt.service.getTotalActiveDebtBalanceForNetWorth —
│   │   │                              #   see api-contracts.md for the full, double-count-safe formula
│   │   └── snapshot.ts                # NEW: captureNetWorthSnapshot(userId),
│   │                                  #   captureAllUsersNetWorthSnapshots() — called by
│   │                                  #   app/api/cron/net-worth-snapshot/route.ts. No UI this phase
│   │                                  #   (per roadmap.md's explicit "backend only, no UI" scope).
│   └── (types.ts, components/ unchanged this phase — Net Worth History chart is Phase 3b)
│
└── lib/
    ├── recurrence.ts                  # NEW: shared pure cadence math, extracted from
    │                                  #   bills/server/occurrence.ts — see Architecture.md
    └── transaction-link-guard.ts      # NEW: assertTransactionNotAlreadyLinked(...) — narrow,
                                       #   documented exception to "no cross-domain Prisma
                                       #   reach-through," see Architecture.md
```

### Rationale notes

- **`debt`, `investments`, `recurring-income` are three separate feature modules, not folded into one "Phase 3a" module.** Same reasoning as Phase 2's Budgeting/Goals/Bills split: each is an independently-ownable domain with its own data, its own CRUD surface, and (per the Roadmap's own build-order note) its own dedicated backend implementation pass. Folding them together would recreate the exact "too large for one clean review cycle" problem the Phase 3/3a split itself was designed to avoid at the phase level — no reason to reintroduce it at the module level.
- **`payoff-math.ts` breaks the "pure logic lives under `server/`" precedent Bills' `occurrence.ts` set**, and that break is deliberate, not an inconsistency — see Architecture.md's isomorphic pure-calculation-file convention for the full justification (client-side instant recompute requirement, AC6/AC7).
- **`recurring-income/server/occurrence.ts` is a new, small, parallel file to `bills/server/occurrence.ts`, not a shared/merged model.** Per `recurring-income.md`'s own Dependencies note, sharing the underlying schedule/occurrence *model* between Bills and Recurring Income was left as "an implementation consideration, not a product requirement" for the Database Architect. This Architect's recommendation: keep the two Prisma models parallel (`BillOccurrence`, `IncomeOccurrence`), since their status vocabularies and paid/received semantics genuinely differ (Late vs. Not Yet Received is a deliberate, resolved product distinction, not an oversight) — but do not duplicate the underlying cadence math, hence `lib/recurrence.ts`.
- **`lib/transaction-link-guard.ts` exists specifically to avoid a circular feature-level dependency between `bills` and `recurring-income`** — see Architecture.md's "Cross-feature exclusivity" section for the two designs considered and why the shared-`lib/`-utility shape was chosen over either domain importing the other.
- **The Net Worth Snapshot job is added to the existing `features/dashboard/` module, not a new `features/net-worth-snapshot/` module.** It has no data of its own beyond a snapshot row of numbers Dashboard's own `getNetWorth` already computes, and no UI this phase (`roadmap.md`: "backend only, no UI... does not wait for 3b's Net Worth History chart"). This mirrors the reasoning that kept Calendar v1 inside `features/bills/` in Phase 2 rather than spinning up a placeholder module: a single dependency, in one direction, with no independent data model of its own beyond "a timestamped copy of a number Dashboard already knows how to compute."
- **`app/(dashboard)/investments/[accountId]/page.tsx` is keyed by the container's `accountId`, not a separate "investment ID"** — consistent with the Product Owner's/this Architect's recommendation that the Account row itself is the container, not a new parallel entity.
- **No standalone `app/(dashboard)/debts/[debtId]/holdings` or similar nested route is introduced for Debt** — Debt's optional Account link (if the Database Architect adopts it) is surfaced as an action within the debt detail page (e.g. "Link to an existing account"), not a separate route, matching how Bills' transaction-linking is a dialog within the bill detail view, not its own page.
