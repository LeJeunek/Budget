-- Hand-authored migration (Prisma's schema DSL has no first-class
-- conditional/partial @@unique syntax — see prisma/schema.prisma's
-- CategorySuggestion model comment and docs/database/migration-strategy.md
-- for why hand-edited migration SQL is the deliberate, documented escape
-- hatch for this specific category of constraint, not the default path).
--
-- Enforces, at the database level, "at most one PENDING CategorySuggestion
-- row per transaction" for EVERY writer, including two overlapping
-- invocations of app/api/cron/categorize-transactions/route.ts racing the
-- same application-level check-then-create guard from separate execution
-- contexts (Security Architect Phase 4a design-stage review, Finding 5) —
-- a race an application-level-only guard cannot close, unlike this
-- schema's two prior "single user, within milliseconds of themselves"
-- exclusivity precedents (Bills<->Recurring-Income, Debt Payoff), which
-- remain application-level guards on purpose. See
-- docs/database/er-diagram.md's Phase 4a design notes for the full
-- reasoning, including why a run-level idempotency key (the
-- NetWorthSnapshot (userId, capturedDate) pattern) was considered and
-- rejected for this specific job.
CREATE UNIQUE INDEX "category_suggestion_transactionId_pending_key"
  ON "category_suggestion" ("transactionId")
  WHERE "status" = 'PENDING';
