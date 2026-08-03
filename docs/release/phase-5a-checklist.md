# Phase 5a Deployment / Phase-Gate Checklist — Accessibility & Responsive Foundation

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5a-notes.md` for full reasoning and justification behind every
item below (first pass, REJECT), and `phase-5a-second-pass.md` for the
targeted re-check (second pass, APPROVE) that closed the blocking item below
and re-verified the two secondary findings. **Gate status: APPROVED —
Phase 5a is fully closed**, per the second pass. The single blocking item and
the two secondary items are updated in place below to reflect that pass's
findings, rather than duplicating the whole document.

## Blocking

- [x] **RESOLVED (second pass).** 5 of 6 accent-color presets (blue, violet,
      emerald, rose, teal) failed WCAG 2.1 AA color-contrast (4.5:1) on their
      real, rendered `bg-primary` button text in light mode, plus the
      focus-visible ring failing the 3:1 non-text floor for
      emerald/amber/teal — first-pass finding, `phase-5a-notes.md` §1.
      Fixed in commit `3362fab`: `src/app/globals.css`'s light-mode
      `--primary`/`--ring` tokens darkened per-preset (blue `#2563eb`,
      violet `#7c3aed`, emerald `#047857`, rose `#be123c`, teal `#0f766e`,
      amber's `--ring` specifically `#b45309`), each verified against real
      WCAG relative-luminance math before shipping. **Independently
      re-derived by the second pass** for 5 of the 6 changed values (own
      contrast-formula computation, not trust in the shipped comment) — all
      matched to within rounding. A new regression test,
      `tests/e2e/accessibility/accent-contrast.spec.ts`, parametrizes over
      all 6 `ACCENT_COLOR_OPTIONS` presets, selects each via the real
      `/settings/appearance` UI, reloads, navigates to `/transactions`, and
      asserts zero critical/serious axe color-contrast violations on the real
      "Add transaction" button — confirmed by the second pass to be a
      genuine, non-trivially-passing test (real UI interaction, real reload,
      real axe scan), closing the actual regression-coverage gap the first
      pass identified. See `phase-5a-second-pass.md` §1.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5a-accessibility-responsive.md`)
      — every AC and DoD bullet checked against real evidence, not summaries.
      All hold, including AC5/the color-contrast DoD bullet (resolved above).
- [x] Solution Architect design (`docs/architecture/phase-5a-technical-design.md`)
      — Playwright/axe-core bootstrap, `BottomNav`'s component boundary,
      `ResponsiveDataTable`/`DataTableCardList`'s `meta.cardDisplay`
      mechanism, and Calendar v2's `DayDetailSheet` design all confirmed
      matching shipped code by direct inspection.
- [x] CTO kickoff pass + Phase 5a CTO resolution pass (`roadmap.md`) — binding
      constraints (WCAG 2.1 AA, three named breakpoints, 44×44px touch
      targets, bottom-nav's additive/non-replacing relationship) all honored
      in the shipped implementation, confirmed by direct spot-check, not
      re-derived from scratch.
- [~] Risk register (`docs/planning/risk-register.md` rows #39–#52) —
      **two of the first pass's three recommended updates are made**; the
      third (a durable risk-register row for the accent-contrast gap itself)
      remains a recommended, non-blocking follow-up:
      1. **Not yet added**: a new row for the now-closed accent-contrast gap
         (Section 1, above), so the "AC5 was never actually executed against
         non-default presets" root cause has a durable record beyond this
         release document. Still recommended for the CTO/Solution
         Architect's next pass to action.
      2. **Done** (second pass, §2) — the Goals `toGoal()` Decimal-leak
         instance now has its own bug report
         (`docs/testing/bug-reports/goals-toGoal-leaks-raw-decimal-contributions-to-client.md`);
         no dedicated risk-register row was added for the leak *pattern*
         itself, unchanged recommendation, still non-blocking.
      3. **Mostly done** (second pass, §3) — Row #46's/#51's "six
         consumers" claims are corrected to "five" in `risk-register.md` and
         `roadmap.md`. **One instance remains uncorrected** in
         `docs/architecture/phase-5a-technical-design.md` (line 187, §3.1's
         opening sentence still reads "Six consumers" against the "5 existing
         consumers" sentence two paragraphs later in the same section) — a
         residual, non-blocking paperwork gap, see
         `phase-5a-second-pass.md` §3.

## Automated checks (re-run independently, both passes)

- [x] `npm run typecheck` — clean, 0 errors (first pass and second pass).
- [x] `npm run lint` — clean, 0 errors/warnings (first pass and second pass).
- [x] `npx vitest run` — 633/633 tests passing, 52 test files (first pass and
      second pass — identical count, consistent with no unit-tested surface
      being touched by the fix commit).
- [x] `npm run build` — production build succeeds, all 45 routes generated
      (first pass; not re-run second pass, no route/component code changed
      beyond CSS tokens and one converter function).
- [x] `npx prisma migrate status` — up to date, 11 migrations, confirming
      zero schema change this phase (first pass; unaffected by the fix
      commit).
- [x] `git status` — clean on both passes; second pass additionally confirmed
      `3362fab` is on `master`, pushed to `origin/master`.

## Accessibility

- [x] Automated axe-core coverage, default theme — 32/32 routes passing,
      zero critical/serious violations, zero moderate/minor findings — live
      re-run by the first pass, matches `accessibility-run-report.md`'s final
      claim exactly.
- [x] **RESOLVED (second pass).** Automated axe-core coverage, non-default
      accent presets — built in `3362fab`
      (`tests/e2e/accessibility/accent-contrast.spec.ts`), confirmed genuine
      by direct read (second pass). Per the fix commit's own message, a fresh
      live run passed all 6 presets plus a clean 39/39 on the full
      accessibility route gate; corroborated by
      `docs/testing/e2e/accessibility-report.md`'s auto-generated timestamp
      advancing to a new run. Not independently re-executed by the second
      pass (out of this pass's explicit scope — see
      `phase-5a-second-pass.md` §1's own noted limitation).
- [x] Keyboard-only operability / focus-trap / focus-return — Radix's
      built-in behavior confirmed sound for every ordinary `Trigger`-driven
      `Dialog`/`Sheet` (Security review §1.5, Architecture doc §5.2); the two
      genuine gaps Bug Hunter found (externally-triggered `BottomNav`
      "More" and `DayDetailSheet`) are fixed and independently re-verified
      sound against the bug report (`phase-5a-notes.md` §2.4).
- [x] Screen-reader flows — 9 named flows built under `tests/e2e/flows/`,
      28/28 passing (2 desktop-only variants intentionally skipped for
      Transactions' table-dependent steps, per that suite's own documented
      scope).
- [x] Touch targets (44×44px) — Bug Hunter's High-severity finding fixed
      and verified (kebab menu, Mark Paid/Received buttons).
- [x] Form labels / icon-only accessible names / landmarks/headings — covered
      by the passing axe-core run (default theme) and the structural-fix
      commits (`2c659d1`, `ea5a102`), which directly targeted these rule
      classes.
- [x] `BottomNav` meets the same Accessibility DoD as every other route's
      chrome — confirmed part of the passing axe-core run; `aria-current`/
      `isActivePath` reuse and 44px sizing confirmed by direct source read.

## Responsive

- [x] All 30 individually-testable paths × 3 breakpoints — 92/92 passing the
      automatable "no horizontal page scroll" half of AC2, per
      `responsive-run-report.md`.
- [x] Card-list mobile treatment (Transactions, Admin's `UserTable`/
      `AuditLogTable`, Bills'/Recurring Income's `OccurrenceHistoryTable`) —
      confirmed all 5 real consumers correctly render `<ResponsiveDataTable>`,
      verified by direct source read of each file's own JSX.
- [x] `BottomNav` breakpoint — confirmed `flex sm:hidden` in the actual
      shipped file, not `md:hidden` (Risk #50's own named hazard), by direct
      source read.
- [x] Calendar v2's condensed-grid-plus-tap-to-expand mobile treatment —
      `DayDetailSheet`/`day-entry-indicators.tsx` confirmed present and
      wired per the architecture doc's design; focus-return regression fixed
      (Bug Hunter, above).
- [x] Reports' column-priority collapse, Analytics' horizontal-scroll-with-
      affordance (`ScrollAffordanceContainer`, 6 real chart consumers) —
      confirmed present per the Performance Engineer's own direct-measurement
      review (unaffected by anything since).
- [~] `ResponsiveDataTable`'s shared toolbar renders twice in the DOM
      (`responsive-data-table-toolbar-duplicated-in-dom.md`, Medium) —
      reviewed and agreed as acceptable, tracked, non-blocking debt: no
      visible defect to a sighted user, no binding AC violated, already
      named/owned/reported with a concrete suggested fix.

## Security

- [x] Security Architect review (`docs/security/phase-5a-security-review.md`)
      — APPROVE, confirmed still current: no code in `3362fab` (CSS tokens,
      one converter function narrowing its own return shape, a new
      test-only Playwright spec, documentation) introduces any new Server
      Action, Route Handler, or data-egress surface. Unaffected by the
      second pass's fix commit.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5a-performance-review.md`) — APPROVE,
      confirmed still current: bundle-size delta negligible (+1 kB shared
      First Load JS), `ResponsiveDataTable`'s dual-render cost is real but
      bounded/pagination-capped (Finding 1, non-blocking, recommended
      opportunistic `cardDisplay: "hidden"` follow-up), Calendar v2's
      dual-render cost confirmed genuinely minor (Finding 2). Unaffected by
      the second pass's fix commit.

