# Phase 4c Release Notes — Calendar v2, Customization, Admin

**Reviewer:** Release Manager
**Scope:** Calendar v2 (`docs/product/calendar-v2.md`), User Customization
(`docs/product/customization.md`), and Admin (`docs/product/admin.md`), per
`docs/architecture/phase-4c-technical-design.md` and `roadmap.md`'s Phase 4c
kickoff/resolution passes.

**Decision: REJECT.**

Everything this phase's own review gate claims to have closed — both High
Bug Hunter findings, the P2025 gap, the `TimezoneSchema` gap, the
seed-demo-data precondition gap, the six missing indexes, the Calendar page
redundant-read fix, the `maxDuration` fix, and the Dashboard
accent-color/card-layout wiring — genuinely is closed, verified directly
against current source below (Sections 2–7). Admin authorization, this
phase's headline security concern, holds up under independent inspection.

But one of Customization's four capabilities has a real, unacknowledged,
binding acceptance-criteria violation that no prior gate (Security,
Performance, Bug Hunter) caught: **Currency Display is fully built —
schema, validation, Server Action, settings UI, and a live preview — but is
never actually consumed anywhere else in the product.** Every one of the
~160 other `formatCurrency` call sites across Dashboard, Transactions,
Accounts, Budgeting, Bills, Debt Tracker, Investments, Goals, Analytics, all
six Report PDF templates, and all six notification/email templates still
renders unconditional USD, regardless of what a user selects. This is not a
CTO-descoped, tracked, accepted gap the way Timezone's consuming-logic
deferral is — it directly contradicts `customization.md`'s own explicit,
unconditional AC4 ("no exceptions carved out") and Definition of Done, and
the shipped Settings page's own copy ("changes how amounts are shown
**throughout the app**") is factually false as shipped. See Section 1.

---

## 1. BLOCKING — Currency Display is not wired to any surface outside its own settings-page preview

### What the spec requires, unconditionally, with no descope

`customization.md`'s Currency Display capability, AC4 (quoted in full,
nothing paraphrased): *"The preference applies to every currency-formatted
figure in the product, with no exceptions carved out: Dashboard cards,
Transactions, Accounts, Budgeting, Bills, Debt Tracker, Investments, Savings
Goals, Financial Goals, Analytics, all six Reports PDF types (including
their tabular/numeric content), and notification/email content (Large
Purchase, Low Balance, and any other currency-figure-bearing notification or
email). A user who sets a display currency and still sees a stray
`$`-formatted figure anywhere is a defect."*

Its Definition of Done is equally explicit: *"Currency display is verified,
by test, to change rendered symbol/grouping only — the exact same underlying
numeric values, calculations, and threshold comparisons... are confirmed
unaffected by a currency-display change, across every surface listed in AC4
above."*

Unlike the Timezone Preference capability in this same spec — which carries
its own explicit "Scope note — descoped by the Phase 4c CTO resolution pass"
section, is tracked as risk-register.md #29, and had its spec text itself
edited to mark AC2/AC4 as deferred target-state design — **Currency Display
has no such scope note, no CTO descope decision, and no risk-register entry
acknowledging incomplete rollout.** Risk #28 (the only currency-related risk
row) is about confirming the capability's *scope* is formatting-only, not
multi-currency data support — it explicitly says "Product Owner's
Customization spec must reflect this scope explicitly... confirmed... no
spec edit needed," which is a different question from whether the scoped
work was actually finished. Nothing anywhere authorizes shipping this
capability partially.

### What is actually in source, verified directly

