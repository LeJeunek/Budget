# Phase 5b Release Notes — Sixth Pass (Targeted Re-Check + Proactive-Sweep Audit)

**Reviewer:** Release Manager
**Scope:** re-check of the fifth pass's (`docs/release/phase-5b-fifth-pass.md`)
sole blocking finding (`budget-category-row.tsx`'s per-category "percent
used" label) AND a full audit of the same commit's own proactive, broader
sweep for the "secondary caption directly under an already-wired headline,
within the same per-item card" pattern, per commit `12d1d52` ("Phase 5b:
close Release Manager fifth-pass REJECT + proactive fix for a whole
recurring pattern class"), already on `origin/master`. Security Architect
and Performance Engineer sign-offs are re-confirmed unaffected below
(Section 6), not re-litigated in full, per this pass's own charter —
mirroring the second through fifth passes' own scoping.

This pass's own explicit charter asked for something beyond a rubber-stamp
on the named fix: (1) verify every file the commit touched is genuinely and
correctly shaped, not just present; (2) live-verify a representative sample
per file; (3) independently re-judge the commit's own "left correctly
unwired" list against AC7's actual reasoning, not trust the commit message's
own summary of it; (4) run one more genuinely independent sweep of the
codebase's remaining, not-yet-touched per-item card components for the same
pattern. That work found one genuine issue — not in a newly-discovered
surface, but in the commit's own "left correctly unwired" reasoning for a
figure it explicitly considered and excluded. See Section 3.

**Decision: REJECT. Phase 5b is still not closed.** The fifth pass's named
fix (`budget-category-row.tsx`'s percent-used label) is genuine and holds
(Section 1), and six of the seven proactively-fixed captions are genuine,
correctly shaped, and live-verified to animate (Section 2). But this pass's
own required independent judgment check on the commit's "left correctly
unwired" list found that **`strategy-comparison.tsx`'s "total interest
paid" figure — explicitly named and excluded in the commit's own message —
is not actually correctly out of scope.** The reasoning that justified its
exclusion in the third pass (and was repeated verbatim by this commit) no
longer holds, because this same commit invalidated its own supporting
precedent. See Section 3.

---

## 1. The named fix — `budget-category-row.tsx`'s percent-used label — CONFIRMED FIXED, independently re-derived and live-verified

Read `src/features/budgeting/components/budget-category-row.tsx` in full and
`git show 12d1d52 -- src/features/budgeting/components/budget-category-row.tsx`
directly. The fix is a trivial in-place wrap, exactly as the fifth pass's own
required-fix steps specified — no `"use client"` addition needed (the file
already carries one, pre-existing for its own input/blur handling):

```tsx
<AnimatedNumber
  value={line.percentUsed as number}
  format={(n) => `${Math.round(n)}%`}
/>
```

replacing the prior plain `{Math.round(line.percentUsed as number)}%` text
node, inside the same `<span>` that still carries the row's own
over-budget-aware `className`. `AnimatedNumber` is imported from
`@/components/shared/motion`, the shared primitive, no second formatting
path introduced.

**Live-verified**, not just source-read. Ran `npm run seed:e2e` fresh, then
an ad-hoc, throwaway Playwright script (Node + the repo's own installed
`playwright` package's `chromium` launcher, logged in via the real `/login`
UI form — never committed to the repo, per this role's own "never edits
`tests/`" boundary) that navigated to `/budgeting` and sampled the first
category row's percent-used label (`span.tabular-nums`, an unambiguous
selector on this route) every 60ms:

```
14% -> 0% -> 3% -> 6% -> 8% -> 10% -> 12% -> 13% -> 13% -> 14% -> 14% -> ...
```

A genuine, monotonic count-up from the documented
unconditional-correct-first-frame down to 0 and back up (per
`animated-number.tsx`'s own reduced-motion-race fix, matching every other
already-fixed figure's sampled shape across all five prior passes), settling
at the true value — not a static render.

**Verdict: holds.** The fifth pass's blocking finding is genuinely fixed.

---

## 2. The proactive seven-instance sweep — six of seven CONFIRMED genuine and correctly shaped, live-verified

Read every file `12d1d52` touched in full, and `git show 12d1d52` for the
complete diff, not just the post-fix state. For each: confirmed the file was
already a Client Component (`"use client"` pre-existing in every one — no
new Server/Client boundary crossed, no function passed across one), confirmed
`AnimatedNumber` is imported from the shared `@/components/shared/motion`
module (not a local reimplementation), and confirmed `format` always closes
over the same `formatCurrency`/`useFormatCurrency`-backed pipeline already
used elsewhere in that same file — no second, parallel formatting path.

### 2.1 `budget-summary-cards.tsx` — "uncategorized spending this month" caption

```tsx
<AnimatedNumber value={uncategorizedSpent} format={(n) => formatCurrency(n, currency)} />
```

`formatCurrency` is the module-level `@/lib/utils` import already used by
this file's own `StatCard` figures two lines above — same pipeline, no
divergence. Live-verified: this fixture account's uncategorized-spend total
happens to be a genuine `$0.00` (confirmed via a full-text check of the
caption, not merely the animated span), so sampling shows a static `$0.00`
throughout — the correct, expected behavior for a value that mounts already
at its resting state (AC1's "a value updates to the identical value it
already held" edge case, applied at mount), not a defect. The wrap itself is
confirmed correct by source read; a nonzero live sample was not obtainable
from this account's fixture data, so this instance is confirmed sound by
source plus a correct (non-animating-because-genuinely-zero) live result,
not by a positive count-up sample.

### 2.2 `debt-card.tsx` — "APR / minimum payment" and "total interest remaining" captions

```tsx
{debt.interestRate}% APR &middot;{" "}
<AnimatedNumber value={debt.minimumPayment} format={formatCurrency} />
/mo minimum
```
```tsx
<AnimatedNumber value={debt.totalInterestRemaining ?? 0} format={formatCurrency} />{" "}
total interest remaining at minimum payment
```

The pre-existing `debt.totalInterestRemaining ?? 0` null-guard is preserved
unchanged ahead of the wrap — this commit did not alter that edge-case
handling, only the formatting call downstream of it, so the file's own
documented null contract is not regressed. `formatCurrency` is this file's
existing `useFormatCurrency()` closure, already used by the card's own
already-wired balance headline. Live-verified, fresh navigation immediately
before each sample:

```
APR caption:      $150.00 -> $150.00 -> $22.90 -> $53.25 -> $75.16 -> ... -> $150.00/mo minimum
Interest caption: $723.77 -> $723.77 -> $57.55 -> $159.95 -> $301.44 -> ... -> $723.77 total interest remaining
```

Both genuine, monotonic count-ups, confirmed live on the real seeded
database.

### 2.3 `goal-card.tsx` and `goal-detail-progress-card.tsx` — "remaining" / "over your target" captions

```tsx
<AnimatedNumber value={goal.overageAmount} format={formatCurrency} /> over your{" "}
<AnimatedNumber value={goal.targetAmount} format={formatCurrency} /> target
```
```tsx
<AnimatedNumber value={goal.remainingAmount} format={formatCurrency} /> remaining
```

`goal-detail-progress-card.tsx`'s own target figure inside the overage
branch (`your {formatCurrency(goal.targetAmount)} target` →
`your <AnimatedNumber value={goal.targetAmount} format={formatCurrency} />
target`) closes a gap in this same file's own earlier (first-pass-era) fix —
confirmed by direct read that this is the only remaining bare
`formatCurrency(` call this file had left. Live-verified on both the list
page and the detail route (fixture goal's `remainingAmount` branch, not the
overage branch, on this account):

```
Goal list "remaining":   $2,500.00 -> $2,500.00 -> $192.54 -> $698.88 -> ... -> $2,500.00 remaining
Goal detail "remaining": $2,500.00 -> $2,500.00 -> $192.54 -> $571.20 -> ... -> $2,500.00 remaining
```

Both genuine count-ups. The overage branch (`goal.overageAmount > 0`) was not
independently live-sampled (this fixture account's one seeded goal is not
overshot), but is confirmed sound by direct source read — identical
`AnimatedNumber`/`formatCurrency` shape to the already-verified
`remainingAmount` branch in the same conditional, on the same file.

### 2.4 `financial-goal-card.tsx` — three sub-captions across its three goal-type bodies

Read in full, all three bodies (`DebtPayoffProgress`, `NetWorthSavingsProgress`,
`SavingsRateProgress`):

- `DebtPayoffProgress`'s `"X% paid off"` caption — wrapped, `format={(n) =>
  \`${Math.round(n)}%\`}`, matching the sibling percent-used treatment this
  same commit used in `budget-category-row.tsx`.
- `NetWorthSavingsProgress`'s `"X to go / over target"` caption — the
  pre-existing `distanceToTarget > 0 ? ... to go : ... over target` sign
  branch is preserved exactly (only the number now flows through
  `Math.abs(distanceToTarget)` wrapped in `AnimatedNumber`, with the sign-
  dependent word choice — "to go" vs. "over target" — left as plain text
  outside the animated span, which is correct: there is no color/style
  dependent on the sign here, unlike the Investments gain/loss case, so no
  sign-dependent visual treatment needed to move inside `format`).
- `SavingsRateProgress`'s `"target X%"` caption — wrapped, consistent with
  its own file's `NetWorthSavingsProgress` sibling's already-wired target
  amount (the exact inconsistency the fifth pass flagged as a
  non-blocking, "strongly recommended" fix — now closed).

This fixture account's one seeded `FinancialGoal` is a `DEBT_PAYOFF`-type
goal with a genuine `0%` `percentPaidOff` (confirmed via
`prisma/seed-e2e-test-user.ts`, which seeds exactly one such goal), so live
sampling of that one instance correctly shows a static `0% paid off` — the
correct, expected AC1 "value already at its resting state" behavior, not a
defect (an animation from 0 to 0 has nothing to animate). No
`NetWorthSavingsProgress`/`SavingsRateProgress` fixture goal exists in this
account's seed data to sample live for those two branches; both are confirmed
sound by direct source read against the same pipeline and pattern already
live-verified elsewhere in this same commit (2.1–2.3 above).

**Verdict on Section 2, all six instances: genuine, correctly shaped, no
Server/Client boundary regression, no null/sign-edge-case regression.**

---

## 3. NEW FINDING, BLOCKING — `strategy-comparison.tsx`'s "total interest paid" figure was incorrectly re-confirmed out of scope; the reasoning that excluded it no longer holds after this same commit's own fix to its supporting precedent

### What the commit's own message claims, and why it is worth re-checking independently

`12d1d52`'s own commit message lists, among figures "left correctly unwired":
*"`strategy-comparison.tsx`'s 'total interest paid' (a secondary caption
under a non-currency headline)."* This is not a new judgment call — it
restates, nearly verbatim, the third pass's own reasoning
(`docs/release/phase-5b-third-pass.md` §2): *"a secondary annotation under
the real headline, not a second headline of its own. Correctly out of scope
under the same primary/secondary distinction `debt-card.tsx`'s own
un-animated 'APR / minimum payment' and 'total interest remaining' captions
already establish."*

**That supporting precedent no longer exists.** This exact commit (`12d1d52`)
just wired `debt-card.tsx`'s own "APR / minimum payment" and "total interest
remaining" captions into `AnimatedNumber` (Section 2.2 above) — the two
un-animated captions the third pass's own reasoning cited as the
*justification* for treating a secondary caption as out of scope. The
premise ("secondary captions like this one don't animate elsewhere in this
app") that supported excluding `strategy-comparison.tsx`'s interest-paid
figure has been overturned by this same commit's own actions, but the
conclusion drawn from that premise was carried forward unchanged, without
re-deriving it from the current state of the codebase.

### Re-deriving the scope question directly against AC6/AC7, not against a now-stale precedent

- **`StrategyComparison` renders directly on `/debt`** (confirmed:
  `src/app/(dashboard)/debt/page.tsx:113`, `<StrategyComparison
  debts={comparisonDebts} />`), the exact route AC6 names for Debt:
  *"Debt (`/debt`, balance/payoff figures)."* "Total interest paid" — the
  total interest cost of a snowball/avalanche payoff strategy — is,
  verbatim, a **payoff figure**, not an inferred extension of one.
- **None of AC7's three named exclusions apply.** It is not Transactions'
  "one line among many" (the panel shows exactly two strategies —
  Snowball, Avalanche — a fixed, always-two-count side-by-side comparison,
  structurally a stat-card pairing, not a repeating list of arbitrary
  length). It is not Reports' static PDF output (this is a live,
  client-side-recomputed `useMemo` value, per this file's own JSDoc — "No
  server call at all after initial load... recomputing on every extra-
  payment keystroke"). It is not Admin.
- **The commit's own operating theory for the rest of this sweep does not
  actually require "an already-wired headline directly above it" as a
  precondition.** `budget-summary-cards.tsx`'s "uncategorized spending"
  caption (Section 2.1) sits in its own standalone dashed-border box, not
  literally beneath any other headline figure on the same card, and was
  wired anyway — the commit's real, broader test (as applied everywhere else
  in this same diff) is "an AC6-named-or-implied currency/percentage figure,
  styled as informational text, not row-level, not PDF/Admin," not "must be
  physically adjacent to an already-`AnimatedNumber`-wrapped sibling." Under
  that same, actually-applied test, `strategy-comparison.tsx`'s figure
  qualifies identically.
- **Styling is not a disqualifying factor either.** The figure is styled
  `text-sm font-medium text-foreground` — a *heavier* weight than
  `budget-summary-cards.tsx`'s own now-wired `"font-medium text-foreground"`
  caption (identical class) and heavier than every `text-xs
  text-muted-foreground` caption this same commit wired in `debt-card.tsx`,
  `goal-card.tsx`, and `financial-goal-card.tsx`. If those all qualified as
  "informational text worth animating" at `text-xs`, this `text-sm
  font-medium` figure does not fail that same bar by being too light.

The one distinguishing fact — the panel's own true headline
(`formatMonthsToDebtFree(...)`, a duration string like `"2 yrs 3 mos"`) is
correctly *never* wired, because it is not a currency or percentage figure
and so is not in AC1's mechanism at all — does not exempt a *different*,
independently-in-scope currency figure sitting below it. AC1's own scope
test is per-figure ("this capability's applicability is defined by the
formatting pipeline a figure flows through"), not "only the single most
prominent figure on a card counts, and everything else inherits its
non-headline status."

### Confirmed pre-existing, not a regression newly introduced by this commit's own work

`git log --all -- "src/features/debt/components/strategy-comparison.tsx"`
shows no `AnimatedNumber` was ever wired into this file at any point in this
phase — this gap predates `12d1d52` (it was first raised and then dismissed
by the third pass); this commit's own contribution was re-asserting the
prior pass's now-outdated reasoning rather than re-checking it, not
introducing a new defect.

### Live-verified static on the real seeded database, isolated from any prior sampling window

Ran the same throwaway Playwright script, with a fresh navigation to `/debt`
immediately before sampling (avoiding the false-negative risk a prior
sampling window closing before a second measurement starts, the same
methodological care the fourth pass's own script iteration first
established):

```
"total interest paid" dollar figure: $723.77 (x18 samples, ~1080ms, fully static)
```

A real, nonzero value (not the zero-valued "correctly static" case in
Section 2.1 above), sampled immediately after a fresh page load, showing no
count-up at all — in direct contrast to the same page's own now-genuinely-
animating "APR / minimum payment" and "total interest remaining" captions,
sampled in the same session (Section 2.2).

### Why this is blocking, not a lower-severity note

Identical reasoning to all six prior instances in this phase's own chain: a
figure squarely named by AC6's own text ("payoff figures" on `/debt`), not
excluded by any of AC7's three specific, reasoned exclusions, confirmed
static via live sampling using a real, nonzero value — and, distinctly from
every prior instance, its own prior "correctly out of scope" justification
is demonstrably invalidated by this exact commit's own other changes, not
merely re-litigated on new grounds.

**Verdict: does not hold. Blocking.**

---

## 4. Independent judgment check on the rest of the "left correctly unwired" list — CONFIRMED correctly out of scope

Per this pass's own charter (spot-check at least three, against AC7's actual
reasoning, not the commit message's summary of it) — checked the following
directly against source, beyond the one finding above:

- **`budget-category-row.tsx`'s own allocated/spent/remaining dollar
  figures**: read in full (Section — file's own JSDoc: renders "an inline
  Allocated input..., Spent..., Remaining" per category, one row among
  potentially many categories in the planner grid). AC6 names only
  "category-row **progress**" for Budgeting, not the row's per-column
  currency breakdown — a narrower, deliberate textual scope, distinct from
  a blanket "everything in this row." Consistent with Transactions' own
  row-level reasoning by analogy (a dense, multi-column grid row, not a
  standalone headline). **Confirmed correctly out of scope.**
- **Settings' currency preview** (`currency-display-select.tsx:98`,
  `Preview: {formatCurrency(PREVIEW_AMOUNT, preference.currencyDisplay)}`):
  a fixed, hardcoded `PREVIEW_AMOUNT` constant used to demonstrate a
  formatting choice, not a real financial figure of the user's own data —
  not named by any AC6 surface, and animating a static demo constant on
  every currency-format toggle would be pure visual noise with no
  information content, the same category of reasoning AC7 uses for Reports'
  static output. **Confirmed correctly out of scope.**
- **`split-dialog.tsx`'s informational text** (lines 135, 197, 201–202): read
  in full — these are inline prose sentences inside a dialog's own
  instructional/validation copy ("Divide '...' (`$X`) across two or more
  categories," "Splits sum to `$X` — ready to submit," "`$X` of `$Y`
  allocated"), not a headline figure on a persistent card; Transactions
  itself (the parent surface) is explicitly row-level-excluded by AC7's own
  name, and a transient dialog's own recomputed validation text is a
  materially different, non-headline case with no AC6 surface naming it.
  **Confirmed correctly out of scope.**
- **`notification-bell.tsx`'s dropdown text** (interpolated into narrative
  sentences — *"A `$X` purchase at `Y` exceeded your threshold"*): the same
  "narrative sentence, not a headline figure" shape the fourth pass's own
  negative check already ruled out of scope for
  `insights-candidates.ts`'s `streakLength` interpolation. **Confirmed
  correctly out of scope.**

None of these four re-checks reopened; **only `strategy-comparison.tsx`'s
figure (Section 3) failed this pass's own independent re-check.**

---

## 5. One more independent sweep for the same pattern, in features no prior pass has yet touched — no new instance found

Per this pass's own charter (a genuinely new sweep of not-yet-touched
per-item card components), read in full:

- **`account-card.tsx`** (Accounts): the only secondary text under the
  headline balance is `"Manually updated balance"` (a static caveat string
  for `INVESTMENT`/`RETIREMENT`/`CRYPTO` account types) — no numeric figure
  of any kind. **No gap.**
- **`holding-row.tsx`** (Investments' per-item list row): the file's own
  JSDoc states this component is deliberately "laid out as a table-ish row
  instead of a card since holdings are grouped several-per-container rather
  than one-per-card" — the identical row-level shape AC7 already excludes
  Transactions on, by the component's own stated design intent, not this
  pass's inference. Its `gainLossPercent` inline parenthetical was already
  separately judged correctly out of scope by the third pass. **No gap.**
- **`expected-upcoming-income-card.tsx`**'s `data.byStream.map(...)`
  per-source rows: a repeating list of arbitrary length (one row per active
  income stream), the same row-level shape. **No gap.**
- **Bills/Recurring Income** (`bill-list.tsx`, `upcoming-bills-list.tsx`,
  `occurrence-history-table.tsx`, `income-stream-list.tsx`,
  `irregular-event-history-list.tsx`, `mark-paid-dialog.tsx`,
  `transaction-picker.tsx`): every remaining `formatCurrency(` call is
  inside a `TableCell` or an equivalent dense list/dialog-picker row —
  row-level or dialog-informational, not a per-item card's own headline-
  adjacent caption. **No gap.**
- **Analytics** (`subscriptions-list.tsx`'s per-candidate `TableCell`s,
  `top-merchants-list.tsx`, `largest-purchases-list.tsx`,
  `budget-vs-actual-table.tsx`, every chart's `Tooltip`/legend
  `formatCurrency` call): all confirmed row-level table cells or
  chart-internal tooltip content (Chart Transitions' own mechanism, not
  Number Counters', per AC1's pipeline-based scope, re-confirmed by the
  fifth pass's own negative check and unaffected by anything since).
  **No gap.**
- **Dashboard's card-group registry**
  (`app/(dashboard)/_lib/dashboard-card-groups.tsx`,
  `dashboard-animated-stat-value.tsx`): no bare `formatCurrency(` call or
  unwired percent figure found; every stat renders through
  `AnimatedCurrencyStatValue`/`AnimatedPercentStatValue`. **No gap.**

No seventh (in this pass's own numbering, the eighth overall) instance of
this pattern was found in any not-yet-touched surface. **Section 3's finding
is a re-opened judgment call on an already-considered figure, not a newly
discovered surface** — consistent with this phase's own recurring lesson
that a prior pass's dismissal of a specific figure needs to be re-derived
against the codebase's *current* state, not trusted as permanently settled,
especially once a later commit changes the very precedent that dismissal
relied on.

---

## 6. Automated checks — re-run fresh, live, by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — identical
  count to all six passes; this commit and this pass's own new finding are
  both production-code/display-layer only, with no unit-tested surface
  touched.
- `npm run seed:e2e` → ran fresh twice (once for the throwaway live-sample
  scripts, once immediately before the Playwright run below);
  `tests/e2e/support/fixture-ids.json` restored to its committed placeholder
  form afterward (`git checkout -- tests/e2e/support/fixture-ids.json`,
  confirmed via `git status` showing no diff on that file at the end of this
  review).
- `npx playwright test accessibility --project=desktop --workers=1
  --reporter=list` → **45/45 passing**, a single clean run (2 setup logins +
  9 `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
  `route-a11y.spec.ts`, including "Budgeting" and "Debt Tracker" — both
  routes this pass's own findings touch; this suite asserts zero
  critical/serious axe violations and the reduced-motion end-state contract,
  not the Number Counters mount-animation contract, so its passing does not
  contradict this pass's finding, the same distinction the third through
  fifth passes' own sections already drew). No flake observed.
- `git status`/`git log` — working tree clean at review start; at review
  end, only the expected auto-generated `docs/testing/e2e/
  accessibility-report.md` timestamp diff remains (accepted per this
  project's established precedent). `HEAD` at `12d1d52`, matching this
  review's stated scope; no new commit made by this pass (a review-only
  pass, per its own charter, until a fix commit closes Section 3's finding).

---

## 7. Security / Performance sign-offs — still unaffected, confirmed via direct `git diff --stat`, not trusted from the prompt

`git diff --stat 25fb0e7..12d1d52` (the fourth pass's fix commit through this
pass's own reviewed commit) touches exactly `docs/release/phase-5b-checklist.md`,
`docs/release/phase-5b-fifth-pass.md` (both docs), the auto-generated
`docs/testing/e2e/accessibility-report.md`, and six feature files
(`budget-category-row.tsx`, `budget-summary-cards.tsx`, `debt-card.tsx`,
`financial-goal-card.tsx`, `goal-card.tsx`, `goal-detail-progress-card.tsx`)
— no new Server Action, Route Handler, API route, query-layer file, or
dependency; every touched file is a pure display-layer `AnimatedNumber` wrap
of an already-fetched, already-rendered number, the identical shape already
reviewed six times this phase. The first- through fifth-pass gates' Security
Architect and Performance Engineer APPROVE verdicts
(`docs/security/phase-5b-security-review.md`,
`docs/performance/phase-5b-performance-review.md`) hold, unaffected.

This pass's own new finding (Section 3) has not yet been fixed by any
commit — it is a review-only finding, projected to be the identical
pure-display-layer, no-new-surface fix shape once addressed. It does not
reopen either team's review scope in advance of a fix.

---

## Release Manager Decision (sixth pass)

**REJECT. Phase 5b is still not closed.**

The fifth pass's named fix — `budget-category-row.tsx`'s per-category
"percent used" label — is genuine, sound, and independently confirmed both
by direct source review and by live browser verification against the real
seeded database (Section 1). Six of the seven captions this same commit
proactively swept and fixed are likewise genuine, correctly shaped (no
Server/Client boundary regression, no null/sign-edge-case regression), and
confirmed live wherever this account's fixture data made a nonzero,
genuinely-animating sample obtainable, with the remaining instances
confirmed sound by direct source read against an already-live-verified
identical pattern (Section 2).

But this pass's own required independent judgment check on the same
commit's "left correctly unwired" list found that **`strategy-comparison.tsx`'s
"total interest paid" figure is not, in fact, correctly out of scope.** Its
exclusion rests on a specific piece of reasoning — "a secondary caption,
correctly out of scope under the same primary/secondary distinction
`debt-card.tsx`'s own un-animated captions already establish" — that this
exact commit's own other changes overturned: `debt-card.tsx`'s "APR /
minimum payment" and "total interest remaining" captions are no longer
un-animated; this same commit wired them. The conclusion was carried
forward from the third pass unchanged even though its supporting premise no
longer held. Re-derived independently against AC6's own text (Debt's
"payoff figures," a phrase this figure matches verbatim) and AC7's three
specific, reasoned exclusions (none of which apply — this is not row-level,
not PDF output, not Admin), this figure is genuinely in scope, and was
confirmed static live against a real, nonzero fixture value
(`$723.77`, fully flat across eighteen samples) in direct contrast to the
same page's own now-genuinely-animating sibling captions sampled in the same
session.

This phase's own standing "trust but verify" discipline applies with no less
force to a prior pass's *dismissal* of a figure than to a claimed fix — a
judgment call that was correct when made can stop being correct once a later
commit changes the facts it depended on, and re-asserting it unchanged is
itself a gap of the same defect class this phase has now produced seven
times. This release cannot be approved with it open.

**Required before re-review:** wire `AnimatedNumber` into
`strategy-comparison.tsx`'s "total interest paid" figure:

```tsx
<AnimatedNumber value={summary.totalInterestPaid} format={formatCurrency} />{" "}
total interest paid
```

replacing the plain `{formatCurrency(summary.totalInterestPaid)}` span — a
trivial in-place wrap; this file already carries `"use client"` and an
existing `formatCurrency = useFormatCurrency()` closure used by the sibling
"to debt-free" panel's own `StrategyPanel` component, so no new boundary
extraction or import restructuring is needed beyond the
`AnimatedNumber` import itself.

**Strongly recommended, not required, before the next re-review:** when a
future pass re-confirms a prior pass's "correctly out of scope" judgment
call, re-derive it against AC6/AC7's own text directly rather than citing an
earlier pass's summary of that reasoning — especially in the same commit
that changes the specific precedent facts an earlier dismissal relied on.
This is the seventh instance of a "named-or-implied AC6 figure skipped"
defect shape this phase has now produced (after the Savings Goal detail
finding, the first pass's two-surface finding, the second pass's Debt
aggregate finding, the third pass's `BudgetHealthScoreBadge` finding, the
fourth pass's Financial Health Score headline finding, the fifth pass's
`budget-category-row.tsx` percent-used finding, and now this — the first of
the seven that is a re-opened dismissal rather than a newly-discovered
surface). The per-component AC6 pass/fail checklist the Definition of Done
has now asked for across six consecutive passes remains unproduced; its
continued absence is demonstrably still the root cause.

Phase 5 remains open pending this fix and a follow-up (seventh) Release
Manager pass.
