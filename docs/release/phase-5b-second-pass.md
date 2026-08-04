# Phase 5b Release Notes — Second Pass (Targeted Re-Check)

**Reviewer:** Release Manager
**Scope:** narrow re-check of the first pass's (`docs/release/phase-5b-notes.md`)
sole blocking finding (Section 1: two Number Counters AC6 surfaces —
`/income/[streamId]`'s "Expected amount" figure and
`/investments/[holdingId]`'s four-figure stat grid — never wired to
`AnimatedNumber`) and the accompanying `tests/e2e/support/axe.ts` flake
mitigation, per commit `8a5d89a` ("Phase 5b: close Release Manager REJECT —
wire the two remaining Number Counters gaps"), already on `origin/master`.
Security Architect, Performance Engineer, and Bug Hunter sign-offs from the
first-pass full review gate are unaffected by this commit (no new Server
Action, Route Handler, dependency, or data-egress surface — confirmed below)
and are not re-litigated here, per this pass's own charter — mirroring
5a's second-pass scoping (`docs/release/phase-5a-second-pass.md`) exactly.

This pass's own explicit charter also included a bounded spot-check for any
*other* Number Counters AC6 surface that might still be gapped (not a full
ten-surface re-derivation). That check found one: **Debt's own `/debt` page-
level "Total active debt" summary figure was never wired, in this phase or
any prior one, and was not caught by the first pass's own review.** See
Section 3.

**Decision: REJECT. Phase 5b is still not closed** — the two-surface fix
this pass was scoped to verify is genuine and holds (Section 1), and the
`axe.ts` flake mitigation holds under a fresh live run (Section 2), but a
third, previously-uncaught instance of the identical "named AC6 surface
never wired" defect shape was found independently by this pass (Section 3),
so the phase's own binding Definition of Done ("all ten surfaces... each
confirmed to animate") still does not hold.

---

## 1. The two-surface fix (income stream detail, holding detail) — CONFIRMED FIXED, independently re-derived and live-verified

### `income-stream-detail-client.tsx`

Read in full. The "Expected amount" figure (still inside the existing
`stream.expectedAmount !== null ? ... : "—"` null guard, matching
`AnimatedNumber`'s own documented contract of only ever receiving a definite
`number`) now reads:

```tsx
{stream.expectedAmount !== null ? (
  <AnimatedNumber value={stream.expectedAmount} format={formatCurrency} />
) : (
  "—"
)}
```

`formatCurrency` is `useFormatCurrency()`'s return value, the same
preference-aware pipeline already used elsewhere in this file — no second,
parallel formatting path introduced. This file was already a Client
Component (`"use client"` at the top, pre-existing), so this is exactly the
"trivial fix" both the first pass and the fix commit's own message described
it as — confirmed genuinely trivial by direct read, not merely trusted.

### `investments/[holdingId]/page.tsx` + new `holding-detail-stats-card.tsx`

Read both in full. `page.tsx` remains a Server Component (fetches
`getHoldingById`/`getContainers`/`getGrowthHistory`/`getUserPreference`
directly, unchanged), and now delegates its four-figure stat grid entirely
to a new Client Component:

```tsx
<HoldingDetailStatsCard
  currentValue={holding.currentValue}
  costBasis={holding.costBasis}
  gainLossAmount={holding.gainLossAmount}
  gainLossPercent={holding.gainLossPercent}
  totalDividends={totalDividends}
  currencyDisplay={userPreference.currencyDisplay}
/>
```

`HoldingDetailStatsCard` receives only plain, serializable primitives (four
numbers, one nullable number, one string) — no function crosses the
Server/Client boundary, correctly mirroring `goal-detail-progress-card.tsx`'s
established fix pattern for the identical prior Goals detail gap (confirmed
by direct side-by-side read of both files: same `"use client"` +
`formatCurrency` wrapper-closure shape, same Card/CardContent structure).
All four figures (`currentValue`, `costBasis`, `gainLossAmount`,
`totalDividends`) are wrapped in `AnimatedNumber`. The gain/loss figure's
sign-dependent color lives inside its own `format` callback:

```tsx
format={(n) => (
  <span className={cn(n < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
    {n < 0 ? "" : "+"}
    {formatCurrency(n)}
  </span>
)}
```

— genuinely mirroring `portfolio-overview-section.tsx`'s own `gainLossText`
helper (confirmed by direct read of that file's identical shape and its own
inline comment cross-referencing this exact pattern), so the color flips at
the true zero-crossing point mid-tween rather than only at the final
settled value, matching `AnimatedNumber`'s own documented edge case
(confirmed against `animated-number.tsx`'s own JSDoc usage example, which
now cites this exact pattern).

### Live-verified, not just source-read

Ran `npm run seed:e2e` (fresh fixture ids written), then an ad-hoc,
throwaway Playwright script (Node + `@playwright/test`'s `chromium` launcher,
never committed to the repo — this role does not edit `tests/`) that logged
in via the real `/login` UI form and sampled each figure's rendered text
every ~60-80ms immediately after navigating to each route. Results:

- **Income stream detail, "Expected amount":** samples climbed
  `$1,493.72 → $2,322.47 → $2,892.42 → $3,313.51 → $3,656.37 → $3,888.32 →
  $3,997.53 → $4,000.00` before settling at the final `$4,000.00` — a real,
  monotonic count-up over ~500ms, not a static render.
- **Holding detail, "Current value":** an early sample briefly showed the
  final `$3,200.00` (the deliberate, unconditional-correct-first-render this
  phase's own reduced-motion-race fix produces, per `animated-number.tsx`'s
  own comment), then dropped to `$0.00` and counted back up —
  `$0.00 → $810.60 → $1,418.71 → $1,963.94 → $2,351.91 → $2,752.53 →
  $2,998.01 → $3,156.88 → $3,200.00` — settling at ~700ms, consistent with
  `NUMBER_COUNTER_DURATION_MS = 600` plus sampling/render overhead. The
  "Gain / loss" figure animated on the identical timeline
  (`+$15.90 → ... → +$200.00`), confirming the sign-dependent `format`
  callback runs correctly on every intermediate tick, not just the final one.

This is a genuine count-up-from-near-zero animation on mount for both
previously-static surfaces, independently confirmed live in a real browser
against the real seeded database — not merely a plausible-looking diff.
`tests/e2e/support/fixture-ids.json` was restored to its committed
placeholder form afterward (`git checkout -- tests/e2e/support/fixture-ids.json`,
confirmed via `git status` showing no diff on that file).

**Verdict: holds.** Both named surfaces from the first pass's blocking
finding are genuinely fixed.

---

## 2. `tests/e2e/support/axe.ts` flake mitigation — CONFIRMED SOUND, holds under a fresh live run

Read the diff in full (`git show 8a5d89a -- tests/e2e/support/axe.ts`). The
reasoning is correct and specific, not hand-waved: `AnimatedNumber` and
`ProgressRing` are both driven by a raw `useMotionValue` updated via Framer
Motion's standalone `animate()` plus React `setState` on every tick — not a
declarative `motion.*` `animate` prop — so neither registers as a native Web
Animation `document.getAnimations()` can see or wait for, unlike
`FadeIn`/`PageTransition`/`ExpandableCard`'s declarative `motion.div`
animations, which the pre-existing wait already covered correctly. A fixed
`700ms` buffer (comfortably longer than `NUMBER_COUNTER_DURATION_MS`'s
`600ms`) now follows the existing Web-Animations-settle wait, and the
comment correctly reasons that the two waits together (`2s` + `700ms`) stay
bounded, so a genuinely stuck animation still surfaces as a timeout rather
than hanging the suite.

Ran `npx playwright test accessibility --project=desktop --workers=1
--reporter=list` fresh, live, myself: **45/45 passing** (2 setup logins + 9
`accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
`route-a11y.spec.ts`), including both `route-a11y.spec.ts`'s "Income stream
detail" and "Holding detail" tests (the two routes this phase's fix commit
touched) and the "Financial Goals list" test the task flagged as a possible
intermittent flake — it passed cleanly on this run, so per the task's own
instruction, no second run was required to confirm resolution (a re-run is
only called for if that specific flake is *observed*, which it was not).

**Verdict: holds.**

---

## 3. NEW FINDING, BLOCKING — Debt's own `/debt` page-level "Total active debt" figure was never wired

Per this pass's own charter (a bounded spot-check for other gaps, not a full
ten-surface re-derivation — item 5 of this pass's own instructions), a quick
independent grep/read pass was run across every AC6-named route's own page
file (`app/(dashboard)/**/page.tsx`) for remaining plain-`formatCurrency`
headline figures, cross-referenced against which files never received an
`AnimatedNumber` import.

**`src/app/(dashboard)/debt/page.tsx`** (read in full): the page's own
summary card, above the Active/Archived tabs, renders:

```tsx
<Card>
  <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
    <span className="text-sm text-muted-foreground">Total active debt</span>
    <span className="font-heading text-xl font-semibold text-foreground">
      {formatCurrency(totalActiveBalance, userPreference.currencyDisplay)}
    </span>
  </CardContent>
</Card>
```

— plain `formatCurrency`, no `AnimatedNumber` anywhere in this file. This is
styled identically to every other now-animated headline figure in the app
(`font-heading text-xl font-semibold text-foreground`, the exact class
string `holding-detail-stats-card.tsx`'s four figures and
`portfolio-overview-section.tsx`'s figures both use), inside its own
dedicated summary `Card`, at the top of the page — the same visual and
structural role as Investments' now-fixed stat grid and Debt's own
already-correctly-wired per-item balance figure in `debt-card.tsx` (`grep`
confirms `debt-card.tsx` imports and uses `AnimatedNumber` for its own
per-debt balance, at line 164-166 — only the page-level *aggregate* figure
was missed).

**This is squarely in AC6's own named scope.** Number Counters AC6 names,
verbatim: *"Debt (`/debt`, balance/payoff figures)"* — no narrower carve-out
distinguishes a per-card balance from a page-level aggregate balance, and
this capability's own AC1 explicitly defines scope "by the formatting
pipeline a figure flows through, not by which component happens to render it
today," which this figure clearly satisfies (a headline, not row-level,
`formatCurrency`-driven figure — the identical "headline, in its own summary
card" shape as the already-fixed Investments stat grid, not a `Transactions`
row-level exclusion under AC7).

**Confirmed pre-existing, not a regression of this fix commit.**
`git log --all -- "src/app/(dashboard)/debt/page.tsx"` shows this file was
last touched in Phase 4c (`4851d30`, the currency-display fix that threaded
`userPreference.currencyDisplay` into this exact line) — it has not been
touched at all during Phase 5b, by the original Number Counters
implementation, the first Bug Hunter pass, or this fix commit. The first
pass's own Section 4 spot-check claimed Debt was among the "four of the six
plain-`<span>` surfaces... confirmed correctly wired via direct grep/read" —
that grep evidently matched `debt-card.tsx`'s own already-correct balance
figure and did not separately check the page-level aggregate, an
incomplete-sweep gap of the same shape as the two the first pass itself
caught, just one level removed.

**A quick negative check on the same pattern elsewhere:** the equivalent
page-level aggregate slot does not exist as a similarly-missed gap on
Accounts (`accounts/page.tsx`, read in full: no page-level summary card at
all, only `AccountCard`'s own already-wired per-account balances),
Investments (`portfolio-overview-section.tsx` confirmed wired), Recurring
Income (`expected-upcoming-income-card.tsx` confirmed wired), Budgeting
(`budget-summary-cards.tsx` confirmed wired), or Financial Goals list
(`financial-goal-card.tsx` confirmed wired) — Debt's own page is the one
outlier with this exact "page-level aggregate card, separate from its list
items' own cards" shape left unwired.

**Verdict: does not hold. Blocking**, on the same Definition-of-Done grounds
the first pass's own finding was blocking.

---

## 4. Automated checks — re-run fresh, live, by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — identical
  count to both prior passes, consistent with this fix commit and this
  pass's own new finding both being production-code/display-layer only, with
  no unit-tested surface touched.
- `npm run seed:e2e` → ran fresh; `tests/e2e/support/fixture-ids.json`
  regenerated with real ids, then restored to its committed placeholder form
  afterward (confirmed via `git status` showing no diff on that file at the
  end of this review).
- `npx playwright test accessibility --project=desktop --workers=1
  --reporter=list` → **45/45 passing**, a single clean run (Section 2); no
  flake observed, so no second run was needed per this pass's own
  instructions.
- `git status`/`git log` — working tree clean at review start; at review end,
  only the expected auto-generated `docs/testing/e2e/accessibility-report.md`
  timestamp diff remains (accepted per this project's established precedent,
  `phase-5a-second-pass.md` §1), `fixture-ids.json` confirmed restored.
  `HEAD` at `8a5d89a`, matching this review's stated scope.

---

## 5. Security / Performance / Bug Hunter sign-offs — still unaffected, including by this pass's own new finding

`8a5d89a`'s `git diff --stat` against its parent touches only
`docs/testing/e2e/accessibility-report.md` (auto-generated), the two named
detail-route files, one new feature file
(`holding-detail-stats-card.tsx`, plain serializable props only — the
identical shape already reviewed for `dashboard-animated-stat-value.tsx`/
`goal-detail-progress-card.tsx`), and `tests/e2e/support/axe.ts` (test-only)
— no new Server Action, Route Handler, API route, or query-layer file, no
new dependency. The first-pass gate's Security Architect and Performance
Engineer APPROVE verdicts (`docs/security/phase-5b-security-review.md`,
`docs/performance/phase-5b-performance-review.md`) hold, unaffected, exactly
as the first pass's own Sections 5-6 already established for the rest of
this phase's commits.

This pass's own new finding (Section 3) is a pure display-layer omission —
an existing, already-fetched, already-rendered number rendered via one
formatting call instead of two (`formatCurrency(...)` vs.
`<AnimatedNumber ... format={formatCurrency} />`) — with no new data
exposure, no new route, and no new dependency of its own once fixed (the fix
pattern is the same `AnimatedNumber` wrap already used everywhere else on
this exact page). It does not reopen either team's review scope.

---

## Release Manager Decision (second pass)

**REJECT. Phase 5b is still not closed.**

The specific fix this pass was scoped to re-check — the two Number Counters
surfaces named in the first pass's blocking finding — is genuine, sound, and
independently confirmed both by source review and by live browser
verification against the real seeded database (Section 1). The `axe.ts`
flake mitigation is correctly reasoned and holds under a fresh, clean 45/45
Playwright run (Section 2).

But this pass's own required spot-check for other gaps (per its own
charter) found a third, previously-uncaught instance of the identical
defect shape: **Debt's own `/debt` page-level "Total active debt" summary
figure was never wired to `AnimatedNumber`, in this phase or any prior
one** (Section 3). This is not a new regression introduced by `8a5d89a` — it
predates this phase entirely — but it means Number Counters' binding
Definition of Done ("all ten [AC6] surfaces... each confirmed to animate")
still does not hold, for the third time this same capability has produced
this exact "a named surface skipped in full" defect shape (after the
already-fixed Savings Goal detail finding and the first pass's own
two-surface finding). Per this project's own standing "trust but verify"
discipline, this is a genuine, confirmed gap, not a nitpick, and this
release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into `debt/page.tsx`'s
"Total active debt" figure — a small, low-risk, mechanical fix, reusing the
identical inline pattern `income-stream-detail-client.tsx` just used (this
file is already a Server Component with the figure computed inline, closer
in shape to `income-stream-detail-client.tsx`'s pre-fix state than to
Investments'/Goals' extraction cases — though since `debt/page.tsx` is a
Server Component, not already a Client Component, the correct fix is a small
Client Component boundary extraction of just this one summary card, mirroring
`goal-detail-progress-card.tsx`/`holding-detail-stats-card.tsx`'s established
pattern, not a whole-page conversion). **Strongly recommended, not required:**
before the next re-review, run one exhaustive, systematic pass over all ten
AC6 surfaces with a per-component recorded pass/fail (the Definition of Done
has asked for this artifact since this capability's spec was written, and
its continued absence is the root cause all three instances of this same
defect shape went uncaught until an ad hoc spot-check happened to find each
one) — so a fourth recurrence is structurally prevented rather than caught
by chance on a future pass.

Phase 5b is not closed. Phase 5, and the roadmap's original three-workstream
stub (motion/transitions, accessibility, responsive/mobile), remain open
pending this fix and a follow-up Release Manager pass.
