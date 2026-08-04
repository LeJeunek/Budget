# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for the first-pass full review,
`phase-5b-second-pass.md` for the second pass's full reasoning,
`phase-5b-third-pass.md` for the third pass's full reasoning,
`phase-5b-fourth-pass.md` for the fourth pass's full reasoning, and
`phase-5b-fifth-pass.md` for this fifth pass's full reasoning.
**Gate status: REJECTED (fifth pass) — Phase 5b is still NOT closed.** The
fourth pass's blocking finding (`/financial-health-score`'s own headline
score span) is fixed and confirmed — but this fifth pass's own required
independent sweep (a genuinely new detection mechanism: re-deriving AC6's
own ten-surface list from the product spec verbatim and checking every named
sub-clause individually) found a new, previously-uncaught blocking item
below (`budget-category-row.tsx`'s own per-category "percent used" label —
named by AC6's "category-row progress" phrase and AC4's "budget... progress
percentages" phrase, styled with no `font-semibold`/`font-bold` weight class
at all). It must be fixed and this gate re-run (a sixth pass) before Phase
5b — and therefore Phase 5 in full — can close.

## Blocking (found by the fifth pass)

- [!] **Number Counters' Definition of Done ("all ten AC6 surfaces... each
      confirmed to animate") still not met — a sixth instance found.**
      `src/features/budgeting/components/budget-category-row.tsx` renders
      each budget category row's own "percent of allocation used" figure
      (paired with a `Progress` linear bar) as a plain, unformatted
      `{Math.round(line.percentUsed as number)}%`, styled `text-xs
      font-medium tabular-nums` — no `font-semibold`/`font-bold` anywhere in
      the file, and no `AnimatedNumber` import anywhere in the file. This is
      the exact semantic counterpart of `ProgressRing`'s own already-
      universally-animated default label, just paired with the app's other
      progress-indicator primitive instead. AC6 names this figure directly
      (*"Budgeting (`/budgeting`, **category-row progress** + summary
      cards)"*) and AC4 names its figure-type directly (*"goal/**budget**/
      debt-payoff progress **percentages**... one consistent counting
      treatment"*) — not an inferred or judgment-call surface. Live-sampled
      on a real seeded page load alongside a genuinely-animating `StatCard`
      dollar figure on the same page (a positive control confirming the
      sampling method itself is capable of catching a real animation on
      this exact page, re-run twice with consistent results): the
      percent-used label stayed static at `14%` across fifteen samples
      (re-confirmed on a second, independent run across sixteen samples)
      while the dollar figure genuinely counted up
      (`$250.34 -> $293.99 -> ... -> $400.00`) in the same run. See
      `phase-5b-fifth-pass.md` §2 for the full reasoning, the negative
      checks confirming no seventh instance elsewhere, and the concrete,
      one-line fix (a trivial in-place `AnimatedNumber` wrap — this file is
      already a Client Component, no boundary extraction needed).

## RESOLVED (fourth pass's blocking item — confirmed fixed by this fifth pass)

- [x] `src/app/(dashboard)/financial-health-score/page.tsx`'s own big
      headline score — now wrapped in `AnimatedNumber` via new
      `financial-health-score-headline-card.tsx` (`"use client"` Client
      Component boundary extraction, identical `format`/pattern shape as
      every sibling score figure this phase). Confirmed by direct
      source/diff re-read and a live Playwright run showing a genuine
      count-up (`16 -> 31 -> ... -> 100`) alongside its own already-wired
      subscore grid (positive control) on the same page load. See
      `phase-5b-fifth-pass.md` §1.

## RESOLVED (third pass's blocking item — confirmed fixed by the fourth pass, re-confirmed unaffected by this fifth pass)

- [x] `src/features/budgeting/components/budget-health-score-badge.tsx` —
      score now wrapped in `AnimatedNumber` (`"use client"` added, identical
      `format`/`className` shape as its sibling
      `financial-health-score-badge.tsx`). Confirmed by direct source
      re-read and a live Playwright run showing genuine count-ups on both
      named surfaces: Dashboard (`100 -> 0 -> 65 -> ... -> 100`) and
      `/budgeting` (`100 -> 6 -> 19 -> ... -> 100`). See
      `phase-5b-fourth-pass.md` §1.

## RESOLVED (second pass's blocking item — confirmed fixed by the third pass, re-confirmed unaffected by the fourth and fifth passes)

- [x] `src/app/(dashboard)/debt/page.tsx` — "Total active debt" now wrapped
      in `AnimatedNumber` via new `total-active-debt-card.tsx`. See
      `phase-5b-third-pass.md` §1.
- [x] `src/app/(dashboard)/transactions/[id]/transaction-detail-client.tsx`
      — headline transaction amount now wrapped in `AnimatedNumber`
      (proactive fix). See `phase-5b-third-pass.md` §2.
