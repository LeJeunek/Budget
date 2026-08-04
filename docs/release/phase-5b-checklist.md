# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for the first-pass full review, and
`phase-5b-second-pass.md` for this targeted second pass's full reasoning.
**Gate status: REJECTED (second pass) — Phase 5b is still NOT closed.** The
first pass's blocking finding is fixed and confirmed (commit `8a5d89a`), but
this second pass's own required spot-check for other gaps found a new,
previously-uncaught blocking item below. It must be fixed and this gate
re-run (a third pass) before Phase 5b — and therefore Phase 5 in full — can
close.

## Blocking (found by the second pass)

- [!] **Number Counters' Definition of Done ("all ten AC6 surfaces... each
      confirmed to animate") still not met — one more surface found.**
      `src/app/(dashboard)/debt/page.tsx`'s own page-level "Total active
      debt" summary figure renders via plain `formatCurrency`, no
      `AnimatedNumber` anywhere in the file. Pre-existing since Phase 4c
      (`4851d30`) — not a regression of the first-pass fix commit
      (`8a5d89a`), and not caught by the first pass's own Debt spot-check
      (which correctly confirmed `debt-card.tsx`'s own per-item balance
      figure but did not separately check this page-level aggregate). Same
      defect shape, third occurrence this phase: a named AC6 "+ page-level
      headline figure" surface skipped in full. See
      `phase-5b-second-pass.md` §3 for the full reasoning and the concrete
      fix pattern (a small Client Component boundary extraction of just this
      summary card, mirroring `goal-detail-progress-card.tsx`/
      `holding-detail-stats-card.tsx`'s established pattern).

## RESOLVED (first pass's blocking item — confirmed fixed by this second pass)

- [x] `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
      — "Expected amount" now wrapped in `AnimatedNumber`. Confirmed by
      direct source re-read and a live Playwright run showing a genuine
      count-up (`$1,493.72 → ... → $4,000.00`). See
      `phase-5b-second-pass.md` §1.
- [x] `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
      headline figures (Current value, Cost basis, Gain/loss, Total dividend
      income) now wrapped in `AnimatedNumber` via new
      `holding-detail-stats-card.tsx` (plain serializable props only,
      mirroring `goal-detail-progress-card.tsx`). Confirmed by direct source
      re-read and a live Playwright run showing a genuine count-up
      (`$0.00 → ... → $3,200.00`). Gain/loss sign-dependent color confirmed
      flipping correctly mid-tween. See `phase-5b-second-pass.md` §1.
- [x] `tests/e2e/support/axe.ts`'s 700ms fixed-buffer addition, closing the
      intermittent `route-a11y.spec.ts` flake caused by `AnimatedNumber`/
      `ProgressRing`'s imperative (non-Web-Animations-API) animation shape —
      confirmed sound and holding under a fresh, live, clean 45/45
      Playwright run (no flake observed, including on the specific
      "Financial Goals list" test named as a possible flake candidate). See
      `phase-5b-second-pass.md` §2.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence
      across both passes. The spec itself is sound and internally consistent
      (confirmed by the CTO's own resolution pass + follow-up re-check); the
      blocking gap above is an implementation-completeness failure against
      the spec, not a defect in the spec's own scope definition.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — the reduced-motion mechanism, `AnimatedNumber`/`ExpandableCard`/
      `PageTransition`/chart-animation-hook designs, and the §1.4 correction
      all confirmed matching shipped code by direct inspection.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound and internally
      consistent; not reopened by either pass's own findings (a completeness
      gap against an already-correct scope definition, not a scope-defect).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7.

## Automated checks (re-run live by both passes)

- [x] `npm run typecheck` — clean, 0 errors (both passes).
- [x] `npm run lint` — clean, 0 errors/warnings (both passes).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (both passes,
      identical count — neither pass's changes touch unit-tested surface).
- [x] `npm run seed:e2e` — ran fresh in both passes;
      `tests/e2e/support/fixture-ids.json` restored to its committed
      placeholder form afterward each time (confirmed via `git status`
      showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** in both passes (9
      `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
      `route-a11y.spec.ts` + 2 setup logins). Second pass's own run was a
      single clean run with no flake observed (including on the specific
      route the task flagged as a possible flake candidate), so no repeat
      run was required.
- [x] `git status`/`git log` — working tree clean at the start and end of
      both reviews (aside from the expected, accepted
      `docs/testing/e2e/accessibility-report.md` timestamp regeneration).
      `HEAD` at `8a5d89a` for this second pass, matching its stated scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Fresh-page-load race —
      fixed via unconditional-correct-first-render + `useLayoutEffect`-
      deferred mount animation, confirmed by direct source read and a
      live-passing E2E test in both passes.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook, confirmed by direct source read.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug.

## Number Counters

- [!] **BLOCKING — see above.** Nine of ten AC6 surfaces now confirmed
      correctly wired by direct source read and, for the two named in the
      first pass's finding, live Playwright verification; one
      (`/debt`'s own page-level "Total active debt" aggregate) is not.
- [x] **RESOLVED (this second pass's re-verification).** Recurring Income
      detail (`/income/[streamId]`) and Investment holding detail
      (`/investments/[holdingId]`) — both previously missing
      `AnimatedNumber` entirely, now fixed and live-verified genuinely
      animating. See `phase-5b-second-pass.md` §1.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Savings Goal detail
      page (`/goals/[goalId]`) — fixed via `goal-detail-progress-card.tsx`,
      confirmed by direct source read.
- [x] Duration bound (`NUMBER_COUNTER_DURATION_MS = 600`), single shared
      formatting pipeline, and the null/zero-crossing edge cases all
      confirmed by direct read of `animated-number.tsx`, and reconfirmed live
      (the gain/loss sign-flip mid-tween on the Holding detail page,
      Section 1 of the second pass).

## Chart Transitions

- [x] All 14 Recharts consumers spread `useChartAnimationProps()`.
- [x] Analytics' heatmap (`spending-heatmap.tsx`) confirmed wrapped in
      `FadeIn`, per its own non-Recharts exception.
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
      missing while collapsed — fixed via an explicit `React.useId()`-based
      id, confirmed by direct source read and a live-passing E2E test in
      both passes.
- [x] Risk #59 — spot-checked; no misannotation found.

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones,
      confirmed by both passes' own source reads and the Performance
      Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current across both passes: `8a5d89a`
      touches only the two named detail-route files, one new
      plain-serializable-props feature file, one test-support file, and one
      auto-generated doc — no new Server Action, Route Handler, or
      query-layer change. This second pass's own new finding (Section 3 of
      `phase-5b-second-pass.md`) is a pure display-layer omission with no
      security surface of its own once fixed.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings, confirmed still current and unaffected by
      anything since, across both passes.

## Bug Hunter

- [x] 4 findings total (first-pass gate), all 4 fixed and independently
      re-verified against each bug report's own root cause.
- [!] The systematic per-surface sweep the Definition of Done calls for
      still has not actually been completed: after the Savings Goal detail
      finding (Bug Hunter) and the first-pass Release Manager's own
      two-surface finding, this second pass's own spot-check found a *third*
      instance of the identical gap shape (Debt's page-level aggregate). See
      Blocking, above.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports, and the E2E reduced-motion report/spec
      — all internally consistent with shipped code, confirmed by direct
      source inspection across both passes.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows in a
      coherent final state, no dangling rows.

## Overall Gate Decision

**REJECT (second pass). Phase 5b is not closed.**

The first pass's blocking finding (two Number Counters AC6 surfaces never
wired to `AnimatedNumber`) is genuinely fixed, independently confirmed by
both direct source review and live Playwright verification against the real
seeded database — both figures now demonstrably count up on mount rather
than rendering statically. The `axe.ts` flake mitigation this same fix
commit shipped is correctly reasoned and holds under a fresh, clean 45/45
live Playwright run.

But this second pass's own required spot-check for other gaps (not a
rubber-stamp of the fix commit alone) found a third, previously-uncaught
instance of the identical defect shape: `/debt`'s own page-level "Total
active debt" summary figure was never wired, in this phase or any prior
one. Number Counters' binding Definition of Done ("all ten [AC6] surfaces...
each confirmed to animate") still does not hold. Per this project's own
standing "trust but verify" discipline, this is a genuine, confirmed gap,
not a nitpick, and this release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into `debt/page.tsx`'s
"Total active debt" figure (see `phase-5b-second-pass.md` §3's Decision
section for the concrete fix pattern). **Strongly recommended:** produce the
per-component AC6 pass/fail checklist the Definition of Done has asked for
since this capability's spec was written, so a fourth recurrence of this
exact gap shape is structurally prevented rather than caught by chance on a
future review pass.

Phase 5 remains open pending this fix and a follow-up (third) Release
Manager pass.
