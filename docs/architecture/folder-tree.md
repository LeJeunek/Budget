# FinanceOS — Folder Tree (Phase 0 + Phase 1)

Only Phase 0/1 files are listed concretely. Later-phase folders are noted as placeholders where Phase 0 should reserve the path (per Architecture.md) without populating it.

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
│   │   ├── budgeting/                # Phase 2 — reserved, empty
│   │   ├── goals/                    # Phase 2 — reserved, empty
│   │   ├── bills/                    # Phase 2 — reserved, empty
│   │   ├── debt/                     # Phase 3 — reserved, empty
│   │   └── investments/              # Phase 3 — reserved, empty
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

## Notes

- `src/` is used (not root-level `app/`) to keep config files uncluttered at the repo root as the project grows.
- Route groups `(auth)` and `(dashboard)` split layouts without affecting URL structure.
- `features/<domain>/components/` holds domain-aware composed UI (knows about Account/Transaction types, may call hooks); `components/shared/` holds domain-agnostic building blocks only — this is the boundary between Frontend Lead/UI Component Engineer ownership and where Backend Engineer's types leak into presentation.
- Every `features/<domain>/server/*.ts` file must call `getCurrentUser()` from `lib/auth.ts` and scope every Prisma query by that user's ID — this is the concrete implementation of risk register item #4.
