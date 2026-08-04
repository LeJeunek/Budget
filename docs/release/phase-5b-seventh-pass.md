# Phase 5b Release Notes — Seventh Pass (Targeted Re-Check + Final Stale-Dismissal Audit)

**Reviewer:** Release Manager
**Scope:** re-check of the sixth pass's (`docs/release/phase-5b-sixth-pass.md`)
sole blocking finding (`strategy-comparison.tsx`'s "total interest paid"
figure, whose "correctly out of scope" dismissal had gone stale once the same
commit wired `debt-card.tsx`'s previously-un-animated sibling captions), per
commit `17e4336` ("Phase 5b review gate: Release Manager sixth-pass REJECT +
fix"), already on `origin/master`. Security Architect and Performance
Engineer sign-offs are re-confirmed unaffected below (Section 4), not
re-litigated in full, per this pass's own charter — mirroring the second
through sixth passes' own scoping.

This pass's own explicit charter also required one more genuinely careful
re-read of every "left correctly out of scope" judgment call made across all
six prior passes' own reasoning — not a new grep sweep, but a targeted check
for the exact same defect class the sixth pass itself found: a dismissal
whose supporting premise was quietly invalidated by a *later* fix in this
same review chain. That re-read found no further instance. See Section 3.

**Decision: APPROVE. Phase 5b is closed, and Phase 5 is complete.** The
sixth pass's fix is genuine, correctly shaped, and independently
live-verified against the real seeded database — the exact figure and exact
dollar value the sixth pass recorded static (`$723.77`) now genuinely counts
up on the same fixture (Section 1). This pass's own required stale-dismissal
audit, applied with the same rigor the sixth pass demonstrated, found no
eighth instance of this defect class, in this figure's own remaining
citations or in any other surface named by this pass's own charter (Section
3). All automated checks pass fresh, live (Section 2). Security and
Performance sign-offs hold, unaffected — the entire fix is a two-line,
one-file source diff (Section 4).

---

## 1. The named fix — `strategy-comparison.tsx`'s "total interest paid" figure — CONFIRMED FIXED, independently re-derived and live-verified

Read `src/features/debt/components/strategy-comparison.tsx` in full and
`git show 17e4336 -- src/features/debt/components/strategy-comparison.tsx`
directly. The fix is exactly the trivial in-place wrap the sixth pass's own
required-fix steps specified:

```diff
+import { AnimatedNumber } from "@/components/shared/motion"
...
       <div className="flex flex-col gap-0.5">
         <span className="text-sm font-medium text-foreground">
-          {formatCurrency(summary.totalInterestPaid)}
+          <AnimatedNumber value={summary.totalInterestPaid} format={formatCurrency} />
         </span>
         <span className="text-xs text-muted-foreground">total interest paid</span>
       </div>
```

`formatCurrency` is the file's own pre-existing `useFormatCurrency()` closure
(line 132, unchanged), already used by this same `StrategyPanel` component's
sibling months-to-debt-free/debt-order rendering — no second, parallel
formatting path introduced, and `AnimatedNumber` is imported from the shared
`@/components/shared/motion` module, not a local reimplementation. The file
already carried `"use client"` before this change (confirmed by direct read
of the full file, unchanged by this diff) — no new Server/Client boundary
was crossed, and no function newly crosses one.

**Live-verified**, not just source-read. Ran `npm run seed:e2e` fresh, then
an ad-hoc, throwaway Playwright script (Node + the repo's own installed
`playwright` package's `chromium` launcher, logged in via the real `/login`
UI form — never committed to the repo, per this role's own "never edits
`tests/`" boundary), navigating fresh to `/debt` and sampling the first
strategy panel's "total interest paid" figure every ~65ms immediately after
navigation:

```
$723.77 -> $723.77 -> $723.77 -> $61.55 -> $177.75 -> $289.95 -> $393.92 ->
$466.30 -> $549.72 -> $620.65 -> $676.70 -> $705.97 -> $723.63 -> $723.77 ->
$723.77 -> $723.77 -> $723.77 -> $723.77 -> $723.77 -> $723.77
```

11 distinct values across 20 samples spanning ~1.27s — a genuine, monotonic
count-up from the documented unconditional-correct-first-frame (per
`animated-number.tsx`'s own reduced-motion-race fix, matching every other
already-fixed figure's sampled shape across all six prior passes) down
through a real tween and back up, settling at the true value. This is the
**exact same fixture account and the exact same static value** the sixth
pass's own report recorded as fully flat across eighteen samples
(`$723.77 (x18 samples, ~1080ms, fully static)`) — confirming this is not a
different account, a different figure, or a coincidentally-already-correct
value, but the identical previously-broken figure now genuinely animating.

`tests/e2e/support/fixture-ids.json` was restored to its committed
placeholder form immediately afterward (`git checkout --
tests/e2e/support/fixture-ids.json`, confirmed via `git status` showing no
diff on that file at that point in the review).

**Verdict: holds.** The sixth pass's blocking finding is genuinely fixed.

---

## 2. Automated checks — re-run fresh, live, by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — identical
  count to all six prior passes; this fix commit is production-code/
  display-layer only, with no unit-tested surface touched.
- `npm run seed:e2e` → ran fresh twice (once for the throwaway live-sample
  script, once immediately before the Playwright run below);
  `tests/e2e/support/fixture-ids.json` restored to its committed placeholder
  form after each run (`git checkout --
  tests/e2e/support/fixture-ids.json`, confirmed via `git status` showing no
  diff on that file at the end of this review).
- `npx playwright test accessibility --project=desktop --workers=1
  --reporter=list` → **45/45 passing**, a single clean run (2 setup logins +
  9 `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
  `route-a11y.spec.ts`, including "Debt Tracker," the route this pass's own
  re-verification touches; this suite asserts zero critical/serious axe
  violations and the reduced-motion end-state contract, not the Number
  Counters mount-animation contract, so its passing does not contradict or
  substitute for this pass's own live-sampling verification in Section 1 —
  the same distinction every prior pass's own equivalent section already
  drew). No flake observed.
- `git status`/`git log` — working tree clean at review start; at review
  end, only the expected auto-generated `docs/testing/e2e/
  accessibility-report.md` timestamp diff remains (accepted per this
  project's established precedent, `phase-5a-second-pass.md` §1),
  `fixture-ids.json` confirmed restored. `HEAD` at `17e4336`, matching this
  review's stated scope.

---

## 3. Final stale-dismissal audit — every remaining "correctly out of scope" judgment call re-checked against the current state of the codebase; no eighth instance found

Per this pass's own charter, this section deliberately does **not** re-run a
fresh grep sweep for new, previously-undiscovered surfaces (six passes' worth
of progressively-broadened sweeps, plus the sixth pass's own two dedicated
sweep sections, already did that work exhaustively). Instead, it re-derives
whether any *specific piece of reasoning* that justified a dismissal still
holds, given the one thing that changed since the sixth pass's own review:
`strategy-comparison.tsx`'s figure moved from "un-animated, cited as
precedent for excluding other figures" to "animated."

### 3.1 Which dismissals actually cited `strategy-comparison.tsx` or `debt-card.tsx`'s pre-`12d1d52` un-animated captions as supporting precedent

A direct search across all six prior passes' own text (not a source-code
grep) for every citation of `strategy-comparison.tsx`'s interest-paid caption
or `debt-card.tsx`'s APR/interest-remaining captions used as a *justification*
for excluding a *different* figure — the exact shape of bug the sixth pass
found — turns up exactly two, both already resolved:

1. **The third pass's own dismissal of `strategy-comparison.tsx`'s own
   figure**, citing `debt-card.tsx`'s then-un-animated captions as its
   precedent. This is the finding the sixth pass caught and this commit
   fixed (Section 1 above). **Resolved.**
2. **The fifth pass's own non-blocking treatment of
   `financial-goal-card.tsx`'s `percentPaidOff` caption**
   (`DebtPayoffProgress` branch), which explicitly reasoned: *"`percentPaidOff`
   ... sits below an already-fully-wired dollar-figure headline exactly the
   way `debt-card.tsx`'s own un-animated APR caption and
   `strategy-comparison.tsx`'s interest-paid caption already do — is
   correctly left out of scope on that same established secondary-caption
   reasoning."* This citation went stale the moment `12d1d52` wired
   `debt-card.tsx`'s captions — the identical mechanism as the sixth pass's
   own finding, on a second figure. **Independently confirmed already
   resolved**, not a live gap: `12d1d52`'s own proactive sweep (audited in
   full by the sixth pass's own Section 2.4, re-confirmed here by direct
   read of `src/features/financial-goals/components/financial-goal-card.tsx`)
   wrapped both `DebtPayoffProgress`'s `"X% paid off"` caption *and*
   `SavingsRateProgress`'s `"target X%"` caption in `AnimatedNumber` in the
   same commit that (unknowingly, per the sixth pass's own finding) left
   `strategy-comparison.tsx` stale. Confirmed directly:

   ```tsx
   <AnimatedNumber value={percentPaidOff} format={(n) => `${Math.round(n)}%`} />% paid off
   ```

   (read in full in `financial-goal-card.tsx`'s current source). This
   citation's own stale premise never produced a live gap, because the
   figure it was protecting was independently fixed in the same commit that
   created the staleness — a coincidence worth recording, not a second
   instance requiring a fix.

No other citation of either figure as supporting precedent for a *different*
dismissal was found anywhere in the six prior passes' own text.

### 3.2 `holding-detail-stats-card.tsx`'s `gainLossPercent` inline parenthetical — re-derived from scratch, not carried forward on citation alone

This is the one remaining dismissal in this phase's own chain that shares
the *structural* shape of the bug class this pass is auditing for (a
same-span percentage annotation left unwired, justified partly by "no
sibling establishes this shape should animate") — worth re-deriving fully
rather than trusting its own prior "holds" verdict.

Re-read `src/features/investments/components/holding-detail-stats-card.tsx`
in full: `gainLossPercent` (the `" (+12.3%)"` parenthetical appended inside
the same `<span>` as the now-`AnimatedNumber`-wrapped `gainLossAmount`) is
still plain, unformatted text — unchanged by any commit since the third pass
first raised it (`git log --all` for this file shows no touch since the
second pass's own original fix).

The third pass's dismissal rested on two premises. Both independently
re-checked against the codebase's *current* state, not trusted from the
prior pass's own summary:

- **"It is never animated anywhere else in this codebase in the identical
  shape (the row-level `holding-row.tsx` treats it identically)."** Re-read
  `src/features/investments/components/holding-row.tsx` directly: its own
  `gainLossPercent` parenthetical (lines 126-127) is unchanged, still plain
  text — confirmed still true, not stale.
- **"Unlike `BudgetHealthScoreBadge`'s score, it has no already-fixed sibling
  surface establishing that this exact figure shape is expected to
  animate."** Re-checked whether any commit since the third pass wired a
  same-span, parenthetical, sign-adjacent percentage annotation of an
  already-animating dollar figure anywhere else in the app. Direct read of
  `portfolio-overview-section.tsx` (Investments' own list-page summary, the
  one file structurally closest to `holding-detail-stats-card.tsx`) confirms
  it renders no percentage figure of any kind alongside its own animated
  gain/loss dollar amount — only the dollar figure. No sibling of this exact
  shape exists anywhere in the codebase today.

**Independently re-derived against AC4/AC6's own text, not against a prior
pass's summary**, for completeness: AC4 names its in-scope percentage
categories explicitly — *"goal/budget/debt-payoff progress percentages and
the Financial Health Score's numeric score."* An investment holding's
gain/loss percentage is not a goal, budget, or debt-payoff progress
percentage, and is not the Financial Health Score — it falls outside AC4's
own enumerated list, unlike every percentage figure this phase's chain has
found genuinely in scope (`budget-category-row.tsx`'s percent-used,
`financial-goal-card.tsx`'s three percentage captions). AC6's Investments
line (*"holding values/gains"*) is satisfied by `gainLossAmount`, which is
already wired; "gains" as stated does not separately, explicitly name a
percentage sub-figure the way Budgeting's "category-row progress" or
Financial Health Score's "the score itself plus subscores" do.

**Verdict: still holds, on independently re-derived grounds, not merely
carried forward.** This is a materially different case from
`strategy-comparison.tsx`'s: that figure's exclusion rested on a specific,
falsifiable comparison ("secondary captions like this one don't animate
elsewhere") whose supporting instances were later wired out from under it.
`gainLossPercent`'s exclusion rests on (a) a comparison whose supporting
instance (`holding-row.tsx`) is confirmed unchanged, and (b) an independent,
AC4-text-level reason with no dependency on any other figure's own wired
state at all. Neither premise has been invalidated by anything in this
chain, including this pass's own fix.

### 3.3 Transactions/Bills/Recurring-Income list rows, Analytics rows, Investments history lists — re-checked for the same dependency; none found

Per this pass's own charter, checked directly whether any of these
surfaces' own "row-level, correctly out of scope" reasoning depends on a
comparison to a sibling figure that has since been wired (rather than on
AC7's own named exclusion or a structural "dense table row" distinction,
neither of which depends on any other figure's wired state):

- **Every dismissal of this shape found across all six prior passes** (Bills'
  list page, `bill-list.tsx`/`upcoming-bills-list.tsx`/
  `occurrence-history-table.tsx`, `income-stream-list.tsx`,
  `irregular-event-history-list.tsx`, `holding-row.tsx`'s per-item shape,
  `expected-upcoming-income-card.tsx`'s per-source rows, Analytics'
  `subscriptions-list.tsx`/`top-merchants-list.tsx`/
  `largest-purchases-list.tsx`/`budget-vs-actual-table.tsx`,
  `budget-category-row.tsx`'s own allocated/spent/remaining figures,
  `split-dialog.tsx`, `notification-bell.tsx`, Settings' currency preview)
  is reasoned on one of three grounds: AC7's own named exclusion by surface,
  a structural "dense, multi-column, arbitrary-length row" distinction, or a
  content-type distinction (narrative sentence, hardcoded demo constant, PDF
  output). None of these cite a *specific other figure's un-animated state*
  as their own supporting evidence the way `strategy-comparison.tsx`'s
  dismissal did — they are definitional, not comparative, and therefore
  cannot go stale via a sibling being wired.
- **Directly re-confirmed, not merely re-cited:** `dividend-history-list.tsx`
  and `value-history-list.tsx` (Investments' own two "history" surfaces on
  the holding detail route, read in full for this pass — neither was
  individually named by any of the first six passes, though both fall
  squarely under the same established row-level `TableCell` exclusion every
  other history/list table in this app already uses). Both are read-only
  Server Components rendering dense `Table`/`TableCell` grids with no
  headline figure of their own — the same shape as `value-history-list.tsx`'s
  sibling `contribution-history-list.tsx`/`occurrence-history-table.tsx`,
  correctly excluded on the same structural grounds, unaffected by anything
  wired elsewhere in this phase.
- **Directly re-confirmed `portfolio-overview-section.tsx`'s own by-container
  table** (the one place in the codebase where a wired headline aggregate and
  an unwired row-level table share a single file): its own header comment
  states explicitly that its per-row `gainLossText(row.gainLoss, currency)`
  calls are "row-level, out of Number Counters' scope per AC7" by the
  file's own original design, not a comparison to any other file's state —
  confirming no table row anywhere in this codebase has ever been wired to
  `AnimatedNumber`, so the "row-level figures don't animate" premise
  every one of these dismissals relies on remains categorically true,
  unaffected by this or any prior fix commit in this chain.

**No eighth instance of the stale-dismissal defect class was found.**

---

## 4. Security / Performance sign-offs — still unaffected, confirmed via direct `git diff --stat`, not trusted from the prompt

`git diff --stat 12d1d52..17e4336` touches exactly four files:
`docs/release/phase-5b-checklist.md`, `docs/release/phase-5b-sixth-pass.md`
(both docs), the auto-generated `docs/testing/e2e/accessibility-report.md`,
and `src/features/debt/components/strategy-comparison.tsx`. Restricted to
`src/` alone, this is a **one-file, two-insertion/one-deletion change**
(`git diff --stat 12d1d52..17e4336 -- src/` → `1 file changed, 2
insertions(+), 1 deletion(-)`): one new import line plus one line's
`formatCurrency(...)` call replaced with an `AnimatedNumber` wrap of the
identical value through the identical formatting pipeline. No new Server
Action, Route Handler, API route, query-layer file, or dependency. The
first- through sixth-pass gates' Security Architect and Performance Engineer
APPROVE verdicts (`docs/security/phase-5b-security-review.md`,
`docs/performance/phase-5b-performance-review.md`) hold, unaffected — this is
the smallest single-figure fix this entire phase has produced, and it is a
pure display-layer change with no security or performance surface of its
own, matching every prior instance's fix shape exactly.

---

## 5. Risk register — re-confirmed coherent, no new dangling rows

`docs/planning/risk-register.md` rows #40, #44, #52, #53, #55–#59 — all
eight already confirmed coherent by the first pass (`phase-5b-notes.md` §7)
and re-confirmed unaffected by every subsequent pass. This pass's own fix
and audit introduce no new row-relevant fact: Section 1's fix is a
completeness gap closed, not a visual regression (row #52's own routing
condition, re-confirmed the same way every prior pass has); nothing in
Section 3's audit reopens any register row. No dangling or falsely-resolved
row found.

---

## Release Manager Decision (seventh pass)

**APPROVE.**

The sixth pass's named fix — wiring `AnimatedNumber` into
`strategy-comparison.tsx`'s "total interest paid" figure — is genuine, sound,
and independently confirmed both by direct source/diff review and by live
browser verification against the real seeded database, sampling the exact
same figure and the exact same previously-static dollar value
(`$723.77`) the sixth pass recorded, now genuinely counting up (Section 1).

This pass's own required final audit — a targeted re-check of every
"correctly out of scope" judgment call across all six prior passes' own
reasoning, specifically for the stale-precedent defect class the sixth pass
itself discovered — found no eighth instance. The only two citations of
`strategy-comparison.tsx`/`debt-card.tsx`'s pre-`12d1d52` un-animated state as
supporting precedent for a *different* dismissal are both already resolved:
the sixth pass's own finding (fixed by this commit), and the fifth pass's
`percentPaidOff`/`targetPercent` non-blocking note (independently fixed by
the same `12d1d52` sweep that created the staleness, before it could ever
surface as a live gap). `holding-detail-stats-card.tsx`'s `gainLossPercent`
parenthetical — the one remaining dismissal sharing this bug class's
structural shape — was re-derived from scratch against the codebase's
current state rather than trusted on citation, and both of its supporting
premises independently still hold (Section 3.2). Every row-level exclusion
this phase has produced (Transactions, Bills, Recurring Income, Analytics,
Investments' two history lists) rests on AC7's own named exclusion or a
structural distinction that does not depend on any other figure's wired
state, and therefore cannot go stale the way `strategy-comparison.tsx`'s did
(Section 3.3).

All automated checks pass fresh, live, on this exact commit:
`npm run typecheck` clean, `npm run lint` clean, `npx vitest run` 633/633,
and the full 45-test `accessibility` Playwright project clean with no flake
(Section 2). Security Architect and Performance Engineer sign-offs hold,
unaffected — the entire fix under this pass's review is a one-file,
two-insertion/one-deletion source diff with no new Server Action, Route
Handler, API route, query-layer file, or dependency (Section 4). The risk
register remains coherent (Section 5).

**This closes Phase 5b, and therefore Phase 5 in full.** Number Counters'
own Definition of Done — "all ten [AC6] surfaces... each confirmed to
animate," per-component evidence, not an aggregate claim — now genuinely
holds across all ten named surfaces and every named sub-clause within them,
after seven consecutive Release Manager passes and eight total instances of
this phase's own recurring "named-or-implied AC6 figure skipped" defect
shape (the Savings Goal detail finding, the first pass's two-surface
finding, the second pass's Debt aggregate finding, the third pass's
`BudgetHealthScoreBadge` finding, the fourth pass's Financial Health Score
headline finding, the fifth pass's `budget-category-row.tsx` percent-used
finding, the sixth pass's stale-dismissal finding on
`strategy-comparison.tsx`, and no ninth instance found by this pass's own
final audit). Reduced-Motion Foundation, Chart Transitions, Page
Transitions, Expandable Cards, and the Cross-Cutting GPU-Compositable-
Properties Bar were each independently confirmed sound across multiple
passes and remain unaffected by anything in this final fix. Security and
Performance sign-offs, produced early in this phase's own review-gate
sequence, hold unmodified through all seven passes and every one of the
fix commits that followed them.

Phase 5's original roadmap stub named three workstreams: motion/transitions,
accessibility, and responsive/mobile. Phase 5a (accessibility,
responsive/mobile) and Phase 5b (motion/transitions, Motion & Craft) are both
now shipped, audited, and signed off. **Phase 5, in full, is complete.**
