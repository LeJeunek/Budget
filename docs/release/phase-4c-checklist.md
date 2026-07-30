# Phase 4c Deployment / Phase-Gate Checklist — Calendar v2, Customization, Admin

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-4c-notes.md` for full reasoning and justification behind every
item below. This is the first Release Manager pass for Phase 4c.

## Blocking

- [!] **Currency Display (`docs/product/customization.md`, Currency Display
      capability, AC4 + Definition of Done) is not wired to any surface
      outside its own settings-page preview.** `formatCurrency`'s `currency`
      parameter is only ever passed at 2 of 162 call sites in `src/`
      (both inside `currency-display-select.tsx`'s own live preview) — every
      other currency-formatted figure in the product (Dashboard cards/charts,
      Transactions, Accounts, Budgeting, Bills, Debt Tracker, Investments,
      Savings/Financial Goals, Analytics, all six Reports PDF templates, all
      six notification/email templates) always renders fixed USD regardless
      of a user's saved `UserPreference.currencyDisplay`. Confirmed by direct
      grep and file reading, not assumed. No CTO descope, no risk-register
      entry, and no mention in any of this phase's three review-gate
      documents acknowledges this as an accepted gap — unlike Timezone's
      explicitly-tracked (Risk #29) consuming-logic deferral in this same
      spec, this is a genuine, unacknowledged miss. The settings page's own
      shipped copy ("changes how amounts are shown throughout the app") is
      false as currently implemented. See `phase-4c-notes.md` §1 for the
      full trace and the required fix shape. **Blocks this release.**

## Product / Architecture artifacts

- [x] Product Owner specs (`docs/product/calendar-v2.md`,
      `docs/product/customization.md`, `docs/product/admin.md`) — every AC
      checked directly against shipped code. Calendar v2: all 13 ACs hold.
      Admin: all six capabilities' ACs hold. Customization: Theme & Accent
      Color, Dashboard Layout, and Timezone Preference (per its own explicit,
      tracked descope) hold; Currency Display does not (blocking item above).
- [x] Solution Architect + Database Architect design
      (`docs/architecture/phase-4c-technical-design.md`) — all five schema
      questions (admin `role` column, Calendar v2's zero-schema composition,
      `UserPreference`/`DashboardCardPreference`, `SystemCategoryTemplate`,
      `ReportGenerationEvent`) implemented as specified; `lib/feature-flags.ts`
      and `AdminActionLog` (the two items the CTO's five questions didn't
      anticipate) both present and correctly scoped. §3.6's own explicit
      call for app-wide `formatCurrency` call-site plumbing is the one part
      of this document not yet carried out — see blocking item above.
- [x] Database Architect schema — both migrations applied and confirmed via
      `npx prisma migrate status` ("Database schema is up to date!," 11
      migrations): the schema pass
      (`20260729145632_phase_4c_calendar_customization_admin`) and the
      performance follow-up
      (`20260730015719_phase_4c_perf_followup_audit_log_timestamp_indexes`).

## Backend implementation

- [x] Calendar v2 — `features/calendar/server/service.ts`, confirmed pure
      composition (zero Prisma imports, zero status-computation calls),
      correctly does not read `UserPreference.timezone` (Risk #29 descope
      intact).
- [x] Admin — `features/admin/server/{users,audit-log,feature-flags,demo-data,actions}.ts`,
      `features/categories/server/template.ts`, `features/reports/server/audit.ts`,
      `lib/feature-flags.ts`, `scripts/grant-admin.ts` — all six mutations
      confirmed to check `getCurrentAdminUser()` as their literal first
      statement; all three cross-user read functions confirmed reachable
      only from behind the admin-gated layout.
- [~] Customization — `features/settings/server/{actions,service,validation}.ts`
      — Theme & Accent Color, Dashboard Layout, and Timezone Preference all
      verified correct and race-safe; Currency Display's own
      Server Action/validation/storage layer is itself correct, but nothing
      downstream consumes its output (blocking item above).
- [x] All six Bug Hunter findings — genuinely resolved (two High TOCTOU races
      via genuine Serializable-isolation fixes with the guard re-verified
      inside the transaction, the P2025 gap, the `TimezoneSchema` gap, the
      seed-demo-data precondition gap) or genuinely, documentedly deferred
      (the audit-log cursor tie-timestamp gap) — each independently
      re-verified against current source, not the fix commit's own message.
- [x] All three Performance Engineer findings — the six missing indexes, the
      Calendar page's `hasAnyBills`/`hasAnyIncomeStreams` fix, and the
      demo-data `maxDuration` fix — all confirmed present in current source.
- [x] Dashboard genuinely wired to Customization's preferences —
      `app/(dashboard)/page.tsx` reads `getDashboardCardPreferences`,
      `app/(dashboard)/layout.tsx` reads `getUserPreference` for accent
      color — both confirmed by direct reading, not the commit message.

## Frontend implementation

- [x] `/calendar`, `/settings/appearance`, `/settings/preferences`, and the
      six `/admin/**` pages all present and generated in the production
      build. `PaydayEntry`/`BillEntry`/`BudgetResetMarker` confirmed to
      satisfy calendar-v2.md AC5/AC9's visual-distinction requirements by
      direct reading.
- [!] Currency Display's UI (`currency-display-select.tsx`) ships copy
      claiming an app-wide effect that does not exist yet — see blocking
      item above.

## Security

- [x] Security Architect review (`docs/security/phase-4c-security-review.md`)
      — **APPROVE**, no High/Medium findings — independently re-verified,
      not accepted on the document's own word: `role`'s `input: false`
      wiring confirmed against Better Auth's actual source, the admin
      layout guard confirmed to run first with no caching, all six admin
      mutations confirmed to check `getCurrentAdminUser()` first, `getUsers`'
      projection confirmed to exclude every credential/token field,
      `AdminActionLog` confirmed to have no edit/delete path anywhere,
      `scripts/grant-admin.ts` confirmed still unreachable from any product
      code path.
- [x] Cross-user, `userId`-unscoped reads (`getUsers`, `getAuditLog`,
      `getReportGenerationEvents`) — confirmed reachable only from behind
      the admin-gated layout, by direct grep of every call site.
- [x] ADMIN-tier grants made to `lejeunekyle@gmail.com` and
      `showcase@lkbudget.demo` in the dev database during verification —
      expected, user-approved use of `scripts/grant-admin.ts`; not treated
      as a gate-blocking finding, per this task's own framing.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-4c-performance-review.md`) — **APPROVE with
      3 non-blocking follow-ups**, all three since closed and independently
      re-verified against current source (Section 4 of `phase-4c-notes.md`).

## Bug Hunter

- [x] All six findings — independently re-verified against current source
      (Section 3 of `phase-4c-notes.md`), not the fix commit's own claims.

## Module-boundary discipline

- [x] Zero `lib/ai/` imports anywhere in `features/calendar/`,
      `features/settings/`, or `features/admin/` — confirmed by grep (the
      two incidental hits in `features/settings/*.test.ts` are doc-comment
      citations of an unrelated precedent, not imports).
- [x] `isFeatureEnabled` wired at exactly the two existing choke points
      (`lib/ai/generate-structured-output.ts`,
      `lib/email/send-notification-email.ts`) — a `lib/`-to-`lib/`
      dependency, not a new feature reaching into either module.
- [x] No self-service admin-role-assignment UI anywhere — confirmed by grep
      of `src/app/` and `src/features/admin/` for any role-setting
      form/endpoint; the only `role=` hits are unrelated ARIA attributes.

## Build / tooling (re-run independently, this pass)

- [x] `npx prisma migrate status` — up to date, 11 migrations.
- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — **618/618 tests passing, 51 test files**, re-run
      fresh, matches the fix commit's own claimed number exactly.
- [x] `npm run build` — production build succeeds, all routes generated
      (including `/calendar`, `/settings/appearance`, `/settings/preferences`,
      and six `/admin/**` routes), no regressions.
- [x] `git status` — clean, nothing uncommitted. `git log` — the full Phase
      4c commit range confirmed present and in order, no gaps.

## Documentation

- [x] Product specs, architecture design doc, both Security/Performance
      reviews, all six bug reports — internally consistent with shipped
      code, except Currency Display's own AC4/Definition of Done (blocking
      item above), which the shipped code does not yet satisfy.
- [x] `docs/planning/risk-register.md` rows #25–#38 — checked; Risk #29
      (Timezone's consuming-logic deferral) confirmed correctly tracked and
      open; no equivalent tracked entry exists for Currency Display's
      wiring gap because it was never identified as a decision to make.

## Required follow-up — binding for re-submission, not optional

- [ ] **Thread each surface's resolved `UserPreference.currencyDisplay`
      into its existing `formatCurrency` calls**, per
      `phase-4c-technical-design.md` §3.6's own already-written plan:
      Dashboard cards/charts, Transactions, Accounts, Budgeting, Bills, Debt
      Tracker, Investments, Savings/Financial Goals, Analytics, all six
      Reports PDF templates, and all six notification/email templates.
      Verify by test (per `customization.md`'s own Definition of Done) that
      a non-USD display currency changes only rendered symbol/grouping,
      never an underlying value or threshold comparison, across every
      surface AC4 names. Owner: Backend Engineer (server-side call sites:
      Reports, email templates, Server Component reads) + Frontend Lead
      (Dashboard/client-rendered surfaces already receiving server data).
      This checkbox is intentionally left unchecked — closing it is
      implementation work outside the Release Manager's own scope to
      perform, not something this review can verify as already done.

## Overall Gate Decision

**REJECT**, for Phase 4c as a bundled release of Calendar v2, Customization,
and Admin. Calendar v2 and Admin are both fully verified and hold in full,
independently, against every acceptance criterion in their specs. Three of
Customization's four capabilities (Theme & Accent Color, Dashboard Layout,
Timezone Preference) likewise hold. Every review-gate finding from Security,
Performance, and Bug Hunter is independently confirmed genuinely resolved or
genuinely, documentedly deferred — not merely claimed. All automated checks
pass cleanly, re-run fresh this pass.

The blocking item is narrow and precisely scoped: Currency Display's
call-site rollout across the rest of the app was never done, despite being
an unconditional, explicitly-worded acceptance criterion with no CTO descope
and no risk-register acknowledgment. This is real, bounded, mechanical
plumbing work over an already-correct function signature — not a redesign,
and not comparable in size or risk to the two genuine TOCTOU races this
phase already found and fixed. Once threaded through and verified by test
per `customization.md`'s own Definition of Done, this release is expected to
clear on a focused re-verification of that one capability, the same
"targeted re-check against the specific prior finding" shape
`phase-4b-notes.md`'s own second pass already used successfully.

See `phase-4c-notes.md` for full reasoning.
