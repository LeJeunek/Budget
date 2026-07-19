# FinanceOS — Migration Strategy

## Phase 0/1 baseline
- First migration (`prisma migrate dev --name init`) creates the full Phase 0/1 schema in one shot — auth models + Account/Transaction/Category/Tag/TransactionTag. There is no production data yet, so no backward-compatibility constraints apply to this migration.

## Ongoing process (binding from Phase 2 onward)
1. Database Architect authors schema changes in `prisma/schema.prisma` only after the relevant Product Owner spec and Solution Architect design exist for that phase's domain (per Architecture.md's role boundaries) — never speculatively.
2. Every migration is generated via `prisma migrate dev --name <descriptive-name>` and committed alongside the schema change, never hand-edited SQL except for genuinely irreversible data backfills.
3. **Additive-first**: new columns are nullable or have defaults so existing rows remain valid without a backfill step blocking deploy. Making a column required happens in a follow-up migration after a backfill, not the same migration that introduces it.
4. **Renames are two migrations**, not one: add the new column, backfill/dual-write, then drop the old column in a later migration — never a single `ALTER ... RENAME` on a table that might have production data by Phase 2+.
5. Destructive migrations (drop column/table) require Release Manager sign-off per the release checklist — they are irreversible in production.

## Phase-by-phase schema growth (planned, not yet modeled)
- **Phase 2**: `Budget`, `BudgetCategory`, `Goal`, `Bill` — will reference existing `Category`/`Account`, no changes to Phase 1 tables expected.
- **Phase 3**: `DebtDetail` (extends `Account` where `type` is a debt-bearing type), `InvestmentHolding`, `RecurringIncome` — may add fields to `Account` (e.g. `payoffDate` lives on `DebtDetail`, not `Account`, to avoid nullable-field sprawl on the shared table).
- **Phase 4**: AI-related tables (e.g. cached insights, financial health score snapshots) are additive-only against existing domains.

## Seed data
- `prisma/seed.ts` is dev/demo-only (creates a `demo@financeos.local` user). It is never run against production. Production users get their default categories created at signup time by the Backend Engineer's auth/signup flow, which imports `DEFAULT_CATEGORIES` from `prisma/seed.ts` rather than duplicating the list.
