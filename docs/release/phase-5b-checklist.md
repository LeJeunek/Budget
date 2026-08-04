# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for the first-pass full review,
`phase-5b-second-pass.md` for the second pass's full reasoning,
`phase-5b-third-pass.md` for the third pass's full reasoning, and
`phase-5b-fourth-pass.md` for this fourth pass's full reasoning.
**Gate status: REJECTED (fourth pass) — Phase 5b is still NOT closed.** The
third pass's blocking finding (`BudgetHealthScoreBadge`'s own numeric score,
unwired on both `/budgeting` and the Dashboard) is fixed and confirmed — but
this fourth pass's own required independent sweep found a new,
previously-uncaught blocking item below (`/financial-health-score`'s own
headline score span — distinct from its already-wired subscore grid two
components below it on the same page). It must be fixed and this gate
re-run (a fifth pass) before Phase 5b — and therefore Phase 5 in full — can
close.

## Blocking (found by the fourth pass)

- [!] **Number Counters' Definition of Done ("all ten AC6 surfaces... each
      confirmed to animate") still not met — a fifth instance found.**
      `src/app/(dashboard)/financial-health-score/page.tsx` renders its own
      big `text-5xl font-semibold` headline score as a plain, unformatted
      `{breakdown.score}`, with no `AnimatedNumber` import and no
      `"use client"` directive anywhere in the file — still a Server
      Component. This page is itself one of AC6's ten named surfaces
      (*"Financial Health Score detail (`/financial-health-score`, the score
      itself plus subscores)"*) — its own subscore grid
      (`FinancialHealthScoreBreakdownGrid`, rendered two components below
      the score on the same page) is already correctly wired to
      `AnimatedNumber`, so this page satisfies only half of its own named
      AC6 description. Live-sampled on a single fresh page load alongside
      its own already-wired sibling subscore (a positive control confirming
      the sampling method itself is capable of catching a real animation on
      this exact page): the big score stayed static at `100` across ten
      samples while the subscore genuinely counted up
      (`100 -> 10 -> 23 -> ... -> 100`) in the same run. See
      `phase-5b-fourth-pass.md` §2 for the full reasoning and the concrete,
      three-step fix (small Client Component boundary extraction — this
      page is a Server Component with two other sections that have no
      stated need to become Client Components — plain serializable props,
      identical `AnimatedNumber` format/className shape already shipped on
      every sibling score figure this phase).

## RESOLVED (third pass's blocking item — confirmed fixed by this fourth pass)

- [x] `src/features/budgeting/components/budget-health-score-badge.tsx` —
      score now wrapped in `AnimatedNumber` (`"use client"` added, identical
      `format`/`className` shape as its sibling
      `financial-health-score-badge.tsx`). Confirmed by direct source
      re-read and a live Playwright run showing genuine count-ups on both
      named surfaces: Dashboard (`100 -> 0 -> 65 -> ... -> 100`) and
      `/budgeting` (`100 -> 6 -> 19 -> ... -> 100`). See
      `phase-5b-fourth-pass.md` §1.

## RESOLVED (second pass's blocking item — confirmed fixed by the third pass, re-confirmed unaffected by this fourth pass)

- [x] `src/app/(dashboard)/debt/page.tsx` — "Total active debt" now wrapped
      in `AnimatedNumber` via new `total-active-debt-card.tsx`. See
      `phase-5b-third-pass.md` §1.
- [x] `src/app/(dashboard)/transactions/[id]/transaction-detail-client.tsx`
      — headline transaction amount now wrapped in `AnimatedNumber`
      (proactive fix). See `phase-5b-third-pass.md` §2.
- [x] `src/features/debt/components/strategy-comparison.tsx`'s "total
      interest paid" figure — confirmed correctly out of scope (a secondary
      caption, not a second headline). See `phase-5b-third-pass.md` §2.

## RESOLVED (first pass's blocking item — confirmed fixed by the second pass, re-confirmed unaffected by the third and fourth passes)

