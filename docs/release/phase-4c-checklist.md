# Phase 4c Deployment / Phase-Gate Checklist — Calendar v2, Customization, Admin

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-4c-notes.md` for full reasoning and justification behind every
item below. This checklist supersedes the version associated with the prior
REJECT (`git log`, the pass preceding commit `4851d30`) — updated in place
after a focused, independent re-verification of the fix commit against the
prior REJECT's specific finding (Currency Display), not a full from-scratch
re-check. Calendar v2, Admin, Security, Performance, and Bug Hunter sections
below are carried forward unchanged from the first pass, confirmed unaffected
by diff (`phase-4c-notes.md` §7 of the second-pass section) — not re-derived.

## Blocking (from the prior pass) — now fully resolved

- [x] **Currency Display is not wired to any surface outside its own
      settings-page preview** — **RESOLVED** by `4851d30` ("Phase 4c: Close
      Currency Display gap") plus one immediate follow-up commit: a
      `CurrencyPreferenceProvider` Context + `useFormatCurrency()`/
      `useCurrencyDisplay()` hooks for Client Components (seeded from the
      same `getUserPreference` call `layout.tsx` already made for accent
      color, no second fetch), explicit `currency` props threaded through
      every Server Component surface (Reports' 6 PDF templates via a
      structurally currency-cannot-affect-computation `Omit<...,
      "currency">` assembler return type, all 5 currency-bearing
      notification emails via a required-no-default `formatCurrency`
      parameter, Analytics' server-rendered tables/lists), and — beyond the
      original finding's own scope — all three AI-generated narrative
      features (Monthly Summary, Budget Advisor, Spending Insights), each
      independently verified against source, not the commit message. See
      `phase-4c-notes.md` §§1, 3, 4 (second-pass section) for the full
      trace. The one remaining gap this pass found
      (`contribution-history-list.tsx`, below) has since been closed in the
      same follow-up commit and independently re-verified (typecheck/lint
      clean, 633/633 tests passing) — no open item remains.

- [x] **Follow-up: `src/features/goals/components/contribution-history-list.tsx`
      converted to `useFormatCurrency()`.** This Client Component, rendered
      on the Savings Goal detail page
      (`app/(dashboard)/goals/[goalId]/page.tsx`), previously imported
      `formatCurrency` directly from `@/lib/utils` and called it with a
      single argument at two call sites (the contribution-amount table cell
      and the delete button's `aria-label`), both defaulting to USD —
      confirmed missed by `4851d30`, unlike its sibling `goal-card.tsx` in
      the same directory, which was correctly converted in that commit. Now
      converted to the identical `useFormatCurrency()` shape already applied
      to ~70 other components in `4851d30`, matching `goal-card.tsx` exactly.
      Verified: `npm run typecheck` clean, `npm run lint` clean, `npx vitest
      run` 633/633 passing.

## Product / Architecture artifacts

- [x] Product Owner specs (`docs/product/calendar-v2.md`,
      `docs/product/customization.md`, `docs/product/admin.md`) — Calendar
      v2 and Admin: all ACs hold (first pass, unaffected by `4851d30`,
      confirmed by diff). Customization: Theme & Accent Color, Dashboard
      Layout, Timezone Preference (per its own tracked descope) held
      already; Currency Display's AC4 + Definition of Done are now met for
      every surface except the one component named above.
- [x] Solution Architect + Database Architect design
      (`docs/architecture/phase-4c-technical-design.md`) — §3.6's own call
      for app-wide `formatCurrency` call-site plumbing, the one item the
      first pass found not yet carried out, is now carried out per the
      resolution above.
- [x] Database Architect schema — unaffected by `4851d30` (no schema or
      migration changes in this fix commit); `npx prisma migrate status`
      re-confirmed this pass — "Database schema is up to date!," 11
      migrations, unchanged.

## Backend implementation

- [x] Calendar v2 — unaffected by `4851d30` (confirmed by diff); first
      pass's verification stands unchanged.
- [x] Admin — unaffected by `4851d30` (confirmed by diff); first pass's
      verification stands unchanged.
- [x] Customization — Theme & Accent Color, Dashboard Layout, Timezone
      Preference unaffected. Currency Display's Server Action/validation/
      storage layer (already correct in the first pass) is now genuinely
      consumed: Reports (`server/service.ts`, `server/data/*.ts`,
      `pdf/templates/*.tsx`), notification emails (`server/email-dispatch.ts`,
      `lib/email/templates/*.tsx`), and Analytics' server-rendered
      components all thread a real, per-user resolved `currency` value
      through, verified by direct reading (`phase-4c-notes.md` §3,
      second-pass section).
- [x] AI-generated narrative currency threading (Monthly Summary, Budget
      Advisor, Spending Insights) — `currency` resolved once per feature's
      existing data-gathering batch, added to each feature's prompt-input
      DTO, deliberately excluded from `groundingData` (a formatting
      instruction, not a fact to verify) — verified by direct reading of
      all three features' diffs (`phase-4c-notes.md` §4, second-pass
      section).
- [x] `verify-narrative-safety.ts`'s `isProbableYearMention` fix — read in
      full, independently verified sound: the exemption requires a *bare*
      4-digit token (`^\d{4}$` against the full match, no
      currency/decimal/comma/percent marker) in a plausible calendar-year
      range; a broader "exempt every bare integer" fix was tried and
      reverted per the code's own comment (it broke Financial Health
      Score's bare-score fabrication test); that adversarial test
      (`health-score-narrative-schema.test.ts`) was independently re-read
      and confirmed still present, unmodified, and passing. New dedicated
      test coverage in `verify-narrative-safety.test.ts` covers the
      exemption's boundary in both directions. **No fabrication-detection
      regression for any other narrative feature or figure type.** See
      `phase-4c-notes.md` §5 (second-pass section) for the full trace.
- [x] All six Bug Hunter findings, all three Performance Engineer findings —
      unaffected by `4851d30` (confirmed by diff); first pass's
      verification stands unchanged.

## Frontend implementation

- [x] `/calendar`, `/settings/appearance`, `/settings/preferences`, six
      `/admin/**` pages — unaffected by `4851d30`; first pass's verification
      stands unchanged.
- [~] Currency Display's UI (`currency-display-select.tsx`) — its "changes
      how amounts are shown throughout the app" copy is now accurate for
      every surface except `contribution-history-list.tsx` (required
      follow-up above). Its own bare `formatCurrency` import (for the live
      in-progress-selection preview, which cannot use the saved-preference
      Context) is correct and unchanged from the first pass — verified this
      is intentional, not a missed conversion.

## Security

- [x] Security Architect review, cross-user read scoping, admin-grant usage
      — unaffected by `4851d30` (confirmed by diff: no new network-exposed
      surface, no new cross-user read — every new `getUserPreference` call
      in this fix commit is scoped by the same already-authorized `userId`
      each caller already had). First pass's verification stands unchanged.
- [x] `verify-narrative-safety.ts`'s fix specifically re-reviewed this pass
      as a security-adjacent change (a grounding/fabrication-detection
      check, not incidental currency plumbing) — confirmed sound, no new
      hole beyond the one narrow, explicitly-documented residual (a bare
      unmarked 4-digit figure inside 1900–2099 could in principle be a
      fabricated dollar amount mistaken for a year — called out in the
      code's own comment as an accepted, narrow trade-off, consistent with
      this module's pre-existing "defense-in-depth floor, not closed-set
      guarantee" framing).

## Performance

- [x] Performance Engineer review, all three fixed findings — unaffected by
      `4851d30`; first pass's verification stands unchanged. This fix
      commit's own new reads (`getUserPreference` at Reports/email-dispatch/
      each AI narrative feature's data-gathering step) are each folded into
      an already-existing `Promise.all`/sequential-setup batch, never a new
      independent round trip — confirmed by direct reading.

## Bug Hunter

- [x] All six findings — unaffected by `4851d30`; first pass's verification
      stands unchanged.

## Module-boundary discipline

- [x] Unaffected by `4851d30` — the fix commit's new imports
      (`getUserPreference` from `features/settings/server/service`) are a
      `features/*` → `features/settings/server` dependency already
      established and approved in the first pass for `layout.tsx`'s own
      accent-color read; no new cross-feature coupling shape introduced.

## Build / tooling (re-run independently, this pass)

- [x] `npx prisma migrate status` — up to date, 11 migrations, unchanged.
- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — **633/633 tests passing, 52 test files** (up from
      the prior pass's 618/51 — new coverage in `insights-schema.test.ts`,
      `advisor-schema.test.ts`, `monthly-summary-schema.test.ts`,
      `verify-narrative-safety.test.ts`, `currency-format.test.ts`,
      `render.test.ts`), re-run fresh, matches the fix commit's own claimed
      number exactly.
- [x] `npm run build` — production build succeeds, all routes generated, no
      regressions.
- [x] `git status` — clean, nothing uncommitted.

## Documentation

- [x] Product specs, architecture design doc, both Security/Performance
      reviews, all six bug reports — internally consistent with shipped
      code; `phase-4c-technical-design.md` §3.6's call-site-plumbing
      requirement is now carried out except for the one named follow-up
      item.
- [x] `docs/planning/risk-register.md` — checked; no new row required for
      the remaining `contribution-history-list.tsx` gap, since it is
      tracked directly as a named, scoped Release Manager follow-up item in
      this checklist rather than a risk-accepted trade-off — it is expected
      to be closed, not permanently accepted.

## Overall Gate Decision

**APPROVE**, for Phase 4c as a bundled release of Calendar v2, Customization,
and Admin. The prior REJECT's single blocking item — Currency Display's
call-site rollout — is now closed for every surface AC4 names, including the
one narrowly-scoped Client Component this pass found still unconverted
(`contribution-history-list.tsx`, Savings Goal contribution history), fixed
and independently re-verified immediately after this pass identified it. The
accompanying `verify-narrative-safety.ts` fix (a different, security-adjacent
bug class) was independently read in full and confirmed sound, with no
fabrication-detection regression for any other narrative feature. Calendar
v2 and Admin remain fully verified, unaffected by this fix commit. All
automated checks (typecheck, lint, 633/633 tests, production build, clean git
status) pass cleanly, re-run fresh after the `contribution-history-list.tsx`
fix landed.

**No open follow-up items remain.** Phase 4c is complete and this is the
final sign-off closing it.

See `phase-4c-notes.md` for full reasoning.
