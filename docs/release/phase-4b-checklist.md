# Phase 4b Deployment / Phase-Gate Checklist — Reports & Notifications v2

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-4b-notes.md` for full reasoning and justification behind every
item below. This is an independent re-verification pass — every item was
checked directly against current source, current test output, and a fresh
`npm run build`/`npx vitest run`/`npm run typecheck`/`npm run lint`/`npx
prisma migrate status` run, not accepted on the strength of any prior
gate's own sign-off.

## Blocking

- [!] **`FinancialGoal.completionNotifiedAt` backfill migration omits
      `SAVINGS_RATE_TARGET` goals**, contradicting Goal Achieved's own
      binding "does not retroactively fire for a goal already Completed
      before this feature ships" edge case (`notifications-v2.md`). The
      migration's own SQL comment
      (`prisma/migrations/20260728082118_phase_4b_reports_notifications_v2/migration.sql`,
      lines 95-111) explicitly flags this as requiring either a follow-up
      backfill or an explicit accept decision from Backend
      Engineer/Solution Architect "before `goal-achieved-trigger.ts`
      ships." Neither occurred — no follow-up migration, no risk-register
      entry, no mention in any of the three review-gate documents
      (Security/Performance/Bug Hunter). See `phase-4b-notes.md` §1 for the
      full trace and reproduction.

## Product / Architecture artifacts

- [x] Product Owner specs (`docs/product/reports.md`,
      `docs/product/notifications-v2.md`) — both read in full; every AC and
      edge case checked against shipped code (`phase-4b-notes.md` §2), all
      hold except the one item above.
- [x] Solution Architect + Database Architect design
      (`docs/architecture/phase-4b-technical-design.md`) — PDF library
      decision (`@react-pdf/renderer`), synchronous-generation decision,
      email provider decision (Resend + React Email), `lib/email/` module
      boundary, unsubscribe-token design, `Notification`/`Account`/two-new-
      model schema extension all implemented as specified.
- [x] Database Architect schema — `prisma/migrations/20260728082118_phase_4b_reports_notifications_v2/`
      applied; `npx prisma migrate status` → "Database schema is up to
      date!" (9 migrations). Schema shape matches §7 of the design doc
      exactly (four new nullable `Notification` FKs + three new unique
      constraints, `Account`'s two new fields, `FinancialGoal.completionNotifiedAt`,
      the two new `NotificationPreference`/`NotificationThresholdSettings`
      models). **The DDL is correct; the one-time DATA migration accompanying
      it is incomplete — see Blocking above.**

## Backend implementation

- [x] Reports — all six report types (`features/reports/server/data/*.ts`,
      `pdf/templates/*.tsx`), `app/api/reports/route.ts`, synchronous
      on-demand generation, no `Report` table/persisted artifact (matches
      the design doc's "no stored artifact to leak" property).
- [x] Notifications v2 — four new trigger evaluators (`triggers/*.ts`),
      `lib/email/**` (Resend client, six React Email templates, HMAC-signed
      unsubscribe token), new `app/api/cron/evaluate-notifications/route.ts`,
      new `app/api/notifications/unsubscribe/route.ts`, preference/threshold
      Server Actions.
- [x] Yearly Report label bug, Monthly Summary evaluation-gap bug,
      notification-preferences shared-mutation race, non-UTC report
      timestamp — all four Bug Hunter findings fixed and independently
      re-verified in current source (`phase-4b-notes.md` §3).
- [x] Performance Findings 1, 4, 5, 6 fixed and independently re-verified
      in current source; Findings 2/3 confirmed genuinely deferred (not
      silently dropped), matching the Performance review's own explicit
      non-blocking framing (`phase-4b-notes.md` §3).

## Frontend implementation

- [x] `/reports` page + `report-type-select.tsx`/`report-download-button.tsx` —
      in-progress state (AC2), honest-failure toast on non-2xx (Cross-Cutting
      Requirement #6), no independent client-side report caching (matches
      "no persisted artifact" design property).
- [x] `/settings/notifications` page + `notification-preferences-list.tsx` —
      all 7 trigger types × 2 channels (14 toggles), each with its own
      independent `useMutation` instance (Bug Hunter fix confirmed landed).

## Security

- [x] Security Architect review (`docs/security/phase-4b-security-review.md`)
      — **APPROVE**, no High/Medium findings. Two Low/informational items
      (dynamic-`import()` gap in the `no-restricted-imports` guard;
      cron routes' `!==` vs. `timingSafeEqual`) independently confirmed
      correctly non-exploitable and correctly left as future hardening, not
      silently dropped requirements.
- [x] Cross-user leakage (report generation, email content construction,
      unsubscribe token, both new Server Actions,
      `Account.lowBalanceThresholdOverride`) — independently re-verified,
      no gap found, matching Security's own conclusion.
- [x] Unsubscribe token — HMAC-SHA256 via a dedicated
      `EMAIL_UNSUBSCRIBE_SECRET` (distinct from `BETTER_AUTH_SECRET`),
      `timingSafeEqual` verification, scoped to exactly one `(userId,
      type)` pair, cannot alter another user's preference or a different
      trigger type — confirmed by direct reading.

## Performance

- [x] Performance Engineer review
      (`docs/performance/phase-4b-performance-review.md`) — **APPROVE with
      follow-ups**. Findings 1, 4, 5, 6 fixed and independently re-verified
      in current source, including genuine new test coverage for Finding 6's
      timeout behavior (both the timeout-fires and the
      doesn't-false-positive-on-a-slow-but-successful-send paths).
- [~] Findings 2 (Cash Flow/Expense `ALL_TIME` per-month loop has no
      ceiling) and 3 (Risk #23's high-row-count fixture test not yet
      implemented) — confirmed genuinely deferred with the review's own
      explicit non-blocking reasoning, not silently forgotten; consistent
      with this codebase's established evidence-first performance-review
      posture (Analytics' own identical `ALL_TIME` shape, accepted at the
      3b gate).

## Bug Hunter

- [x] `yearly-report-hardcoded-gain-loss-this-year-label.md` — fixed,
      verified: `pdf/templates/yearly.tsx` now interpolates `data.period.label`.
- [x] `monthly-summary-notification-skips-months-after-evaluation-gap.md`
      — fixed, verified: `getRecentSummaries(userId, 6)` bounded-window fix,
      with genuine regression tests constructing the actual gap scenario.
- [x] `notification-preferences-shared-mutation-defeats-pending-guard.md`
      — fixed, verified: each of the 14 toggle buttons now owns its own
      `useMutation` instance, structurally eliminating the race (not a
      guard-condition patch).
- [x] `report-generated-timestamp-not-utc.md` — fixed, verified:
      `GENERATED_AT_FORMATTER` now pins `timeZone: "UTC"`.

## Module-boundary discipline

- [x] Zero `lib/ai/` imports (static or dynamic `import()`) anywhere under
      `features/reports/**` or `features/notifications/**` — confirmed by
      direct grep, not just the ESLint rule's own claim.
- [x] `app/api/cron/evaluate-notifications/route.ts` uses the identical
      shared-secret pattern as all four pre-existing cron routes — no auth
      bypass.
- [x] No Server Action in either feature accepts a client-supplied `userId`
      — confirmed by reading both `validation.ts` files in full.

## Build / tooling (re-run independently, this pass)

- [x] `npx prisma migrate status` — up to date, 9 migrations.
- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — **569/569 tests passing, 45 test files**, matches
      the last fix commit's own claimed number, re-run fresh.
- [x] `npm run build` — production build succeeds, all routes generated
      including `/reports`, `/settings/notifications`,
      `/api/reports`, `/api/cron/evaluate-notifications`,
      `/api/notifications/unsubscribe`.
- [x] `git status` — clean, nothing uncommitted. `git log` for the Phase 4b
      commit range is coherent and linear, no gaps.

## Documentation

- [x] Product specs, architecture design doc, both Security/Performance
      reviews, and all four bug reports exist, are complete, and are
      internally consistent with the shipped code, with the one exception
      that the architecture design document's own §7.3 requirement (a
      required one-time data migration, fully resolved for two of three
      goal types) was never followed through to completion or explicit
      sign-off for the third.

## Overall Gate Decision

**REJECT.** One specific, actionable, self-identified-but-never-closed gap:
`SAVINGS_RATE_TARGET` Financial Goals were omitted from the required
`completionNotifiedAt` backfill migration, so a pre-existing, already-target-met
goal of that type will fire one incorrect retroactive `GOAL_ACHIEVED`
notification — contradicting notifications-v2.md's own binding "no
retroactive fire" rule for Goal Achieved. The architecture design document
itself flagged this as needing a fix or an explicit accept decision before
`goal-achieved-trigger.ts` shipped; neither happened, and no subsequent
review (Security, Performance, Bug Hunter) caught it. Every other
acceptance criterion, review-gate finding, and automated check in this
phase passes independent re-verification cleanly — see `phase-4b-notes.md`
for full reasoning. Close the one blocking item (a follow-up backfill
migration, or an explicit documented accept from Backend
Engineer/Solution Architect) and re-run this gate.
