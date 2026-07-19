# FinanceOS — Folder Tree (Phase 0 + Phase 1 + Phase 2)

Phase 0/1 files are listed concretely below, unchanged from the original design. Phase 2 additions are listed in their own section further down, in the same style, now that `docs/product/{budgeting,savings-goals,bills,calendar-and-notifications}.md` and the Transactions receipt-attachment addendum are resolved. Phase 3+ folders remain reserved placeholders (Solution Architect will detail them when that phase is designed).

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
│   │   │   ├── server/                # and (Phase 2+) budgeting — not owned by any one of them.
│   │   │   │   ├── service.ts        # See api-contracts.md's 2026-07-19 CTO scope correction.
│   │   │   │   ├── actions.ts
│   │   │   │   └── validation.ts
│   │   │   ├── types.ts
│   │   │   └── components/
│   │   │       ├── category-form.tsx
│   │   │       └── category-list.tsx
│   │   ├── budgeting/                 # Phase 2 — see "Phase 2 additions" below
│   │   ├── goals/                     # Phase 2 — see "Phase 2 additions" below
│   │   ├── bills/                     # Phase 2 — see "Phase 2 additions" below
│   │   ├── notifications/             # Phase 2 — see "Phase 2 additions" below
│   │   ├── debt/                      # Phase 3 — reserved, empty
│   │   └── investments/               # Phase 3 — reserved, empty
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
- `features/<domain>/components/` holds domain-aware composed UI (knows about Account/Transaction types, may call hooks); `components/shared/` holds domain-agnostic building blocks only — this is the boundary between Frontend Lead/UI Component Engineer ownership and where Backend Engineer's types leak into presentation.
- Every `features/<domain>/server/*.ts` file must call `getCurrentUser()` from `lib/auth.ts` and scope every Prisma query by that user's ID — this is the concrete implementation of risk register item #4.

---

## Phase 2 additions