## Bug Hunter

- [x] 4 findings total, 3 fixed (2 High + 1 Medium) and independently
      re-verified against each bug report's own reproduction steps and
      suggested fix shape (`phase-5a-notes.md` §2.4); 1 Medium (toolbar
      duplication) accepted as tracked debt, reviewed and agreed.
- [x] **RESOLVED (second pass).** The previously-untracked Medium-severity
      Goals `toGoal()` Decimal leak (`phase-5a-notes.md` §2.5) is fixed in
      `3362fab` (named-field construction, identical to the Debt fix) and has
      its own bug report,
      `docs/testing/bug-reports/goals-toGoal-leaks-raw-decimal-contributions-to-client.md`
      — confirmed sound by direct source read, second pass
      (`phase-5a-second-pass.md` §2).

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports — internally consistent with shipped
      code, confirmed by direct diff/source inspection, not taken on any
      report's summary.
- [~] `docs/planning/risk-register.md` / `roadmap.md` /
      `phase-5a-technical-design.md` — the "six" vs "five"
      `ResponsiveDataTable`-consumer miscount is corrected in
      `risk-register.md` (#46, #51) and `roadmap.md` in full; **one instance
      remains uncorrected** in `phase-5a-technical-design.md` (line 187) —
      non-blocking (no functional/test/shipped-behavior gap; every real
      consumer remains correctly migrated), flagged for the next pass that
      touches that document. See `phase-5a-second-pass.md` §3.

## Overall Gate Decision

**APPROVE. Phase 5a is fully closed.**

The first pass's sole blocking finding (accent-color contrast, Section
"Blocking" above) is fixed and independently re-verified by the second pass
— correct WCAG math, a genuine live-UI regression test closing the actual
coverage gap, dark-mode values unaffected. Both secondary, non-blocking
findings from the first pass are substantively resolved: the Goals
Decimal-leak fix matches the established Debt-fix pattern exactly and has its
own bug report; the "six"/"five" documentation miscount is corrected in two
of three flagged documents in full, with one residual line in
`phase-5a-technical-design.md` still reading "Six consumers" — a cosmetic,
non-blocking gap noted for the next documentation touch, not a reason to
withhold this approval.

Phase 5b's Product Owner spec pass may now begin.

See `phase-5a-notes.md` (first pass, REJECT) and `phase-5a-second-pass.md`
(second pass, APPROVE) for full reasoning.