- [x] `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
      — "Expected amount" wrapped in `AnimatedNumber`. See
      `phase-5b-second-pass.md` §1.
- [x] `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
      headline figures wrapped via `holding-detail-stats-card.tsx`. Its
      `gainLossPercent` inline parenthetical annotation confirmed correctly
      out of scope (a same-span annotation of an already-animating figure,
      unlike this fourth pass's own finding, which has an already-fixed
      sibling on the same page establishing an expectation otherwise). See
      `phase-5b-second-pass.md` §1, `phase-5b-third-pass.md` §3.
- [x] `tests/e2e/support/axe.ts`'s 700ms fixed-buffer addition — confirmed
      sound and still holding under this fourth pass's own fresh, live,
      clean 45/45 Playwright run. See `phase-5b-second-pass.md` §2.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence
      across all four passes. The spec itself is sound and internally
      consistent; every blocking gap found across all four passes is an
      implementation-completeness failure against the spec, not a defect in
      the spec's own scope definition. AC6's own explicit "the score itself
      plus subscores" language for the Financial Health Score detail
      surface is what made this fourth pass's finding a confirmed,
      unambiguous gap rather than a judgment call.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — confirmed matching shipped code by direct inspection across all
      four passes.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound; not reopened
      by any pass's findings (each is a completeness gap against an
      already-correct scope definition).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7;
      unaffected by this fourth pass's finding (a completeness gap, not a
      visual regression — same reasoning as every prior pass's row #52
      discussion).

## Automated checks (re-run live by all four passes)

- [x] `npm run typecheck` — clean, 0 errors (all four passes).
- [x] `npm run lint` — clean, 0 errors/warnings (all four passes).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (all four
      passes, identical count — no pass's changes touch unit-tested
      surface).
