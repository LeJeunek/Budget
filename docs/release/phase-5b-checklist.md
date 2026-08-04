# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for full reasoning and justification behind every
item below. **Gate status: REJECTED — Phase 5b is NOT closed.** One blocking
item below (Number Counters AC6 completeness) must be fixed and this gate
re-run before Phase 5b — and therefore Phase 5 in full — can close.

## Blocking

- [!] **Number Counters' Definition of Done ("all ten AC6 surfaces... each
      confirmed to animate") is not met.** Two named surfaces never received
      `AnimatedNumber`:
      - `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
        — the "Expected amount" headline figure renders via plain
        `formatCurrency`, no `AnimatedNumber` anywhere in the file.
      - `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
        headline figures (Current value, Cost basis, Gain/loss, Total
        dividend income) render via plain `formatCurrency`, no
        `AnimatedNumber` anywhere in the file.
      Identical defect shape to the already-fixed
      `docs/testing/bug-reports/savings-goal-detail-page-missing-animated-number.md`
      finding — a named AC6 "+ detail route" surface skipped in full. Found
      by this pass's own direct spot-check, not reported by any prior review
      in this phase's chain. See `phase-5b-notes.md` §1 for the full
      reasoning and the concrete fix pattern (reuse
      `goal-detail-progress-card.tsx`'s Client-Component-boundary shape).

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence.
      The spec itself is sound and internally consistent (confirmed by the
      CTO's own resolution pass + follow-up re-check); the blocking gap
      above is an implementation-completeness failure against the spec, not
      a defect in the spec's own scope definition.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — the reduced-motion mechanism, `AnimatedNumber`/`ExpandableCard`/
      `PageTransition`/chart-animation-hook designs, and the §1.4 correction
      (superseding the original `useReducedMotion` re-export and
      `ProgressRing` rows) all confirmed matching shipped code by direct
      inspection.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound and internally
      consistent; not reopened by this gate's own finding (a completeness
      gap against an already-correct scope definition, not a scope-defect).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7.

## Automated checks (re-run live by this pass)

- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — 633/633 tests passing, 52 test files.
- [x] `npm run seed:e2e` — ran fresh; `tests/e2e/support/fixture-ids.json`
      restored to its committed placeholder form afterward (confirmed via
      `git status` showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** (9 `accent-contrast.spec.ts` + 6
      `reduced-motion.spec.ts` + 28 `route-a11y.spec.ts` + 2 setup logins),
      including all six `reduced-motion.spec.ts` tests now passing live — a
      genuine improvement over the E2E Test Engineer's own run report (4/6
      passing at that time, the two failures now confirmed fixed).
- [x] `git status`/`git log` — working tree clean; `HEAD` at `44944ca`,
      matching this review's stated scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (this phase's own Bug Hunter pass).** Fresh-page-load race
      (`AnimatedNumber`/`ProgressRing` briefly animating despite `reduce`
      already active) — fixed via unconditional-correct-first-render +
      `useLayoutEffect`-deferred mount animation, confirmed by direct source
      read and a live-passing E2E test. See `phase-5b-notes.md` §2.1.
