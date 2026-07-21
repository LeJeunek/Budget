# Release Notes — Phase 3a: Debt Tracker, Investments, Recurring Income, Net Worth Snapshot

**Release Manager:** (this review)
**Date:** 2026-07-21
**Gate:** Roadmap's binding "Full 3a review gate" (`docs/planning/roadmap.md`, Phase 3a Milestone 8)
**Decision: PASS.** Phase 3b's architecture may begin.

---

## What shipped

- **Debt Tracker** (`docs/product/debt-tracker.md`): CRUD for six debt types, per-debt payoff
  date and total-interest-remaining projections (minimum-payment pace), snowball vs. avalanche
  comparison with an extra-payment input, Paid-Off auto-detection, archive/unarchive, optional
  linking to an existing Credit Card Account.
- **Investments** (`docs/product/investments.md`): holdings under Investment/Retirement/Crypto
  Account containers (with inline container creation), gain/loss, dividend logging, asset-type
  and sector allocation, historical growth chart from timestamped value-update history, Closed
  holdings (now correctly frozen — see Bug fixes below).
- **Recurring Income** (`docs/product/recurring-income.md`): income streams across six types and
  five schedules plus Irregular/One-off, lazy occurrence generation mirroring Bills, optional
  Transaction linking with cross-feature (Bills vs. Income) exclusivity, expected-upcoming-income
  total kept separate from the Dashboard's actual-transaction-based Monthly Income.
- **Net Worth aggregation update**: `getNetWorth` now nets out unlinked active Debt balances and
  includes Investment/Retirement/Crypto containers' holdings-derived balances, without
  double-counting a Debt against its linked Account.
- **Net Worth Snapshot cron** (backend only, no UI per Roadmap): daily per-user capture, now with
  `maxDuration = 60` to accommodate its sequential per-user loop.

## Review chain (independently verified this pass, not rubber-stamped)

| Gate | Result | Evidence |
|---|---|---|
| Security Architect | PASS | `docs/security/phase-3a-review.md` — read in full; ownership-scoping claims spot-checked against `src/features/debt`, `src/features/investments/server/actions.ts`, `src/lib/transaction-link-guard.ts`. No exploitable finding; 2 Low hardening items (non-blocking). |
| Performance Engineer | PASS-WITH-FOLLOWUPS, both applied | No standalone written performance report exists (see "Process gap" below) — follow-ups verified directly in code/schema/migration history: `maxDuration = 60` present in `src/app/api/cron/net-worth-snapshot/route.ts`; `@@index([accountId, closedAt])` present in `prisma/schema.prisma` and confirmed **applied to the actual dev database** via `npx prisma migrate status` ("Database schema is up to date") and migration `20260721132204_add_holding_account_closed_index`. |
| Bug Hunter | 2 HIGH + 1 MEDIUM found, all fixed and verified in this pass | No standalone written Bug Hunter report exists (see "Process gap" below) — each fix independently re-read against the diff in commit `7fe218a`: (1) archived-Account-with-active-linked-Debt liability-vanishing bug fixed via `unlinkDebtOnAccountArchive` inside `archiveAccount`'s transaction; (2) `updateAccount` overwriting Investments' derived balance fixed via `hasActiveHoldings` guard; (3) Closed holdings remaining editable fixed via a `closedAt` check in `updateHolding`. All three fixes read correctly in the source, not just described in the commit message. |
| Automated tests | 46/46 passing | Re-run this pass: `npm test -- --run` → `Test Files 4 passed (4)`, `Tests 46 passed (46)` across `payoff-math.test.ts`, `investments/server/service.test.ts`, `lib/recurrence.test.ts`, `lib/utils.test.ts`. |
| Typecheck | Clean | Re-run this pass: `npm run typecheck` → no errors. |
| Lint | Clean | Re-run this pass: `npm run lint` → no errors/warnings. |
| Production build | Clean | Re-run this pass: `npm run build` → succeeds, all Phase 3a routes (`/debt`, `/investments`, `/investments/[holdingId]`, `/income`, `/income/[streamId]`, `/api/investments`, `/api/income`, `/api/cron/net-worth-snapshot`) present in the route manifest. |
| Live E2E browser verification | Done (main session, not delegated) | Per handoff: accounts/holdings/debts/income streams created, dividend logged, Debt linked to a Credit Card Account, snowball-vs-avalanche live recompute exercised, income occurrence marked received/unreceived, Net Worth math (incl. double-counting prevention) confirmed correct against the real dev DB. Not independently re-driven by this review — accepted on the strength of the specific, falsifiable claims made (exact actions taken, exact math property checked) rather than a generic "looks good." |
| Migrations applied to real DB | Verified this pass | `npx prisma migrate status` against the actual Neon dev database reports all 4 migrations applied, schema up to date. |

### Process gap (noted, not blocking)