- [x] `src/features/debt/components/strategy-comparison.tsx`'s "total
      interest paid" figure — confirmed correctly out of scope (a secondary
      caption, not a second headline). See `phase-5b-third-pass.md` §2.

## RESOLVED (first pass's blocking item — confirmed fixed by the second pass, re-confirmed unaffected by the third, fourth, and fifth passes)

- [x] `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
      — "Expected amount" wrapped in `AnimatedNumber`. See
      `phase-5b-second-pass.md` §1.
- [x] `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
      headline figures wrapped via `holding-detail-stats-card.tsx`. Its
      `gainLossPercent` inline parenthetical annotation confirmed correctly
      out of scope (a same-span annotation of an already-animating figure).
      See `phase-5b-second-pass.md` §1, `phase-5b-third-pass.md` §3.
- [x] `tests/e2e/support/axe.ts`'s 700ms fixed-buffer addition — confirmed
      sound and still holding under this fifth pass's own fresh, live,
      clean 45/45 Playwright run. See `phase-5b-second-pass.md` §2.

## Non-blocking, adjacent observation (fifth pass, recorded for completeness)

- [~] `src/features/financial-goals/components/financial-goal-card.tsx`'s
      `SavingsRateProgress` renders `→ target {targetPercent}%` as static
      text beside its own already-wired current-rate `AnimatedNumber` —
      inconsistent with its own file's `NetWorthSavingsProgress` sibling,
      whose equivalent target *amount* is wired. Judged non-blocking (no AC6/
      AC4 clause names a "target percentage" sub-figure specifically, and it
      is a rarely-changing configured value, not a fluctuating progress
      figure) but flagged as a strongly-recommended fix in the same commit
      that closes the blocking finding above. See `phase-5b-fifth-pass.md`
      §2.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence
      across all five passes, including this fifth pass's own from-scratch
      re-derivation of AC6's full ten-surface list against shipped code
      (not against any prior pass's own summary of it). The spec itself is
      sound and internally consistent; every blocking gap found across all
      five passes is an implementation-completeness failure against the
      spec, not a defect in the spec's own scope definition.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — confirmed matching shipped code by direct inspection across all
      five passes.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound; not reopened
      by any pass's findings (each is a completeness gap against an
      already-correct scope definition).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7;
      unaffected by this fifth pass's finding (a completeness gap, not a
      visual regression — same reasoning as every prior pass's row #52
      discussion).

## Automated checks (re-run live by all five passes)

- [x] `npm run typecheck` — clean, 0 errors (all five passes).
- [x] `npm run lint` — clean, 0 errors/warnings (all five passes).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (all five
      passes, identical count — no pass's changes touch unit-tested
      surface).