- [x] `npm run seed:e2e` — ran fresh in all four passes;
      `tests/e2e/support/fixture-ids.json` restored to its committed
      placeholder form afterward each time (confirmed via `git status`
      showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** in all four passes (9
      `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
      `route-a11y.spec.ts` + 2 setup logins). This fourth pass's own run was
      a single clean run with no flake observed; note this suite verifies
      zero critical/serious axe violations, not the Number Counters
      animation contract, so its passing does not contradict this pass's
      own finding.
- [x] `git status`/`git log` — working tree clean at the start and end of
      all four reviews (aside from the expected, accepted
      `docs/testing/e2e/accessibility-report.md` timestamp regeneration).
      `HEAD` at `843e0d0` for this fourth pass, matching its stated scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Fresh-page-load race
      — fixed, confirmed by direct source read and a live-passing E2E test
      in all four passes.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook, confirmed by direct source read.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug.

## Number Counters

- [!] **BLOCKING — see above.** Nine of AC6's ten named surfaces (and the
      Financial Health Score detail surface's "subscores" half of the
      tenth) now have every headline figure confirmed correctly wired;
      that same tenth surface's own "the score itself" half is not.
- [x] **RESOLVED (this fourth pass).** `BudgetHealthScoreBadge`'s score, on
      both `/budgeting` and the Dashboard. See §1 above and
      `phase-5b-fourth-pass.md` §1.
- [x] **RESOLVED (second pass, re-confirmed by the third and fourth
      passes).** Debt's page-level "Total active debt" aggregate.
- [x] **RESOLVED (third pass, proactive fix).** Transaction detail's
      headline amount.
- [x] **RESOLVED (second pass's own re-verification).** Recurring Income
      detail (`/income/[streamId]`) and Investment holding detail
      (`/investments/[holdingId]`).
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Savings Goal detail
      page (`/goals/[goalId]`).
- [x] Duration bound (`NUMBER_COUNTER_DURATION_MS = 600`), single shared
      formatting pipeline, and the null/zero-crossing edge cases all
      confirmed by direct read of `animated-number.tsx`, and reconfirmed
      live across all four passes.

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
      a live-passing E2E test across all four passes.
- [x] Risk #59 — spot-checked; no misannotation found.

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones,
      confirmed across all four passes' own source reads and the
      Performance Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current across all four passes: `843e0d0`
      touches only two files (`budget-health-score-badge.tsx`, the
      auto-generated accessibility report) — no new Server Action, Route
      Handler, or query-layer change, confirmed via a direct `git diff
      --stat` this fourth pass ran itself. This fourth pass's own new
      finding (§2 of `phase-5b-fourth-pass.md`) is a pure display-layer
      omission with no security surface of its own once fixed.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings, confirmed still current and unaffected by
      anything since, across all four passes.

## Bug Hunter

- [x] 4 findings total (first-pass gate), all 4 fixed and independently
      re-verified against each bug report's own root cause.
- [!] The systematic per-surface sweep the Definition of Done calls for
      still has not actually been completed: after the Savings Goal detail
      finding (Bug Hunter), the first-pass Release Manager's own two-surface
      finding, the second-pass Release Manager's own Debt-aggregate
      finding, and the third-pass Release Manager's own
      `BudgetHealthScoreBadge` finding, this fourth pass's own independent
      sweep found a *fifth* instance of the identical gap shape
      (`/financial-health-score`'s own headline score, distinct from its
      own already-wired subscore grid two components below it on the same
      page). See Blocking, above.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports, and the E2E reduced-motion report/spec
      — all internally consistent with shipped code, confirmed by direct
      source inspection across all four passes.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows in a
      coherent final state, no dangling rows.

## Overall Gate Decision

**REJECT (fourth pass). Phase 5b is not closed.**

The third pass's blocking finding (`BudgetHealthScoreBadge`'s own numeric
score) is genuinely fixed, independently confirmed by both direct source
review and live Playwright verification against the real seeded database on
both of its named surfaces.

But this fourth pass's own required independent sweep (deliberately widened
past every specific grep pattern the prior three passes' own fix commits and
Release Manager passes had each used) found a fifth, previously-uncaught
instance of the identical defect shape: `/financial-health-score`'s own
headline score — one of AC6's ten named surfaces, whose own text explicitly
names "the score itself plus subscores" — satisfies only the "subscores"
half. Live-sampled on the same page, in the same run, alongside its own
already-wired sibling subscore (used as a positive control proving the
sampling method itself is capable of catching a real animation on this exact
page), the big score was confirmed fully static while the subscore
genuinely counted up. Number Counters' binding Definition of Done ("all ten
[AC6] surfaces... each confirmed to animate") still does not hold. Per this
project's own standing "trust but verify" discipline, now exercised for a
fifth time on this exact capability, this is a genuine, confirmed gap, not a
nitpick, and this release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into
`app/(dashboard)/financial-health-score/page.tsx`'s own headline score — a
small Client Component boundary extraction (this page is a Server
Component; a bare `"use client"` add to the whole page is not appropriate,
since it also renders a chart and a narrative card with no stated need to
become Client Components), reusing the exact `AnimatedNumber`
`format`/pattern already proven four times this phase. See
`phase-5b-fourth-pass.md`'s Decision section for the full, concrete fix.
**Strongly recommended, not required:** produce the per-component AC6
pass/fail checklist the Definition of Done has now asked for across four
consecutive passes — its continued absence is demonstrably the root cause
all five instances of this same defect shape went uncaught until an ad hoc
spot-check happened to find each one, and this fifth instance specifically
demonstrates that even a sweep deliberately broadened in response to three
prior misses can still miss an occurrence one size class outside its own
chosen net, or a same-named field on a second file its own dedup logic
didn't separately verify — a checklist enumerating all ten AC6 surfaces by
their actual rendered figures, checked one at a time against `AnimatedNumber`
usage rather than via any single grep pattern chosen in advance, would have
caught this the first time, not the fifth.

Phase 5 remains open pending this fix and a follow-up (fifth) Release
Manager pass.
