# Phase 4b Release Notes — Reports & Notifications v2

**Reviewer:** Release Manager
**Scope:** Reports (six PDF report types) and Notifications v2 (four new
trigger types, email delivery channel, notification preferences) — per
`docs/product/reports.md`, `docs/product/notifications-v2.md`,
`docs/architecture/phase-4b-technical-design.md`, and `roadmap.md`'s Phase 4b
milestones.

**Decision: APPROVE.** This supersedes the prior sign-off in this same file
(`git log` commit `a11e5e6`'s parent state, REJECT — the `SAVINGS_RATE_TARGET`
`completionNotifiedAt` backfill gap, Section 1 below). This is a focused,
independent re-verification of the fix commit (`a11e5e6`, "Phase 4b: Close
SAVINGS_RATE_TARGET backfill gap") against the prior REJECT's specific
finding, not a from-scratch re-derivation of Sections 2-7 — those were
already independently re-verified in the prior pass, nothing else in the
codebase changed since (confirmed by diff, Section 2 below), and they are
carried forward unchanged. Section 1 is fully rewritten to record why the fix
is sufficient.

---

## 1. RESOLVED — `SAVINGS_RATE_TARGET` `completionNotifiedAt` backfill gap is genuinely closed

**Recap of the prior blocking finding.** The Phase 4b schema migration
(`prisma/migrations/20260728082118_phase_4b_reports_notifications_v2/
migration.sql`) backfilled `FinancialGoal.completionNotifiedAt` for
`DEBT_PAYOFF` and `NET_WORTH_SAVINGS_TARGET` goals that were already
Completed before the `GOAL_ACHIEVED` trigger shipped, but deliberately
skipped `SAVINGS_RATE_TARGET` goals — its own SQL comment (lines 95-111 at
the time) said this "cannot be faithfully replicated in raw SQL" at
migration-authoring time, and explicitly asked the Backend
Engineer/Solution Architect to either re-run an equivalent backfill once a
rolling-savings-rate formula existed, or explicitly accept the gap, before
`goal-achieved-trigger.ts` shipped. Neither happened — the trigger shipped
with no special-casing for this goal type, so any user with an
already-complete `SAVINGS_RATE_TARGET` goal at deploy time was due exactly
one incorrect retroactive "goal achieved" notification, violating
notifications-v2.md's own binding "no retroactive fire" edge case.

**What the fix commit (`a11e5e6`) actually does — read in full, verified
directly against source, not accepted on the strength of the commit
message:**

- **`prisma/backfill-savings-rate-goal-notifications.ts`** — a one-time
  script (`npm run backfill:savings-rate-completion`, confirmed wired in
  `package.json`). Selects every non-archived `SAVINGS_RATE_TARGET` goal with
  `completionNotifiedAt: null`, groups by `userId` (avoiding N redundant
  per-goal calls to a per-user read), and for each user calls
  `getFinancialGoalCompletionStatus(userId)` — **confirmed this is the
  identical, unmodified function `goal-achieved-trigger.ts` itself already
  calls in production** (`src/features/financial-goals/server/service.ts`,
  lines 604-628; the trigger file was not touched at all by this fix commit
  — `git diff 575a9d5 a11e5e6 --stat` on
  `goal-achieved-trigger.ts` shows zero changes attributable to `a11e5e6`,
  confirmed by `git log` on that path showing its last two touching commits
  are `15dc761`/`655d837`, both pre-dating this fix). This is the
  load-bearing property the original migration comment asked for: the
  backfill and the live trigger share one formula, not two independently
  maintained copies that could silently drift apart. There is no second,
  hand-rolled SQL or TypeScript re-derivation of
  `computeCurrentRollingSavingsRatePercent` anywhere in the new script.
- **`prisma/backfill-savings-rate-goal-notifications-logic.ts`** — the pure
  selection function (`selectGoalIdsToBackfill`), extracted with zero DB
  access and zero side effects specifically so it is unit-testable without
  invoking the DB-touching entry-point file (which runs unconditionally at
  import time, the same documented shape as `prisma/seed-showcase.ts`).
  Filters `getFinancialGoalCompletionStatus`'s per-user result down to (a)
  ids in this backfill's target set, (b) `isCompleted === true`, (c)
  `completionNotifiedAt === null`. Correct and minimal — no logic duplicated
  from the real completion formula, only a selection filter over its output.
- **`prisma/backfill-savings-rate-goal-notifications-logic.test.ts`** — 6
  unit tests, read in full: selects a genuinely-eligible goal; excludes
  not-yet-completed; excludes already-notified; excludes a completed goal
  from a *different* user's target set (guards against acting on a
  `DEBT_PAYOFF`/`NET_WORTH_SAVINGS_TARGET` goal that happens to appear in the
  same per-user completion-status read, since that read returns every active
  goal of every type); selects only the matching subset from a mixed list;
  handles empty inputs. This is genuine behavioral coverage of the selection
  logic's actual decision boundary, not a placeholder assertion.
