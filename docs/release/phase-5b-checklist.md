# Phase 5b Deployment / Phase-Gate Checklist — Motion & Craft

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5b-notes.md` for the first-pass full review,
`phase-5b-second-pass.md` for the second pass's full reasoning,
`phase-5b-third-pass.md` for the third pass's full reasoning,
`phase-5b-fourth-pass.md` for the fourth pass's full reasoning,
`phase-5b-fifth-pass.md` for the fifth pass's full reasoning,
`phase-5b-sixth-pass.md` for the sixth pass's full reasoning, and
`phase-5b-seventh-pass.md` for this seventh, final pass's full reasoning.

**Gate status: APPROVED (seventh pass). Phase 5b is closed, and Phase 5 is
complete.** The sixth pass's blocking finding
(`strategy-comparison.tsx`'s "total interest paid" figure — a stale
"correctly out of scope" dismissal whose supporting precedent had been
overturned by the same commit that carried it forward) is fixed and
confirmed, live-verified sampling the exact same fixture value the sixth
pass recorded static (`$723.77`) now genuinely counting up. This seventh
pass's own required final audit — a targeted re-read of every remaining
"correctly out of scope" judgment call across all six prior passes, checking
specifically for the same stale-precedent defect class the sixth pass
discovered — found no eighth instance. All automated checks pass fresh,
live. Security and Performance sign-offs hold, unaffected by a fix that
touches exactly one source file, two insertions, one deletion. Phase 5b —
and with it, Phase 5 in full (motion/transitions, accessibility,
responsive/mobile) — is complete.

## RESOLVED (sixth pass's blocking item — confirmed fixed by this seventh pass)

- [x] `src/features/debt/components/strategy-comparison.tsx`'s "total
      interest paid" figure — the third pass's original "correctly out of
      scope" dismissal (a secondary caption, justified by comparison to
      `debt-card.tsx`'s then-un-animated sibling captions) went stale once
      `12d1d52` wired those exact sibling captions, but was carried forward
      unchanged by that same commit's own "left correctly unwired" list. The
      sixth pass caught this and re-derived the figure as genuinely in scope
      (Debt's "payoff figures," none of AC7's three exclusions apply). Fixed
      by a trivial in-place `AnimatedNumber` wrap (`17e4336`) — the file
      already carried `"use client"` and the `formatCurrency` closure. Live-
      verified sampling the exact fixture value the sixth pass recorded
      fully static (`$723.77`, 18/18 samples flat) now genuinely counting up
      (`$723.77 -> $61.55 -> ... -> $723.77`, 11 distinct values across 20
      samples). See `phase-5b-seventh-pass.md` §1.
- [x] **Final stale-dismissal audit (this seventh pass's own required
      check).** Every other "correctly out of scope" judgment call across
      all six prior passes was re-derived against the codebase's *current*
      state, not trusted on citation alone. The only other citation of the
      same now-stale precedent (the fifth pass's non-blocking note on
      `financial-goal-card.tsx`'s `percentPaidOff`/`targetPercent`
      captions) was already independently fixed by `12d1d52`'s own proactive
      sweep before it could ever surface as a live gap.
      `holding-detail-stats-card.tsx`'s `gainLossPercent` parenthetical (the
      one remaining dismissal sharing this bug class's structural shape) was
      re-derived from scratch and both of its supporting premises still
      independently hold — no sibling of its exact shape exists anywhere in
      the app, and it falls outside AC4's own enumerated percentage
      categories. No eighth instance found. See `phase-5b-seventh-pass.md`
      §3.

## RESOLVED (fifth pass's blocking item — confirmed fixed by the sixth pass, re-confirmed unaffected by this seventh pass)

- [x] `src/features/budgeting/components/budget-category-row.tsx` — each
      budget category row's own "percent of allocation used" figure now
      wrapped in `AnimatedNumber` (trivial in-place wrap; the file was
      already a Client Component). Confirmed by direct source/diff re-read
      and a live Playwright run showing a genuine count-up
      (`14% -> 0% -> 3% -> ... -> 14%`). The same fix commit (`12d1d52`)
      proactively swept and fixed seven more instances of the same
      "secondary caption under an already-wired headline" pattern across
      `budget-summary-cards.tsx`, `debt-card.tsx` (×2), `goal-card.tsx`/
      `goal-detail-progress-card.tsx`, and `financial-goal-card.tsx` (×3) —
      all six independently confirmed genuine and correctly shaped by the
      sixth pass. See `phase-5b-sixth-pass.md` §1–§2.

## RESOLVED (fourth pass's blocking item — confirmed fixed by the fifth pass, re-confirmed unaffected since)

- [x] `src/app/(dashboard)/financial-health-score/page.tsx`'s own big
      headline score — now wrapped in `AnimatedNumber` via new
      `financial-health-score-headline-card.tsx` (`"use client"` Client
      Component boundary extraction, identical `format`/pattern shape as
      every sibling score figure this phase). Confirmed by direct
      source/diff re-read and a live Playwright run showing a genuine
      count-up (`16 -> 31 -> ... -> 100`) alongside its own already-wired
      subscore grid (positive control) on the same page load. See
      `phase-5b-fifth-pass.md` §1.

## RESOLVED (third pass's blocking item — confirmed fixed by the fourth pass, re-confirmed unaffected since)

- [x] `src/features/budgeting/components/budget-health-score-badge.tsx` —
      score now wrapped in `AnimatedNumber` (`"use client"` added, identical
      `format`/`className` shape as its sibling
      `financial-health-score-badge.tsx`). Confirmed by direct source
      re-read and a live Playwright run showing genuine count-ups on both
      named surfaces: Dashboard (`100 -> 0 -> 65 -> ... -> 100`) and
      `/budgeting` (`100 -> 6 -> 19 -> ... -> 100`). See
      `phase-5b-fourth-pass.md` §1.

## RESOLVED (second pass's blocking item — confirmed fixed by the third pass, re-confirmed unaffected since)

- [x] `src/app/(dashboard)/debt/page.tsx` — "Total active debt" now wrapped
      in `AnimatedNumber` via new `total-active-debt-card.tsx`. See
      `phase-5b-third-pass.md` §1.
- [x] `src/app/(dashboard)/transactions/[id]/transaction-detail-client.tsx`
      — headline transaction amount now wrapped in `AnimatedNumber`
      (proactive fix). See `phase-5b-third-pass.md` §2.
- [x] `src/features/debt/components/strategy-comparison.tsx`'s "total
      interest paid" figure — the third pass's own original dismissal here
      ("correctly out of scope, a secondary caption") is the judgment call
      that later went stale and was fixed by the sixth/seventh passes above;
      recorded here for the historical record, superseded by the RESOLVED
      entry at the top of this checklist.

## RESOLVED (first pass's blocking item — confirmed fixed by the second pass, re-confirmed unaffected since)

- [x] `src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`
      — "Expected amount" wrapped in `AnimatedNumber`. See
      `phase-5b-second-pass.md` §1.
- [x] `src/app/(dashboard)/investments/[holdingId]/page.tsx` — all four
      headline figures wrapped via `holding-detail-stats-card.tsx`. Its
      `gainLossPercent` inline parenthetical annotation confirmed correctly
      out of scope (a same-span annotation of an already-animating figure)
      — re-derived from scratch, not merely re-cited, by the seventh pass's
      own final stale-dismissal audit; both of its supporting premises
      independently still hold. See `phase-5b-second-pass.md` §1,
      `phase-5b-third-pass.md` §3, `phase-5b-seventh-pass.md` §3.2.
- [x] `tests/e2e/support/axe.ts`'s 700ms fixed-buffer addition — confirmed
      sound and still holding under every subsequent pass's own fresh, live,
      clean 45/45 Playwright run, through this seventh pass. See
      `phase-5b-second-pass.md` §2.

## RESOLVED (fifth pass's non-blocking observation — confirmed fixed by the sixth pass)

- [x] `src/features/financial-goals/components/financial-goal-card.tsx`'s
      `SavingsRateProgress` target-percentage caption and `DebtPayoffProgress`'s
      `percentPaidOff` caption — both wrapped in `AnimatedNumber` by
      `12d1d52`'s proactive sweep, closing the fifth pass's own strongly-
      recommended (non-blocking) note. This independently pre-empted a
      second stale-dismissal instance the seventh pass's own audit would
      otherwise have found: the fifth pass's note on `percentPaidOff` cited
      the same now-overturned `debt-card.tsx` precedent
      `strategy-comparison.tsx`'s dismissal did, but the figure it was
      protecting was already fixed before that staleness could surface as a
      live gap. See `phase-5b-sixth-pass.md` §2.4,
      `phase-5b-seventh-pass.md` §3.1.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5b-motion-craft.md`) — every
      capability's AC and Definition of Done checked against real evidence
      across all seven passes, including the fifth pass's own from-scratch
      re-derivation of AC6's full ten-surface list against shipped code
      (not against any prior pass's own summary of it), and the seventh
      pass's own final audit re-deriving every remaining exclusion against
      AC4/AC6/AC7's own text directly. The spec itself is sound and
      internally consistent; every gap found across all seven passes was
      either an implementation-completeness failure against the spec or a
      stale re-affirmation of an otherwise-correct judgment call — never a
      defect in the spec's own scope definition.
- [x] Solution Architect design (`docs/architecture/phase-5b-technical-design.md`)
      — confirmed matching shipped code by direct inspection across all
      seven passes.
- [x] CTO Phase 5b resolution pass + Follow-up re-check (`roadmap.md`) —
      Number Counters' AC1/AC6 reconciliation confirmed sound; not reopened
      by any pass's findings (each is a completeness gap or stale-dismissal
      gap against an already-correct scope definition).
