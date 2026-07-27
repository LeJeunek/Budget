# Phase 4a Release Notes — AI Features

**Reviewer:** Release Manager
**Scope:** Transaction Auto-Categorization, AI Budget Advisor, Automatic
Monthly Summaries, Spending Insights, Financial Health Score (0-100) — per
`docs/product/ai-features.md`, `docs/architecture/ai-features-design.md`,
and `roadmap.md`'s Phase 4a milestones 1-6.

**Decision: APPROVE.** This supersedes the prior sign-off in this same file
(`git log` commit `37a6e3e`, REJECT — "zero shipped frontend" for Features
2-5). This is a full, independent re-verification of Phase 4a as a whole,
not a re-derivation of any prior gate's own claims (including this
document's own prior REJECT) — every item below was checked directly
against current source, current test output, and a fresh `npm run
build`/`npx vitest run`/`npm run typecheck`/`npm run lint` run, not accepted
on the strength of an intervening gate's sign-off.

The "Account Balance Auto-Adjustment" feature, the "LK Budget" rebrand, and
the showcase demo-account seed script that landed in the same commit window
are correctly out of scope for this gate and did not factor into this
decision either way, consistent with how the prior REJECT pass also
excluded them.

---

## 1. What changed since the prior REJECT

Commit `37a6e3e` rejected the bundled release because Features 2-5 (Budget
Advisor, Monthly Summaries, Spending Insights, Financial Health Score) had
complete backends and zero shipped frontend. Since then:

- `079500f` — built all four missing frontend surfaces.
- `cc7304a` — Security follow-up review of the new frontend (APPROVE, no
  findings).
- `71c6ac4` — Performance follow-up review of the new frontend (APPROVE with
  follow-ups: two MEDIUM-HIGH, one MEDIUM, two lower-severity accepted).
- `c1ef591` — fixed the two MEDIUM-HIGH findings (cache-check-first reorder
  in `advisor.ts`/`insights.ts`) and the MEDIUM finding (optional
  `precomputedBudgetHealthScore` param).
- `7a9bbea` — Bug Hunter pass against the new frontend; found four real bugs
  (two HIGH).
- `5c2f3fe` — fixed all four Bug Hunter findings.

## 2. Frontend surfaces — verified present, wired, and matching Acceptance Criteria

Read every file directly, not just confirmed existence:

