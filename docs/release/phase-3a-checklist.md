# Deployment Checklist — Phase 3a: Debt Tracker, Investments, Recurring Income, Net Worth Snapshot

**Status: APPROVED FOR DEPLOYMENT.** See `phase-3a-notes.md` for the full review record.

## Pre-deploy verification (completed by this review)

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `npm test -- --run` — 46/46 passing across 4 test files
- [x] `npm run build` — production build succeeds; all Phase 3a routes present in the manifest
      (`/debt`, `/investments`, `/investments/[holdingId]`, `/income`, `/income/[streamId]`,
      `/api/investments`, `/api/income`, `/api/cron/net-worth-snapshot`)
- [x] `npx prisma migrate status` against the real dev database — all 4 migrations applied,
      schema up to date (confirms the Performance follow-up index actually reached the database,
      not just `schema.prisma`)
- [x] Security Architect review read and spot-checked — PASS, no blocking findings
- [x] Bug Hunter's 3 findings (2 HIGH, 1 MEDIUM) re-verified fixed by reading the actual diff in
      commit `7fe218a`, not just trusting the commit message
- [x] Performance follow-ups (cron `maxDuration`, `Holding` composite index) re-verified present
      in code and applied to the real database
- [x] Live E2E browser verification performed this cycle against the real dev database (per
      handoff — accounts/holdings/debts/income streams, dividend logging, Debt-to-Account linking,
      snowball/avalanche live recompute, income occurrence receive/un-receive, Net Worth math)
- [x] Working tree clean, all changes committed (`git status` confirmed no pending diffs)

## Deploy-time steps (for whoever executes the deploy — DevOps/CTO responsibility, not verified
by this review since it is outside Release Manager's role to execute infrastructure changes)

- [ ] Confirm the target environment (staging/production) has run
      `npx prisma migrate deploy` so all 4 migrations — including
      `20260721132204_add_holding_account_closed_index` — are applied there too (this review only
      confirmed the **dev** database; production/staging application of the same migrations is a
      DevOps action, not something this review can execute or attest to).
- [ ] Confirm `CRON_SECRET` is set in the deploy target's environment variables (the cron route
      fails closed if absent, per the Security review's Finding #3 — this is correct behavior, but
      means the snapshot job silently no-ops rather than erroring loudly if the var is missing;
      worth an explicit check after deploy).
- [ ] Confirm the net-worth-snapshot cron job's schedule/trigger (Vercel Cron or equivalent) is
      registered against `/api/cron/net-worth-snapshot` with the new `maxDuration = 60` respected
      by the hosting platform's own cron/function timeout ceiling (Vercel's own plan-tier limits
      can override a route's `maxDuration` export — confirm the plan tier supports 60s for this
      route).
- [ ] Smoke-test in the deploy target immediately after deploy: create one Debt, one Holding, one
      Income stream, and confirm the Dashboard's Net Worth figure updates — a lightweight
      production-equivalent of this review's dev-database live verification, since environment
      config (env vars, connection pooling, cold starts) can behave differently under a real
      deploy than local dev.

## Post-deploy monitoring follow-ups (tracked, not blocking this release)

- [ ] Track the MEDIUM "double-submit create investment container" race condition as a follow-up
      ticket for a future frontend hardening pass (disable-on-submit or idempotency key).
- [ ] Track the LOW items (stale `accountId` on an archived-and-still-linked Debt; "100 years"
      display for mathematically-infinite payoff; no DB-dependent occurrence-generation test
      coverage for Recurring Income/Bills) as backlog items, not release blockers.
- [ ] Recommend Performance Engineer and Bug Hunter begin producing standalone written artifacts
      under `docs/performance/` and a QA-equivalent directory in future phases (see the Process
      gap note in `phase-3a-notes.md`), rather than folding findings only into a commit message.

## Gate outcome

Per `docs/planning/roadmap.md`'s binding phase-gate rule ("3b's architecture does not start until
this gate is passed"): **gate passed. Phase 3b's Solution Architect + Database Architect pass may
begin.**
