# FinanceOS — Case Study & Phase-by-Phase Engineering Breakdown

A personal finance dashboard built end-to-end by simulating a 17-role engineering studio — every "role" (CTO, Product Owner, Solution Architect, Database Architect, Backend Engineer, Frontend Lead, UI Component Engineer, AI Engineer, Security Architect, Code Reviewer, Unit/Integration/E2E Test Engineers, Bug Hunter, Performance Engineer, Documentation Engineer, Release Manager) is a real Claude Code subagent with its own scoped tools and a written charter, not a persona switch. This document is the project's own record of how that process actually played out: what got built, what broke, how it got fixed, and the patterns that held up across ten shipped phases.

**Stats at a glance:** 150 commits · 542 TypeScript/TSX files · ~81,400 lines of application code · 42 Prisma models · 110 markdown docs · 17 subagent roles · 0 phases shipped without a Release Manager sign-off.

---

## The process, not just the product

The defining thing about how this was built isn't any single feature — it's the pipeline every feature went through, unchanged, for ten phases straight:

**Product Owner** writes a spec (user story, acceptance criteria, edge cases, explicit non-goals) → **CTO** runs a resolution pass against it (re-verifies every claim against the actual codebase, checks for scope drift, sends it back if something doesn't hold up) → **Solution Architect** (+ **Database Architect** for schema work) designs the implementation → **Backend Engineer** and **Frontend Lead** build it → a full **review gate** (Security Architect, Performance Engineer, Bug Hunter, sometimes E2E Test Engineer) tries to break it → **Release Manager** either APPROVEs or REJECTs with specific findings. The next phase doesn't start until the current one clears that gate.

The discipline that mattered most in practice: **nothing was rubber-stamped.** A Release Manager REJECT wasn't a formality — it happened repeatedly, for real reasons, and every finding got fixed and re-verified before the next pass, not just noted and waved through. The starkest example: Phase 5b's "Number Counters" capability took **seven consecutive Release Manager passes** to reach APPROVE, each one finding one more headline figure that hadn't actually been wired to the shared animation primitive, or a scope judgment call whose own premise had gone stale mid-review-chain. Every one of those seven passes was independently verified live (real Playwright browser runs against a seeded database), not trusted on the previous pass's word.

---

## Tech stack

Next.js 15 (App Router, Turbopack) · TypeScript · Tailwind v4 · shadcn/ui · Prisma 6 + PostgreSQL (Neon) · Better Auth · TanStack Query/Table · React Hook Form + Zod · Recharts · Framer Motion · Vitest · Playwright + axe-core · `@react-pdf/renderer` · Resend + React Email.

---

## Phase 0 — Foundation

**What it entails:** Next.js scaffold, Postgres/Neon provisioning, Prisma setup, Better Auth (email/password + Google OAuth), the base authenticated app shell.

**File layout:** `src/lib/auth.ts` (Better Auth config + signup hook), `src/lib/db.ts` (Prisma client singleton), `src/app/(auth)/`, `src/app/(dashboard)/layout.tsx` (the one server-side auth gate every authenticated route inherits).

**Primary pattern established here, binding for the rest of the project:** every authenticated Server Component calls `getCurrentUser()` and redirects before rendering anything — there is exactly one auth gate, not one per route. This single decision is what let Phase 5's public demo mode later be built as a structurally separate sibling route rather than a special-cased exception.

---

## Phase 1 — Core: Accounts, Transactions, Categories, Dashboard v1

**What it entails:** the first real financial data — Accounts (balance, type, sign convention), Transactions (with splits and CSV import), Categories (11 defaults seeded on signup), Dashboard v1's aggregation and first charts.

**File layout:** `features/accounts/`, `features/transactions/` (including `server/import.ts` for CSV), `features/categories/`, `features/dashboard/`.

**Primary patterns:**
- The `features/<domain>/{types.ts, server/{service,actions,validation}.ts, components/}` module shape, used identically by every feature added afterward.
- Prisma's `Decimal` type is never passed across the Server→Client boundary raw — every `types.ts` converts it to `number` before it leaves `server/`. This one rule caught real bugs twice more in later phases (see Phase 5a below) when it was violated by accident.
- CSV import's duplicate-detection key (`date + amount + merchant`, normalized) — still the exact mechanism in place today.

---

## Phase 2 — Budgeting, Savings Goals, Bills, Notifications v1, Calendar v1, Receipts

**What it entails:** category-level monthly budgets, savings goals with contribution tracking, recurring bills with paid/late status, an in-app notification inbox, a first calendar view, receipt file attachments.

**File layout:** `features/budgeting/`, `features/goals/`, `features/bills/`, `features/notifications/`, `features/calendar/` (v1).

**Primary pattern:** status computed at read time, never stored — a bill's "late" flag, a budget category's "over budget" state, a goal's completion percentage are all derived on the fly from raw data, not written to a column that could drift out of sync. This "derive, don't cache" rule became the single most-repeated architectural decision in the entire project.

---

## Phase 3a — Debt Tracker, Investments, Recurring Income, Net Worth Snapshot

**What it entails:** debt payoff projections (snowball/avalanche), an investment portfolio with gain/loss tracking, recurring income streams, and a cron job snapshotting net worth daily.

**File layout:** `features/debt/` (including the isomorphic, Prisma-free `payoff-math.ts`), `features/investments/`, `features/recurring-income/`, `app/api/cron/net-worth-snapshot/`.

**Primary pattern:** pure math modules (`payoff-math.ts`) that never import `lib/db`/`lib/auth` — this is what let the same amortization logic run both server-side (for the real payoff projection) and later, unmodified, inside the demo mode's static fixture data (Phase 5's demo work, months later, reused this file directly with zero changes).

