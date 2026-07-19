# FinanceOS — Architecture (Phase 0 + Phase 1 + Phase 2)

Scope: repo skeleton (Phase 0), the Accounts/Transactions/Dashboard-v1 domain (Phase 1), and Budgeting/Savings Goals/Bills/Calendar v1/Notifications v1 plus the Transactions receipt-attachment addendum (Phase 2), per [docs/planning/roadmap.md](../planning/roadmap.md). Later phases extend this document; they do not replace it.

## Guiding pattern: feature-first modules under App Router

Each business domain (accounts, transactions, dashboard, categories, budgeting, goals, bills, notifications, and later debt/investments/ai) is a **feature module**: its own folder under `features/`, containing everything specific to that domain — server logic, types, validation schemas, hooks — with `app/` staying thin (routing + composition only) and `components/` staying generic (no domain knowledge).

This keeps ownership unambiguous, which matters given the org's role boundaries: Backend Engineer owns `features/<domain>/server/`, Frontend Lead owns `app/`, UI Component Engineer owns `components/`.

## Server/client boundary

- **Server Components by default** for all pages (`app/**/page.tsx`) — fetch data directly via server-only data-access functions, no client-side waterfall for initial load. This includes calling `features/<domain>/server/service.ts` functions directly from a Server Component (see the Folder-level module boundaries table below — this is a clarification of an already-established Phase 1 practice, not a new rule).
- **Server Actions** (`features/<domain>/server/actions.ts`) for mutations (create/update/delete account, transaction; and from Phase 2 onward: budget allocations, goals/contributions, bills/occurrences, notification dismissal, receipt attach/remove).
- **Route Handlers** (`app/api/<domain>/route.ts`) only where a true HTTP endpoint is needed (CSV import upload, anything TanStack Query needs to poll/paginate client-side, thin client-refetch wrappers that mirror an existing `service.ts` read for a domain with an active/archived toggle, and everything under `app/api/ai/` in later phases). Phase 2 adds `app/api/goals/route.ts`, `app/api/bills/route.ts` (both thin `includeArchived` wrappers, same purpose as `app/api/accounts/route.ts`), `app/api/notifications/route.ts` (polling target), and `app/api/uploadthing/route.ts` (third-party integration surface, not our own `ApiResult` contract).
- **Client Components** are opt-in (`"use client"`) for interactive pieces: the transaction table (TanStack Table + Query), forms (React Hook Form + Zod), charts (Recharts), theme toggle, and from Phase 2: the notification bell (polling), the receipt uploader (UploadThing's client widget).
- TanStack Query is used client-side only where a genuine client-cache benefit exists: the transaction table (pagination/filtering/sorting), the Accounts/Goals/Bills `includeArchived` toggle-and-refetch pattern, and the notification bell (ambient polling). Everything else prefers server-rendered data to avoid duplicate fetching logic — this is why Budgeting has no query hook at all (see Phase 2 module boundaries below).

## Data flow (Phase 1 example: Transactions)

```
User action (client form/table)
  → React Hook Form + Zod (client-side validation, same schema as server)
  → Server Action or /api/transactions route (Backend Engineer)
    → features/transactions/server/validation.ts (Zod, re-validated server-side — never trust client)
    → features/transactions/server/service.ts (business logic: dedupe on import, category resolution)
    → prisma client (lib/db.ts) → PostgreSQL
  ← predictable response shape: { success: true, data } | { success: false, error }
  → TanStack Query cache updated → table re-renders
```

## Folder-level module boundaries

| Folder | Owner | May import from | Must NOT import from |
|---|---|---|---|
| `app/` | Frontend Lead | `components/`, `features/*/hooks`, `features/*/types`, `features/*/server/service.ts` (direct read calls from Server Components — see Server/client boundary above) | `features/*/server/actions.ts` only via a proper Server Action reference, never business logic reached into ad hoc |
| `components/ui/`, `components/shared/` | UI Component Engineer | nothing domain-specific | any `features/*` |
| `features/<domain>/server/` | Backend Engineer | `lib/db.ts`, `lib/auth.ts`, `lib/uploadthing.ts` (Transactions only), other domains' server code only via explicit, individually-exported service calls (not direct Prisma reach-through) | `app/`, `components/` |
| `features/<domain>/` (types, schemas, hooks) | shared (Backend Engineer defines, Frontend Lead consumes) | — | — |
| `lib/` | Solution Architect + Database Architect (db client), Backend Engineer (auth helpers, UploadThing SDK singleton) | — | — |
| `prisma/` | Database Architect | — | — |
| `lib/ai/` | AI Engineer | — | `components/` |

This prevents circular dependencies: UI components never know about features; features never import from `app/`; only `app/` composes both.

## Naming conventions

See [naming-standards.md](naming-standards.md).

## API contracts

See [api-contracts.md](api-contracts.md).

## Reusable utilities established in Phase 0/1 (for later phases to reuse, not redefine)

- `lib/db.ts` — singleton Prisma client
- `lib/auth.ts` — Better Auth server instance + `getCurrentUser()` helper (every domain's server code calls this to scope queries by user ID — this is the primary defense against the cross-user data leak risk flagged in the risk register)
- `lib/api-response.ts` — the `{ success, data } | { success, error }` response helper, used by every Route Handler and Server Action from Phase 1 onward
- `components/ui/data-table/` — generic TanStack Table wrapper (UI Component Engineer), domain-agnostic; Transactions table (Phase 1), and every future list/table (budgets, bills, debts, investments) composes this instead of building a new table
- `components/shared/stat-card.tsx`, `components/shared/progress-ring.tsx` — dashboard building blocks reused by every phase's "overview" screens

## Reusable utilities added in Phase 2

- `components/shared/month-navigator.tsx` — domain-agnostic prev/current/next month stepper, shared by Budgeting's planner and Bills' calendar view (both need identical month-navigation UI; see folder-tree.md for why this wasn't forked per-feature).
- `lib/uploadthing.ts` — `utapi` (UploadThing server SDK) singleton, mirroring `lib/db.ts`'s singleton-export pattern. Currently consumed only by `features/transactions/server/receipts.ts`; any later domain that needs file storage (none currently planned) would reuse this rather than instantiating its own client.
- `features/transactions/server/aggregations.ts` — `getSpendingByCategoryForMonth` / `getUncategorizedSpendingForMonth`, extracted so Dashboard's Phase 1 spending-by-category logic and Budgeting's Phase 2 Spent calculation share one implementation instead of two independently-maintained copies of "sum expense transactions by category for a month, respecting split-transaction accounting." See api-contracts.md's Budgeting section for the full duplication rationale.

## Phase 2 module boundaries and cross-domain reads

Four new feature modules ship in Phase 2: `budgeting`, `goals`, `bills`, `notifications`. Their dependency direction, laid out explicitly here to keep the module graph an acyclic one as the codebase grows past what any single engineer holds in their head:

```
Transactions, Categories          (Phase 1 base layer — no Phase 2 module dependencies)
        ↑                ↑
   Budgeting            Bills      (each depends only on the Phase 1 base layer)
        ↑                ↑
        └──── Notifications ────┘  (reads BOTH Budgeting and Bills; written to by neither)
        ↑
    Dashboard                      (Phase 1 module; Phase 2 adds two read calls into Budgeting)

Goals                              (fully independent branch — no dependency on any other
                                     Phase 2 or Phase 1 domain, confirmed by CTO resolution)
```

Concretely, per `docs/architecture/api-contracts.md`'s Phase 2 sections:
- `features/budgeting/server/` calls into `features/transactions/server/aggregations.ts` (Spent) and `features/categories/` (category list); `features/categories/server/actions.ts`'s `deleteCategory` calls into `features/budgeting/server/service.ts` (to remove that category's current/future allocations) — this is the one place a Phase 1 module calls forward into a Phase 2 module, which is fine (it's still one-directional per call site: Categories → Budgeting on delete only, Budgeting never calls into Categories' mutation surface).
- `features/bills/server/` calls into `features/categories/` (optional category) and `features/transactions/server/service.ts` (link-picker search, and reads the linked Transaction's amount at render time).
- `features/notifications/server/` **only reads** from `budgeting.service.getOverBudgetCategories` and `bills.service.getDueSoonAndLateOccurrences` (two small, explicitly-exported functions built for this purpose) and **only writes** to its own `Notification` table. It never imports Budgeting's or Bills' `actions.ts`, and neither of those modules imports anything from `features/notifications/`. This one-directional read relationship is what lets Notifications exist as its own module without either Budgeting or Bills taking on ownership of a concern (in-app alerting) that belongs to neither — see the Calendar v1 vs. Notifications v1 contrast in folder-tree.md for why Calendar *didn't* get the same treatment.
- `features/dashboard/server/service.ts` adds two calls into `features/budgeting/server/service.ts` (Remaining Budget card, Budget Health Score card) — Dashboard remains a pure downstream consumer, as it was in Phase 1 for Transactions; nothing calls back into Dashboard from Budgeting.
- `features/goals/server/` imports nothing from any other feature module — confirmed independent per the Savings Goals spec's resolved Dependencies section.

**Risk this layering is specifically designed to prevent:** without an explicit rule, it would have been easy to give Budgeting or Bills a `notifiedAt`/`dismissedAt` column on their own tables and let Notifications write there directly — this was considered and rejected (see api-contracts.md's Notifications section) precisely because it would require Budgeting and Bills' own server modules to carry mutation logic on behalf of a feature they don't own, and would make a future refactor of Notifications (e.g. adding a new notification type unrelated to either domain) require touching two unrelated modules' server code instead of one.

## Risks / scalability notes

- The Transactions table is the highest-traffic, highest-complexity UI surface and the first thing built — get its pagination/filtering contract right in Phase 1 since Budgeting, Bills, and Debt Tracker will likely reuse the same `DataTable` component and API pagination shape.
- `Account.type` is modeled as a discriminated enum now (see Database Architect schema) specifically so Phase 3's Debt/Investment accounts don't require a new top-level entity — confirmed with Database Architect per risk register item #1.
- AI features (Phase 4) will need `lib/ai/` isolated from day one even though unused in Phase 0/1 — reserving the path now avoids a later refactor fight over where AI code lives.
- **(Phase 2) Bills' occurrence generation and Notifications' `ensureNotifications` are both lazy, on-read mechanisms** (see api-contracts.md for the full justification against eager generation / background jobs). This is the right tradeoff at Phase 2 scale, but it means every read of the bills list, upcoming list, calendar, or notification inbox does a small amount of write work (upserts) inline with the read. If usage grows to a point where this measurably affects read latency, the fix is to move the *trigger* of these functions to a real scheduled job (cron route, queue) — the functions themselves (`ensureOccurrencesGenerated`, `ensureNotifications`) do not need to change, only what calls them, which is a clean seam already, not a future rewrite.
- **(Phase 2) Notifications requires a new `Notification` table not currently listed in `docs/database/migration-strategy.md`'s Phase 2 schema-growth note** (which lists `Budget`, `BudgetCategory`, `Goal`, `Bill` only). Flagged for the Database Architect; see api-contracts.md's Notifications section for the recommended shape.
- **(Phase 2) Schema conflict flagged for the Database Architect:** `docs/database/er-diagram.md` already models `Transaction.receiptUrl` as a single string field from Phase 1. The Phase 2 receipt-attachment addendum requires multiple receipts per transaction, which `receiptUrl` cannot represent — a proper one-to-many `Receipt` model is needed instead. See api-contracts.md's Receipts section for the full note; resolving `receiptUrl` (drop vs. migrate) is the Database Architect's decision, not this Architect's.