Security produced a durable, reviewable artifact (`docs/security/phase-3a-review.md`); Performance
and Bug Hunter did not — their findings and fixes are only recorded in commit `7fe218a`'s message
and verified here by re-reading the actual diff. The outcome checks out (every claimed fix is
present and correct in the code, the index migration is applied to the real database, the
performance flag is present in the route), but going forward, Performance Engineer and Bug Hunter
should each leave a `docs/performance/` and `docs/qa/` (or equivalent) artifact the same way
Security does, so this gate doesn't depend on a commit message being complete and accurate. This
is a process recommendation for future phases, not a reason to block this one — I independently
verified the substance regardless of where it was recorded.

## Known, deliberately deferred items (not blockers)

Per the Bug Hunter's own framing (as relayed and independently sanity-checked against the code):

1. **MEDIUM** — race condition on concurrent double-submission of "create new investment
   container." Not fixed this pass. Rationale for deferring: a UI-level double-click/double-submit
   race, not a data-integrity or cross-user issue; standard mitigation (disable-on-submit /
   idempotency key) is a normal frontend hardening follow-up, not a phase-blocking correctness bug.
2. **LOW** — an archived Debt can still reference a linked `accountId` (stale link, no user-facing
   effect since archived Debts are already excluded from Net Worth regardless of `accountId`).
   Confirmed in `unlinkDebtOnAccountArchive`'s own doc comment as an explicitly acknowledged,
   lower-priority follow-up.
3. **LOW** — mathematically-infinite payoff simulations display as capped at "100 years" rather
   than a distinct "will never pay off" state. Confirmed in `payoff-math.ts`'s
   `MAX_SIMULATION_MONTHS` comment — this is a safety backstop for pathological inputs, not an
   expected outcome for realistic debts, so the display quirk is acceptable for v1.
4. **LOW** — no test coverage for Recurring Income/Bills' DB-dependent occurrence-generation logic
   specifically (the 46 new tests cover pure math only: payoff math, `lib/recurrence.ts`'s schedule
   calculations, and Investments' gain/loss/allocation — all DB-free by design, per this feature's
   isomorphic-pure-function architecture). This is a real coverage gap, but it is the same
   *category* of gap Bills already shipped Phase 2 with (occurrence generation has always been
   verified manually/via live E2E rather than automated integration tests against a real
   database) — not something Phase 3a introduced or made worse, so it does not block this phase
   specifically.

None of these four affect financial correctness for a realistic user of this feature today, and
none are new information beyond what the Bug Hunter already flagged and the fix-pass already
scoped as deferred. I agree with deferring all four.

## Definition of Done — cross-check against all three specs

| Spec requirement (paraphrased) | Status |
|---|---|
| Debt: CRUD for 6 types; payoff date/interest correct incl. negative-amortization + 0%-rate cases | Met — `payoff-math.test.ts` covers amortization incl. 0% rate; negative-amortization warning path present in `payoff-math.ts` |
| Debt: snowball/avalanche correct incl. $0-extra-payment identical-results case | Met — covered by `payoff-math.test.ts`'s snowball/avalanche suite |
| Debt: Paid-Off auto-detection, archive/unarchive | Met — live-verified this cycle per handoff |
| Investments: holdings CRUD incl. inline container creation, Closed state | Met — Closed-holding immutability bug fixed and verified in `actions.ts` |
| Investments: gain/loss, dividend income, asset/sector allocation correctness | Met — `service.test.ts`'s `toHolding`/`computeAllocationEntries` suites, incl. $0-cost-basis divide-by-zero guard and null-sector "Other" bucketing |
| Investments: historical growth chart incl. single-point/no-history states | Met — live-verified this cycle per handoff (not independently re-driven by this review) |
| Recurring Income: stream CRUD for 6 types, 5 schedules + Irregular | Met — `lib/recurrence.test.ts` covers all 5 schedule types incl. month-length edge cases |
| Recurring Income: occurrence status computation, receipt tracking, Transaction-link exclusivity | Met — live-verified this cycle per handoff; exclusivity enforced by `lib/transaction-link-guard.ts`, reviewed clean by Security |
| Recurring Income: expected-upcoming-income distinct from Monthly Income | Met — `getNetWorth`/dashboard service confirmed unchanged wiring; live-verified per handoff |
| All three: Security Architect review | Met — PASS, `docs/security/phase-3a-review.md` |
| All three: Performance Engineer review | Met — PASS-WITH-FOLLOWUPS, both follow-ups applied and verified live in DB (see Process gap note above re: missing written artifact) |
| All three: tests passing | Met — 46/46 |
| All three: documentation | Met, with the one process-gap caveat above |
| All three: CTO/architecture sign-off | Out of my role's scope to confirm directly; architecture docs (`docs/architecture/*`, `docs/database/*`) show Phase 3a sections present and internally consistent with the shipped schema |
