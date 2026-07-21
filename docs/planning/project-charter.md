# FinanceOS — Project Charter

## Vision
Build a modern, production-ready personal finance dashboard that gives users complete visibility into their financial life through budgeting, account management, transaction categorization, savings goals, debt tracking, investments, recurring bills, and insightful analytics. The application should feel like software someone would pay to use.

## Tech Stack (approved)
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts, Framer Motion, TanStack Table, TanStack Query, React Hook Form, Zod
- **Backend**: Next.js API Routes / Server Actions, Prisma, PostgreSQL
- **Auth**: Better Auth (preferred over NextAuth — see decision below), Google OAuth, email login
- **Storage**: UploadThing (primary; S3-compatible fallback if self-hosting is ever needed)
- **Charts**: Recharts

### Decision: Better Auth over NextAuth
Better Auth has first-class Prisma adapter support, simpler session/organization primitives, and more predictable TypeScript inference than NextAuth v5 (still in beta as of this writing). Revisit only if Better Auth proves unstable during Phase 0.

## Why phased delivery
The full feature list (dashboard, accounts, transactions, budgeting, goals, bills, debt tracker, investments, AI features, notifications, calendar, global search, PDF reports, customization, admin) is a multi-quarter build. Shipping it as one pass has no working checkpoints and no way to validate the data model against real usage before it's load-bearing everywhere. This charter mandates phased delivery — see [roadmap.md](roadmap.md) — where each phase produces a usable, demoable increment.

## Non-negotiable engineering principles (binding on every role)
1. Every department stays in its lane — see each role's agent definition in `.claude/agents/`.
2. No feature is implemented until its Product Owner spec and Solution Architect design exist.
3. No schema is designed until the Product Owner spec exists (data models encode business rules — they must not be guessed).
4. Every release requires: tests passing, security review, performance review, docs, and CTO/architecture approval — enforced by the Release Manager.
5. Files stay under ~300 lines; components are modular and single-responsibility.

## Out of scope for the entire v1 arc (explicitly deferred)
- Multi-currency conversion (single currency per user account for now; currency is a user setting, not live FX conversion)
- Bank account aggregation (Plaid/similar) — all Phase 0–3 data entry is manual or CSV import; live bank sync is a post-v1 decision requiring its own compliance review
- Multi-user / shared household accounts
- Native mobile apps (responsive web only)

## Success definition for v1 (end of Phase 3b)
A single user can: sign in, add accounts, log/import transactions, set a monthly budget, track savings goals and bills, track debt and investments, view recurring income, and see a real dashboard with full analytics and Net Worth history — all built from their own data, on a deployed, secured, tested build.

**Correction (CTO, 2026-07-20):** this section previously read "...and receive at least one AI-generated insight" as part of the v1 bar. That was inconsistent with `roadmap.md`, which has always placed AI features in Phase 4 — after the phase this section calls "end of v1." Rather than let that ambiguity stand into Phase 3 planning (the same pattern of catching stale cross-doc conflicts that's come up in every phase so far), it's resolved here: AI-generated insights are a Phase 4 differentiator, not a v1 requirement. The wording above now also names Phase 3a's debt/investment/recurring-income tracking explicitly, since the roadmap's Phase 3 was split into 3a/3b (see `roadmap.md`) and "end of Phase 3" needed disambiguating to "end of Phase 3b" — that is the point at which the roadmap's Phase 3b section states v1 ships.

See [roadmap.md](roadmap.md) for phase breakdown and [risk-register.md](risk-register.md) for tracked risks.