---

## Phase 3b — Net Worth History, Analytics, Financial Goals

**What it entails:** a historical net worth chart, a broader analytics suite (spending trends, category breakdowns, savings rate over time), and Financial Goals — a distinct, second kind of "goal" (net-worth-target, debt-payoff, savings-rate) from Phase 2's Savings Goals.

**Errors encountered & fixed:** the two "goal" concepts (Savings Goals vs. Financial Goals) were deliberately kept as separate, non-unified models after an explicit architecture-pass decision — an early temptation to merge them into one polymorphic model was rejected because their acceptance criteria didn't actually overlap enough to justify the added complexity. This boundary decision held for the rest of the project without ever needing to be revisited.

---

## Phase 4a — Five AI Features

**What it entails:** Transaction Auto-Categorization, AI Budget Advisor, Automatic Monthly Summaries, Spending Insights, and Financial Health Score — all backed by a new `lib/ai/` module.

**File layout:** `lib/ai/` (the shared `AiFeatureResult<T>` / `ApiResult<AiFeatureResult<T>>` composition contract every AI feature returns through), per-feature generation-cache tables in Prisma.

**Errors encountered & fixed:** a cron-concurrency race in `CategorySuggestion` generation (two overlapping cron runs could both try to generate a suggestion for the same transaction) was caught at the design-stage Security Architect review — before any code existed — and closed with a proper uniqueness constraint before the Backend Engineer ever wrote the service function. This is the project's earliest example of a review gate catching a defect before implementation rather than after.

**Primary pattern:** the AI-verification module (`verify-narrative-safety.ts`) that checks every AI-generated sentence against the actual numbers it describes, rejecting any generated text that references a figure not grounded in the real data — a hallucination guard, not just a profanity filter.

---

## Phase 4b — Reports & Notifications v2

**What it entails:** six PDF report types (via `@react-pdf/renderer`), and four new notification triggers (Goal Achieved, Large Purchase, Low Balance, Monthly Summary Ready) plus an email delivery channel.

**Errors encountered & fixed:** the Release Manager gate caught four Bug Hunter findings and one deploy-blocking gap — a one-time data backfill (`FinancialGoal.completionNotifiedAt`) that had to run once against every environment before the new trigger could go live without spamming already-completed goals. Also fixed: four Performance Engineer findings around report-generation query cost.

