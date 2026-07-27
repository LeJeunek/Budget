# Phase 4a Release Notes — AI Features

**Reviewer:** Release Manager
**Scope:** Transaction Auto-Categorization, AI Budget Advisor, Automatic
Monthly Summaries, Spending Insights, Financial Health Score (0-100) — per
`docs/product/ai-features.md`, `docs/architecture/ai-features-design.md`,
and `roadmap.md`'s Phase 4a milestones 1-6.

**Decision: REJECT (as a bundled Phase 4a release).** See "Release Manager
Decision" at the bottom for the full justification. This is an independent
verification, not a re-derivation of the dispatching summary's claims — every
item below was checked directly against source, not accepted on the strength
of a prior gate's own sign-off.

The two unrelated changes that landed in the same commit window — Account
Balance Auto-Adjustment (`c1bbf3c`... actually `603019f`) and the "LK Budget"
rebrand (`c1bbf3c`) — are correctly out of scope for this gate and did not
factor into this decision either way.

---

## 1. Product Owner spec

`docs/product/ai-features.md` exists and specifies all five features, each
with its own User Story / Business Value / Acceptance Criteria / Edge Cases /
Definition of Done / Dependencies / Success Metrics, plus five Cross-Cutting
Product Requirements applying to all five. The Financial Health Score's
scope question (deterministic formula vs. LLM judgment) is explicitly
resolved in-document, with a CTO "Resolved" section covering weighting,
bands, the Net Worth Trend normalization correction, the snapshot-table
steer, and the suggestion/audit-trail table confirmation. **Complete.**

## 2. Solution Architect design

