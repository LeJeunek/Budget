# Phase 5b Release Notes — Motion & Craft

**Reviewer:** Release Manager
**Scope:** all five Phase 5b capabilities (Reduced-Motion Foundation, Number
Counters, Chart Transitions, Page Transitions, Expandable Cards) plus the
Cross-Cutting GPU-Compositable-Properties Bar
(`docs/product/phase-5b-motion-craft.md`), per
`docs/architecture/phase-5b-technical-design.md` (including its §1.4
correction), `docs/planning/roadmap.md`'s Phase 5b CTO resolution pass +
Follow-up re-check, and `docs/planning/risk-register.md` rows #40, #44, #52,
#53, #55–#59. Commits `ede64b1..44944ca` (Product Owner spec through the
latest Bug Hunter fix commit — `git log` re-confirmed live, working tree
clean at review time).

**Decision: REJECT.**

The full review-gate trail this phase produced — Security Architect APPROVE,
Performance Engineer APPROVE (two non-blocking findings), four Bug Hunter
reports (all genuinely fixed, independently re-verified below), and a new
six-test reduced-motion E2E suite (all six now genuinely passing under a
fresh, live run) — holds up almost entirely under this pass's own
"trust but verify" re-verification, the same discipline 5a's first-pass
Release Manager review used. Every one of the four filed bug fixes was
re-read against its own root cause, not merely trusted because a report says
"fixed," and each one genuinely closes what it claims to close (Section 2).
`npm run typecheck`, `npm run lint`, `npx vitest run` (633/633), and the full
45-test `accessibility` Playwright project (including the six-test
`reduced-motion.spec.ts`, previously 4/6 passing, now 6/6 live) were all
re-run fresh by this pass, not taken on any prior report's word (Section 3).

But **Number Counters' own Definition of Done — "verified across every
in-scope surface named in that capability's AC6 — all ten surfaces...
each confirmed to animate" — does not actually hold.** Two of AC6's ten named
surfaces have a headline currency figure that was never wired to
`AnimatedNumber` at all: the Recurring Income stream detail route
(`/income/[streamId]`) and the Investment holding detail route
(`/investments/[holdingId]`) — found by this pass's own spot-check of the six
non-`StatCard` AC6 surfaces, not reported by any prior review in this
phase's chain. This is the identical defect shape as the Bug Hunter's own
already-fixed "Savings Goal detail page missing AnimatedNumber" finding
(`docs/testing/bug-reports/savings-goal-detail-page-missing-animated-number.md`)
— a named AC6 "+ detail route" surface skipped in full — except these two
instances were never caught. See Section 1.

---

## 1. BLOCKING — Number Counters AC6: two of ten named surfaces' detail routes never received `AnimatedNumber` at all

### What the spec requires, unconditionally

Number Counters AC6 names, by name: *"Recurring Income (`/income` + detail,
stream amounts)"* and *"Investments (`/investments` + detail, holding
values/gains)."* The Definition of Done: *"Number counters verified across
every in-scope surface named in that capability's AC6 — all ten surfaces,
regardless of which component renders each one's headline figure today —
each confirmed to animate through `formatCurrency`/`useFormatCurrency`
with no second formatting path, within the 300–600ms bound."* This is not a
soft target — the same Definition of Done separately requires *"a
per-component recorded pass/fail — not an aggregate claim."* No such
per-component checklist artifact exists anywhere in the repo (confirmed:
`docs/testing/`/`docs/architecture/` contain no Number-Counters-specific
per-surface tracking document) — the only verification evidence this
phase's chain actually produced is the four Bug Hunter reports plus the
six-instance-only reduced-motion E2E suite, neither of which is (or claims
to be) an exhaustive AC6 sweep.

### What is actually in source, verified directly

**`src/app/(dashboard)/income/[streamId]/income-stream-detail-client.tsx`**
(read in full): the stream detail card's headline "Expected amount" figure —
`font-heading text-lg font-semibold`, the same prominent-stat styling
`goal-card.tsx`/`account-card.tsx`/`debt-card.tsx` all use for their own
now-animated figures — renders as:

```tsx
{stream.expectedAmount !== null ? formatCurrency(stream.expectedAmount) : "—"}
```