- [x] `npm run seed:e2e` — ran fresh in all five passes;
      `tests/e2e/support/fixture-ids.json` restored to its committed
      placeholder form afterward each time (confirmed via `git status`
      showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** in all five passes (9
      `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
      `route-a11y.spec.ts` + 2 setup logins). This fifth pass's own run was
      a single clean run with no flake observed; note this suite verifies
      zero critical/serious axe violations and the reduced-motion end-state
      contract, not the Number Counters mount-animation contract, so its
      passing does not contradict this pass's own finding.
- [x] `git status`/`git log` — working tree clean at the start and end of
      all five reviews (aside from the expected, accepted
      `docs/testing/e2e/accessibility-report.md` timestamp regeneration).
      `HEAD` at `25fb0e7` for this fifth pass, matching its stated scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Fresh-page-load race
      — fixed, confirmed by direct source read and a live-passing E2E test
      in all five passes.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook, confirmed by direct source read.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug.

## Number Counters

- [!] **BLOCKING — see above.** Nine of AC6's ten named surfaces (and the
      "summary cards" half of Budgeting's own tenth-line two-part
      description) now have every headline figure confirmed correctly
      wired; that same tenth line's "category-row progress" half is not.
- [x] **RESOLVED (this fifth pass).** `/financial-health-score`'s own
      headline score span. See §1 above and `phase-5b-fifth-pass.md` §1.
- [x] **RESOLVED (fourth pass).** `BudgetHealthScoreBadge`'s score, on both
      `/budgeting` and the Dashboard.
- [x] **RESOLVED (second pass, re-confirmed by the third, fourth, and fifth
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
      live across all five passes.

## Chart Transitions

- [x] All 14 Recharts consumers spread `useChartAnimationProps()`.
- [x] Analytics' heatmap (`spending-heatmap.tsx`) confirmed wrapped in
      `FadeIn`.
- [x] Risk #56 — measured non-issue, per the Performance Engineer's direct
      frame-timing capture.
- [x] This fifth pass's own negative check confirmed no chart renders a
      headline figure via custom SVG `<text>` content that would bypass
      both Chart Transitions' native-animation mechanism and Number
      Counters' `AnimatedNumber` mechanism. See `phase-5b-fifth-pass.md` §2.

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
      a live-passing E2E test across all five passes.
- [x] Risk #59 — spot-checked; no misannotation found.

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones,
      confirmed across all five passes' own source reads and the
      Performance Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current across all five passes: `25fb0e7`
      touches only two source-adjacent files (`financial-health-score/
      page.tsx`, the new `financial-health-score-headline-card.tsx`) plus
      the auto-generated accessibility report — no new Server Action, Route
      Handler, or query-layer change, confirmed via a direct `git diff
      --stat` this fifth pass ran itself. This fifth pass's own new finding
      (§2 of `phase-5b-fifth-pass.md`) is, once fixed, a pure display-layer
      change with no security surface of its own, matching every prior
      instance's fix shape.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings, confirmed still current and unaffected by
      anything since, across all five passes.

## Bug Hunter

- [x] 4 findings total (first-pass gate), all 4 fixed and independently
      re-verified against each bug report's own root cause.
- [!] The systematic per-surface sweep the Definition of Done calls for
      still has not actually been completed: after the Savings Goal detail
      finding (Bug Hunter), the first-pass Release Manager's own two-surface
      finding, the second-pass Release Manager's own Debt-aggregate
      finding, the third-pass Release Manager's own `BudgetHealthScoreBadge`
      finding, and the fourth-pass Release Manager's own Financial Health
      Score headline-score finding, this fifth pass's own independent sweep
      — using a genuinely new detection mechanism, not a repeat of any prior
      grep pattern — found a *sixth* instance of the identical gap shape
      (`budget-category-row.tsx`'s own per-category percent-used label,
      named by both AC6's "category-row progress" phrase and AC4's "budget
      progress percentages" phrase). See Blocking, above.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports, and the E2E reduced-motion report/spec
      — all internally consistent with shipped code, confirmed by direct
      source inspection across all five passes.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows in a
      coherent final state, no dangling rows.

## Overall Gate Decision

**REJECT (fifth pass). Phase 5b is not closed.**

The fourth pass's blocking finding (`/financial-health-score`'s own headline
score span) is genuinely fixed, independently confirmed by both direct
source review and live Playwright verification against the real seeded
database, using the page's own already-wired subscore grid as a positive
control.

But this fifth pass's own required independent sweep — deliberately using a
genuinely new detection mechanism (re-deriving AC6's own ten-surface list
from the product spec verbatim and checking every named sub-clause
individually against shipped code, rather than any className- or
field-name-based grep the five prior findings' own fix commits and Release
Manager passes had each already used) — found a sixth, previously-uncaught
instance of the identical defect shape: `budget-category-row.tsx`'s own
per-category "percent used" label, named explicitly by both AC6
("category-row progress") and AC4 ("budget... progress percentages"),
styled with no `font-semibold`/`font-bold` weight class at all — the one
styling convention no prior pass's grep pattern could ever have matched.
Live-sampled on the same page, in the same run, alongside a genuinely-
animating dollar figure (a positive control, re-run twice with consistent
results), the percent-used label was confirmed fully static while the
dollar figure genuinely counted up. Number Counters' binding Definition of
Done ("all ten [AC6] surfaces... each confirmed to animate") still does not
hold. Per this project's own standing "trust but verify" discipline, now
exercised for a sixth time on this exact capability, with genuinely no
exception made for how many rounds this has taken, this is a genuine,
confirmed gap, not a nitpick, and this release cannot be approved with it
open.

**Required before re-review:** wire `AnimatedNumber` into
`budget-category-row.tsx`'s percent-used label — a trivial in-place wrap (no
`"use client"` addition needed; this file is already a Client Component),
the same "trivial fix" shape `income-stream-detail-client.tsx`'s and
`transaction-detail-client.tsx`'s own fixes both were. **Strongly
recommended, not required, in the same commit:** also fix the related,
lower-confidence `SavingsRateProgress` target-percentage inconsistency
(`financial-goal-card.tsx`) noted above. **Strongly recommended, not
required, before the next re-review:** produce the per-component AC6
pass/fail checklist the Definition of Done has now asked for across five
consecutive passes — its continued absence is demonstrably the root cause
all six instances of this same defect shape went uncaught until an ad hoc
spot-check happened to find each one, and this sixth instance specifically
demonstrates that even re-deriving AC6's own surface list from scratch is
only sufficient when each surface's every named sub-clause is checked
individually against shipped code, not against a prior pass's own aggregate
summary of that same surface.

Phase 5 remains open pending this fix and a follow-up (sixth) Release
Manager pass.