**Primary pattern:** an ESLint `no-restricted-imports` rule scoped to `features/reports/` and `features/notifications/`, blocking any import from `lib/ai/` — turning "the Monthly Report's narrative is a verbatim reuse of the already-generated summary, never a fresh generation" from a code-review convention into a build-time-enforced guarantee. This exact mechanism (a scoped ESLint rule as a structural guarantee, not a comment) became the template for every later "this boundary must never be crossed" requirement, including the public demo's read-only guarantee in Phase 5.

---

## Phase 4c — Calendar v2, Customization, Admin

**What it entails:** a real calendar (bills + recurring income + budget-reset markers, composed from the existing Bills/Income services with zero new business logic), Settings (accent color, dashboard layout, currency display, timezone), and an internal Admin section (users, audit log, feature flags, category templates, a demo-data seed trigger).

**Errors encountered & fixed — the two-REJECT phase:**
1. **First Release Manager REJECT:** Currency Display had been built but was never actually consumed — only 2 of 162 `formatCurrency` call sites in the whole app passed a currency argument. Fixed with a `CurrencyPreferenceProvider` React Context for Client Components and explicit `currency` props threaded through Server Components. That same fix pass also surfaced two related bugs found only via live browser testing: AI-generated narrative text hard-coded a `$` sign since the LLM was never told the user's currency, and a false-positive in the narrative-safety verifier that treated a bare calendar year ("2026") in prose as a fabricated, ungrounded figure.
2. **Second Release Manager REJECT:** one more missed `formatCurrency` call site, found by the Release Manager's own re-grep after the first fix — closed, then approved.

**Primary pattern:** `getCurrentAdminUser()` as the one, single admin-authorization gate — every admin route and action checks it directly, never trusts a caller that already checked once.

---

## Phase 5a — Accessibility & Responsive Foundation

**What it entails:** a WCAG 2.1 AA structural pass across the entire app, an `axe-core` + Playwright CI gate, and a responsive/mobile treatment for every data-heavy surface (bottom nav, card-list fallbacks for tables, a redesigned Calendar mobile view).