- **`src/features/budgeting/components/budget-advisor-card.tsx`** — read in
  full. 1-3 recommendations rendered as plain text nodes inside a
  dashed-border/Sparkles-icon treatment (Cross-Cutting #3), "Refresh"
  action, collapse/expand toggle (AC4's "no data-deleting action"), an
  `"unavailable"` branch with a "Try again" retry that never blocks the rest
  of the page (self-contained `Card`). Wired into
  `src/app/(dashboard)/budgeting/page.tsx`, gated correctly behind
  `budgetMonth.isEditable && hasBudgetedCategory` (AC1/AC5) — the page skips
  fetching the advisor entirely rather than rendering a card that would just
  say "unavailable," matching Feature 2's own Edge Case wording.
- **`src/features/dashboard/components/monthly-summary-card.tsx`** — read in
  full. Title + narrative for the most recent completed month (AC4),
  "Summary not available for [Month]" state with a "Try again" action
  (Feature 3's own degraded-state edge case), a "View history" `Dialog`
  listing every past month (AC5), partial-month `Badge`. Wired into
  `src/app/(dashboard)/page.tsx`.
- **`src/features/analytics/components/spending-insights-widget.tsx`** —
  read in full. 2-4 insights (enforced by `insights.ts`'s
  `MIN_CANDIDATES_TO_ATTEMPT`/schema, not re-checked here), each citing a
  concrete figure with a source-metric `Badge` (AC2), a refresh action
  (AC4), an `"unavailable"` state covering both "not enough data" and
  "AI unavailable" honestly (documented judgment call, not a misrepresented
  state). Wired into `src/app/(dashboard)/analytics/page.tsx`, receiving the
  page's own shared `period` (AC5).
- **`src/features/financial-health-score/components/*.tsx`** (badge,
  breakdown, narrative, history chart) — all four read in full.
  `financial-health-score-badge.tsx` renders the Dashboard summary card
  (AC8) with the "not enough data yet" empty state (AC4) and an
  undefined-component annotation, linking to the detail page.
  `financial-health-score-breakdown.tsx` labels all four components (AC2)
  and explicitly ties Budget Adherence back to the Budget Health Score by
  name (AC3: `"Budget Adherence (same as your Budget Health Score)"`).
  `financial-health-score-narrative.tsx` renders the optional narrative,
  visually distinguished (dashed border + Sparkles), and its
  presence/absence never affects the score/breakdown rendering above it
  (AC6). `financial-health-score-history-chart.tsx` is a purely
  presentational sparkline (AC7) fed by a prop, no client refetch. All
  wired into the new **`src/app/(dashboard)/financial-health-score/page.tsx`**
  (AC8's "dedicated detail view"), which is also now reachable from the
  Dashboard badge's `Link` and from `src/components/shared/sidebar.tsx`'s
  new "Health Score" nav entry (Wealth section) — the detail view is
  genuinely user-reachable, not just a route that exists.

All four surfaces use the identical dashed-border + Sparkles-icon visual
language for AI-authored text, satisfying Cross-Cutting Requirement #3
consistently across every Phase 4a surface, matching Feature 1's own
already-approved `suggestion-badge.tsx` precedent.

**Confirmed: all four missing surfaces exist, are wired into their intended
pages, and satisfy their feature's stated Acceptance Criteria** — the
specific gap this document's prior REJECT identified (Feature 2 AC1,
Feature 3 AC4/AC5, Feature 4 AC1, Feature 5 AC8) is closed.

## 3. Fix commits — verified landed in current source, not just claimed

Read the current state of every file the follow-up summary claimed was
fixed, rather than trusting the summary:

- **`src/app/(dashboard)/analytics/page.tsx`** — `key={period}` is present
  at the `SpendingInsightsWidget` call site (line 167), with a doc comment
  explaining the remount-vs-update reasoning. Confirmed this closes the
  period-switch stale-state bug (`spending-insights-widget-period-switch-
  stale-state.md`).
- **`src/features/dashboard/components/monthly-summary-card.tsx`** — the
  `current` local-state mirror is gone entirely; the component reads
  `summary` directly in render (line 110 title, line 184 narrative). Only
  remaining local state is `isRegenerating`. Confirmed this closes
  `monthly-summary-card-stale-state-after-refresh.md` — the main card body
  and the "View history" dialog now share the exact same freshness
  contract (both read straight from props).
- **`src/app/(dashboard)/page.tsx`** — confirmed the shared-promise sharing
  was fully reverted, not left half-fixed: `getBudgetHealthScore(user.id,
  currentMonth)` and `getFinancialHealthScore(user.id, new Date())` are two
  independent, unchained entries in the same flat `Promise.all` (lines
  108-160), each able to fail without affecting the other. No `.then()`
  chaining, no shared promise variable, remains anywhere in this file. The
  extensive doc comment at the `getFinancialHealthScore` call site correctly
  documents why the sharing was reverted and cites the bug report.
- **`src/features/budgeting/server/advisor.ts`** /
  **`src/features/analytics/server/insights.ts`** — confirmed the
  cache-check-first reorder is present in both: `getBudgetAdvisorRecommendations`
  checks `db.budgetAdvisorCache.findUnique` and returns
  `cacheRowToResult(existing)` (lines 418-423) *before* calling
  `getBudgetMonth`/`getBudgetHealthScore`; `getSpendingInsights` checks
  `db.spendingInsightsCache.findUnique` and returns early (lines 492-498)
  *before* calling `gatherInsightCandidates`. Both closed the Performance
  follow-up's two MEDIUM-HIGH findings.
- **`insights.ts`'s doc comment** (the Bug Hunter's fourth finding,
  `spending-insights-cache-reorder-unguarded-staleness.md`) — confirmed
  corrected: the current comment (lines 447-476) explicitly states Spending
  Insights is "NOT symmetrically mitigated" with Budget Advisor despite the
  identical reorder, and explains why (no page-level gate exists for
  Spending Insights the way `hasBudgetedCategory` exists for Budget
  Advisor) — no longer falsely claiming parity.

**Confirmed: every claimed fix commit actually landed in the current code,
not just in a commit message.**

## 4. Tests, typecheck, lint, build — re-run directly, myself

- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings.
- `npx vitest run` → **478/478 tests passing, 35 test files** (up from the
  prior gate's 470, consistent with the new `advisor.test.ts`/
  `insights.test.ts` additions and `service.test.ts` extension covering the
  reorder and the `precomputedBudgetHealthScore` param).
- `npm run build` → succeeds, all 31 routes generated (up from 30 — the new
  `/financial-health-score` route), no regressions. `/budgeting` (4.56 kB),
  `/` (7.33 kB), and `/analytics` (10.3 kB) route sizes now reflect the new
  card/widget markup, unlike the prior gate's unchanged-size finding that
  proved the gap.
- `npx prisma migrate status` → "Database schema is up to date!" (8
  migrations, unchanged — this frontend work touches no schema).

**All green.**

## 5. `error.tsx` gap raised by the Bug Hunter's dashboard-crash finding

The Bug Hunter's HIGH finding
(`dashboard-shared-budget-health-score-promise-crash-and-latency.md`) found
that the *specific* crash trigger — one shared promise consumed twice in
`Promise.all`, so one `getBudgetHealthScore` rejection took down the whole
Dashboard — was a risk **introduced by this phase's own performance fix**
(`c1ef591`'s sharing of `budgetHealthScorePromise`, itself building on
Phase 4a's own new `getFinancialHealthScore` call). That specific trigger is
confirmed reverted (Section 3 above): the two calls are independent
siblings again, so a `getBudgetHealthScore` failure no longer has any
special new blast radius beyond its own Dashboard entry.

Separately, the bug report also noted, correctly, that **no `error.tsx`
exists for the `(dashboard)` route segment or its `page.tsx`, nor a root
`app/error.tsx`**. Checked this directly: the *only* `error.tsx` (or
`loading.tsx`) anywhere in `src/app/` is `(dashboard)/analytics/error.tsx`,
added in Phase 3b (`6d1272e`, 2026-07-21) specifically because Analytics was
"the heaviest single-page aggregation in the app" at the time. Every other
route segment in this codebase — `/`, `/budgeting`, `/transactions`,
`/debt`, `/investments`, `/bills`, `/income`, `/goals`, `/financial-goals`,
and the brand-new `/financial-health-score` — has never had an `error.tsx`,
before or after Phase 4a. This is a **pre-existing, codebase-wide
condition**, not something Phase 4a introduced: Phase 4a added a new
Dashboard fetch (`getFinancialHealthScore`) into an already-`error.tsx`-less
route segment, the same way Phase 3a's Net Worth History and Phase 2's
Budgeting additions did before it. The specific *incremental* risk Phase 4a
introduced (a shared promise multiplying one query's blast radius across
two `Promise.all` entries) has been removed; the general absence of Next.js
error boundaries across most of this app is a standing architectural gap
that predates this phase and applies uniformly across the whole
application, not a bar this phase alone should be held to. **Not a blocker
for Phase 4a** — flagged here for whoever owns cross-cutting route-level
error handling as a separate, pre-existing backlog item, consistent with
how the Bug Hunter report itself flagged it as a secondary note rather than
its primary finding (the primary finding, the shared-promise crash
multiplier, is fixed).

## 6. Backend, cron routes, and prior Security/Performance/Bug Hunter reviews — spot-checked, still valid

Diffed every commit from the frontend build (`079500f`) through the final
Bug Hunter fix (`5c2f3fe`) against the full repo: the only files touched are
the four new components, three modified pages (`budgeting/page.tsx`,
`(dashboard)/page.tsx`, `analytics/page.tsx`), the new
`financial-health-score/page.tsx`, `sidebar.tsx`'s nav entry, three new/
extended test files, and three server modules
(`advisor.ts`/`insights.ts`/`financial-health-score/server/service.ts`) —
each already covered by name in this document's Sections 2-3 and both
follow-up reviews. **Zero changes** to any `app/api/cron/*` route, any
`lib/ai/*` functional module, or `prisma/schema.prisma` in this entire
window. The original five backend features, their cron routes, and the
original `docs/security/phase-4a-review.md` (APPROVE) /
`docs/performance/phase-4a-review.md` (APPROVE) reviews remain fully valid
and unaffected by this frontend work — confirmed by diff, not assumed.

## 7. Definition of Done / Cross-Cutting Product Requirements — now verifiable end-to-end

- **Graceful degradation:** confirmed for all five features' UI, not just
  claimed at the backend layer. Every one of the four new components has an
  explicit `"unavailable"`/empty-state branch that renders a plain message
  and a retry action (where applicable) without ever blocking the rest of
  its host page — each card/widget is a self-contained `Card`, and none of
  the four introduces a loading spinner with no exit state.
- **No autonomous write path:** confirmed structurally for all five
  features. `advisor.test.ts` and the existing `categorization.ts`/
  `monthly-summary.ts`/`insights.ts` tests enforce read-only behavior by
  source inspection (no `db.budget`/`db.budgetCategory` write methods
  callable from `advisor.ts`, for example) — a property actually tested,
  not just documented. The only Server Actions the new UI calls
  (`refreshBudgetAdvisor`, `regenerateMonthlySummary`,
  `refreshSpendingInsights`) all take single-field schemas with no
  user-identity field, matching the already-approved pattern from Feature
  1's `acceptCategorySuggestion`.
- **AI content visually distinguished:** confirmed for all five features
  now that the UI exists — every narrative/recommendation/insight renders
  inside the same dashed-border + Sparkles-icon treatment, a single
  consistent visual language across `suggestion-badge.tsx`,
  `budget-advisor-card.tsx`, `monthly-summary-card.tsx`,
  `spending-insights-widget.tsx`, and
  `financial-health-score-narrative.tsx`.

---

## Release Manager Decision

**APPROVE, for Phase 4a as a bundled release of all five features.**

Every item the prior REJECT identified as blocking is closed: all four
missing frontend surfaces exist, are wired into their intended pages, and
independently verified against their feature's own Acceptance Criteria, not
merely asserted present. Every fix claimed by the intervening Security,
Performance, and Bug Hunter follow-up passes is confirmed landed in current
source by direct reading, not accepted on the strength of any prior gate's
own sign-off. All automated checks (typecheck, lint, 478/478 tests,
production build, migration status) pass cleanly, re-run independently in
this pass. The one new risk this phase itself introduced during its own
performance-fix cycle (the shared-promise Dashboard crash multiplier) has
been reverted and verified gone; the pre-existing, codebase-wide absence of
route-level `error.tsx` boundaries is correctly out of this phase's blast
radius and is flagged as a separate backlog item, not a Phase 4a blocker.
The original five backend implementations, their cron routes, and their
already-APPROVEd Security/Performance reviews are confirmed untouched by
this frontend work.

A user who upgrades to this release now sees all five AI features:
inline category suggestions in Transactions, a Budget Advisor card on
Budgeting, a Monthly Recap card (plus browsable history) on the Dashboard,
a Spending Insights widget on Analytics, and a Financial Health Score badge
on the Dashboard linking to a full breakdown/trend/narrative detail page —
matching `ai-features.md`'s framing of these five as one cohesive release,
not four backend-only features shipped invisibly.

See `docs/release/phase-4a-checklist.md` for the itemized deployment
checklist.
