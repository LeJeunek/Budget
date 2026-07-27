// FinanceOS — showcase demo seed. Run via `npm run seed:showcase`.
//
// Unlike prisma/seed.ts (that file's own top-of-file comment: "exercise
// every model at least once," a deliberately minimal dev fixture with NO
// working login — it creates its demo user via `prisma.user.upsert`
// directly, with no password/AuthAccount row at all), this creates ONE
// real, loggable-in demo account — `showcase@lkbudget.demo` — filled with
// several months of realistic, good-looking data across every feature:
// accounts, transactions, recurring income, budgeting, bills, debt payoff,
// investments, financial goals, net worth history, and every AI-feature
// cache/history row. Built for demoing and screenshotting the app, not for
// exercising every model's edge-case states (that remains
// prisma/seed.ts's + Integration Test Engineer's dedicated fixtures' job).
//
// Idempotent-friendly: if `showcase@lkbudget.demo` already exists (from a
// prior run), it is deleted (cascades to every model below via this
// schema's own onDelete: Cascade relations) and recreated fresh — see
// seed-showcase/user.ts.
//
// Split into one module per domain under prisma/seed-showcase/ (accounts,
// debt, investments, income, bills, expense-transactions, budget,
// financial-goals, net-worth, ai-caches, category-suggestion) rather than
// one large file — the same single-responsibility-per-module discipline
// this codebase's own features/<domain>/ folders already follow, and the
// only reasonable way to keep any one file under this repo's ~300-line
// guideline while still covering every feature area the task asked for.
// prisma/seed-showcase/index.ts is the actual orchestrator; this file is
// just the runnable entry point `"prisma": { "seed": ... }`-style tooling
// expects, mirroring prisma/seed.ts's own "runs main() unconditionally at
// import time" shape.
import "./seed-showcase/index"