**Errors encountered & fixed:**
- **Release Manager REJECT (first pass):** 5 of the app's 6 accent-color presets failed real WCAG contrast math — the presets had been chosen by eye, not measured. Fixed with actual relative-luminance calculation and a permanent regression test (`accent-contrast.spec.ts`) covering all six presets, so this class of bug can't quietly come back.
- A second Decimal-leak instance (`goals/server/service.ts`) was found and fixed during the same pass — the same class of bug Phase 1 had established a rule against, reintroduced later and caught by this phase's Bug Hunter.
- A Sheet-focus-return bug: closing a mobile nav Sheet that had been opened via an *external* trigger (the bottom nav's "More" button, not its own hamburger button) returned keyboard focus to the wrong element — fixed by tracking which control actually opened it and overriding Radix's own (in this one case, wrong) default.

**Primary pattern:** every animation/motion-sensitive primitive built this phase explicitly branches on one shared `useReducedMotion()` hook — never Framer Motion's own re-exported hook, for reasons that became directly relevant in the next phase.

---

## Phase 5b — Motion & Craft: the seven-pass saga

**What it entails:** a reduced-motion foundation, animated number counters app-wide, chart entrance/update transitions, page transitions, and expandable cards.

**Errors encountered & fixed:**
- **Bug Hunter (pre-Release-Manager):** a real reduced-motion race on fresh page loads — Framer Motion's own `useReducedMotion` hook resolves the OS preference via a one-time `useState` initializer that can run before the browser's own media-query value is reliably populated, so a reduced-motion user could briefly see a real animation on first load. Fixed by rewriting `use-reduced-motion.ts` from a bare re-export into a real `useSyncExternalStore`-based hook, which also incidentally fixed a second bug (turning reduced-motion back on mid-session never resumed animation for anything already mounted).
- **Release Manager passes 1–5:** each found one more headline currency/percentage figure across the app that had never actually been wired to the new `AnimatedNumber` primitive — Investments' detail-page figures, Debt's total-balance card, a transaction-detail amount, Budgeting's health-score badge, the Financial Health Score's own headline number, and — once the pattern was recognized — a proactive sweep found and fixed seven more instances of the same gap in secondary captions sitting right next to an already-correct headline figure.
- **Release Manager pass 6, the most sophisticated finding of the cycle:** a prior pass's own "this is correctly out of scope" judgment call had gone stale — a later commit in the same review chain changed the fact that judgment call depended on, invalidating it without anyone revisiting the original reasoning. Caught only by re-deriving every prior scope decision against the codebase's *current* state, not trusting citation of an earlier pass's own conclusion.
- **Release Manager pass 7:** APPROVE.

**Primary pattern:** `AnimatedNumber`, the one shared counter primitive — a bare `<span>` any Server or Client Component can render, taking a raw number and a `format` callback, never a pre-formatted string, so the in-flight tween value and the final settled value are always formatted through the identical pipeline.

---

## Post-Phase-5 — Public Demo Mode, and a round of user-reported fixes

Not a numbered phase — a direct response to user requests once Phase 5 shipped, but run through the identical spec → design → build → security review → live verification pipeline.

**What it entails:** removing a fragile showcase demo account (real DB row, required manual re-seeding, could be broken by anyone with the login) and replacing it with `/demo` — a public, unauthenticated route backed entirely by static, hand-authored fixture data, read-only by construction and enforced by a scoped ESLint rule blocking any import of a Server Action, Prisma, or session state from that route tree.

**Errors encountered & fixed, found by an independent Security Architect review that re-traced every import by hand rather than trusting the implementation's own claims:**
- Two components the technical design had listed as "safe to reuse directly" turned out to have a transitive import three files deep into a Server Action or `@prisma/client` — an ESLint rule scoped to direct imports structurally cannot catch this class of bug. Both were swapped for demo-only twin components instead.
- Live Playwright verification then caught a real UI gap: one of the four list pages never linked to its own detail route (the other three did) — fixed.
- An accessibility sweep caught a real, pre-existing bug in a *real, already-shipped* chart component (a decorative sparkline wrapped in `aria-hidden` still had a keyboard-focusable child) — fixed in both the real component and its demo twin, not just the demo, since the bug predated the demo entirely.

**Also fixed in this window:** a genuinely broken "Sign out" button — `TopNav`'s `onSignOut` prop had never actually been wired to Better Auth's `signOut()` anywhere in the authenticated app, so the button existed and did nothing. And a standalone PDF-statement-to-CSV converter script, built to eliminate a real manual-data-entry chore, using the exact CSV schema the existing import pipeline already expected.

---

## Patterns that held up across the whole project

- **Derive, don't cache.** Status fields (late, over-budget, paid-off, health score) are computed at read time from raw data, never stored redundantly.
- **Decimal never crosses the Server/Client boundary raw.** Every feature's `types.ts` converts Prisma's `Decimal` to `number` before it leaves `server/`.
- **Boundaries enforced by tooling, not convention.** Every "X must never import Y" rule that mattered enough to protect ended up as a scoped ESLint `no-restricted-imports` block, not a comment asking people to remember.
- **One auth gate, one admin gate.** `getCurrentUser()`/`getCurrentAdminUser()` are each checked in exactly one place; nothing downstream re-implements the check.
- **Pure math stays pure.** Files like `payoff-math.ts` never import anything server-only, which is what let them get reused unmodified in a completely different context (the demo) months after they were written for a different purpose entirely.
- **Live verification, every time.** No fix in this entire project was marked done on the strength of a code read alone — everything got a real browser/Playwright run against real (or realistically seeded) data before being called finished.
- **Findings get fixed, not just filed.** A REJECT was never treated as a checkbox to argue past — every one of them, across ten phases, resulted in an actual code change, re-verified, before the next pass began.
