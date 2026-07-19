# FinanceOS — Migration Strategy

## Applied migrations
- `20260719045753_init` (Phase 0/1): auth models + Account/Transaction/Category/Tag/TransactionTag. There was no production data yet, so no backward-compatibility constraints applied.
- `20260719205827_phase2_budgeting_goals_bills_notifications` (Phase 2): adds `Budget`, `BudgetCategory`, `Goal`, `GoalContribution`, `Bill`, `BillOccurrence`, `Notification`, `Receipt`; drops `Transaction.receiptUrl` (see below). This migration includes a destructive change (dropping a column) without a Release Manager sign-off gate — acceptable here only because there was still no production data at the time (same reasoning as the init migration); rule 5 below remains binding for every migration from this point forward, once real users exist.

## Phase 0/1 baseline
- First migration (`prisma migrate dev --name init`) creates the full Phase 0/1 schema in one shot — auth models + Account/Transaction/Category/Tag/TransactionTag. There is no production data yet, so no backward-compatibility constraints apply to this migration.

## Ongoing process (binding from Phase 2 onward)
1. Database Architect authors schema changes in `prisma/schema.prisma` only after the relevant Product Owner spec and Solution Architect design exist for that phase's domain (per Architecture.md's role boundaries) — never speculatively.
2. Every migration is generated via `prisma migrate dev --name <descriptive-name>` and committed alongside the schema change, never hand-edited SQL except for genuinely irreversible data backfills.
3. **Additive-first**: new columns are nullable or have defaults so existing rows remain valid without a backfill step blocking deploy. Making a column required happens in a follow-up migration after a backfill, not the same migration that introduces it.
4. **Renames are two migrations**, not one: add the new column, backfill/dual-write, then drop the old column in a later migration — never a single `ALTER ... RENAME` on a table that might have production data by Phase 2+.
5. Destructive migrations (drop column/table) require Release Manager sign-off per the release checklist — they are irreversible in production.

## Phase-by-phase schema growth
- **Phase 2 (applied, see "Applied migrations" above)**: `Budget`/`BudgetCategory` reference `Category`; `Goal`/`GoalContribution` reference neither `Category` nor `Account` — goal progress is tracked purely through the manually-logged `GoalContribution` model; `Bill`/`BillOccurrence` optionally reference `Category` and optionally link a paid occurrence to an existing `Transaction` (a single-use, unique FK, not a duplicating relation); `Notification` (originally missing from this note — added by the Database Architect alongside the models above, flagged by the Solution Architect as a gap in this document) references `BudgetCategory`/`BillOccurrence`; `Receipt` (Transactions addendum) replaces the Phase 1 `Transaction.receiptUrl` placeholder with a proper one-to-many model. See `docs/database/er-diagram.md`'s Phase 2 design notes for the full rationale on each.
- **Phase 3**: `DebtDetail` (extends `Account` where `type` is a debt-bearing type), `InvestmentHolding`, `RecurringIncome` — may add fields to `Account` (e.g. `payoffDate` lives on `DebtDetail`, not `Account`, to avoid nullable-field sprawl on the shared table).
- **Phase 4**: AI-related tables (e.g. cached insights, financial health score snapshots) are additive-only against existing domains.

## Seed data
- `prisma/seed.ts` is dev/demo-only (creates a `demo@financeos.local` user). It is never run against production. `DEFAULT_CATEGORIES` lives in `src/features/categories/default-categories.ts` (a side-effect-free module `prisma/seed.ts` imports from, not the other way around, since `prisma/seed.ts`'s `main()` runs unconditionally at import time). Production users get their default categories created automatically at signup via a Better Auth `databaseHooks.user.create.after` hook in `src/lib/auth.ts`, which imports the same `DEFAULT_CATEGORIES` list.
