# Phase 5a Deployment / Phase-Gate Checklist — Accessibility & Responsive Foundation

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-5a-notes.md` for full reasoning and justification behind every
item below.

## Blocking

- [!] **5 of 6 accent-color presets (blue, violet, emerald, rose, teal) fail
      WCAG 2.1 AA color-contrast (4.5:1) on their real, rendered
      `bg-primary` button text in light mode** — live-confirmed via this
      project's own `@axe-core/playwright` tooling against the real
      `/settings/appearance` → `/transactions` "Add transaction" button
      (measured: blue 3.67, violet 4.23, emerald 2.53, rose 3.67, teal 2.48 —
      all below the 4.5 floor; amber passes at 8.35 dark-on-amber). The
      focus-visible ring (`--ring`, equal to `--primary`) additionally fails
      WCAG 1.4.11's 3:1 non-text floor against the light-mode page background
      for emerald (2.54), amber (2.15), and teal (2.49). Accessibility AC5's
      binding "14 combinations, every one of them audited" requirement was
      never executed for any of the 6 named presets — the only automated
      coverage this phase built (`route-a11y.spec.ts`) runs exclusively
      against the no-accent-set default, and `src/app/globals.css`'s
      `[data-accent="...]` block has zero commits touching it anywhere in
      this phase's range. **Required before re-review**: a targeted CSS
      custom-property adjustment inside the existing `[data-accent="..."]`/
      `.dark [data-accent="..."]` blocks (darker `--primary` and/or a dark
      `--primary-foreground` for blue/violet/rose; a materially darker
      `--primary` for emerald/teal, whose gap is too large for a foreground
      swap alone; a `--ring` adjustment for emerald/amber/teal) — per the
      spec's own explicit "fix the token, never remove the preset" Edge
      Case. Recommended, not required for gate-passing but strongly
      encouraged to prevent a silent regression: extend
      `route-a11y.spec.ts`/a new spec to iterate the 6 presets so this class
      of gap cannot recur undetected. Owner: Frontend Lead / UI Component
      Engineer, per the spec's own attribution of accent-token fixes.

## Product / Architecture artifacts

- [x] Product Owner spec (`docs/product/phase-5a-accessibility-responsive.md`)
      — every AC and DoD bullet checked against real evidence, not summaries.
      All hold except AC5/the color-contrast DoD bullet (blocking, above).
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
      accurately reflects what was planned and decided at each architecture
      pass. **Two updates recommended, not yet made** (this review does not
      edit `risk-register.md` itself, per this role's remit — flagged here
      for the CTO/Solution Architect's next pass to action):
      1. A new row for the accent-contrast gap (Section 1, blocking) once
         closed, so the "AC5 was never actually executed against non-default
         presets" root cause has a durable record beyond this release
         document.
      2. A new row (or an extension of Risk #46) for the
         previously-untracked Goals `toGoal()` Decimal-leak instance found by
         this pass (`phase-5a-notes.md` §2.5) — same bug class as the
         already-fixed Debt leak, Medium severity, not blocking, but
         currently has no bug report or owner anywhere.
      3. Row #46's "six consumers... confirmed by direct grep" claim is
         off-by-one against the actual, current, correct count of five real
         `ResponsiveDataTable` consumers (`phase-5a-notes.md` §2.4) — a
         paperwork correction, not a functional gap (all five real consumers
         are correctly migrated).

## Automated checks (re-run independently, this pass)

- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — 633/633 tests passing, 52 test files.
- [x] `npm run build` — production build succeeds, all 45 routes generated.
- [x] `npx prisma migrate status` — up to date, 11 migrations, confirming
      zero schema change this phase.
- [x] `git status` — clean; this pass's own temporary verification probes
      (under `tests/e2e/_probe-*.spec.ts`) were deleted after use, no trace
      left.

## Accessibility

- [x] Automated axe-core coverage, default theme — 32/32 routes passing,
      zero critical/serious violations, zero moderate/minor findings — live
      re-run by this pass, matches `accessibility-run-report.md`'s final
      claim exactly.
- [!] Automated axe-core coverage, **non-default accent presets** — never
      built (see Blocking, above). This is the one piece of AC2/AC5's own
      binding coverage requirement genuinely missing, not merely unverified.
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
      confirmed all 5 real consumers (not 6 — see the paperwork note above)
      correctly render `<ResponsiveDataTable>`, verified by direct source
      read of each file's own JSX.
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
      — APPROVE, confirmed still current: no code this pass reviewed
      (Bug Hunter's 3 fixes, all presentation-layer) introduces any new
      Server Action, Route Handler, or data-egress surface. Test-credential
      handling (env-var-sourced password, production guard, no test-only
      auth bypass) independently spot-checked sound.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-5a-performance-review.md`) — APPROVE,
      confirmed still current: bundle-size delta negligible (+1 kB shared
      First Load JS), `ResponsiveDataTable`'s dual-render cost is real but
      bounded/pagination-capped (Finding 1, non-blocking, recommended
      opportunistic `cardDisplay: "hidden"` follow-up), Calendar v2's
      dual-render cost confirmed genuinely minor (Finding 2).

## Bug Hunter

- [x] 4 findings total, 3 fixed (2 High + 1 Medium) and independently
      re-verified against each bug report's own reproduction steps and
      suggested fix shape (`phase-5a-notes.md` §2.4); 1 Medium (toolbar
      duplication) accepted as tracked debt, reviewed and agreed.
- [~] **1 new, previously-untracked Medium-severity finding surfaced by this
      Release Manager pass itself** (`goals/server/service.ts`'s `toGoal()`
      Decimal leak, `phase-5a-notes.md` §2.5) — same bug class as the
      already-fixed Debt leak, same non-blocking severity profile, but
      currently has no bug report or owner. Recommended follow-up: a Bug
      Hunter report + the identical named-field-construction fix Debt
      already received.

## Documentation

- [x] Product spec, architecture design doc, both Security/Performance
      reviews, all four bug reports — internally consistent with shipped
      code, confirmed by direct diff/source inspection, not taken on any
      report's summary.
- [~] `docs/planning/risk-register.md` — three recommended updates not yet
      made (see Product/Architecture artifacts section above); none
      block this gate on their own, but should be actioned in the same pass
      that closes the blocking finding.

## Overall Gate Decision

**REJECT**, pending the accent-color contrast fix (Section 1 /
`phase-5a-notes.md` §1). Everything else in Phase 5a — the 32/32
accessibility route sweep, the 92/92 responsive breakpoint sweep, all four
automated checks, all four Bug Hunter findings' dispositions, and both the
Security and Performance Engineer's APPROVE verdicts — is independently
re-verified and holds. This is a narrow, well-scoped, single-root-cause fix
(a CSS custom-property adjustment to 5–6 lines in `globals.css`, per the
spec's own prescribed remedy), not a reopening of this phase's architecture
or scope. Once landed, a second, targeted Release Manager pass — re-checking
only Section 1's specific finding, the same "targeted re-check" convention
`phase-4c-notes.md`'s own second pass established — can close this phase.

Phase 5a is **not yet complete**. Phase 5b's Product Owner spec pass must not
begin until this gate passes, per this roadmap's own binding phase-gate rule.

See `phase-5a-notes.md` for full reasoning.