- [x] **RESOLVED (this phase's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook replacing the Framer-Motion
      re-export, confirmed by direct source read. See `phase-5b-notes.md`
      §2.2.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug (confirmed by the Bug Hunter's own contrast
      case and re-confirmed live by this pass's Playwright run).

## Number Counters

- [!] **BLOCKING — see above.** Eight of ten AC6 surfaces confirmed
      correctly wired by direct source read; two (`/income/[streamId]`,
      `/investments/[holdingId]`) are not.
- [x] **RESOLVED (this phase's own Bug Hunter pass).** Savings Goal detail
      page (`/goals/[goalId]`) — was missing `AnimatedNumber` entirely, now
      fixed via a new `goal-detail-progress-card.tsx` Client Component
      boundary, confirmed by direct source read.
- [x] Duration bound (`NUMBER_COUNTER_DURATION_MS = 600`), single shared
      formatting pipeline (`format` callback always the caller's own
      `formatCurrency`/`useFormatCurrency`), and the null/zero-crossing edge
      cases all confirmed by direct read of `animated-number.tsx`.

## Chart Transitions

- [x] All 14 Recharts consumers (re-confirmed via fresh `grep -rl "recharts"
      src/features`) spread `useChartAnimationProps()`.
- [x] Analytics' heatmap (`spending-heatmap.tsx`) confirmed wrapped in
      `FadeIn`, per its own non-Recharts exception.
- [x] Risk #56 (Recharts' native SVG-attribute animation vs. the GPU bar) —
      measured non-issue, per the Performance Engineer's direct frame-timing
      capture on the app's two densest chart pages.

## Page Transitions

- [x] `src/app/(dashboard)/template.tsx` confirmed thin, correctly scoped to
      `(dashboard)/` only, composing `PageTransition`/`FadeIn`.
- [x] No TTI regression — measured directly by the Performance Engineer
      (82ms to interactive, well inside the 300ms fade duration).
- [~] Risk #58 (Router Cache skeleton replay on repeat `/analytics`
      navigation) — confirmed real by direct Performance Engineer
      measurement, not a binding-AC breach (composes correctly around
      `loading.tsx`, no double animation), routed to the Frontend Lead as a
      scoped, non-blocking follow-up.

## Expandable Cards

- [x] All five `DataTableCardList` consumers (Transactions, Admin's
      `UserTable`/`AuditLogTable`, Bills'/Recurring Income's
      `OccurrenceHistoryTable`) confirmed annotated with `meta: {
      cardDisplay: "expandable" }`.
- [x] Analytics' "Dismissed merchants" migration confirmed using the shared
      `ExpandableCard` primitive directly.
- [x] **RESOLVED (this phase's own Bug Hunter pass).** `aria-controls`
      missing while collapsed (all six consumers) — fixed via an explicit
      `React.useId()`-based id threaded unconditionally onto both the
      trigger and the content region, confirmed by direct source read and a
      live-passing E2E test.
- [x] Risk #59 (`"expandable"` misannotation risk) — spot-checked; no
      misannotation found (Transactions' Tags/Notes columns confirmed
      genuinely new, not-otherwise-shown content).

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones
      (`ExpandableCard`'s height reveal, `ProgressRing`'s pre-existing
      `strokeDashoffset`), confirmed by this pass's own source reads and the
      Performance Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current: the three commits since that
      review's own scope (`19a0d46`, `44944ca`, and the earlier `5183f38`)
      touch only `components/shared/motion/`, `progress-ring.tsx`, one new
      plain-serializable-props feature file, one new test spec, and
      documentation — no new Server Action, Route Handler, or query-layer
      change in any of them.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings (bundle-size delta traced to a Turbopack
      chunking inefficiency, not a code defect; Risk #58's skeleton replay
      confirmed real but non-blocking), confirmed still current and
      unaffected by anything since.

## Bug Hunter

- [x] 4 findings total, all 4 fixed and independently re-verified against
      each bug report's own root cause and reproduction steps by this pass
      (not taken on any report's summary) — see `phase-5b-notes.md` §2.
- [!] The systematic per-surface sweep the Definition of Done calls for was
      not actually completed even after the fourth finding (Savings Goal
      detail) established the defect shape — two more instances of the
      identical gap were found by this pass's own spot-check, not by the
      Bug Hunter. See Blocking, above.

## Documentation

- [x] Product spec, architecture design doc (including its §1.4
      correction), both Security/Performance reviews, all four bug reports,
      and the E2E reduced-motion report/spec — all internally consistent
      with shipped code, confirmed by direct source inspection, not taken on
      any report's summary.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows (#40, #44,
      #52, #53, #55–#59) in a coherent final state, no dangling rows.

## Overall Gate Decision

**REJECT. Phase 5b is not closed.**

The mechanism-level work this phase shipped — the reduced-motion foundation,
`AnimatedNumber`/`ProgressRing`, chart-transition wiring, the page-transition
wrapper, and the expandable-card primitive — is sound and independently
re-verified live by this pass, and all four Bug Hunter findings are
genuinely fixed. But Number Counters' own binding Definition of Done ("all
ten [AC6] surfaces... each confirmed to animate") is not met: two named
surfaces (`/income/[streamId]`, `/investments/[holdingId]`) never received
`AnimatedNumber` at all, the identical defect shape as an already-fixed
finding this same phase produced. This is a genuine, confirmed gap under
live re-verification, not a nitpick — consistent with this project's own
standing "trust but verify" discipline, this release cannot be approved with
it open.

**Required before re-review:** wire `AnimatedNumber` into both named
surfaces (see `phase-5b-notes.md` §1 for the concrete, low-risk fix
pattern already established elsewhere in this same phase).

Phase 5 remains open pending this fix and a follow-up Release Manager pass.
