# Phase 4a Deployment / Phase-Gate Checklist — AI Features

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-4a-notes.md` for full reasoning and justification behind every
item below.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/ai-features.md`) — all five features
      specced with full AC/Edge Cases/DoD; Financial Health Score scope
      question explicitly resolved (CTO, 2026-07-22).
- [x] Solution Architect design (`docs/architecture/ai-features-design.md`)
      — provider decision (Gemini via Vercel AI SDK), `lib/ai/` module
      boundaries, Zod structured-output pattern, prompt-injection defenses,
      fallback contract, cost/latency bounds. All 8 design-stage Security
      findings addressed or explicitly deferred and later closed (Finding 5
      → the partial unique index).
- [x] Database Architect schema — `CategorySuggestion`, `BudgetAdvisorCache`,
      `MonthlySummary`, `SpendingInsightsCache`,
      `FinancialHealthScoreSnapshot`, `ReasoningModelCallLog` all present in
      `prisma/schema.prisma`. `npx prisma migrate status` → "Database schema
      is up to date!" (8 migrations applied).

## Backend implementation (all five features)

- [x] Transaction Auto-Categorization — `categorization.ts` +
      `categorization-schema.ts`, wired to `cron/categorize-transactions`.
- [x] AI Budget Advisor — `advisor.ts` + `advisor-schema.ts`, on-demand +
      cached, no cron by design.
- [x] Automatic Monthly Summaries — `monthly-summary.ts` +
      `monthly-summary-schema.ts`, wired to `cron/monthly-summary`.
- [x] Spending Insights — `insights.ts` + `insights-schema.ts`, on-demand +
      cached, no cron by design (confirmed intentional per Security review
      Finding 3).
- [x] Financial Health Score — `formula.ts` (deterministic), `service.ts`,
      `snapshot.ts`, `health-score-narrative.ts` +
      `health-score-narrative-schema.ts`, wired to
      `cron/financial-health-score-snapshot`.

## Frontend implementation

- [x] Transaction Auto-Categorization review UI — `suggestion-badge.tsx`,
      integrated into `transaction-table.tsx`; AI content visually
      distinguished (dashed badge + Sparkles icon); Accept/Reject wired to
      atomic Server Actions.
- [!] **AI Budget Advisor card (Budgeting page) — MISSING.** No component
      exists; AC1 not met.
- [!] **Monthly Summary card (Dashboard) + history view — MISSING.** No
      component exists; AC4/AC5 not met.
- [!] **Spending Insights widget (Dashboard/Analytics) — MISSING.** No
      component exists; AC1 not met.
- [!] **Financial Health Score summary card (Dashboard) + detail view —
      MISSING.** No component exists; AC8 not met.

## Security

- [x] Security Architect final pre-release review
      (`docs/security/phase-4a-review.md`) — **APPROVE**, no High/Critical
      findings.
- [x] Two Low findings (cross-feature rate-limit count-then-claim race,
      missing `ReasoningModelCallLog` retention job) — both accepted,
      documented, non-blocking.
- [x] Verified controls spot-checked directly: prompt-injection defenses
      (delimiters, closed-set enums, grounding/narrative-safety checks),
      per-`userId` DB scoping across every new table/query, DTO-typed prompt
      inputs (no raw Prisma entities into prompts), cross-user isolation in
      every cron/batch path, cron auth (`CRON_SECRET`), no
      `dangerouslySetInnerHTML`, no raw SQL.

## Performance

- [x] Performance Engineer review (`docs/performance/phase-4a-review.md`) —
      **APPROVE**, one HIGH finding (categorization cron per-user
      starvation) fixed during the gate.
- [x] Fix verified directly: `MAX_BATCHES_PER_USER_PER_INVOCATION`
      (`src/lib/ai/rate-limit.ts`) + `selectBatchesForInvocation`
      (`categorization.ts`), unit-tested for starvation prevention.
- [~] Four lower-severity findings (retry-doubling cron-budget note,
      `getSavingsGrowth`'s per-month query loop, transaction-table
      full-re-render on suggestion actions, unpaginated
      `getPendingSuggestions`) — accepted, documented, non-blocking
      follow-ups.

## Bug Hunter

- [x] HIGH `accept-reject-category-suggestion-toctou-race.md` — fixed,
      verified: atomic `updateMany`-based claim in `acceptCategorySuggestion`/
      `rejectCategorySuggestion` (`transactions/server/actions.ts`).
- [x] LOW-MEDIUM `accept-suggestion-category-deleted-mid-flight-stuck-pending.md`
      — fixed, verified: `updateTransaction`'s "Category not found" is now
      treated as a REJECTED-marking trigger.
- [x] MEDIUM `manual-reconsider-race-false-unavailable.md` — fixed, verified:
      `requestManualSuggestion` re-checks for an existing PENDING row before
      reporting `"unavailable"`.
- [~] LOW `reasoning-model-rate-limit-cross-feature-race.md` — accepted, not
      fixed; consistent with Security review's own Finding 1 framing, no
      contradiction.
- [x] Confirmed the other three files in `docs/testing/bug-reports/` are
      pre-existing Phase 3b artifacts (`git log` traces all three to
      `36568e4`), correctly out of scope for this gate.

## Build / tooling (re-run independently)

- [x] `npx prisma migrate status` — up to date.
- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — **470/470 tests passing, 35 test files.**
- [x] `npm run build` — production build succeeds, all 30 routes generated,
      no regressions.

## Documentation

- [x] Product spec, architecture design, security review, performance
      review, and all four in-scope bug reports exist, are complete, and
      are internally consistent with the shipped code.
- [!] Documentation implicitly describes five features as release-ready;
      four of five have no user-facing surface to document a user-visible
      workflow for.

## Overall Gate Decision

**REJECT**, for Phase 4a as a bundled release of all five features. Feature
1 (Transaction Auto-Categorization) is independently complete end-to-end
(backend, frontend, security, performance, Bug Hunter fixes) and could ship
on its own if Product/CTO explicitly chooses to split scope. Features 2-5
are backend-complete and reviewed, but have zero shipped frontend, which is
a direct, verified failure of explicit Acceptance Criteria in
`ai-features.md` (Feature 2 AC1, Feature 3 AC4/AC5, Feature 4 AC1, Feature 5
AC8) and of `roadmap.md`'s own stated build order (frontend for all five
surfaces was milestone 5, a prerequisite to this review gate, milestone 6).
See `phase-4a-notes.md` for the full justification and the path to APPROVE.