- **Atomicity/idempotency, confirmed by direct reading, not just the
  script's own doc comment's claim:** the initial `findMany` only selects
  `completionNotifiedAt: null` rows; each write is
  `db.financialGoal.updateMany({ where: { id, userId, completionNotifiedAt:
  null }, data: { completionNotifiedAt: now } })` — a conditional claim that
  re-checks the same null condition at write time, never a separate
  read-then-write. This is the identical TOCTOU-race-prevention pattern
  `goal-achieved-trigger.ts`'s own claim (`updateMany` with the same
  re-check-at-write shape) and `lib/ai/rate-limit.ts` already use elsewhere
  in this codebase — not a new, unreviewed pattern. Consequence, confirmed by
  reading the claim/skip branches: running the script twice in a row is a
  no-op on the second run (every row's `completionNotifiedAt` is already
  non-null, so `claim.count === 0` and it logs "already claimed" rather than
  double-writing); running it concurrently with the live trigger's own
  per-user evaluation for the same goal cannot double-fire either, since
  both paths gate on the same column with the same conditional-`updateMany`
  shape.
- **The already-applied migration's executable SQL was not touched.**
  Confirmed by `git diff 575a9d5 a11e5e6 -- prisma/migrations/
  20260728082118_phase_4b_reports_notifications_v2/migration.sql`: the diff
  is exactly one comment block rewritten (the `-- NOTE (...)` block
  immediately preceding the `NET_WORTH_SAVINGS_TARGET`-adjacent
  `AlterTable`), with zero lines changed in any `UPDATE`/`INSERT`/`ALTER
  TABLE`/other executable statement anywhere in the file. This correctly
  honors "never edit a migration after it has run against a database" — the
  updated comment now says the gap is closed via the new script rather than
  still describing it as open, so a future reader does not mistake "flagged,
  not silently decided here" for a still-live gap.

**Confirmed: the fix reuses the real completion logic (no drift risk), the
write is genuinely atomic and idempotent, and the applied migration's SQL
was left untouched — all three conditions this pass was asked to verify.**

## 2. Everything else — carried forward from the prior pass, confirmed unaffected

Diffed `a11e5e6` against its parent (`655d837`, the last commit the prior
REJECT pass reviewed) directly: the only files this fix commit touches are
the two new backfill files, the new test file, the migration's comment (SQL
untouched, confirmed above), `package.json`'s new script entry, and
`docs/planning/risk-register.md`'s new row (#24, Section 3 below). **Zero
changes** to any report/notification feature code, any trigger, any Server
Action, any component, any cron route, or `prisma/schema.prisma` in this
commit. Every acceptance-criteria check, review-gate fix verification,
module-boundary check, and risk-status check from the prior pass's Sections
2-7 — Reports' six types and cross-cutting requirements, Notifications v2's
five other trigger/channel acceptance criteria, Security's two informational
items, Performance's four fixed findings, all four Bug Hunter fixes, the
`lib/ai/` module-boundary discipline, and Risks #19-23 — is therefore still
current and does not need to be re-derived; nothing in the underlying code
those findings were checked against has changed. Carried forward verbatim
from the prior pass (originally Sections 2-7 of this document, now
unchanged):

- **Product acceptance criteria (Reports and Notifications v2 in full)** —
  hold, with the Section-1 gap now closed. See the prior pass's full
  itemization (preserved in `git log` history of this file, commit
  containing the REJECT decision) for the complete per-trigger/per-report
  breakdown; every item there still applies unchanged.
- **Review-gate fix commits** (Security's 2 informational items, Performance
  Findings 1/4/5/6 fixed + 2/3 deferred, all 4 Bug Hunter fixes) — all
  confirmed landed in current source in the prior pass; none touched by this
  fix commit.
- **Module-boundary discipline** — no `lib/ai/` leakage into
  `features/reports/**`/`features/notifications/**`, cron auth pattern
  consistent, no client-supplied `userId` in any Server Action — unaffected,
  re-confirmed by this pass's own automated checks (Section 4) finding no
  new lint/typecheck issues.
- **Risks #19-23** — unaffected by this fix commit; still in the same state
  the prior pass found them. Risk #24 is new this pass (Section 3).

