# Phase 4b Deployment / Phase-Gate Checklist — Reports & Notifications v2

Status legend: [x] verified pass · [~] pass with a documented, accepted
follow-up (not blocking) · [!] verified FAIL, blocking this gate

See `phase-4b-notes.md` for full reasoning and justification behind every
item below. This checklist supersedes the version associated with the prior
REJECT (`git log`, the pass preceding commit `a11e5e6`) — updated in place
after a focused, independent re-verification of the fix commit against the
prior REJECT's specific finding, not a full from-scratch re-check (Sections
2-7 of the prior pass were re-confirmed unaffected by diff, not re-derived;
see `phase-4b-notes.md` §2).

## Blocking (from the prior pass) — now resolved

- [x] **`FinancialGoal.completionNotifiedAt` backfill migration omits
      `SAVINGS_RATE_TARGET` goals** — **RESOLVED** by `a11e5e6` ("Phase 4b:
      Close SAVINGS_RATE_TARGET backfill gap"). A new one-time, idempotent
      script (`prisma/backfill-savings-rate-goal-notifications.ts`, run via
      `npm run backfill:savings-rate-completion`) reuses the exact
      `getFinancialGoalCompletionStatus` logic the live `GOAL_ACHIEVED`
      trigger already calls (confirmed unmodified by this fix commit — no
      second, independently-maintained formula), with an atomic
      conditional-claim `updateMany` write (same TOCTOU-prevention pattern
      as `goal-achieved-trigger.ts`/`lib/ai/rate-limit.ts`), 6 unit tests
      over its extracted pure selection logic, an already-applied
      migration whose executable SQL was left untouched (comment-only
      update), and a new risk-register entry (#24) correctly framing this
      as a required manual deploy step. See `phase-4b-notes.md` §1 for the
      full independent verification trace. **Carries forward as a required
      deployment-sequencing item — see "Required deployment step" below.**

## Product / Architecture artifacts

- [x] Product Owner specs (`docs/product/reports.md`,
      `docs/product/notifications-v2.md`) — every AC and edge case checked
      against shipped code in the prior pass (`phase-4b-notes.md` §2), all
      hold; the one exception (Goal Achieved's no-retroactive-fire edge case
      for `SAVINGS_RATE_TARGET`) is now closed above.
- [x] Solution Architect + Database Architect design
      (`docs/architecture/phase-4b-technical-design.md`) — PDF library
      decision, synchronous-generation decision, email provider decision,
      `lib/email/` module boundary, unsubscribe-token design,
      `Notification`/`Account`/two-new-model schema extension all
      implemented as specified; §7.3's required one-time data migration is
      now fully resolved for all three goal types (two via the original
      migration, the third via this pass's fix).
- [x] Database Architect schema — `prisma/migrations/
      20260728082118_phase_4b_reports_notifications_v2/` applied and
      confirmed unedited beyond its comment (`git diff` shows zero
      executable-SQL lines changed); `npx prisma migrate status` → "Database
      schema is up to date!" (9 migrations, re-confirmed this pass,
      unchanged — the fix is a script against already-applied schema, not a
      new migration).

## Backend implementation

- [x] Reports — all six report types, `app/api/reports/route.ts`,
      synchronous on-demand generation. Unaffected by this pass's fix
      commit (confirmed by diff, `phase-4b-notes.md` §2).
- [x] Notifications v2 — four new trigger evaluators, `lib/email/**`, cron
      route, unsubscribe route, preference/threshold Server Actions.
      `goal-achieved-trigger.ts` itself confirmed unmodified by this pass's
      fix commit — the fix closes the data gap upstream of the trigger, not
      inside it.
- [x] All four Bug Hunter findings and Performance Findings 1/4/5/6 — fixed
      and re-verified in the prior pass, unaffected by this pass's fix
      commit (confirmed by diff).
- [x] **New this pass:** `prisma/backfill-savings-rate-goal-notifications.ts`
      + `prisma/backfill-savings-rate-goal-notifications-logic.ts` — the
      one-time backfill script and its extracted pure selection logic,
      independently verified (`phase-4b-notes.md` §1).

## Frontend implementation

- [x] `/reports` page and `/settings/notifications` page — unaffected by
      this pass's fix commit (confirmed by diff, `phase-4b-notes.md` §2).

## Security

- [x] Security Architect review (`docs/security/phase-4b-security-review.md`)
      — **APPROVE**, no High/Medium findings; two Low/informational items
      correctly left as future hardening. Unaffected by this pass's fix
      commit — no new attack surface (the backfill script is a manually-run
      Prisma script, not a network-exposed endpoint, and takes no
      user-supplied input).
- [x] Cross-user leakage — the backfill script's own `userId`-scoped
      grouping and per-goal `where: { id, userId, completionNotifiedAt:
      null }` claim confirmed by direct reading to never act across users;
      consistent with the rest of this phase's already-approved pattern.

## Performance

- [x] Performance Engineer review — **APPROVE with follow-ups**, Findings
      1/4/5/6 fixed, 2/3 deferred with explicit non-blocking reasoning.
      Unaffected by this pass's fix commit.
- [x] The new backfill script's own cost — a one-time script,
      groups goals by user to call `getFinancialGoalCompletionStatus` at
      most once per distinct affected user rather than once per goal;
      sequential per-user iteration, matching this codebase's own
      established convention for user-scoped batch work (risk-register
      #21's cron-sweep precedent). Not a latency-sensitive request path, so
      this is an appropriate, not a deficient, design choice.

## Bug Hunter

- [x] All four prior-pass findings — fixed, verified, unaffected by this
      pass's fix commit.

## Module-boundary discipline

- [x] Zero `lib/ai/` imports anywhere under `features/reports/**` or
      `features/notifications/**` — unaffected by this pass's fix commit.
- [x] The new backfill script imports only
      `@/lib/db` and `@/features/financial-goals/server/service` — no new
      cross-feature or `lib/ai/` coupling introduced.

## Build / tooling (re-run independently, this pass)

- [x] `npx prisma migrate status` — up to date, 9 migrations, unchanged.
- [x] `npm run typecheck` — clean, 0 errors.
- [x] `npm run lint` — clean, 0 errors/warnings.
- [x] `npx vitest run` — **575/575 tests passing, 46 test files** (up from
      the prior pass's 569/45 — the new 6-test
      `backfill-savings-rate-goal-notifications-logic.test.ts` file),
      re-run fresh, matches the fix commit's own claimed number exactly.
- [x] `npm run build` — production build succeeds, all 36 routes generated,
      no regressions.
- [x] `git status` — clean, nothing uncommitted.

## Documentation

- [x] Product specs, architecture design doc, both Security/Performance
      reviews, all four bug reports — internally consistent with shipped
      code (prior pass); the architecture design document's §7.3
      requirement is now fully resolved for all three goal types, closing
      the one documentation/implementation mismatch the prior pass found.
- [x] `docs/planning/risk-register.md` row #24 — new this pass, confirmed
      real (not decorative), correctly frames the backfill script as a
      required manual operational step with a named owner and a concrete
      command, not something that runs automatically
      (`phase-4b-notes.md` §3).
- [x] The migration's own comment — confirmed updated to describe the gap
      as closed and point at the resolving script, without altering any
      executable SQL in the already-applied migration.

## Required deployment step — binding for this release, not optional

- [ ] **`npm run backfill:savings-rate-completion` must be run once against
      each target environment (including production), before or during the
      same deploy window that ships this release.** This is not automatic
      and is not satisfied by deploying the code alone — the script is what
      actually corrects any already-affected `SAVINGS_RATE_TARGET` goal's
      `completionNotifiedAt` state; until it runs, a pre-existing affected
      goal in that environment remains eligible for one incorrect
      retroactive notification. Recommended sequencing: run immediately
      after this release's migration-free code deploy completes (the
      script requires no schema change and can run against the
      already-applied `20260728082118` migration), and before the first
      post-deploy `evaluate-notifications` cron tick or bell-poll
      evaluation for any affected user. Owner: Backend Engineer (per
      risk-register.md #24). This checkbox is intentionally left unchecked
      by this review — running it is a deployment action outside the
      Release Manager's own scope to execute, not something this review can
      verify as already done.

## Overall Gate Decision

**APPROVE**, for Phase 4b as a bundled release of Reports and Notifications
v2. The prior REJECT's single blocking item — the `SAVINGS_RATE_TARGET`
`completionNotifiedAt` backfill gap — is closed in code: a new one-time,
idempotent backfill script that reuses the live trigger's own completion
logic (no drift risk), an atomic and genuinely idempotent claim pattern, real
unit-test coverage, an untouched already-applied migration (comment-only
update), and an accurate risk-register entry. Independently re-verified this
pass, not accepted on the strength of the fix commit's own message. Every
other item from the prior pass — every product acceptance criterion, every
review-gate finding across Security/Performance/Bug Hunter, module-boundary
discipline, and the automated build/test/typecheck/lint/migration status —
is confirmed unaffected by this fix commit (by diff) and remains passing,
re-run fresh this pass (575/575 tests, clean typecheck/lint/build,
up-to-date migrations, clean git status).

This APPROVE is conditioned on the one deployment action listed above
actually being carried out as part of the deploy — the code being correct is
necessary but not sufficient to close the underlying user-facing gap; running
`npm run backfill:savings-rate-completion` against production is what
finishes the job. See `phase-4b-notes.md` for full reasoning.
