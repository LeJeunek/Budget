# FinanceOS — Architecture (Phase 0 + Phase 1 + Phase 2 + Phase 3a)

Scope: repo skeleton (Phase 0), the Accounts/Transactions/Dashboard-v1 domain (Phase 1), Budgeting/Savings Goals/Bills/Calendar v1/Notifications v1 plus the Transactions receipt-attachment addendum (Phase 2), and Debt Tracker/Investments/Recurring Income plus the Net Worth aggregation update and Net Worth Snapshot job (Phase 3a), per [docs/planning/roadmap.md](../planning/roadmap.md). Later phases extend this document; they do not replace it.

**Phase 3a status note:** the `Account`-linkage schema question (Risk #9, roadmap.md Phase 3a section) is explicitly **not resolved in this document** — see "Phase 3a — the Account-linkage handoff" below. Everything in this document is written to remain correct regardless of which linkage shape the Database Architect chooses; where a decision would change a module boundary, both possibilities are noted.

## Guiding pattern: feature-first modules under App Router

Each business domain (accounts, transactions, dashboard, categories, budgeting, goals, bills, notifications, debt, investments, recurring-income, and later AI) is a **feature module**: its own folder under `features/`, containing everything specific to that domain — server logic, types, validation schemas, hooks — with `app/` staying thin (routing + composition only) and `components/` staying generic (no domain knowledge).

This keeps ownership unambiguous, which matters given the org's role boundaries: Backend Engineer owns `features/<domain>/server/`, Frontend Lead owns `app/`, UI Component Engineer owns `components/`.

**New in Phase 3a — the isomorphic pure-calculation-file convention.** Every prior "pure function, no Prisma" module (e.g. Bills' `occurrence.ts`) lived under `server/` because nothing client-side ever needed to call it directly — a Server Component always mediated. Debt Tracker's snowball/avalanche comparison breaks that assumption: AC6/AC7 require the comparison to recompute **instantly** as a user adjusts the extra-payment amount, which is a bad fit for a server round-trip on every keystroke. The fix is not a new pattern family, just a placement rule: **a pure calculation module that a Client Component needs to call directly must live at the feature root (sibling to `types.ts`), never under `server/`.** Anything under `server/` is server-only by convention in this codebase (it's where Prisma-touching code lives), and importing a `server/` file into a `"use client"` component is exactly the kind of accidental server/client boundary violation Next.js bundling should never be asked to paper over. See `features/debt/payoff-math.ts` in folder-tree.md's Phase 3a additions.

## Server/client boundary

- **Server Components by default** for all pages (`app/**/page.tsx`) — fetch data directly via server-only data-access functions, no client-side waterfall for initial load. This includes calling `features/<domain>/server/service.ts` functions directly from a Server Component (see the Folder-level module boundaries table below).
- **Server Actions** (`features/<domain>/server/actions.ts`) for mutations. Phase 3a adds: debt create/update/archive/unarchive and optional link/unlink-to-account; holding create/update/close and dividend logging; income stream create/update/archive/unarchive and occurrence mark-received/link/unmark.
- **Route Handlers** (`app/api/<domain>/route.ts`) only where a true HTTP endpoint is needed. Phase 3a adds `app/api/debts/route.ts`, `app/api/investments/route.ts`, `app/api/income/route.ts` (all thin `includeArchived`/`includeClosed` wrappers, same purpose and shape as `app/api/accounts/route.ts`), and **one genuinely new kind of route**: `app/api/cron/net-worth-snapshot/route.ts` — see "Net Worth Snapshot job" below. This is the first Route Handler in the codebase that is not called by an authenticated browser session; it is documented as an explicit, narrow exception in api-contracts.md.
- **Client Components** are opt-in (`"use client"`) for interactive pieces. Phase 3a adds: the snowball/avalanche strategy comparison (recomputes client-side via `features/debt/payoff-math.ts`, no round-trip), the extra-payment input, the allocation/growth charts (Recharts, same pattern as existing Dashboard charts), and the holding/income-stream forms (React Hook Form + Zod, same pattern as every other domain's forms).
- TanStack Query is used client-side only where a genuine client-cache benefit exists (unchanged rule from Phase 1/2). Phase 3a's three new modules each get an `includeArchived`/`includeClosed` toggle-and-refetch hook (`use-debts.ts`, `use-holdings.ts`, `use-income-streams.ts`), mirroring `use-accounts.ts`/`use-goals.ts`/`use-bills.ts` exactly — none of the three needs a polling hook (that remains unique to Notifications) or a full pagination hook (that remains unique to Transactions).

## Data flow (Phase 3a example: Debt Tracker's snowball/avalanche comparison)

This is the first data flow in the app where the "predictable response shape" round-trip is deliberately **not** re-run on every user input, so it's worth spelling out as its own example alongside the Phase 1 Transactions flow already documented below:

```
Initial load (Server Component)
  → features/debt/server/service.ts.getDebts(userId)
    → prisma client (lib/db.ts) → PostgreSQL
    → per debt: features/debt/payoff-math.ts.computeAmortization(debt) (minimum-payment-only projection, AC4)
  ← DebtWithProjection[] rendered server-side (payoff date, total interest, negative-amortization warning)

Strategy comparison (Client Component, features/debt/components/strategy-comparison.tsx)
  → receives the same DebtWithProjection[] as a prop from the Server Component (no refetch)
  → user types an extra-payment amount
  → features/debt/payoff-math.ts.compareSnowballAndAvalanche(debts, extraPayment) — pure function,
    runs entirely in the browser, recomputes on every keystroke with no network round-trip
  ← comparison table re-renders instantly

Mutating a debt (e.g. editing balance/rate/minimum payment)
  → React Hook Form + Zod (client-side validation, same schema as server)
  → Server Action updateDebt
    → features/debt/server/validation.ts (re-validated server-side)
    → features/debt/server/service.ts (persists the edit; does NOT recompute/store projections —
      they are always derived at the next read, same "computed at read time" rule as Goals/Bills)
  ← ApiResult<Debt> → revalidatePath → Server Component re-fetches → payoff-math.ts recomputes
```

Unchanged Phase 1 example (Transactions) retained for reference:
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
| `app/` | Frontend Lead | `components/`, `features/*/hooks`, `features/*/types`, `features/*/server/service.ts` (direct read calls from Server Components), `features/*/payoff-math.ts`-style feature-root pure modules | `features/*/server/actions.ts` only via a proper Server Action reference, never business logic reached into ad hoc |
| `components/ui/`, `components/shared/` | UI Component Engineer | nothing domain-specific | any `features/*` |
| `features/<domain>/server/` | Backend Engineer | `lib/db.ts`, `lib/auth.ts`, `lib/uploadthing.ts` (Transactions only), `lib/recurrence.ts` (Bills, Recurring Income — Phase 3a), `lib/transaction-link-guard.ts` (Bills, Recurring Income — Phase 3a), other domains' server code only via explicit, individually-exported service calls (not direct Prisma reach-through) | `app/`, `components/` |
| `features/<domain>/` (types, schemas, hooks, feature-root pure modules like `payoff-math.ts`) | shared (Backend Engineer defines, Frontend Lead consumes) | — | — |
| `lib/` | Solution Architect + Database Architect (db client), Backend Engineer (auth helpers, UploadThing SDK singleton, recurrence math, transaction-link guard) | — | — |
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

- `components/shared/month-navigator.tsx` — domain-agnostic prev/current/next month stepper, shared by Budgeting's planner and Bills' calendar view.
- `lib/uploadthing.ts` — `utapi` (UploadThing server SDK) singleton, mirroring `lib/db.ts`'s singleton-export pattern.
- `features/transactions/server/aggregations.ts` — `getSpendingByCategoryForMonth` / `getUncategorizedSpendingForMonth`, shared by Dashboard and Budgeting.

## Reusable utilities added in Phase 3a

- **`lib/recurrence.ts`** (NEW) — pure, framework-agnostic schedule-cadence math: `getNextOccurrenceDate(fromDate, schedule)` and `generateOccurrenceDatesBetween(fromDate, throughDate, schedule)`, for the `weekly | biweekly | monthly | quarterly | annually` schedule set. **Extracted from Bills' existing `features/bills/server/occurrence.ts`**, which currently has this date math inlined alongside its own status computation. Recurring Income needs the identical cadence math (per `recurring-income.md` AC1's "same recurring-schedule set already established in the Bills spec") but has its own distinct status vocabulary (`Not Yet Received`, not `Late` — a deliberate, resolved product distinction per that spec's AC7) and its own `Irregular`/One-off cadence with no generated occurrences at all. Sharing only the date-cadence math (not the status logic, not the schema) avoids duplicating "what's the next date for a monthly schedule" in two places while respecting that Bills and Recurring Income are otherwise independent domains with independent business rules. **This is a refactor of an existing Phase 2 file** (extracting, not rewriting, its cadence-math functions) — flagged explicitly per this doc's own established convention for touching prior-phase files (see Phase 2's Receipts section in api-contracts.md for precedent). `features/bills/server/occurrence.ts` keeps its own `computeStatus` and now imports `getNextOccurrenceDate`/`generateOccurrenceDatesBetween` from `lib/recurrence.ts` instead of defining them inline; `features/recurring-income/server/occurrence.ts` is a new, small, parallel file that imports the same shared functions and defines its own `computeStatus` (`Upcoming | Expected Today | Not Yet Received | Received`).
- **`lib/transaction-link-guard.ts`** (NEW) — see "Cross-feature exclusivity: Bills ↔ Recurring Income" below. A narrow, explicitly-documented exception to "no cross-domain Prisma reach-through": this single small file reads directly (read-only) from both `BillOccurrence`-equivalent and `IncomeOccurrence`-equivalent rows by `transactionId` to answer "is this Transaction already linked to any recurring-item occurrence, anywhere in the product." It is the one deliberate carve-out in this codebase's module-boundary rule, justified in detail below because the alternative (Bills and Recurring Income each importing the other's service) would create a circular feature-level dependency.
- **`features/debt/payoff-math.ts`** — see the isomorphic pure-calculation-file convention above. Pure functions: `computeAmortization(debt, extraPayment)`, `compareSnowballAndAvalanche(debts[], extraPayment)`, handling 0% interest and negative-amortization detection (AC4/AC5/Edge Cases). Consumed by both `features/debt/server/service.ts` (server-rendered initial numbers) and `features/debt/components/strategy-comparison.tsx` (client-side instant recompute).

## Phase 3a module boundaries and cross-domain reads

Three new feature modules ship in Phase 3a: `debt`, `investments`, `recurring-income`. Their dependency direction, laid out the same way Phase 2's was, to keep the module graph acyclic:

```
Accounts, Transactions, Categories        (Phase 1 base layer — unchanged; still has zero
        ↑            ↑                     dependency on any Phase 2 or Phase 3a module)
        |            |
      Debt      Investments                (each reads Accounts read-only; Investments additionally
        |            |                      writes a recalculated balance back onto Account — see
        |            |                      "Investments → Accounts: the derived-balance write-back"
        |            |                      below. Neither Debt nor Investments imports the other —
        |            |                      confirmed independent, no spec requires it.)
        |            |
        └─────┬──────┘
              ↓
          Dashboard                        (adds Net Worth aggregation reads into Debt and
                                            Investments — see the Net Worth Aggregation Update
                                            section in api-contracts.md — and a new snapshot writer)

Bills  ←──────────────→  Recurring Income  (NOT a direct import in either direction — both instead
   ↓                          ↓              depend one-directionally on lib/transaction-link-guard.ts,
   └────────┬─────────────────┘              which has narrow, read-only Prisma access to both
            ↓                                domains' occurrence tables. See below for why this
   lib/transaction-link-guard.ts             specific shape avoids a circular feature dependency.)

Recurring Income  →  Transactions           (link-picker search + read linked transaction amount,
                                             exact same pattern Bills already established)
```

Concretely:

- **`features/debt/server/`** calls into `features/accounts/server/service.ts` **only if** the Database Architect's chosen linkage shape includes an optional Account link (Product Owner's recommended Option C) — in that case, `debt.service`'s "effective balance" helper reads the linked Account's balance live via `accounts.service.getAccountById`, the same "read live via the join, never copied" precedent already established for `BillOccurrence.transactionId` (see api-contracts.md). If the Database Architect instead chooses fully-standalone Debt records (Option B) or Account-extension (Option A), this one call site is the only place that changes — everything else in this document (payoff-math.ts, the service's public function signatures, the API contract shapes) is unaffected, which is the point of designing the boundary this way.
- **`features/investments/server/`** calls into `features/accounts/server/service.ts` for container CRUD/lookup (read) and, per the Product Owner's recommendation to grow `Account` as the holdings container rather than introduce a parallel container model, **writes back** a recalculated balance onto the Account whenever a holding is created/updated/closed — see "Investments → Accounts: the derived-balance write-back" below for why this is a write, not the usual read-only cross-domain call, and why that's still architecturally sound (one-directional, no cycle).
- **`features/recurring-income/server/`** calls into `features/transactions/server/service.ts` for the link-picker search and to read the linked Transaction's amount at render time — identical in shape to Bills' existing `searchTransactionsForLinking` call.
- **`features/dashboard/server/service.ts`** adds calls into `debt.service` (total active, unlinked-to-account debt liability — see the Net Worth Aggregation Update section in api-contracts.md for why "unlinked" matters) and, per the write-back design above, needs **no new call into `investments.service`** for the base Net Worth number, since Investments' derived balances already flow through the ordinary `accounts.service.getAccounts` sum Dashboard already uses. Dashboard's portfolio-specific reads (if any future Dashboard card wants gain/loss or allocation) would call `investments.service.getPortfolioOverview` directly, same shape as every other cross-domain read in this document — none is needed for Net Worth itself.
- **`features/dashboard/server/snapshot.ts`** (NEW) is added to the existing Dashboard module — see "Net Worth Snapshot job" below.

### Investments → Accounts: the derived-balance write-back (a deliberate, narrow exception)

Every derived value elsewhere in this codebase (Budget Health Score, Goal progress, Bill occurrence status, Debt payoff projections) is computed at read time and never stored, specifically to avoid stored/derived drift bugs. Investments' "an Account's balance becomes the sum of its holdings once it has any" (Product Owner's recommendation, `investments.md`) cannot follow that same rule cleanly, for a reason specific to this one case: **`Account.balance` already has many pre-existing, unrelated consumers** that were built in Phase 1 with no knowledge that Investments would ever exist — the Accounts list page, the Transaction form's account picker, and Dashboard's Net Worth base sum all read `account.balance` directly today. Two ways to make all of them see the correct, up-to-date derived number were considered:

1. **Make `features/accounts/server/service.ts` compute it dynamically** by checking whether an account has holdings and, if so, querying Investments. Rejected: this would make Accounts — the Phase 1 foundational module every later phase already depends on — depend *forward* into Investments, a Phase 3a module. That inverts this codebase's entire layering discipline (nothing in the Phase 1 base layer may depend on a later phase) and is exactly the kind of circular-risk this Architect's job is to prevent.
2. **Have Investments write the recalculated sum onto `Account.balance`** every time a holding is created, updated (current value changed), or closed, via a small new exported function on Accounts' own service (e.g. `accounts.service.setDerivedBalance(userId, accountId, balance)` — naming is Backend Engineer's call). **Recommended.** This keeps the dependency one-directional (Investments → Accounts, already an established, permitted direction — Investments already reads from Accounts for container lookup) and requires zero changes to any of `Account.balance`'s existing unrelated consumers. It is a deliberate, narrow exception to "never store what can be derived," justified specifically because the alternative breaks module layering and this one is the only place in the app where a derived value has pre-existing consumers outside the domain that derives it.

**Requirement for whoever implements this (Backend Engineer, after the Database Architect's schema pass):** the write-back must happen in the same database transaction as the holding mutation (Prisma `$transaction`), the same atomicity rigor already applied to Bills' occurrence-generation upserts — a holding create that succeeds but whose balance write-back fails would silently desynchronize the two numbers, exactly the class of bug this design otherwise exists to prevent. Flagged here for visibility; not this Architect's file to implement.

**Contrast with Debt's linkage:** Debt's optional Account link (if the Database Architect chooses that shape) does **not** need this write-back pattern — a Debt's "effective balance" is consumed only within `features/debt/`'s own service and Dashboard's Net Worth aggregation, both of which can cheaply read the Account live at request time (the same "read live via the join, never copied" pattern as `BillOccurrence`). Investments needed the write-back specifically because `Account.balance` has many *unrelated* existing consumers; Debt's linked balance does not, so the simpler read-live approach is sufficient and preferred there.

### Cross-feature exclusivity: Bills ↔ Recurring Income (a Transaction backs at most one occurrence, of either kind)

`recurring-income.md`'s Edge Cases requires: "a single Transaction can back at most one recurring-item occurrence across the whole product" — i.e., a Transaction already linked to a `BillOccurrence` must be rejected if a user tries to also link it to an income occurrence, and vice versa. Two designs were considered:

1. **Bills imports Recurring Income's service (or vice versa)** to check the other domain's link status before creating a new one. Rejected: whichever domain checks the other creates a one-directional import, but the *other* domain also needs to check back the same way for its own linking action, which makes the import bidirectional at the feature-module level — a genuine circular dependency between two sibling domains, the exact thing the module-boundary table exists to prevent (contrast with Notifications, which only ever *reads* from Budgeting/Bills and is never imported back by either — a one-directional relationship this case cannot replicate, since both sides need to write-guard against the other).
2. **A small, neutral, shared guard function with narrow, explicit, read-only Prisma access to both occurrence tables.** **Recommended.** `lib/transaction-link-guard.ts` exports one function, e.g. `assertTransactionNotAlreadyLinked(userId, transactionId, excluding?: { billOccurrenceId?: string; incomeOccurrenceId?: string })`, called by both `features/bills/server/actions.ts`'s `linkOccurrenceToTransaction` and `features/recurring-income/server/actions.ts`'s `linkOccurrenceToTransaction`, immediately before creating the link. Because this file lives in `lib/` (shared infrastructure, same tier as `lib/db.ts`/`lib/api-response.ts`) rather than as a third "feature," both Bills and Recurring Income depend on it in the same one-directional way they already depend on `lib/db.ts` — no feature-to-feature import exists in either direction, so the module graph stays acyclic. Its narrow Prisma reach-through into both domains' occurrence tables is a documented, intentional exception to the "no direct Prisma reach-through across domains" rule, exactly parallel to how `lib/db.ts` itself is shared rather than domain-owned.

**Data-model implication flagged for the Database Architect (not decided here):** enforcing this at the database level (not just in application code) is harder than a single table's unique constraint, since the invariant spans two separate tables. The two existing per-table unique constraints (`BillOccurrence.transactionId` unique, and the new `IncomeOccurrence.transactionId` unique) each correctly prevent *that table* from double-linking a Transaction, but do not by themselves prevent one Transaction from having one row in *each* table simultaneously. `assertTransactionNotAlreadyLinked` closes that gap in application code; whether the Database Architect additionally wants a race-condition-safe guarantee (e.g. wrapping the check-then-link in a single Prisma `$transaction` with a `SELECT ... FOR UPDATE`-equivalent, or a shared polymorphic link table) is a schema/implementation decision, not an architectural one — flagged here so it isn't silently missed.

## Phase 3a — the Account-linkage handoff (for the Database Architect)

Per Risk #9 and roadmap.md's Phase 3a section, the Database Architect makes the actual schema-shape call next. This Architect's job is to hand off a module-boundary design that survives any of the three options, plus a recommendation. Restated concisely:

- **Debt Tracker:** three of four non-credit-card debt types have no existing `Account` counterpart at all (Personal Loan, Auto Loan, Student Loan, Mortgage) — a standalone `Debt` model is required regardless of the final answer for Credit Card. This Architect's recommendation, **matching the Product Owner's own recommendation**, is **Option C (hybrid, optional link)**: a standalone `Debt` record for every debt type, with an optional nullable-unique FK to `Account` for the Credit Card case, mirroring the already-approved `BillOccurrence.transactionId` pattern (nullable + unique + `onDelete: SetNull`). This is what the module-boundary design above assumes as its primary case, but as shown above, Options A and B each only change one call site (`debt.service`'s effective-balance helper), not the shape of anything else.
- **Investments:** the real decision is narrower — a child-level `Holding` model is required regardless (no single `Account.balance` figure can represent per-holding allocation/gain-loss/dividend detail). This Architect's recommendation, **matching the Product Owner's own recommendation**, is to make the existing `Account` row the container (do not introduce a second, parallel "Investment container" model for something that already exists as Investment/Retirement/Crypto Account types) — see the derived-balance write-back design above, which is this Architect's concrete proposal for how that recommendation can be implemented without breaking module layering.
- **Both recommendations above are non-binding on the Database Architect** — per this project's standing rule, the Database Architect may reach a different, better-justified schema shape. If a different shape is chosen, re-check this document's "Investments → Accounts" and "Debt ↔ Accounts" call sites specifically; everything else in this document (payoff-math.ts, the API contracts, the Bills/Recurring-Income guard) is designed to be indifferent to that choice.

## Risks / scalability notes

- The Transactions table is the highest-traffic, highest-complexity UI surface — Budgeting, Bills, Debt, and Investments all reuse the same `DataTable` component and API pagination shape.
- `Account.type` is modeled as a discriminated enum specifically so Phase 3a's Debt/Investment features don't require a new top-level entity for the types that already exist — confirmed with Database Architect per risk register item #1. **Correction to a Phase 1-era note:** `docs/database/er-diagram.md`'s Phase 1 design note ("a `CREDIT_CARD` account gains debt-specific fields via a related `DebtDetail` table in Phase 3") was explicitly flagged by the Product Owner as illustrative precedent only, not a settled decision — the actual decision is the Database Architect's, made fresh against the real Phase 3a specs, not against a two-phase-old placeholder comment. This Architect is not amending `er-diagram.md` (Database Architect's file) but is flagging the discrepancy here so it isn't mistaken for prior sign-off.
- AI features (Phase 4) will need `lib/ai/` isolated from day one, unchanged from prior phases.
- **(Phase 3a) Net Worth double-counting is the single highest-value correctness risk in this phase's aggregation update — see api-contracts.md's Net Worth Aggregation Update section for the full contract.** In short: if a Debt is linked to an Account (Credit Card case), that Account's balance is already subtracted once in the existing Phase 1 Net Worth formula (per `accounts.md` AC6's sign convention); naively also subtracting that same Debt's balance as a second "total active debt liability" term double-counts it. The aggregation must only add the balances of debts **not** linked to an Account into the new liability term.
- **(Phase 3a) The Net Worth Snapshot job is the first scheduled/cron surface in this codebase.** See api-contracts.md's dedicated section — it requires a shared-secret-authenticated Route Handler, an explicit exception to "every endpoint requires an authenticated session," and an external scheduler (Vercel Cron, GitHub Actions cron, or equivalent) to actually trigger it on a schedule. **This Architect is not selecting or provisioning that scheduler** — that is a DevOps/Backend Engineer decision dependent on the chosen deployment target (Phase 0's "deployment target decided" milestone); flagged here as a required artifact from that role before this job can go live, not assumed.
- **(Phase 3a) Investments is front-loaded first in the backend implementation order** (per roadmap.md's own build-order rationale — it is the most complex piece). This Architect's module design gives it exactly one outbound dependency (`features/accounts/server/`) and one write call site (the derived-balance write-back), which should keep its implementation surface bounded even though its calculation surface (allocation, gain/loss, growth history, dividends) is the largest of the three Phase 3a domains.