## 3. Risk register entry #24 — confirmed real and correctly framed as a required manual deployment step

Read `docs/planning/risk-register.md` in full. Row #24 (new this pass, added
by `a11e5e6`) documents this exact gap: correctly states the original
migration's scope (`DEBT_PAYOFF`/`NET_WORTH_SAVINGS_TARGET` backfilled,
`SAVINGS_RATE_TARGET` deferred), correctly cites the prior Release Manager
REJECT as the trigger for closing it, correctly scores it Low
probability/Medium impact (narrow precondition, bounded to one notification
per affected goal by the pre-existing `@@unique([financialGoalId, type])`
constraint), and — the specific property this pass was asked to confirm —
**correctly states this does not happen automatically**: "this script does
not run automatically — it must be run once against each environment,
including production, before/during the Phase 4b deploy, or the gap remains
open for any pre-existing affected goal in that environment," explicitly
pointing at the deployment checklist for sequencing. This is not a passive
"risk accepted" entry; it is an operational instruction with a named owner
(Backend Engineer) and a concrete command
(`npm run backfill:savings-rate-completion`). Confirmed genuine, not a
decorative row added only to look complete.

## 4. Automated checks — re-run independently, myself, this pass

- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings.
- `npx vitest run` → **575/575 tests passing, 46 test files** — matches the
  fix commit's own claimed number exactly (up from the prior pass's
  569/569, 45 files — the delta is the new 6-test
  `backfill-savings-rate-goal-notifications-logic.test.ts` file), re-run
  fresh, not accepted on the strength of the commit message.
- `npm run build` → succeeds, all 36 routes generated, no regressions (the
  backfill script is a standalone `tsx`-run Prisma script, not an app route,
  so it correctly does not appear in the route table).
- `npx prisma migrate status` → "Database schema is up to date!" (9
  migrations, unchanged — this fix commit adds no new migration, correctly:
  it is a script against already-applied schema, not a new schema change).
- `git status` → clean, nothing uncommitted.

**All green, matching the fix commit's own claims exactly, not just
approximately.**

## 5. Deployment sequencing — the one operational condition this APPROVE depends on

Unlike every other item in this phase, closing Section 1 depends on a manual
step that has **not yet been run against any real environment** as of this
review — the script exists, is correct, and is tested, but its entire
purpose is to mutate `FinancialGoal` rows at deploy time, which this review
cannot and should not do on the codebase's behalf (that is a deployment
action, not a code-review action, and per this role's own scope this review
verifies code, it does not execute production operations). This is recorded
as a required, sequenced step in `docs/release/phase-4b-checklist.md`'s
deployment checklist below, not silently assumed to have already happened.
Approving this release means the code is ready and correct, and that running
this script is a documented, blocking prerequisite of the deploy itself —
not that the script has already been run.

---

## Release Manager Decision

**APPROVE.**

The prior REJECT's single blocking gap — `SAVINGS_RATE_TARGET` Financial
Goals omitted from the `completionNotifiedAt` backfill — is closed by
`a11e5e6`: a new one-time, idempotent backfill script that reuses the exact
completion-determination logic (`getFinancialGoalCompletionStatus`) the live
`GOAL_ACHIEVED` trigger already trusts, with an atomic conditional-claim
write pattern matching this codebase's own established TOCTOU-prevention
convention, genuine unit-test coverage of its pure selection logic, an
already-applied migration whose executable SQL was correctly left untouched
(only its comment updated), and a new risk-register entry that accurately
frames this as a required manual operational step rather than something that
resolves itself. Independently re-verified all three properties this pass
was asked to confirm: the fix reuses the real logic (no formula drift risk),
the write is genuinely atomic/idempotent, and the applied migration was not
edited beyond its comment.

Every item the prior pass already independently verified (Sections 2-7 of
that pass, preserved in Section 2 above) remains unaffected — confirmed by
diff, not re-derived from scratch, since nothing in the underlying
report/notification feature code changed in this fix commit. All automated
checks (typecheck, lint, 575/575 tests, production build, migration status,
clean git status) pass cleanly, re-run independently in this pass.

**This APPROVE carries one binding deployment prerequisite**, documented in
`docs/release/phase-4b-checklist.md`: `npm run
backfill:savings-rate-completion` must be run once against each target
environment (including production) as part of the deploy sequence, before or
during the same deploy that ships this release — the code fix alone does not
retroactively correct any already-affected goal until the script actually
runs. This is the same "operational step, not automatic" framing
risk-register.md #24 itself uses.

See `docs/release/phase-4b-checklist.md` for the itemized deployment
checklist, including this step's required position in the deploy sequence.
