# Phase 5b Release Notes — Third Pass (Targeted Re-Check)

**Reviewer:** Release Manager
**Scope:** narrow re-check of the second pass's (`docs/release/phase-5b-second-pass.md`)
sole blocking finding (Section 3: Debt's own `/debt` page-level "Total active
debt" summary figure never wired to `AnimatedNumber`) and the proactive fix
this same commit went on to make (Transaction detail's headline amount), per
commit `34fcae7` ("Phase 5b: close Release Manager second-pass REJECT — Debt
aggregate + proactive Transaction detail fix"), already on `origin/master`.
Security Architect and Performance Engineer sign-offs are re-confirmed
unaffected below (Section 5), not re-litigated in full, per this pass's own
charter — mirroring the second pass's own scoping exactly.

This pass's own explicit instructions also required an independent sweep —
not merely trusting the fix commit's own claim that its sweep was
exhaustive. That independent sweep found one more: **Budgeting's
`BudgetHealthScoreBadge` (`src/features/budgeting/components/
budget-health-score-badge.tsx`) — rendered on both `/budgeting` (AC6's
"summary cards") and the Dashboard (AC6's own named surface) — has never been
wired to `AnimatedNumber`, and its own numeric score renders as a static,
unformatted `{score.score}`.** This is the fourth instance of the identical
"named AC6 surface skipped in full" defect shape this phase has now
produced. See Section 3.

**Decision: REJECT. Phase 5b is still not closed.** The Debt-aggregate fix
this pass was scoped to verify is genuine and holds (Section 1), and the
proactive Transaction-detail fix is likewise genuine and correctly shaped
(Section 2) — both confirmed by direct source read and live browser
verification against the real seeded database. But this pass's own required
independent sweep (not a rubber-stamp of the fix commit's own claimed
sweep) found a fourth, previously-uncaught instance of the same defect
shape, so Number Counters' binding Definition of Done ("all ten [AC6]
surfaces... each confirmed to animate") still does not hold.

---

## 1. Debt's "Total active debt" fix — CONFIRMED FIXED, independently re-derived and live-verified

Read `src/app/(dashboard)/debt/page.tsx` and the new
`src/features/debt/components/total-active-debt-card.tsx` in full, and
`git show 34fcae7` for both diffs directly (not just the post-fix state).

`debt/page.tsx` remains a Server Component (unchanged fetch shape — still
resolves `getDebts`/`getAccounts`/`getUserPreference` directly via
`Promise.all`), and now delegates the summary card entirely to a new Client
Component:

```tsx
<TotalActiveDebtCard
  totalActiveBalance={totalActiveBalance}
  currencyDisplay={userPreference.currencyDisplay}
/>
```

`TotalActiveDebtCard` receives only two plain, serializable primitives (a
`number` and a `string`) — no function crosses the Server/Client boundary,
correctly mirroring `goal-detail-progress-card.tsx`/
`holding-detail-stats-card.tsx`'s established fix pattern (confirmed by
direct side-by-side read: identical `"use client"` + closure-over-
`currencyDisplay` + `Card`/`CardContent` shape). The figure is wrapped:

```tsx
<AnimatedNumber value={totalActiveBalance} format={formatCurrency} />
```

where `formatCurrency` is a local closure over `formatCurrencyWithDisplay`
(`@/lib/utils`) bound to the passed-in `currencyDisplay` — the same real
formatting pipeline used everywhere else, no second/parallel formatting
path introduced.

**Live-verified**, not just source-read: ran `npm run seed:e2e` fresh, then
an ad-hoc, throwaway Playwright script (Node + `playwright`'s `chromium`
launcher, logged in via the real `/login` UI form — never committed, per
this role's own "never edits `tests/`" boundary) that sampled the "Total
active debt" figure's rendered text every ~60ms immediately after
navigating to `/debt`:

```
$5,000.00 -> $0.00 -> $1,105.01 -> $2,003.08 -> $2,794.19 -> $3,350.69 ->
$4,061.01 -> $4,503.45 -> $4,821.31 -> $4,964.37 -> $5,000.00
```

A genuine, monotonic (after the documented unconditional-correct-first-frame,
per `animated-number.tsx`'s own reduced-motion-race fix) count-up settling
at the true total, not a static render.

**Verdict: holds.**

---

## 2. Transaction detail's headline amount — proactive fix, CONFIRMED genuinely in scope and correctly shaped

Read `src/app/(dashboard)/transactions/[id]/transaction-detail-client.tsx`
in full, before and after the diff.

This file was already a Client Component (pre-existing `"use client"`), so
this is a trivial in-place wrap, not a new boundary extraction:

```tsx
{isExpense ? "-" : "+"}
<AnimatedNumber value={Math.abs(transaction.amount)} format={formatCurrency} />
```

`formatCurrency` is `useFormatCurrency()`'s return value, already used
elsewhere in this same file — no second formatting path.

**Scope reasoning independently re-checked, not just trusted:** AC7
excludes "Transactions' table/card rows" by name, reasoned on "one line
among many... visual noise on this app's highest-interaction-frequency
surface." A single transaction's own detail page is not a row among
many — it is the one and only headline figure on that page, structurally
identical to the already-in-scope Bills detail route
(`bill-detail-client.tsx`, confirmed in the first pass's own Section 4).
This reasoning holds and is not a stretch: the commit's own message states
the same conclusion, and independent re-derivation here reaches the
identical result.

**Live-verified:** sampling `/transactions/[id]`'s headline amount over the
same live run:

```
-$54.32 -> -$7.31 -> -$16.35 -> -$24.68 -> -$32.09 -> -$40.38 -> -$45.85 ->
-$50.18 -> -$53.18 -> -$54.32
```

A genuine count-up (from the unconditional-correct-first-frame down to
near-zero and back up), settling at the true amount, not a static render.

**`strategy-comparison.tsx`'s "total interest paid" figure** — checked
directly, not merely trusted from the commit message. Read
`src/features/debt/components/strategy-comparison.tsx` in full: the
panel's actual headline is `formatMonthsToDebtFree(...)`, styled
`font-heading text-xl font-semibold` (the app's established headline
signature); "total interest paid" sits in its own separate line below,
styled `text-sm font-medium` with a `text-xs text-muted-foreground` caption
label — a secondary annotation under the real headline, not a second
headline of its own. Correctly out of scope under the same primary/
secondary distinction `debt-card.tsx`'s own un-animated "APR / minimum
payment" and "total interest remaining" captions already establish.
**Verdict: holds, correctly not fixed.**

---

## 3. NEW FINDING, BLOCKING — `BudgetHealthScoreBadge`'s own numeric score was never wired, on either of its two rendered surfaces

Per this pass's own charter (an independent sweep, not a rubber-stamp of
the fix commit's own claimed-exhaustive sweep), every headline-styled
(`text-xl`/`text-2xl`/`text-lg font-semibold`) figure under `src/features`
was re-enumerated and cross-checked against `AnimatedNumber` usage in the
same file, and every remaining plain `formatCurrency(` call under
`src/app/(dashboard)` was re-confirmed absent (both grep classes the fix
commit itself used) — but the sweep was widened past `formatCurrency`
specifically, since a percentage/score figure need not flow through that
function name at all to be in scope (AC1.4: "goal/budget/debt-payoff
progress percentages and the Financial Health Score's numeric score...one
consistent counting treatment covers both currency and percentage headline
figures app-wide").

**`src/features/budgeting/components/budget-health-score-badge.tsx`** (read
in full): renders `BudgetHealthScore.score` (a plain `number`, 0-100) as:

```tsx
<span className="font-heading text-2xl font-semibold text-foreground">
  {score.score}
</span>
```

— no formatting function of any kind, no `AnimatedNumber` import anywhere
in the file, and critically: **no `"use client"` directive** — this
component is still a Server Component today.

This is not a novel or ambiguous figure shape. It is the exact sibling of
`src/features/financial-health-score/components/financial-health-score-badge.tsx`,
which this very phase already fixed — that file's own doc comment states
verbatim: *"Mirrors `features/budgeting/components/
budget-health-score-badge.tsx`'s exact `Card`/`CardHeader`/`CardContent`
structure and null/banded-label handling... so the two 'Health Score'
surfaces read as siblings"*, and separately: *"**Phase 5b addition (Number
Counters):** gained its own `"use client"` directive here — it was a Server
Component before this phase... Wiring `AnimatedNumber`... requires it."*
The sibling received exactly this treatment during this phase; this file
did not. Side-by-side, `FinancialHealthScoreBadge`'s fixed version:

```tsx
<AnimatedNumber
  value={breakdown.score}
  format={(n) => Math.round(n).toString()}
  className="font-heading text-2xl font-semibold text-foreground"
/>
```

— the identical `className`, the identical `Card`/`CardHeader`/
`CardContent` structure, the identical null/banded-label branching, on a
structurally identical 0-100-plus-band score. `BudgetHealthScoreBadge` was
simply never given the same fix.

**Squarely in AC6's own named scope, on two separate named surfaces, not
one.** `BudgetHealthScoreBadge` is rendered from two call sites, both
independently AC6-named:

- `src/app/(dashboard)/budgeting/page.tsx` (`<BudgetHealthScoreBadge
  score={healthScore} />`) — AC6 names *"Budgeting (`/budgeting`,
  category-row progress + summary cards)"*; this badge is exactly that
  page's own health-score summary card.
- `src/app/(dashboard)/_lib/dashboard-card-groups.tsx` (`render: () =>
  <BudgetHealthScoreBadge score={data.budgetHealthScore} />`) — AC6 names
  *"Dashboard (`/`, stat cards + Financial Health Score ring)"*; this is a
  second, separate stat card on that exact surface.

**Live-verified on both surfaces, not just source-read.** Ran the same
throwaway Playwright script against the real seeded database (logged in via
`/login`), sampling the badge's full text every 80ms for over a second on
each page:

- `/budgeting`: `"Budget Health Score\n100\nGood"` — **identical on every
  one of 15 samples across 1,120ms**, no transition at any point.
- `/` (Dashboard): `"Budget Health Score\n100\nGood"` — **identical on
  every one of 12 samples across 880ms**, no transition at any point.

Contrast this directly against the two genuinely-fixed figures sampled in
the same session (Sections 1-2 above), both of which show a clear,
multi-step monotonic count-up over their first ~500-700ms. This figure
shows no such behavior on either rendered surface — it is a static render,
confirmed live, not a plausible-looking source-code omission alone.

**Why the fix commit's own sweep did not catch this.** The commit message
states its sweep methodology explicitly: grepping `page.tsx`/`*-client.tsx`
files for remaining plain `formatCurrency(` calls, plus a features-wide
grep for headline-styled classes *co-located with a `formatCurrency` call*.
`BudgetHealthScoreBadge`'s score is not formatted via `formatCurrency` at
all — it is a raw, unformatted `number` — so neither grep, exactly as
literally described, would ever have matched this file. This is a
methodological blind spot in that sweep, not a spot the sweep checked and
reasoned past (contrast with `strategy-comparison.tsx`, which the same
commit did check and correctly ruled out — Section 2 above).

**A quick negative check on the same pattern elsewhere:** this pass also
checked `holding-detail-stats-card.tsx`'s `gainLossPercent` parenthetical
(`" (+12.3%)"`, appended inline after the already-animated gain/loss dollar
figure) for the same class of gap. That figure is judged correctly
out of scope, not a fifth instance: it is not an independent headline
figure but a same-span annotation of the dollar amount that is already
animating, it is never animated anywhere else in this codebase in the
identical shape (the row-level `holding-row.tsx` treats it identically),
and — unlike `BudgetHealthScoreBadge`'s score — it has no already-fixed
sibling surface establishing that this exact figure shape is expected to
animate. This is a judgment call, noted here for transparency, but not
blocking; `BudgetHealthScoreBadge` is not a judgment call — it is a
same-file-shape, same-two-surfaces, live-confirmed-static sibling of a
figure this very phase already fixed.

**Verdict: does not hold. Blocking**, on the same Definition-of-Done
grounds the prior two passes' own findings were blocking.

---

## 4. Automated checks — re-run fresh, live, by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — identical
  count to all three passes; this fix commit and this pass's own new
  finding are both production-code/display-layer only, with no unit-tested
  surface touched.
- `npm run seed:e2e` → ran fresh; `tests/e2e/support/fixture-ids.json`
  regenerated with real ids, then restored to its committed placeholder form
  afterward (`git checkout -- tests/e2e/support/fixture-ids.json`,
  confirmed via `git status` showing no diff on that file at the end of this
  review).
- `npx playwright test accessibility --project=desktop --workers=1
  --reporter=list` → **45/45 passing**, a single clean run (2 setup logins +
  9 `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
  `route-a11y.spec.ts`); no flake observed.
- `git status`/`git log` — working tree clean at review start; at review
  end, only the expected auto-generated `docs/testing/e2e/
  accessibility-report.md` timestamp diff remains (accepted per this
  project's established precedent). `HEAD` at `34fcae7`, matching this
  review's stated scope.

---

## 5. Security / Performance sign-offs — still unaffected, confirmed via direct `git diff --stat`, not trusted from the prompt

`git diff --stat b9fc713..34fcae7` (excluding `docs/` and the
auto-regenerated `fixture-ids.json`) touches exactly three source files:
`debt/page.tsx`, `transaction-detail-client.tsx`, and the one new
`total-active-debt-card.tsx` — no new Server Action, Route Handler, API
route, query-layer file, or dependency. The first- and second-pass gates'
Security Architect and Performance Engineer APPROVE verdicts
(`docs/security/phase-5b-security-review.md`,
`docs/performance/phase-5b-performance-review.md`) hold, unaffected.

This pass's own new finding (Section 3) is likewise a pure display-layer
omission on an already-fetched, already-rendered number — adding
`"use client"` plus an `AnimatedNumber` wrap, the identical shape already
reviewed for `financial-health-score-badge.tsx` itself. It introduces no
new data exposure, no new route, and no new dependency once fixed, and does
not reopen either team's review scope.

---

## Release Manager Decision (third pass)

**REJECT. Phase 5b is still not closed.**

The specific fix this pass was scoped to re-check — Debt's page-level
"Total active debt" aggregate — is genuine, sound, and independently
confirmed both by source review and by live browser verification against
the real seeded database (Section 1). The proactive Transaction-detail fix
this same commit went on to make is likewise genuine, correctly reasoned as
in-scope, and live-verified (Section 2). `strategy-comparison.tsx`'s
"total interest paid" figure was independently re-checked and confirmed
correctly left out of scope.

But this pass's own required independent sweep — not a rubber-stamp of the
fix commit's own claim that its sweep was exhaustive — found a fourth,
previously-uncaught instance of the identical defect shape:
**`BudgetHealthScoreBadge`'s own numeric score, rendered on both `/budgeting`
and the Dashboard, was never wired to `AnimatedNumber`, despite its own
explicitly-documented sibling (`FinancialHealthScoreBadge`) receiving
exactly this fix earlier in this same phase.** Live-sampled on both
surfaces, the figure is confirmed static across more than a full second of
sampling, in direct contrast to the two genuinely-fixed figures sampled in
the same session. Number Counters' binding Definition of Done ("all ten
[AC6] surfaces... each confirmed to animate") still does not hold. Per this
project's own standing "trust but verify" discipline — now exercised for a
fourth time on this exact capability — this is a genuine, confirmed gap,
not a nitpick, and this release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into
`budget-health-score-badge.tsx`'s score, reusing the exact fix shape already
proven on its own sibling file (`financial-health-score-badge.tsx`):

1. Add `"use client"` at the top of the file (required — `AnimatedNumber`
   is a Client Component, and this file is currently rendered from Server
   Component call sites on both `/budgeting` and the Dashboard).
2. Import `AnimatedNumber` from `@/components/shared/motion`.
3. Replace the plain `{score.score}` span with:
   ```tsx
   <AnimatedNumber
     value={score.score}
     format={(n) => Math.round(n).toString()}
     className="font-heading text-2xl font-semibold text-foreground"
   />
   ```
   — the identical `format`/`className` shape already shipped in
   `financial-health-score-badge.tsx`.
4. No Server/Client boundary extraction is needed (unlike the Debt/Goals/
   Investments fixes) — `score` already arrives as a plain, already-
   serializable prop at both call sites; only the component's own directive
   and internal rendering change.

**Strongly recommended, not required, before the next re-review:** the
per-component AC6 pass/fail checklist this Definition of Done has now asked
for across three consecutive passes remains unproduced, and its continued
absence is demonstrably the root cause all four instances of this exact
defect shape went uncaught until an ad hoc spot-check happened to find each
one — including this pass's own finding, which fell outside the specific
grep pattern ("`formatCurrency` co-located with a headline class") the
fix commit's own sweep used, precisely because a percentage/score figure
need not be named `formatCurrency` to be in AC6's scope. A pass/fail
checklist enumerating all ten AC6 surfaces by their actual rendered
figures — not by which formatting function each one happens to call —
would have caught this the first time, not the fourth.

Phase 5b is not closed. Phase 5, and the roadmap's original three-workstream
stub (motion/transitions, accessibility, responsive/mobile), remain open
pending this fix and a follow-up (fourth) Release Manager pass.
