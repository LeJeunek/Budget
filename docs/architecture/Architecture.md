# FinanceOS — Architecture (Phase 0 + Phase 1)

Scope: repo skeleton (Phase 0) and the Accounts/Transactions/Dashboard-v1 domain (Phase 1), per [docs/planning/roadmap.md](../planning/roadmap.md). Later phases extend this document; they do not replace it.

## Guiding pattern: feature-first modules under App Router

Each business domain (accounts, transactions, dashboard, and later budgeting/goals/bills/debt/investments/ai) is a **feature module**: its own folder under `features/`, containing everything specific to that domain — server logic, types, validation schemas, hooks — with `app/` staying thin (routing + composition only) and `components/` staying generic (no domain knowledge).

This keeps ownership unambiguous, which matters given the org's role boundaries: Backend Engineer owns `features/<domain>/server/`, Frontend Lead owns `app/`, UI Component Engineer owns `components/`.

## Server/client boundary

- **Server Components by default** for all pages (`app/**/page.tsx`) — fetch data directly via server-only data-access functions, no client-side waterfall for initial load.
- **Server Actions** (`features/<domain>/server/actions.ts`) for mutations (create/update/delete account, transaction).
- **Route Handlers** (`app/api/<domain>/route.ts`) only where a true HTTP endpoint is needed (CSV import upload, anything TanStack Query needs to poll/paginate client-side, and everything under `app/api/ai/` in later phases).
- **Client Components** are opt-in (`"use client"`) for interactive pieces: the transaction table (TanStack Table + Query), forms (React Hook Form + Zod), charts (Recharts), theme toggle.
- TanStack Query is used client-side for the transaction table specifically (pagination/filtering/sorting benefit from client cache); everything else prefers server-rendered data to avoid duplicate fetching logic.

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
| `app/` | Frontend Lead | `components/`, `features/*/hooks`, `features/*/types` | `features/*/server/*` (never import server-only code into a client-boundary-crossing path without going through an action/route) |
| `components/ui/`, `components/shared/` | UI Component Engineer | nothing domain-specific | any `features/*` |
| `features/<domain>/server/` | Backend Engineer | `lib/db.ts`, `lib/auth.ts`, other domains' server code only via explicit service calls (not direct Prisma reach-through) | `app/`, `components/` |
| `features/<domain>/` (types, schemas, hooks) | shared (Backend Engineer defines, Frontend Lead consumes) | — | — |
| `lib/` | Solution Architect + Database Architect (db client), Backend Engineer (auth helpers) | — | — |
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

## Risks / scalability notes

- The Transactions table is the highest-traffic, highest-complexity UI surface and the first thing built — get its pagination/filtering contract right in Phase 1 since Budgeting, Bills, and Debt Tracker will likely reuse the same `DataTable` component and API pagination shape.
- `Account.type` is modeled as a discriminated enum now (see Database Architect schema) specifically so Phase 3's Debt/Investment accounts don't require a new top-level entity — confirmed with Database Architect per risk register item #1.
- AI features (Phase 4) will need `lib/ai/` isolated from day one even though unused in Phase 0/1 — reserving the path now avoids a later refactor fight over where AI code lives.