- [x] Risk register (`docs/planning/risk-register.md` rows #40, #44, #52,
      #53, #55–#59) — all eight reviewed rows in a coherent final state, no
      row dangling or falsely marked resolved. See `phase-5b-notes.md` §7,
      re-confirmed unaffected by every subsequent pass including this
      seventh (`phase-5b-seventh-pass.md` §5).

## Automated checks (re-run live by all seven passes)

- [x] `npm run typecheck` — clean, 0 errors (all seven passes).
- [x] `npm run lint` — clean, 0 errors/warnings (all seven passes).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (all seven
      passes, identical count — no pass's changes touch unit-tested
      surface).
- [x] `npm run seed:e2e` — ran fresh in all seven passes;
      `tests/e2e/support/fixture-ids.json` restored to its committed
      placeholder form afterward each time (confirmed via `git status`
      showing no diff on that file).
- [x] `npx playwright test accessibility --project=desktop --workers=1
      --reporter=list` — **45/45 passing** in all seven passes (9
      `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
      `route-a11y.spec.ts` + 2 setup logins). This seventh pass's own run was
      a single clean run with no flake observed; note this suite verifies
      zero critical/serious axe violations and the reduced-motion end-state
      contract, not the Number Counters mount-animation contract, so its
      passing does not substitute for this pass's own live-sampling
      verification of the specific fixed figure.
- [x] `git status`/`git log` — working tree clean at the start and end of
      all seven reviews (aside from the expected, accepted
      `docs/testing/e2e/accessibility-report.md` timestamp regeneration).
      `HEAD` at `17e4336` for this seventh, final pass, matching its stated
      scope.

## Reduced-Motion Foundation

- [x] Central mechanism (`<MotionConfig reducedMotion="user">` in
      `providers.tsx` + `useReducedMotion()`) confirmed present and
      correctly composed.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Fresh-page-load race
      — fixed, confirmed by direct source read and a live-passing E2E test
      in all seven passes.
- [x] **RESOLVED (first pass's own Bug Hunter pass).** Mid-session
      reduced-motion re-enable not resuming animation — fixed via
      `useSyncExternalStore`-based hook, confirmed by direct source read.
- [x] `components/ui/progress.tsx`'s CSS-transition-based fill correctly
      unaffected by either bug.

## Number Counters

- [x] **CLOSED.** All ten of AC6's named surfaces, and every named
      sub-clause within each (Budgeting's "category-row progress" +
      "summary cards," Financial Health Score's "the score itself" +
      "subscores"), confirmed correctly wired to `AnimatedNumber`, plus the
      one stale-dismissal instance (`strategy-comparison.tsx`'s "total
      interest paid," AC6's Debt "payoff figures") fixed and live-verified.
      This closed only after seven consecutive Release Manager passes each
      independently caught one further instance of this phase's own
      recurring "named-or-implied AC6 figure skipped" defect shape — see the
      RESOLVED sections above for the full chain, and
      `phase-5b-seventh-pass.md` §3 for the final audit confirming no eighth
      instance remains.
- [x] **RESOLVED (seventh pass).** `strategy-comparison.tsx`'s "total
      interest paid" figure (Debt).
- [x] **RESOLVED (sixth pass).** `budget-category-row.tsx`'s per-category
      percent-used label, plus seven proactively-fixed sibling captions
      across Budgeting/Debt/Goals/Financial Goals.
- [x] **RESOLVED (fifth pass).** `/financial-health-score`'s own headline
      score span.
- [x] **RESOLVED (fourth pass).** `BudgetHealthScoreBadge`'s score, on both
      `/budgeting` and the Dashboard.
- [x] **RESOLVED (second pass, re-confirmed since).** Debt's page-level
      "Total active debt" aggregate.
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
      live across all seven passes.
- [x] `holding-detail-stats-card.tsx`'s `gainLossPercent` inline
      parenthetical — the one remaining figure in this phase sharing the
      sixth pass's stale-dismissal defect shape — re-derived from scratch by
      the seventh pass's own final audit and confirmed still genuinely
      correctly out of scope (no sibling of its exact shape exists anywhere
      in the app; falls outside AC4's own enumerated percentage
      categories). Investments' `dividend-history-list.tsx`/
      `value-history-list.tsx` (never individually named by any prior pass)
      directly confirmed correctly row-level-excluded on the same
      established grounds as every other history/list table in the app. See
      `phase-5b-seventh-pass.md` §3.2–§3.3.

## Chart Transitions

- [x] All 14 Recharts consumers spread `useChartAnimationProps()`.
- [x] Analytics' heatmap (`spending-heatmap.tsx`) confirmed wrapped in
      `FadeIn`.
- [x] Risk #56 — measured non-issue, per the Performance Engineer's direct
      frame-timing capture.
- [x] The fifth pass's own negative check confirmed no chart renders a
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
      a live-passing E2E test across all seven passes.
- [x] Risk #59 — spot-checked; no misannotation found.

## Cross-Cutting GPU-Compositable-Properties Bar

- [x] No undocumented third exception found beyond the two named ones,
      confirmed across all seven passes' own source reads and the
      Performance Engineer's independent review.

## Security

- [x] Security Architect review (`docs/security/phase-5b-security-review.md`)
      — APPROVE, confirmed still current through this seventh, final pass:
      every fix commit across all seven passes' own `git diff --stat`
      touches only display-layer feature files (an `AnimatedNumber` import
      plus an in-place wrap, or a small Client Component boundary extraction
      receiving plain serializable props) — no new Server Action, Route
      Handler, or query-layer change at any point in this chain. This
      seventh pass's own re-check (`git diff --stat 12d1d52..17e4336`)
      confirms the final fix is a one-file, two-insertion/one-deletion
      source diff. See `phase-5b-seventh-pass.md` §4.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5b-performance-review.md`) — APPROVE, two
      non-blocking findings, confirmed still current and unaffected by
      anything since, across all seven passes.

## Bug Hunter

- [x] 4 findings total (first-pass gate), all 4 fixed and independently
      re-verified against each bug report's own root cause.
- [x] **CLOSED.** The systematic per-surface sweep the Number Counters
      Definition of Done called for was never produced as a standalone
      artifact, but was effectively completed the hard way: seven
      consecutive Release Manager passes, each independently catching one
      further instance of the same "named-or-implied AC6 figure skipped"
      defect shape (two full-surface misses, a page-level aggregate, two
      score badges, one percent-used label, and one stale re-affirmed
      dismissal), until the seventh pass's own final, dedicated
      stale-dismissal audit found no further instance. Recorded here as a
      standing lesson for future phases: a per-component pass/fail
      checklist enumerated against the spec's own text from the start would
      have caught all eight instances on the first sweep rather than one at
      a time across seven review rounds.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports, and the E2E reduced-motion report/spec
      — all internally consistent with shipped code, confirmed by direct
      source inspection across all seven passes.
- [x] `docs/planning/risk-register.md` — all eight reviewed rows in a
      coherent final state, no dangling rows.

## Overall Gate Decision

**APPROVE (seventh pass). Phase 5b is closed, and Phase 5 is complete.**

The sixth pass's blocking finding — `strategy-comparison.tsx`'s "total
interest paid" figure, a stale "correctly out of scope" dismissal whose
supporting precedent had been overturned earlier in the same commit that
carried it forward unchanged — is genuinely fixed, independently confirmed
both by direct source/diff review and by live browser verification sampling
the exact fixture value the sixth pass recorded fully static, now genuinely
counting up.

This seventh pass's own required final audit — a targeted re-read of every
remaining "correctly out of scope" judgment call across all six prior
passes' own reasoning, checking specifically for the same stale-precedent
defect class the sixth pass discovered, not a new sweep for previously-
undiscovered surfaces — found no eighth instance. The only other citation of
the now-overturned precedent had already been independently fixed by the
same commit that created the staleness, before it could ever surface as a
live gap. The one remaining dismissal sharing this defect class's structural
shape (`holding-detail-stats-card.tsx`'s `gainLossPercent` parenthetical) was
re-derived from scratch against the codebase's current state, and both of
its supporting premises independently still hold. Every row-level exclusion
this phase has produced (Transactions, Bills, Recurring Income, Analytics,
Investments' two history lists) rests on AC7's own named exclusion or a
structural distinction that does not depend on any other figure's wired
state, and therefore cannot go stale the way `strategy-comparison.tsx`'s did.

`npm run typecheck`, `npm run lint`, `npx vitest run` (633/633), and the full
45-test `accessibility` Playwright project were all re-run fresh, live, on
this exact commit, with no flake observed. Security Architect and
Performance Engineer sign-offs hold, unaffected — the fix under this pass's
review is a one-file, two-insertion/one-deletion source diff with no new
Server Action, Route Handler, API route, query-layer file, or dependency.
The risk register remains coherent.

Number Counters' own Definition of Done — "all ten [AC6] surfaces... each
confirmed to animate" — now genuinely holds, across all ten named surfaces
and every named sub-clause within them, after seven consecutive Release
Manager passes and eight total instances of this phase's own recurring
defect shape, ending with this pass's own confirmation that no ninth
instance remains. Reduced-Motion Foundation, Chart Transitions, Page
Transitions, Expandable Cards, and the Cross-Cutting GPU-Compositable-
Properties Bar were each independently confirmed sound across multiple
passes and are unaffected by this final fix.

**Phase 5b is closed.** Phase 5's original roadmap stub named three
workstreams: motion/transitions, accessibility, and responsive/mobile. Phase
5a (accessibility, responsive/mobile) and Phase 5b (motion/transitions,
Motion & Craft) are both now shipped, audited, and signed off. **Phase 5, in
full, is complete.**
