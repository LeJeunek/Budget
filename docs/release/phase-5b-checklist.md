# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for the first-pass full review,
`phase-5b-second-pass.md` for the second pass's full reasoning, and
`phase-5b-third-pass.md` for this third pass's full reasoning.
**Gate status: REJECTED (third pass) — Phase 5b is still NOT closed.** The
second pass's blocking finding (Debt's page-level "Total active debt"
aggregate) is fixed and confirmed, and this same fix commit's own proactive
Transaction-detail fix is also confirmed genuine — but this third pass's own
required independent sweep found a new, previously-uncaught blocking item
below (`BudgetHealthScoreBadge`'s own numeric score, unwired on both of its
rendered surfaces). It must be fixed and this gate re-run (a fourth pass)
before Phase 5b — and therefore Phase 5 in full — can close.

## Blocking (found by the third pass)

- [!] **Number Counters' Definition of Done ("all ten AC6 surfaces... each
      confirmed to animate") still not met — a fourth surface found.**
      `src/features/budgeting/components/budget-health-score-badge.tsx`
      renders its own 0-100 score as a plain, unformatted `{score.score}`,
      with no `AnimatedNumber` import and no `"use client"` directive
      anywhere in the file — still a Server Component. Rendered on two
      separate AC6-named surfaces (`/budgeting`'s own summary card and the
      Dashboard's stat-card grid), both live-sampled and confirmed fully
      static across 1+ second of sampling on each. This is the exact
      sibling of `financial-health-score-badge.tsx`, which this same phase
      already fixed (that file's own doc comment names
      `budget-health-score-badge.tsx` explicitly as the structure it
      mirrors) — the identical fix was simply never applied to this file.
      See `phase-5b-third-pass.md` §3 for the full reasoning and the
      concrete, four-step fix (add `"use client"`, import `AnimatedNumber`,
      wrap the score with the identical `format`/`className` shape already
      shipped on its sibling — no Server/Client boundary extraction needed,
      since `score` already arrives as a plain prop at both call sites).

## RESOLVED (second pass's blocking item — confirmed fixed by this third pass)

- [x] `src/app/(dashboard)/debt/page.tsx` — "Total active debt" now wrapped
      in `AnimatedNumber` via new `total-active-debt-card.tsx` (plain
      serializable props only, mirroring `goal-detail-progress-card.tsx`/
      `holding-detail-stats-card.tsx`). Confirmed by direct source re-read
      and a live Playwright run showing a genuine count-up
      (`$5,000.00 -> $0.00 -> ... -> $5,000.00`). See
      `phase-5b-third-pass.md` §1.
- [x] `src/app/(dashboard)/transactions/[id]/transaction-detail-client.tsx`
      — headline transaction amount now wrapped in `AnimatedNumber`
      (proactive fix, reasoned in-scope despite Transactions' row-level AC7
      exclusion, by the same "single detail page, not one row among many"
      logic already applied to Bills' detail route). Confirmed by direct
      source re-read and a live Playwright run showing a genuine count-up
      (`-$54.32 -> -$7.31 -> ... -> -$54.32`). See `phase-5b-third-pass.md`
      §2.
- [x] `src/features/debt/components/strategy-comparison.tsx`'s "total
      interest paid" figure — independently re-checked and confirmed
      correctly out of scope (a `text-sm font-medium` secondary caption
      under the panel's real headline, the time-to-debt-free string — not a
      second headline). See `phase-5b-third-pass.md` §2.

## RESOLVED (first pass's blocking item — confirmed fixed by the second pass, re-confirmed unaffected by this third pass)

- [x] `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
      — "Expected amount" wrapped in `AnimatedNumber`. See
      `phase-5b-second-pass.md` §1.
- [x] `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
      headline figures wrapped via `holding-detail-stats-card.tsx`. See
      `phase-5b-second-pass.md` §1. This third pass additionally checked
      that file's `gainLossPercent` inline parenthetical annotation for the
      same gap class — judged correctly out of scope (a same-span
      annotation of an already-animating figure, never animated elsewhere
      in this codebase in the identical shape, with no already-fixed
      sibling establishing an expectation otherwise — unlike this pass's
      own `BudgetHealthScoreBadge` finding, which does have such a sibling).
      See `phase-5b-third-pass.md` §3's negative-check note.
- [x] `tests/e2e/support/axe.ts`'s 700ms fixed-buffer addition — confirmed
      sound and still holding under this third pass's own fresh, live,
      clean 45/45 Playwright run. See `phase-5b-second-pass.md` §2.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence
      across all three passes. The spec itself is sound and internally
      consistent; every blocking gap found across all three passes is an
      implementation-completeness failure against the spec, not a defect in
      the spec's own scope definition.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — confirmed matching shipped code by direct inspection across all
      three passes.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound; not reopened
      by any pass's findings (each is a completeness gap against an
      already-correct scope definition).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7.

## Automated checks (re-run live by all three passes)

- [x] `npm run typecheck` — clean, 0 errors (all three passes).
- [x] `npm run lint` — clean, 0 errors/warnings (all three passes).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (all three
      passes, identical count — no pass's changes touch unit-tested
      surface).
- [x] `npm run seed:e2e` — ran fresh in all three passes;
      `tests/e2e/support/fixture-ids.json` restored to its committed
      placeholder form afterward each time (confirmed via `git status`
      showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** in all three passes (9
      `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
      `route-a11y.spec.ts` + 2 setup logins). This third pass's own run was
      a single clean run with no flake observed.
- [x] `git status`/`git log` — working tree clean at the start and end of
      all three reviews (aside from the expected, accepted
      `docs/testing/e2e/accessibility-report.md` timestamp regeneration).
      `HEAD` at `34fcae7` for this third pass, matching its stated scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Fresh-page-load race
      — fixed, confirmed by direct source read and a live-passing E2E test
      in all three passes.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook, confirmed by direct source read.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug.

## Number Counters

- [!] **BLOCKING — see above.** Nine of ten AC6-named routes/pages now have
      every one of their own headline figures confirmed correctly wired;
      `/budgeting` and Dashboard's shared `BudgetHealthScoreBadge` component
      is not, on either of its two rendered surfaces.
- [x] **RESOLVED (second pass, re-confirmed by this third pass).** Debt's
      page-level "Total active debt" aggregate. See §1 above and
      `phase-5b-third-pass.md` §1.
- [x] **RESOLVED (this third pass, proactive fix).** Transaction detail's
      headline amount. See §1 above and `phase-5b-third-pass.md` §2.
- [x] **RESOLVED (second pass's own re-verification).** Recurring Income
      detail (`/income/[streamId]`) and Investment holding detail
      (`/investments/[holdingId]`).
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Savings Goal detail
      page (`/goals/[goalId]`).
- [x] Duration bound (`NUMBER_COUNTER_DURATION_MS = 600`), single shared
      formatting pipeline, and the null/zero-crossing edge cases all
      confirmed by direct read of `animated-number.tsx`, and reconfirmed
      live across all three passes.

## Chart Transitions

- [x] All 14 Recharts consumers spread `useChartAnimationProps()`.
- [x] Analytics' heatmap (`spending-heatmap.tsx`) confirmed wrapped in
      `FadeIn`.
- [x] Risk #56 — measured non-issue, per the Performance Engineer's direct
      frame-timing capture.

## Page Transitions

- [x] `src/app/(dashboard)/template.tsx` confirmed thin, correctly scoped to
      `(dashboard)/` only, composing `PageTransition`/`FadeIn`.
- [x] No TTI regression — measured directly by the Performance Engineer.
- [~] Risk #58 (Router Cache skeleton replay on repeat `/analytics`
      navigation) — confirmed real, not a binding-AC breach, routed to the
      Frontend Lead as a scoped, non-blocking follow-up.

## Expandable Cards

- [x] All five `DataTableCardList` consumers confirmed annotated with
      `meta: { cardDisplay: "expandable" }`.
- [x] Analytics' "Dismissed merchants" migration confirmed using the shared
      `ExpandableCard` primitive directly.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** `aria-controls`
      missing while collapsed — fixed, confirmed by direct source read and
      a live-passing E2E test across all three passes.
- [x] Risk #59 — spot-checked; no misannotation found.

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones,
      confirmed across all three passes' own source reads and the
      Performance Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current across all three passes: `34fcae7`
      touches only three source files (`debt/page.tsx`,
      `transaction-detail-client.tsx`, one new plain-serializable-props
      feature file) — no new Server Action, Route Handler, or query-layer
      change, confirmed via a direct `git diff --stat` this third pass ran
      itself. This third pass's own new finding (§3 of
      `phase-5b-third-pass.md`) is a pure display-layer omission with no
      security surface of its own once fixed.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings, confirmed still current and unaffected by
      anything since, across all three passes.

## Bug Hunter

- [x] 4 findings total (first-pass gate), all 4 fixed and independently
      re-verified against each bug report's own root cause.
- [!] The systematic per-surface sweep the Definition of Done calls for
      still has not actually been completed: after the Savings Goal detail
      finding (Bug Hunter), the first-pass Release Manager's own two-surface
      finding, and the second-pass Release Manager's own Debt-aggregate
      finding, this third pass's own independent sweep found a *fourth*
      instance of the identical gap shape (`BudgetHealthScoreBadge`,
      unwired on two separate surfaces). See Blocking, above.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports, and the E2E reduced-motion report/spec
      — all internally consistent with shipped code, confirmed by direct
      source inspection across all three passes.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows in a
      coherent final state, no dangling rows.

## Overall Gate Decision

**REJECT (third pass). Phase 5b is not closed.**

The second pass's blocking finding (Debt's page-level "Total active debt"
aggregate) is genuinely fixed, independently confirmed by both direct
source review and live Playwright verification against the real seeded
database. This same fix commit's own proactive Transaction-detail fix is
likewise genuine, correctly reasoned as in-scope, and live-verified.
`strategy-comparison.tsx`'s "total interest paid" figure was independently
re-checked and confirmed correctly out of scope.

But this third pass's own required independent sweep (not a rubber-stamp of
the fix commit's own claimed-exhaustive sweep) found a fourth,
previously-uncaught instance of the identical defect shape:
`BudgetHealthScoreBadge`'s own numeric score — the explicitly-documented
sibling of `FinancialHealthScoreBadge`, which this very phase already
fixed — was never wired to `AnimatedNumber`, on either of its two rendered
surfaces (`/budgeting`, Dashboard). Both were live-sampled and confirmed
static across 1+ second of sampling, in direct contrast to the two
genuinely-fixed figures sampled in the same session. Number Counters'
binding Definition of Done ("all ten [AC6] surfaces... each confirmed to
animate") still does not hold. Per this project's own standing "trust but
verify" discipline, now exercised for a fourth time on this exact
capability, this is a genuine, confirmed gap, not a nitpick, and this
release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into
`budget-health-score-badge.tsx`'s score — a small, low-risk, mechanical fix
(add `"use client"`, import `AnimatedNumber`, wrap the score with the
identical `format`/`className` shape already shipped on its own sibling
file, `financial-health-score-badge.tsx`; no Server/Client boundary
extraction needed since `score` already arrives as a plain prop at both call
sites). See `phase-5b-third-pass.md`'s Decision section for the full,
concrete fix. **Strongly recommended, not required:** produce the
per-component AC6 pass/fail checklist the Definition of Done has now asked
for across three consecutive passes — its continued absence is
demonstrably the root cause all four instances of this same defect shape
went uncaught until an ad hoc spot-check happened to find each one, and
this fourth instance specifically fell outside the exact grep pattern the
prior fix commit's own sweep used (a percentage/score figure need not be
named `formatCurrency` to be in AC6's scope) — a checklist enumerating all
ten AC6 surfaces by their actual rendered figures, not by which formatting
function each one happens to call, would have caught this the first time,
not the fourth.

Phase 5 remains open pending this fix and a follow-up (fourth) Release
Manager pass.