Four new feature modules (`budgeting`, `goals`, `bills`, `notifications`), three route placeholders replaced (`app/(dashboard)/{budgeting,goals,bills}/page.tsx` already exist per the Phase 0 tree above and get their real implementation now, same pattern as Phase 1's `accounts`/`transactions` pages replacing their own placeholders), one small addendum to the existing `transactions` module (receipts), and one new piece of shared infra (`lib/uploadthing.ts` + its Route Handler).

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── budgeting/
│   │   │   └── page.tsx              # replaces Phase 0 placeholder; ?month=YYYY-MM searchParam
│   │   ├── goals/
│   │   │   ├── page.tsx              # replaces Phase 0 placeholder; list (active + completed + archived toggle)
│   │   │   └── [goalId]/page.tsx     # goal detail: progress, edit, contribution history (AC9)
│   │   └── bills/
│   │       ├── page.tsx              # replaces Phase 0 placeholder; ?view=list|calendar&month=YYYY-MM
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
│       └── month-navigator.tsx       # NEW: domain-agnostic prev/current/next month control,
│                                     # shared by Budgeting's planner and Bills' calendar (see rationale below)
│
├── features/
│   ├── transactions/                 # existing Phase 1 module — Phase 2 adds receipts only
│   │   ├── server/
│   │   │   ├── receipts.ts           # NEW: attachReceipt, removeReceipt, getReceiptsForTransaction
│   │   │   └── actions.ts            # UPDATED: deleteTransaction now also purges attached receipt
│   │   │                             #   files via utapi.deleteFiles before removing the row (see
│   │   │                             #   api-contracts.md's Receipts section — this is a behavior
│   │   │                             #   change to an existing Phase 1 file, flagged explicitly)
│   │   ├── types.ts                  # UPDATED: adds `Receipt` type, `receipts: Receipt[]` on
│   │   │                             #   the transaction-detail shape (NOT on the table-row shape —
│   │   │                             #   see api-contracts.md; avoids fetching receipts for every row)
│   │   └── components/
│   │       ├── receipt-uploader.tsx  # NEW: wraps UploadThing's <UploadButton endpoint="receiptUploader">
│   │       └── receipt-list.tsx      # NEW: list + download + remove, used in transaction detail view
│   │
│   ├── budgeting/
│   │   ├── server/
│   │   │   ├── service.ts            # getBudgetMonth (carry-forward + read-only-history logic),
│   │   │   │                         #   setCategoryAllocation's read-side helpers, getBudgetHealthScore,
│   │   │   │                         #   getBudgetMonthSummary (consumed by features/dashboard/server/service.ts)
│   │   │   ├── actions.ts            # setCategoryAllocation
│   │   │   └── validation.ts         # SetAllocationSchema, MonthSchema (shared "YYYY-MM" validator)
│   │   ├── types.ts                  # BudgetMonthView, BudgetCategoryLine, BudgetHealthScore
│   │   └── components/
│   │       ├── budget-planner-table.tsx
│   │       ├── budget-category-row.tsx     # inline allocation input, Server Action + revalidatePath
│   │       ├── budget-summary-cards.tsx    # Total Allocated/Spent/Remaining + Uncategorized line
│   │       └── budget-health-score-badge.tsx
│   │       # No hooks/ dir: allocation edits use Server Action + revalidatePath (Accounts-form
│   │       # pattern), not TanStack Query — there is no pagination/filtering need like Transactions'
│   │       # table, so the added complexity of a query hook isn't justified here.
│   │
│   ├── goals/
│   │   ├── server/
│   │   │   ├── service.ts            # getGoals, getGoalById, progress/estimate calc (read-time derived)
│   │   │   ├── actions.ts            # createGoal, updateGoal, archiveGoal, unarchiveGoal,
│   │   │   │                         #   addContribution, deleteContribution
│   │   │   └── validation.ts         # CreateGoalSchema, UpdateGoalSchema, AddContributionSchema
│   │   ├── types.ts                  # Goal, GoalContribution, GoalWithProgress (computed fields)
│   │   ├── hooks/
│   │   │   └── use-goals.ts          # mirrors use-accounts.ts exactly (includeArchived toggle refetch)
│   │   └── components/
│   │       ├── goal-form.tsx
│   │       ├── goal-card.tsx         # reuses components/shared/progress-ring.tsx — do not fork it
│   │       ├── contribution-form.tsx
│   │       └── contribution-history-list.tsx
│   │
│   ├── bills/
│   │   ├── server/
│   │   │   ├── service.ts            # bill CRUD, getUpcomingOccurrences, getBillById (+history),
│   │   │   │                         #   markOccurrencePaid, linkOccurrenceToTransaction,
│   │   │   │                         #   unmarkOccurrencePaid, getCalendarMonth (backs Calendar v1)
│   │   │   ├── occurrence.ts         # PURE functions: next-due-date math per schedule, status
│   │   │   │                         #   computation (Upcoming/DueToday/Late/Paid) — no Prisma calls,
│   │   │   │                         #   unit-testable in isolation (Integration Test Engineer will
│   │   │   │                         #   want this split for the recurrence-correctness test matrix
│   │   │   │                         #   the Bills spec's Definition of Done calls for)
│   │   │   ├── actions.ts            # createBill, updateBill, archiveBill, unarchiveBill,
│   │   │   │                         #   markOccurrencePaid, linkOccurrenceToTransaction,
│   │   │   │                         #   unmarkOccurrencePaid
│   │   │   └── validation.ts         # CreateBillSchema, UpdateBillSchema, MarkPaidSchema, LinkSchema
│   │   ├── types.ts                  # Bill, BillOccurrence, OccurrenceStatus
│   │   ├── hooks/
│   │   │   └── use-bills.ts          # mirrors use-accounts.ts exactly (includeArchived toggle refetch)
│   │   └── components/
│   │       ├── bill-form.tsx
│   │       ├── bill-list.tsx
│   │       ├── upcoming-bills-list.tsx
│   │       ├── occurrence-history-table.tsx   # composes components/shared/data-table (per
│   │       │                                  #   Architecture.md's reusable-utilities note)
│   │       ├── mark-paid-dialog.tsx           # includes the optional transaction-link picker
│   │       └── bill-calendar.tsx              # Calendar v1's view — lives here, not a separate
│   │                                          #   `features/calendar/` module; see rationale below
│   │
│   └── notifications/                # NEW small shared module — see rationale below
│       ├── server/
│       │   ├── service.ts            # ensureNotifications (lazy materialize), getNotifications,
│       │   │                         #   reads budgeting.service + bills.service; writes only to
│       │   │                         #   its own Notification rows, never into Budget*/Bill* tables
│       │   ├── actions.ts            # dismissNotification, markNotificationRead, markAllRead
│       │   └── validation.ts
│       ├── types.ts                  # Notification, NotificationType
│       ├── hooks/
│       │   └── use-notifications.ts  # TanStack Query, short poll + refetch-on-focus — see
│       │                             #   api-contracts.md for why this is the one Phase 2 module
│       │                             #   that does need a query hook
│       └── components/
│           └── notification-bell.tsx # composed into TopNav via a new `notificationSlot` prop
│                                     #   (small, additive prop on the existing shared component —
│                                     #   see Architecture.md's Phase 2 notes)
│
└── lib/
    └── uploadthing.ts                # NEW: `utapi` (UploadThing server SDK) singleton, mirrors
                                       #   lib/db.ts's singleton-export pattern; also re-exports the
                                       #   FileRouter type used by app/api/uploadthing/core.ts
```

### Rationale notes

- **Calendar v1 lives inside `features/bills/`, not its own `features/calendar/` module.** Contrast with why `features/categories/` became its own shared module in Phase 1: Categories is depended on by three domains (Transactions, Dashboard, and now Budgeting) that each need to *read and reference* it independently, so no single owner made sense. Calendar v1 has exactly one dependency, in one direction (`docs/product/calendar-and-notifications.md`: "Calendar v1 has no data of its own; it is entirely a view over Bills' due dates and statuses") and introduces no data model of its own. Folding it into Bills as one more read function (`getCalendarMonth`) plus one more component (`bill-calendar.tsx`) avoids a placeholder module that would exist solely to re-export Bills' own data.
- **`features/notifications/` is its own module**, unlike Calendar, because it genuinely reads from two independently-owned domains (Budgeting and Bills) and has its own durable state (read/dismissed) that belongs to neither. Giving Budgeting or Bills ownership of that state would mean one domain's server code mutates rows that conceptually belong to a different concern, and would force whichever domain didn't "win" ownership to reach into the other's module anyway. See `api-contracts.md` and `Architecture.md`'s Phase 2 section for the full read/write boundary.
- **`components/shared/month-navigator.tsx` is new domain-agnostic shared UI**, not duplicated per-feature, because both Budgeting's planner and Bills' calendar need the identical "prev / current label / next" month-stepping control. It takes `{ month: string; onMonthChange: (month: string) => void }` and nothing else — no domain knowledge, same boundary rule as `components/shared/progress-ring.tsx`.
- **Receipts are an addendum to `features/transactions/`, not a new module** — per the Transactions spec's own addendum framing ("ships now as a small addition to the existing Transactions feature — not a new top-level domain or document"). `lib/uploadthing.ts` and `app/api/uploadthing/` are the only genuinely new pieces of infrastructure; everything else is new files inside the existing `transactions` module boundary.
- **`uploadthing` and `@uploadthing/react` are not currently installed** (checked `package.json` — absent from `dependencies`). Whoever implements this addendum must run `npm install uploadthing @uploadthing/react` and add the relevant UploadThing env var(s) (e.g. `UPLOADTHING_TOKEN`) to `.env.example`; this Architect does not install dependencies or touch `.env.example` (Backend/DevOps territory).
- **`app/(dashboard)/bills/page.tsx` hosts both the list and calendar views** via a `?view=list|calendar` search param rather than a separate `/bills/calendar` route, since no nav item for a standalone Calendar page is requested anywhere in the resolved specs or the current sidebar (`components/shared/sidebar.tsx`'s `NAV_SECTIONS`). If Frontend Lead later prefers a dedicated URL for shareability/bookmarking, splitting into `bills/calendar/page.tsx` is a small, backward-compatible follow-up (both would call the same `bills.service.getCalendarMonth`), not a redesign.
- **Budgeting, Goals, and Bills do not get their own Route Handlers for list reads beyond the thin `GET` wrappers noted above** (and Budgeting gets none at all) — Server Components call `service.ts` functions directly for first render, consistent with Architecture.md's existing preference for server-rendered data over client-side duplication. Goals and Bills get a thin `GET` route + hook *only* because both have an `includeArchived` toggle exactly like Accounts (precedent: `features/accounts/hooks/use-accounts.ts`), not because they need pagination/sorting like Transactions.