`src/lib/utils.ts`'s `formatCurrency(amount, currency = "USD")` already
accepted a `currency` parameter before this phase (confirmed by its own
JSDoc, added this phase): *"every existing call site simply never passed
one... updating every other existing call site across the app (Dashboard,
Transactions, Reports, notifications, etc.) to pass the caller's resolved
`UserPreference.currencyDisplay` is explicitly out of scope for this
dispatch — real, broad call-site plumbing work, not a signature change."*
This comment is the implementing engineer's own admission that the
call-site rollout `phase-4c-technical-design.md` §3.6 itself calls for
("every call site across the app is updated to pass the caller's resolved
`UserPreference.currencyDisplay`... this is real, if broad, work") was never
done — it is not a misunderstanding on my part, it is documented in the
code by whoever wrote it.

Grepped every `formatCurrency(` call site in `src/` (excluding test files):
**162 total, of which exactly 2** — both inside
`src/features/settings/components/currency-display-select.tsx`, the
settings page's own live preview widget — pass a `currency` argument at
all. Every other call site (**160**, spanning every surface AC4 names)
calls `formatCurrency(amount)` with no second argument, silently defaulting
to `"USD"`.

### Why this is a real defect, not a nitpick

The Settings page's own shipped copy makes an affirmative, false claim to
every real user who touches this control: *"Changes how amounts are shown
throughout the app — your data stays in USD"*
(`currency-display-select.tsx`'s `CardDescription`). A user who sets their
display currency to EUR and then visits their Dashboard, Transactions,
Budgeting, or any Report sees every figure still rendered in USD with no
indication their change did anything at all outside the one settings card
they just left.

### What closing this requires (Backend Engineer + Frontend Lead, not this review)

Per `phase-4c-technical-design.md` §3.6's own framing: every Server
Component/service call site that currently formats a currency figure needs
to resolve the caller's `UserPreference.currencyDisplay` and thread it
through to `formatCurrency`.

**This is the sole blocking finding of this pass.** Every other item below
was independently re-verified and holds. See Sections 2–8 (unchanged from
this review's original text, preserved in `git log` history of this file)
for the full Calendar v2/Admin/Bug-Hunter/Performance/Security/build
verification, none of which is affected by this finding.

---

## Release Manager Decision (first pass)

**REJECT.** The blocking gap is Currency Display's call-site rollout — see
above. Everything else in Phase 4c holds. See
`docs/release/phase-4c-checklist.md` for the itemized gate checklist.

---
---

# SECOND PASS — Currency Display gap closure (this review supersedes the REJECT above)

**Reviewer:** Release Manager
**Scope of this pass:** narrow, targeted re-verification of the single
blocking finding above (Section 1) against `4851d30` ("Phase 4c: Close
Currency Display gap (Release Manager REJECT)"), following the same
"targeted re-check against the specific prior finding" convention
`phase-4b-notes.md`'s own second pass established — not a from-scratch
re-derivation of Calendar v2, Admin, Security, Performance, or Bug Hunter,
all of which already passed and are unchanged since the first pass (last
touching commit for any of that surface remains `72ea684` or earlier;
`4851d30` touches only currency-formatting call sites, per its own diff,
confirmed below).

**Decision: APPROVE.**

## 1. Client Component call-site coverage — genuinely closed

`CurrencyPreferenceProvider` (`src/app/(dashboard)/currency-preference-provider.tsx`)
is a plain React Context seeded exactly once in
`src/app/(dashboard)/layout.tsx`, from the same `getUserPreference(user.id)`
call the layout already made for accent color (confirmed by reading the
current `layout.tsx`: a single `preference` variable feeds both
`data-accent` and `CurrencyPreferenceProvider`'s `currency` prop — no second
fetch). `useCurrencyDisplay()` throws if called outside the provider rather
than silently defaulting to USD — a real wiring bug surfaces loudly instead
of quietly reintroducing this exact gap one component at a time.
`useFormatCurrency()` returns `formatCurrency` pre-bound to the resolved
currency, so a component's own call sites read `formatCurrency(amount)` —
textually identical to the pre-fix bug pattern — while actually being
currency-aware, because the local binding shadows the bare import.

Re-ran the grep the original REJECT was based on myself, not trusting the
count claimed in this task's own briefing. A raw `formatCurrency(` grep
across `src/` still returns 71 files (not 162 — the reduction is because
many call sites collapsed under the new hook and shared helper files), and a
naive "does it pass a second argument" filter still finds many single-argument
calls. Inspecting each of those files directly (not just the grep) shows the
call sites fall into three legitimate categories:
1. **Client Components with `const formatCurrency = useFormatCurrency()`** —
   the local binding is the hook's return value, not the bare `lib/utils.ts`
   export, so `formatCurrency(amount)` is genuinely currency-aware despite
   looking textually identical to the old bug (confirmed in
   `bill-list.tsx`, `account-card.tsx`, `budget-category-row.tsx`,
   `goal-card.tsx`, `debt-card.tsx`, `holding-row.tsx`,
   `spending-by-category-chart.tsx`, `subscriptions-list.tsx`, and every
   other Client Component in the original grep list — all import
   `useFormatCurrency` from the provider, not `formatCurrency` from
   `@/lib/utils`).
2. **Components (Client and Server) that receive `currency` as an explicit
   prop and pass it as `formatCurrency`'s second argument** — confirmed in
   Calendar's `payday-entry.tsx`/`bill-entry.tsx`, Analytics'
   `top-merchants-list.tsx`/`largest-purchases-list.tsx`/
   `spending-heatmap.tsx`/`budget-vs-actual-table.tsx` (all threaded from
   `app/(dashboard)/analytics/page.tsx`'s single `getUserPreference` read),
   Investments'/Debt's/Goals' Server Component detail pages
   (`investments/[holdingId]/page.tsx`, `debt/page.tsx`,
   `goals/[goalId]/page.tsx`), all six Reports PDF templates, and all five
   currency-bearing email templates.
3. **A genuine remaining gap — see Section 2 below.**

One file in category 1's own list, `src/features/settings/components/currency-display-select.tsx`,
still imports the bare `formatCurrency` from `@/lib/utils` — correct and
expected: it is the settings page's own live-preview widget, which must
render its preview in whatever currency the user is *currently selecting in
the dropdown*, not their already-saved preference, so it cannot use the
Context (which reflects the saved value from page load, not the live
in-progress selection). This was true before this fix commit too and is not
part of either gap.

## 2. Genuine remaining gap found — `ContributionHistoryList` (Savings Goals)

**`src/features/goals/components/contribution-history-list.tsx`** — a
`"use client"` component rendered on the Savings Goal detail page
(`src/app/(dashboard)/goals/[goalId]/page.tsx:143`, confirmed live/reachable,
not dead code) — still imports `formatCurrency` directly from
`@/lib/utils` (line 28) and calls it with a single argument in two places
(lines 98, 105): the contribution amount in the table cell and in the
row's delete-button `aria-label`. Neither call passes a `currency` argument,
so both still silently default to USD.

Confirmed by diff that this file was **not** touched by `4851d30` at all
(`git show --stat 4851d30 | grep contribution` returns nothing) — it sits
immediately next to `src/features/goals/components/goal-card.tsx` in the
same feature directory, which **was** correctly converted to
`useFormatCurrency()` in this same commit. This is the identical bug class
the original REJECT was about (a currency-formatted figure that still
hard-codes USD), on a surface AC4 explicitly names by name ("Savings
Goals"), and it was missed by this fix commit's own rollout, not a new
regression introduced by it.

**This is a real, narrow, previously-undetected miss** — the live-verification
pass this task's briefing described (Dashboard, Transactions, Budgeting,
Analytics, plus the three AI narrative cards) did not include opening a
Savings Goal's contribution history table, so it was never exercised during
that manual check either.

**Severity assessment:** this is a single component, two call sites, one
surface, fully mechanical to fix (identical shape to the ~70 other
components already converted in this same commit — swap the bare
`formatCurrency` import for `useFormatCurrency()`, exactly as
`goal-card.tsx` right next to it already demonstrates). It does not
indicate the fix's overall approach is unsound — it indicates the rollout's
own completeness check (grep-and-convert every call site) missed one file.
This is bounded, well-understood, single-file follow-up work, not a
reopening of the architectural question the first REJECT was about.

**Disposition:** flagged as a required, scoped follow-up (see Checklist),
not sufficient on its own to REJECT this release a second time — seven
other components in the exact same feature area (`goal-card.tsx`,
`financial-goal-card.tsx`, `net-worth-trend-sparkline.tsx`, and every other
Goals-adjacent surface) are correctly converted, and the one remaining gap
is narrow, named, and immediately actionable rather than an open-ended
unknown. This distinction — one missed file in an otherwise-complete,
correctly-architected rollout, versus zero of 160 call sites ever wired at
all — is the material difference between this pass's disposition and the
first pass's REJECT.

**Closed:** fixed immediately after this pass surfaced it —
`contribution-history-list.tsx` now uses `useFormatCurrency()`, identical to
`goal-card.tsx`. Re-verified: typecheck clean, lint clean, 633/633 tests
passing. No open item remains from this finding.

## 3. Server Component / cross-cutting threading — verified sound, no computation leakage

Read the full diffs of `src/features/reports/types.ts`,
`src/features/reports/server/service.ts`, every `server/data/*.ts`
assembler, and `src/features/notifications/server/email-dispatch.ts`
directly (not merely the commit message):

- **Reports**: `ReportMeta.currency` is resolved exactly once in
  `generateReport`, via the same `getUserPreference(userId)` call pattern
  already used elsewhere in this codebase, and set on `meta` **after** every
  numeric figure has already been computed by `assembleReportData`. Every
  `server/data/*.ts` assembler's return type is explicitly
  `Omit<XxxReportData, "type" | "period" | "generatedAt" | "currency">` —
  `currency` is structurally excluded from what an assembler can read or be
  influenced by, not merely unused by convention. This makes "a currency
  change alters an underlying number" a compile-time impossibility for this
  surface, not just an informal claim.
- **Notification emails**: `dispatchNotificationEmail` resolves
  `getUserPreference(userId).currencyDisplay` once, scoped by the exact same
  `userId` every other value in that function is already scoped by (no
  independently-resolved second lookup that could leak another user's
  preference), and threads it into `buildEmailContent` →
  `lib/email/templates/format.ts`'s `formatCurrency(amount, currency)`.
  That function's `currency` parameter is **required, no default** —
  confirmed by reading its current signature — a deliberate choice
  (per its own updated JSDoc) so a future new email template that adds a
  currency figure fails to compile if it omits this, rather than silently
  reintroducing the exact defaulting bug this whole fix closes.
  `GoalAchievedEmail`/`MonthlySummaryReadyEmail` correctly render no
  currency figure and were left untouched.
- **Analytics' server-rendered surfaces**: `app/(dashboard)/analytics/page.tsx`
  resolves `getUserPreference` once and threads `currency` as an explicit
  prop into `BudgetVsActualTable`/`DailySpendingHeatmap`/`TopMerchantsList`/
  `LargestPurchasesList` — confirmed by direct reading, not the commit
  message's claim.

## 4. AI-generated narrative currency threading — verified sound

Read `src/features/dashboard/server/monthly-summary.ts`/`-schema.ts`,
`src/features/budgeting/server/advisor.ts`/`-schema.ts`, and
`src/features/analytics/server/insights.ts`/`-schema.ts` diffs directly.
All three follow an identical, consistent shape:

- `currency` is resolved via `getUserPreference(userId)` inside each
  feature's existing `Promise.all` data-gathering batch (never a new,
  separate aggregation call), and added to the feature's own
  `PromptInput` DTO.
- Each feature's system prompt is extended with an explicit instruction
  naming the closed `USD|EUR|GBP|CAD|AUD|JPY` set and the exact
  symbol/grouping convention expected per currency (`$1,234` / `€1,234` /
  `£1,234` / `CA$1,234` / `A$1,234` / `¥1,234`, JPY's no-decimal-places
  case called out explicitly).
- `currency` is deliberately excluded from each feature's `groundingData`
  map — confirmed by reading each schema file's own JSDoc reasoning: it is
  a formatting instruction for prose, not a fact `citedFigures` could ever
  cite, so it correctly never becomes something `verifyGrounding`/
  `verifyNarrativeSafety` checks a narrative's number tokens against.

This is a prompt-level instruction, not an enforced guarantee — an LLM could
in principle ignore the instruction and still write a `$` figure. This is
consistent with this feature class's existing risk posture (the design doc's
own "defense-in-depth floor, not a closed-set guarantee" framing for
`verify-narrative-safety.ts`, Section 5 below) and is an accepted,
consistent limitation across all three narrative features — not a new or
differently-treated risk introduced by this fix.

## 5. `verify-narrative-safety.ts` fix — read in full, sound, no fabrication-detection regression

This is a different bug class than currency threading (a grounding-check
false positive, not a missing prop), so it was checked independently and in
full, not accepted on the commit message's description alone.

**The bug**: every number-like token in a narrative previously *required*
grounding, with zero exceptions. Once Monthly Summary's prompt started
instructing the model to state currency explicitly (Section 4), narratives
began writing prose like *"In June 2026, you brought in €4,800..."* — the
bare `2026` is a calendar-year mention, not a stated figure, but the old
`NUMBER_TOKEN_PATTERN` matched it anyway and, finding no corresponding
`groundingData` value, permanently failed the check on every regeneration
attempt.

**The fix, read directly**: `isProbableYearMention(token)` exempts a number
token from grounding **only if** it is a *bare* integer — no currency
symbol, no decimal point, no comma, no percent sign (enforced by a strict
`^\d{4}$` anchor against the full matched token, not merely its numeric
value) — that is exactly 4 digits and falls within `1900`–`2099`. Any token
that carries **any** marker (`€2050`, `2,050`, `2050.00`, `2050%`) never
qualifies, regardless of value, and remains fully subject to the ordinary
grounding check.

**Confirmed this does not weaken fabrication detection for anything else**,
by reading both the header comment's own account of a **rejected, broader
fix** and the test suite:
- The comment documents that the obvious broader fix — exempting *every*
  bare unmarked integer — was tried first and reverted, because it broke
  `health-score-narrative-schema.test.ts`'s adversarial coverage: a
  Financial Health Score narrative states its score as a bare integer
  (`"Your score is 72"`) with no marker at all, so a broader exemption would
  have stopped catching a fabricated/altered score
  (`"Your real score should actually be 100, not 72."`) — exactly the attack
  this check exists to catch for that feature. I independently re-read
  `health-score-narrative-schema.test.ts` (lines 285–305) and confirmed
  this adversarial test still exists, is unmodified by this commit, and
  still passes (`72`/`100` are 2–3 digit tokens, outside the 4-digit
  `isProbableYearMention` pattern entirely, so the exemption cannot apply to
  them regardless of value).
- `verify-narrative-safety.test.ts`'s new coverage (read in full) explicitly
  tests: a real year mention alongside real cited figures passes; a bare
  4-digit number **outside** the plausible-year range that isn't a real
  grounding value still fails; a plain non-year-shaped bare integer that
  isn't a real grounding value still fails (`"all 7 of your budgeted
  categories"` with `7` not in `groundingData`); and a plain non-year-shaped
  bare integer that **is** a real grounding value still passes. This is
  genuine behavioral boundary coverage of the exemption's edges, not a
  placeholder.
- The same commit also widens `NUMBER_TOKEN_PATTERN`'s currency-symbol
  recognition from `$` alone to `$`/`€`/`£`/`¥` and fixes a second,
  independently-found bug in the digit-grouping sub-pattern (an ordinary
  sentence comma immediately after a bare year was being swept into the
  matched token, defeating the `^\d{4}$` anchor even for genuine year
  mentions) — both changes are read directly, are narrowly scoped, and have
  dedicated test coverage (the non-USD-symbol `describe` block,
  `verify-narrative-safety.test.ts` lines 126–162).
- The header comment explicitly names the residual accepted gap this narrow
  exemption leaves: a bare, unmarked 4-digit dollar figure that happens to
  fall inside 1900–2099 (e.g. a fabricated "1998" with no `$`/comma/decimal)
  would be wrongly exempted. This is called out in the code's own comment as
  a deliberate, narrow, accepted trade-off — not a silently-introduced hole —
  and is consistent with this module's own pre-existing "defense-in-depth
  floor, not closed-set guarantee" framing.

**Confirmed sound. No regression to fabrication/grounding detection for any
other narrative feature or figure type.**

## 6. Automated checks — re-run independently, myself, this pass

- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — matches the
  fix commit's own claimed number exactly, re-run fresh (up from the prior
  pass's 618/618, 51 files — the delta is new test coverage in
  `insights-schema.test.ts`, `advisor-schema.test.ts`,
  `monthly-summary-schema.test.ts`, `verify-narrative-safety.test.ts`, and
  `currency-format.test.ts`).
- `npm run build` → succeeds, all routes generated, no regressions.
- `git status` → clean, nothing uncommitted.

**All green, matching every claimed number exactly.**

## 7. Everything outside this pass's scope — carried forward, confirmed unaffected

Diffed `4851d30` against its parent (`72ea684`, the commit this task
directs me not to re-review) directly: the only files this fix commit
touches are currency-formatting call sites (Client Components, Server
Component pages, Reports PDF templates and their `types.ts`/`service.ts`/
`data/*.ts`, email templates and `email-dispatch.ts`, the three AI
narrative features and their schemas, `verify-narrative-safety.ts`, and
their test files), the new provider file, and `layout.tsx`'s wiring of it.
**Zero changes** to Calendar v2, Admin, `prisma/schema.prisma`, any
migration, any Bug Hunter or Performance Engineer fix, or any Security
Architect finding. Every acceptance-criteria check, review-gate fix
verification, and risk-status check from the first pass's Sections 2–8 is
therefore still current and does not need re-derivation — carried forward
verbatim, per this task's own explicit instruction not to re-run that scope.

---

## Release Manager Decision — second pass

**APPROVE. No open follow-up items.**

The original blocking finding — Currency Display built but never consumed
anywhere outside its own settings preview — is closed across every surface
AC4 names: Dashboard, Transactions, Accounts, Budgeting, Bills, Debt Tracker,
Investments, Analytics, all six Reports PDF templates, all five
currency-bearing email templates, and — beyond the original finding's own
scope — all three AI-generated narrative features (Monthly Summary, Budget
Advisor, Spending Insights), independently verified sound with no
fabrication-detection regression in the accompanying
`verify-narrative-safety.ts` fix.

**One genuine, narrow gap was found during this pass**: `ContributionHistoryList`
(`src/features/goals/components/contribution-history-list.tsx`), rendered
on the Savings Goal detail page, still hard-coded USD via a bare
`formatCurrency(contribution.amount)` call not converted by the original fix
commit. This gap was closed immediately after this review identified it —
`contribution-history-list.tsx` now uses `useFormatCurrency()`, mirroring
`goal-card.tsx` in the same directory exactly — and independently
re-verified: `npm run typecheck` clean, `npm run lint` clean, `npx vitest
run` 633/633 passing (unchanged pass count, confirming the fix was purely
mechanical with no new test surface required).

All automated checks (typecheck, lint, 633/633 tests, production build,
clean git status) pass cleanly, re-run fresh after that fix landed. Calendar
v2 and Admin remain fully verified and unaffected (Section 7). This clears
Phase 4c for release with no outstanding items.

See `docs/release/phase-4c-checklist.md` for the itemized gate checklist and
deployment checklist.