`docs/architecture/ai-features-design.md` exists: LLM provider decision
(Google Gemini via Vercel AI SDK `generateObject`, with the documented
provider-swap addendum from an original Anthropic-Claude-first pass),
`lib/ai/` module boundaries, the Zod structured-output pattern, prompt-
injection defenses, the fallback/degraded-behavior contract, and cost/latency
bounds. All 8 design-stage Security Architect findings are addressed inline
and tagged at their point of application (Finding 5 explicitly deferred to a
joint Database Architect resolution — confirmed closed via the
`category_suggestion_transactionId_pending_key` partial unique index,
verified present in the security review's Verified Control G). **Complete.**

## 3. Database Architect schema

`prisma/schema.prisma` contains `CategorySuggestion`, `BudgetAdvisorCache`,
`MonthlySummary`, `SpendingInsightsCache`, `FinancialHealthScoreSnapshot`,
and `ReasoningModelCallLog`. Ran `npx prisma migrate status` directly:

```
8 migrations found in prisma/migrations
Database schema is up to date!
```

**Confirmed, up to date.**

## 4. Backend implementation — all five features

Verified each of the following exists and is wired to its cron route (where
applicable):

- `src/features/transactions/server/categorization.ts` → `app/api/cron/categorize-transactions/route.ts`
- `src/features/budgeting/server/advisor.ts` (on-demand, cached, no cron)
- `src/features/dashboard/server/monthly-summary.ts` → `app/api/cron/monthly-summary/route.ts`
- `src/features/analytics/server/insights.ts` (on-demand, cached, no cron — correctly, by design, per Security review Finding 3)
- `src/features/financial-health-score/server/{formula,service,snapshot,health-score-narrative}.ts` → `app/api/cron/financial-health-score-snapshot/route.ts`

All five are backend-complete, tested, and reviewed. **Confirmed.**

## 5. Frontend UI

`src/features/transactions/components/suggestion-badge.tsx` exists and is
integrated into `transaction-table.tsx` (imported, rendered inline per row
next to the category cell, gated on `suggestionsByTransactionId`). This is a
genuinely complete, well-built surface: dashed-border badge + Sparkles icon
satisfying Cross-Cutting Requirement #3's "AI content is visually
distinguished," Accept/Reject wired to the atomic Server Actions, correct
handling of the "suggested category deleted mid-flight" edge case (renders
nothing rather than a broken badge). **Confirmed, for Feature 1 only.**

**Gap found: no frontend exists for Features 2-5.** Verified by direct
search (no component named or resembling an advisor card, monthly summary
card, insights widget, or health score display anywhere in `src/`; no
`page.tsx` or component imports `advisor.ts`, `insights.ts`,
`monthly-summary.ts`, or `financial-health-score/server/service.ts` — the
only non-test importers of these four modules are their own cron routes).
`npm run build`'s route output confirms `/budgeting` (3.09 kB) and `/`
(5.27 kB) are unchanged in size from what a Budget-Health-Score-only page
would produce — no new card markup is present. See "Release Manager
Decision" below for why this blocks the bundled release.

## 6. Security Architect final review

`docs/security/phase-4a-review.md` — **Recommendation: APPROVE**, no
High/Critical findings, two Low findings (cross-feature rate-limit race,
missing `ReasoningModelCallLog` retention job) both explicitly accepted as
documented, non-blocking trade-offs appropriate to this app's single-user/
small-team deployment target. Verified controls A-I checked by direct
inspection: prompt-injection defenses, per-userId DB scoping, DTO-typed
prompt inputs, cross-user isolation in all cron/batch paths, cron auth,
rate-limiting ordering, schema `userId`-scoping + cascade behavior, no
`dangerouslySetInnerHTML` usage, no raw SQL. **Confirmed, APPROVE.**

## 7. Performance Engineer review

`docs/performance/phase-4a-review.md` — **Recommendation: APPROVE**, with
one HIGH finding (categorization cron per-user starvation) fixed during the
gate. Verified the fix directly:

- `MAX_BATCHES_PER_USER_PER_INVOCATION` exists in `src/lib/ai/rate-limit.ts`.
- `selectBatchesForInvocation` exists in
  `src/features/transactions/server/categorization.ts` and is unit-tested
  (`categorization.test.ts`) for partial-processing/starvation-prevention.

Four lower-severity findings (retry-doubling cron-budget note,
`getSavingsGrowth`'s per-month query loop, transaction-table full re-render
on suggestion actions, unpaginated `getPendingSuggestions`) are accepted,
documented, non-blocking follow-ups consistent with this app's deployment
scale. **Confirmed, APPROVE.**

## 8. Bug Hunter findings

`docs/testing/bug-reports/` contains seven files; three
(`financial-goal-unarchive-bypasses-debt-payoff-exclusivity.md`,
`savings-rate-goal-past-target-date-no-overdue-state.md`,
`subscription-dismissal-normalized-name-collision.md`) are pre-existing
Phase 3b artifacts (confirmed via `git log` — all three trace to commit
`36568e4`, already resolved in the prior release gate) and are not part of
this review. The four Phase 4a-scoped reports:

- **HIGH** `accept-reject-category-suggestion-toctou-race.md` — fixed.
  Verified `acceptCategorySuggestion`/`rejectCategorySuggestion`
  (`src/features/transactions/server/actions.ts`) now use an atomic
  `updateMany({ where: { ..., status: "PENDING" }, data: { status: ... } })`
  claim, checking `count === 1` before any transaction-mutating side effect,
  with a documented, deliberate claim-before-mutate ordering.
- **LOW-MEDIUM** `accept-suggestion-category-deleted-mid-flight-stuck-pending.md`
  — fixed. `acceptCategorySuggestion` now treats `updateTransaction`'s
  specific "Category not found" failure as the same REJECTED-marking
  trigger as the already-null-at-read branch, and reverts the ACCEPTED claim
  back to PENDING for any other failure.
- **MEDIUM** `manual-reconsider-race-false-unavailable.md` — fixed.
  `requestManualSuggestion` (`src/features/transactions/server/categorization.ts`)
  no longer branches on `generateSuggestionsForBatch`'s own `suggested`
  count; it unconditionally re-checks for a now-existing `PENDING` row
  before concluding `"unavailable"`.
- **LOW** `reasoning-model-rate-limit-cross-feature-race.md` — accepted,
  not fixed, consistent with the Security review's own Finding 1 framing
  (same risk, same rating, same accepted-trade-off reasoning). No
  contradiction between the two documents.

**Confirmed: three fixed, one consistently accepted as documented risk.**

## 9. Tests, typecheck, lint, build

Ran directly, myself:

- `npx prisma migrate status` → "Database schema is up to date!"
- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings.
- `npx vitest run` → **470/470 tests passing, 35 test files**, matching the
  expected count.
- `npm run build` → succeeds, all 30 routes generated, no route regressions.

**All green.**

## 10. Definition of Done / Cross-Cutting Requirements spot-check

- **Graceful degradation (`AiFeatureResult<T>`):** confirmed as the single
  shared discriminated union in `src/lib/ai/types.ts`, returned by every
  feature-owned server function; each of the five files independently
  catches its own non-AI errors too (Finding 7's extended contract),
  confirmed present in the Security review's inspection and consistent with
  code read directly.
- **No autonomous write path:** confirmed structurally — `lib/ai/` and every
  AI-specific file are read-and-suggest only; only the user-initiated Accept
  Server Action writes `Transaction.categoryId`, and it does so via the same
  `updateTransaction` path a manual edit uses.
- **AI content visually distinguished:** confirmed for the one shipped
  frontend surface (`suggestion-badge.tsx`'s dashed border + Sparkles icon +
  "Suggested:" label). **Cannot be confirmed for Features 2-5's narrative
  output, because no UI renders it yet** (see Section 5's gap).

---

## Release Manager Decision

**REJECT, for Phase 4a as a bundled release of all five features.**

`ai-features.md` itself frames these five features as one cohesive spec that
"share one technical foundation and one review theme" rather than
independently dispatchable domains — so this decision evaluates them
together, per that framing, not as five separate go/no-go calls.

**What blocks this release:** Features 2-5 (AI Budget Advisor, Automatic
Monthly Summaries, Spending Insights, Financial Health Score) have complete,
well-reviewed, well-tested backend implementations and **zero shipped
frontend**. This is not a style or polish gap — it is a direct, verified
failure of explicit Acceptance Criteria in `ai-features.md`:

- Feature 2 AC1: "The advisor card appears on the Budgeting page..." — no
  such card exists.
- Feature 3 AC4/AC5: "The most recently completed month's summary is
  surfaced on the Dashboard as its own card" / "A history of all past
  monthly summaries is browsable" — neither exists.
- Feature 4 AC1: "An Insights widget presents between 2 and 4 concise,
  natural-language observations..." — no widget exists.
- Feature 5 AC8: "The score is surfaced on the Dashboard (a summary card)
  and on a dedicated detail view..." — neither exists.

`roadmap.md`'s own Phase 4a build order states this explicitly, in order:
"4. Backend implementation... 5. **Frontend for all five surfaces**... 6.
**Full 4a review gate**" — frontend for all five was scoped as a
prerequisite to the review gate this document represents, not an optional
or deferrable follow-on. What actually shipped instead is backend for five
features plus frontend for one, with the review gate (Security, Performance,
Bug Hunter) run against that reduced surface — each of those three reviews'
own stated scope lines confirm they reviewed only "the Transaction
Auto-Categorization frontend surface," not a gap they introduced, but a
faithful reflection of what exists to review. None of the three prior gates
overlooked anything; there was simply nothing built yet for them to review
on Features 2-5's frontend.

The practical consequence: a user who upgrades to this release gets a fully
functional, safe, well-tested category-suggestion review flow in
Transactions, and **no visible change anywhere else** — the Budget Advisor,
Monthly Summaries, Spending Insights, and Financial Health Score are
computed, cached, and cron-scheduled entirely invisibly, with no way for any
user to ever see any of it. Shipping this as "Phase 4a: AI Features" would
represent four of five named features as delivered when they are not
user-reachable at all.

**What does not block this release — explicitly confirmed high quality:**
schema/migrations, all five backend implementations, the shared `lib/ai/`
foundation, prompt-injection defenses, rate-limiting, the Security Architect
review (APPROVE), the Performance Engineer review (APPROVE, HIGH finding
fixed and verified), three of four Bug Hunter findings (fixed and verified),
the fourth (accepted risk, consistent across both review documents), and all
automated checks (typecheck, lint, 470/470 tests, production build).

**Path to APPROVE:**

1. Build the missing frontend for Features 2-5 (Budget Advisor card on the
   Budgeting page, Monthly Summary card on the Dashboard plus a browsable
   history view, Spending Insights widget on the Dashboard/Analytics, and
   the Financial Health Score's Dashboard summary card plus dedicated detail
   view with breakdown/trend/narrative) — per `roadmap.md` milestone 5 and
   each feature's own Acceptance Criteria in `ai-features.md`.
2. Route the new frontend surfaces back through Security Architect and
   Performance Engineer for review (their existing APPROVE verdicts were
   correctly scoped to what existed at the time and do not cover
   not-yet-built UI — e.g. narrative rendering must be re-verified as a
   plain-text node per `ai-features-design.md` §4.3's Frontend Lead
   handoff, and any new client-side data fetching needs its own performance
   pass).
3. Re-run Bug Hunter against the new surfaces.
4. Return to Release Manager for a fresh sign-off pass.

**Alternative, narrower path, if Product/CTO chooses to split scope:**
Feature 1 (Transaction Auto-Categorization) is independently complete —
backend, frontend, security, performance, and all Bug Hunter findings fixed
and verified — and could ship on its own merits today. That is a scope
decision for Product Owner/CTO to make explicitly (mirroring how this
exact document flagged the 4a/4b/4c split as a CTO decision), not one this
Release Manager is authorized to make unilaterally by silently approving a
subset of a spec that was written and dispatched as one cohesive release.