No `AnimatedNumber` import anywhere in this file. `grep -rn "AnimatedNumber"
src/features/recurring-income/` returns exactly one match, in
`expected-upcoming-income-card.tsx` (the Dashboard-adjacent `/income` list
page's already-correctly-animated `StatCard` consumer) — the detail route's
own figure is not that component, is not reused from it, and is not
independently wired.

**`src/app/(dashboard)/investments/[holdingId]/page.tsx`** (read in full):
a four-figure headline stat grid — Current value, Cost basis, Gain/loss, and
Total dividend income, all `font-heading text-xl font-semibold`, styled
identically to `portfolio-overview-section.tsx`'s already-animated list-page
figures — renders all four via plain `formatCurrency`, zero `AnimatedNumber`
usage anywhere in the file:

```tsx
{formatCurrency(holding.currentValue, userPreference.currencyDisplay)}
{formatCurrency(holding.costBasis, userPreference.currencyDisplay)}
{formatCurrency(holding.gainLossAmount, userPreference.currencyDisplay)}
{formatCurrency(totalDividends, userPreference.currencyDisplay)}
```

Both routes are Server Components fetching their own data directly (the
identical shape the already-fixed Savings Goal detail bug describes as the
reason that page "was rendered directly by a Server Component page... and
can't become a Client Component wholesale") — the same fix shape used there
(a small, dedicated Client Component boundary, e.g.
`goal-detail-progress-card.tsx`) is directly applicable to both and was
simply never applied.

### Why this is blocking, not a lower-severity note

- It is a direct, confirmed violation of a binding Definition-of-Done line
  ("all ten surfaces... each confirmed to animate"), not a judgment call
  about scope (contrast with, e.g., Bills' list page, which this pass also
  checked and confirmed has no genuine headline figure to animate at all —
  a correct AC7 exclusion, not a gap).
- It is the same defect *class* the Bug Hunter already found and the team
  already fixed once this phase (Savings Goal detail) — meaning the
  systematic per-surface sweep the Definition of Done calls for was not
  actually completed even after that first instance was caught, and no
  artifact in this phase's chain claims it was re-run exhaustively after
  that fix landed.
- Both affected routes are explicitly, individually named in AC6's own
  prose ("+ detail" for both Recurring Income and Investments) — this is
  not an ambiguous scope boundary this pass is inventing.

### What does NOT need to be redone

Everything else this pass checked in Number Counters holds (Section 4) —
this is a **completeness** gap in two named surfaces, not a defect in the
`AnimatedNumber`/`ProgressRing`/reduced-motion mechanism itself, which is
independently confirmed sound (Section 2, Section 5). The fix is
mechanical and low-risk: apply the same Client-Component-boundary pattern
`goal-detail-progress-card.tsx` already established to
`income-stream-detail-client.tsx`'s "Expected amount" figure and
`investments/[holdingId]/page.tsx`'s four-figure stat grid, then re-run this
same spot-check (and, ideally, produce the per-component checklist the
Definition of Done has asked for since this capability's spec was written,
so a third instance of this exact gap doesn't recur).

**Verdict: does not hold. Blocking.**

---

## 2. The four filed Bug Hunter fixes — CONFIRMED FIXED, independently re-verified against root cause, not report summary

### 2.1 Reduced-motion not honored on first page load (`AnimatedNumber`/`ProgressRing`) — HIGH — FIXED

Read `src/components/shared/motion/animated-number.tsx` and
`src/components/shared/progress-ring.tsx` in full. Both now render their
correct, final value **unconditionally** on every render — including the
very first, SSR-matching one — via a plain `useState`/`useMotionValue`
initializer that starts from `format(value)`/`restingOffset`, never `0`/the
empty-ring position. The "start from zero and count up" mount animation
(AC1a) is moved into a `useLayoutEffect`, which only runs client-side after
`useReducedMotion()` is known-correct — so a reduced-motion user's very
first painted byte of HTML is already, and stays, correct, with no window in
which a `$0.00` flash or a stroke sweep could ever be observed. This
directly closes the root cause the bug report identified (Framer Motion's
own `useReducedMotion` resolving via a one-time, possibly-stale `useState`
snapshot) by never making the SSR-matching render depend on that value at
all. Confirmed live, not just by source read: `reduced-motion.spec.ts`'s
"Number Counters" and "Pre-existing motion: ProgressRing" tests, both
previously failing per `docs/testing/e2e/reduced-motion-report.md`, now pass
under this pass's own fresh `npx playwright test accessibility` run
(Section 3).

### 2.2 Reduced-motion mid-session re-enable does not resume — MEDIUM — FIXED

Read `src/components/shared/motion/use-reduced-motion.ts` in full. No longer
a re-export of Framer Motion's own hook — now a `useSyncExternalStore`-based
hook, subscribed directly to `window.matchMedia("(prefers-reduced-motion:
reduce)")`'s `change` event. `getSnapshot` is read fresh on every render (no
stale one-time capture), and the `change` listener triggers a re-render for
every mounted consumer in either direction, closing both the fresh-load race
and the mid-session-re-enable failure with the same fix, exactly as the
file's own doc comment claims. `getServerSnapshot` returns `false`,
consistent with what the server always renders, so this fix introduces no
new hydration-mismatch risk (independently confirmed by the Performance
Engineer's review, Section 6, and by this pass's own clean `npx vitest run`
and full Playwright accessibility run). The doc comment correctly explains
why `MotionConfig`'s own internal resolution (a separate, second mechanism)
still carries an equivalent one-time-read staleness the app-owned hook
cannot reach — and correctly identifies `progress-ring.tsx` as the one
primitive that therefore needed to stop relying on `MotionConfig` alone,
which it now does (imperative `useMotionValue`/`animate()`, matching
`AnimatedNumber`'s architecture, confirmed by direct read).

### 2.3 Expandable card `aria-controls` missing while collapsed — MEDIUM — FIXED

Read `src/components/shared/motion/expandable-card.tsx` in full.
`React.useId()` generates a stable id, threaded explicitly as `id` on
`CollapsibleContent` and `aria-controls` on `CollapsibleTrigger`,
unconditionally — both override Radix's own conditional/generated values
(Radix's default is spread before this component's own explicit props, per
Radix's own prop order, matching the fix's own doc-comment claim). This is
correct and present in every state, not only once a card has been expanded
at least once, closing the exact gap the bug report and the E2E Test
Engineer's own test-authoring note both identified. Confirmed live:
`reduced-motion.spec.ts`'s "Expandable Cards" test (which now reads
`aria-controls` after the first click and re-uses that same stable id to
verify the collapsed state afterward) passes under this pass's fresh run.

### 2.4 Savings Goal detail page missing `AnimatedNumber` — MEDIUM — FIXED, but the underlying "detail route incompletely swept" pattern recurred (see Section 1)

Read `src/features/goals/components/goal-detail-progress-card.tsx` and
`src/app/(dashboard)/goals/[goalId]/page.tsx` in full. The new Client
Component receives only plain, serializable props (the full `goal` object
plus a `currencyDisplay` string — no function crosses the Server/Client
boundary, avoiding the exact RSC-serialization crash
`dashboard-animated-stat-value.tsx` exists to work around), and correctly
wraps every headline figure on the page — the `ProgressRing`'s custom label,
current/target progress, overage-or-remaining, and the optional planned
monthly contribution (with the existing `!== null` guard kept ahead of the
wrap, exactly as the bug report's own suggested fix specified) — in
`AnimatedNumber`. This individual fix is sound and complete. **However**,
this exact defect shape (a named AC6 "+ detail route" surface fully skipped)
independently recurred in two more places this phase's own chain never
caught — see Section 1. The fix pattern established here is directly
reusable for both.

---

## 3. Automated checks — re-run fresh, live, by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files.**
- `npm run seed:e2e` → ran fresh; `tests/e2e/support/fixture-ids.json`
  regenerated with real database ids, then **restored to its committed
  placeholder form** after the Playwright run, per this pass's own
  instructions — confirmed via `git status` showing no diff on that file at
  the end of this review.
- `npx playwright test accessibility --project=desktop --workers=1
  --reporter=list` → **45/45 passing** (2 setup logins + 43 spec tests:
  9 `accent-contrast.spec.ts` + 6 `reduced-motion.spec.ts` + 28
  `route-a11y.spec.ts`), including all six `reduced-motion.spec.ts` tests
  now passing live — a genuine change from the E2E Test Engineer's own run
  report, which recorded 4/6 passing with the two failures now-confirmed
  fixed above (Section 2.1).
- `git status` / `git log` — working tree clean at review start and end
  (aside from the expected `docs/testing/e2e/accessibility-report.md`
  timestamp regenerated by the live Playwright run, an accepted
  auto-generated artifact per this project's own established precedent,
  `phase-5a-second-pass.md` §1); `HEAD` at `44944ca`, matching the review
  scope stated above.

---

## 4. Capability spot-checks beyond the four bug reports — mostly confirmed sound, one gap (Section 1) found

- **Reduced-Motion Foundation**: `providers.tsx`'s `<MotionConfig
  reducedMotion="user">` and the corrected `use-reduced-motion.ts` hook
  confirmed present and correctly composed (Section 2.2); no other consumer
  found bypassing the shared hook.
- **Number Counters**: the four already-`StatCard`-based surfaces
  (Dashboard, Budgeting, Goals/Financial Goals, Recurring Income's list
  page) and four of the six plain-`<span>` surfaces (Accounts, Debt,
  Analytics, both Financial Health Score surfaces) confirmed correctly
  wired via direct grep/read. **Two surfaces have a gap — Section 1.**
  Bills' own list page confirmed to have no genuine headline figure to
  animate (correctly excluded under AC7, not a gap) — its detail route
  (`bill-detail-client.tsx`) is confirmed correctly wired.
- **Chart Transitions**: all 14 Recharts consumers (re-confirmed by a fresh
  `grep -rl "recharts" src/features`, matching the architecture doc's own
  count exactly) spread `useChartAnimationProps()`; the Analytics heatmap
  confirmed wrapped in `FadeIn`.
- **Page Transitions**: `src/app/(dashboard)/template.tsx` confirmed thin,
  composing `PageTransition`, scoped correctly to `(dashboard)/` only (no
  `/login`/`/admin` wrapper found).
- **Expandable Cards**: all five `DataTableCardList` consumers (Transactions,
  Admin's `UserTable`/`AuditLogTable`, Bills'/Recurring Income's
  `OccurrenceHistoryTable`) confirmed annotated with `meta: { cardDisplay:
  "expandable" }` on genuinely new, not-otherwise-shown columns (Tags/Notes
  for Transactions, matching Risk #59's own review discipline); Analytics'
  migrated "Dismissed merchants" toggle confirmed using the shared primitive
  directly.
- **Cross-Cutting GPU bar**: no new, undocumented third exception found
  beyond the two named ones — consistent with the Performance Engineer's own
  independent finding.

---

## 5. Security Architect review — APPROVE, confirmed still current

`docs/security/phase-5b-security-review.md`'s scope (`2a209c0..HEAD` at the
time of that review) predates this phase's four bug-fix commits
(`19a0d46`, `44944ca`) and the earlier E2E-coverage commit (`5183f38`).
Reviewed those three commits directly for anything that would change that
review's conclusions: no new Server Action, Route Handler, API route, or
query-layer file appears in any of them (`git diff --stat` for each against
its parent touches only `components/shared/motion/`,
`progress-ring.tsx`, one new feature file
(`goal-detail-progress-card.tsx`, plain serializable props only, the
identical shape already reviewed for `dashboard-animated-stat-value.tsx`),
one new test spec, and documentation). The APPROVE verdict holds,
unaffected.

## 6. Performance Engineer review — APPROVE, confirmed still current

`docs/performance/phase-5b-performance-review.md`'s two non-blocking
findings (Finding 1: bundle-size delta traced to a Turbopack chunking
inefficiency, not a code defect; Finding 2: Risk #58's Router Cache
skeleton-replay on `/analytics`, confirmed real but not a binding-AC breach)
are unaffected by the bug-fix commits reviewed above — none of them touch
`next.config.ts`, `(dashboard)/template.tsx`, or any chart component. The
APPROVE verdict holds, unaffected. Risks #56/#57 (measured non-issues) and
Page Transitions AC2 (no TTI regression, measured directly) are unaffected
for the same reason.

---

## 7. Risk register — coherent, no dangling rows found

All eight reviewed rows (#40, #44, #52, #53, #55–#59) are in a coherent
final state:

- **#40** (`prefers-reduced-motion` central mechanism) — resolved, and its
  entry correctly reflects the §1.4 correction's real shipped shape
  (`useSyncExternalStore`, not a re-export) once that correction is read
  alongside it; the row itself predates the correction but is not
  contradicted by it.
- **#44** (Framer Motion bundle-size delta) — extended, then closed with
  real measurement by the Performance Engineer (non-blocking Finding 1).
- **#52** (visual-regression tooling revisit trigger) — explicitly routed to
  "5b's own Bug Hunter cross-surface motion review / E2E Test Engineer
  reduced-motion pass / Release Manager gate." This pass's own Section 1
  finding is a **completeness** gap (a named surface never wired), not a
  **visual regression** (an unintended side-effect a screenshot-diff tool
  would catch) — it does not trigger adopting visual-regression tooling,
  and no other finding in this pass's own review does either.
- **#53** — closed by the Product Owner's AC1/AC6 broadening, confirmed
  sound by the CTO's own follow-up re-check; not reopened by anything this
  pass found (Section 1's gap is an implementation-completeness question,
  not a scope-definition question — AC1/AC6 already correctly include both
  affected surfaces).
- **#55** (`StatCard`'s pre-formatted-string contract) — resolved by the
  Solution Architect's `AnimatedNumber` design; unaffected by this pass.
- **#56, #57** — routed to the Performance Engineer, measured, closed as
  non-issues.
- **#58** — routed to the Performance Engineer, measured, confirmed real but
  non-blocking; routed onward to the Frontend Lead as a scoped follow-up,
  not a gap in this register's own state.
- **#59** (`"expandable"` misannotation risk) — spot-checked directly
  (Section 4); no misannotation found on the one consumer inspected in
  depth (Transactions' Tags/Notes columns are genuinely new, not-otherwise-
  shown content).

No row was found dangling, unresolved-but-marked-resolved, or routed to a
reviewer who never actually addressed it.

---

## Release Manager Decision

**REJECT.**

This phase's mechanism-level work — the reduced-motion foundation, the
`AnimatedNumber`/`ProgressRing` primitives, chart-transition wiring across
all 14 Recharts consumers plus the heatmap, the page-transition wrapper, and
the expandable-card primitive across all six named consumers — is sound,
independently re-verified against live-running code and a fresh full test
run, not any prior report's word. All four Bug Hunter findings are genuinely
fixed. Security and Performance sign-offs hold, unaffected by anything
since. The risk register is coherent.

But Number Counters' own Definition of Done — a binding, explicit
"all ten [AC6] surfaces... each confirmed to animate" bar — is not met.
Two named surfaces (`/income/[streamId]`'s "Expected amount" figure,
`/investments/[holdingId]`'s four-figure stat grid) were never wired to
`AnimatedNumber` at all, the same defect shape as the Bug Hunter's own
already-fixed Savings Goal detail finding, undetected by this phase's own
review chain until this pass's own direct spot-check. Per this project's
own standing "trust but verify" discipline (5a's first-pass Release Manager
REJECT for exactly this reason — a claimed fix never actually live-tested),
this is a genuine, confirmed gap, not a nitpick, and this release cannot be
approved with it open.

**Required before re-review:** wire `AnimatedNumber` into both named
surfaces, reusing the `goal-detail-progress-card.tsx` Client-Component-
boundary pattern already established for the identical prior defect.
Recommended, not required: produce the per-component pass/fail record the
Definition of Done has asked for since this capability's spec was written,
so a third recurrence of this same gap shape is structurally prevented
rather than caught by chance on a future review pass.

Phase 5b is not closed. Phase 5, and the roadmap's original three-workstream
stub (motion/transitions, accessibility, responsive/mobile), remain open
pending this fix and a follow-up Release Manager pass.
