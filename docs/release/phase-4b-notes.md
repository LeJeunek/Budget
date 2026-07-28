# Phase 4b Release Notes — Reports & Notifications v2

**Reviewer:** Release Manager
**Scope:** Reports (six PDF report types) and Notifications v2 (four new
trigger types, email delivery channel, notification preferences) — per
`docs/product/reports.md`, `docs/product/notifications-v2.md`,
`docs/architecture/phase-4b-technical-design.md`, and `roadmap.md`'s Phase 4b
milestones.

**Decision: REJECT.** Everything this gate checked — acceptance criteria,
review-gate fix commits, automated checks, module-boundary discipline, and
test substance — holds up under independent re-verification, with one
exception: a self-identified, explicitly-flagged data-migration gap that was
never closed or explicitly accepted by any subsequent role, and that
produces exactly one incorrect notification for a specific goal type under a
specific, real (if narrow) precondition. This is a genuine violation of
notifications-v2.md's own explicit Goal Achieved edge case, not a
theoretical concern — see Section 1 below. Everything else in this document
(Sections 2–7) is written so that once Section 1's gap is closed, re-review
should be fast.

---

## 1. BLOCKING — `SAVINGS_RATE_TARGET` Financial Goals were never backfilled for `completionNotifiedAt`, contradicting Goal Achieved's own binding "no retroactive fire" rule

**What the spec requires.** `notifications-v2.md`'s Goal Achieved trigger,
Edge Cases: "A Financial Goal that was already Completed before this feature
ships: does **not** retroactively fire a notification... announcing 'you
paid off your debt!' for something that actually happened months before this
feature existed would be confusing, not useful." This is stated as a
deliberate, binding design decision (the explicit opposite of Low Balance's
own retroactive-fire rule), not a nice-to-have.

**What the architecture design specifies as the enforcement mechanism.**
`phase-4b-technical-design.md` §7.3: "a script that sets
`completionNotifiedAt = now()` for every `FinancialGoal` row that is
**already** Completed... as of the moment this feature deploys... without
it, the very first evaluation pass after deploy would see every
already-completed goal as newly transitioning and fire a burst of stale
'you achieved this months ago' notifications, which is the exact outcome
the spec explicitly rules out." This is correctly implemented as a
`DataMigration` block inside
`prisma/migrations/20260728082118_phase_4b_reports_notifications_v2/migration.sql`
for two of the three `FinancialGoal` types:

- `DEBT_PAYOFF` — backfilled correctly (joins `debt`/`financial_account` to
  replicate the live "effective balance ≤ 0" completion formula).
- `NET_WORTH_SAVINGS_TARGET` (both `TOTAL_NET_WORTH` and `ACCOUNT_SUBSET`
  measurement bases) — backfilled correctly (replicates the live
  net-worth/account-subset comparison against `targetAmount`).
- **`SAVINGS_RATE_TARGET` — deliberately NOT backfilled.** The migration's
  own SQL comment (lines 95-111) states this explicitly: this type's
  completion formula (a rolling 3-month average against a target percent)
  "cannot be faithfully replicated in raw SQL," and flags, in its own words,
  **"Before `goal-achieved-trigger.ts` ships, re-run an equivalent backfill
  UPDATE for this type using that formula once it exists, or explicitly
  accept this gap — flagged for the Backend Engineer/Solution Architect,
  not silently decided here."**

**What actually happened: neither of those two options was taken.**
`goal-achieved-trigger.ts` shipped (`15dc761`, Backend: Notifications v2
triggers), and it evaluates all three goal types identically via
`getFinancialGoalCompletionStatus` — there is no special-casing for
`SAVINGS_RATE_TARGET` that would exempt it from firing based on the
now-generally-available `computeCurrentRollingSavingsRatePercent` logic
(confirmed present and already in use elsewhere in this codebase since
Phase 3b, contrary to the migration comment's own stated reason for
deferring — the "not yet implemented in this codebase" justification the
comment gives was already false at the time this migration was authored,
since `features/financial-goals/server/service.ts` and
`features/dashboard/server/service.ts` both predate Phase 4b). Checked
directly:

- `git log --all --grep="savings.rate" -i` / `--grep="backfill" -i` across
  the entire repository: no commit after `575a9d5` (the Database Architect's
  schema pass that introduced this comment) ever touches this gap — no
  follow-up migration, no updated comment, no test, no risk-register entry.
- `docs/planning/risk-register.md` (read in full, all 23 rows): no entry
  documents this as an accepted risk. Risk #21 covers the cron route's
  general cross-user-leakage exposure, not this specific backfill gap.
- Neither `docs/security/phase-4b-security-review.md` nor
  `docs/performance/phase-4b-performance-review.md` nor any of the four
  Bug Hunter reports mentions `SAVINGS_RATE_TARGET` or this migration
  comment at all — none of the three review-gate roles caught it.
- `goal-achieved-trigger.test.ts` (source-level wiring tests only, per its
  own documented convention) has no coverage of this scenario, and
  couldn't — this is a data-migration correctness question, not something a
  mocked unit test over the trigger function itself can exercise.

**Concrete, reproducible impact.** Any user who, at the moment this
migration ran against production data, already had a non-archived
`SAVINGS_RATE_TARGET` Financial Goal whose rolling 3-month average was
already at or above its `targetPercent` will receive exactly one incorrect
"you achieved this goal" notification (in-app, and — if they'd already
opted into email for this trigger type, which defaults off — by email too)
the next time `ensureNotifications`/the cron sweep evaluates them, falsely
implying the goal was *just* reached. This is bounded (the
`@@unique([financialGoalId, type])` constraint still guarantees it fires at
most once, never a flood) but it is a real, deterministic, spec-contradicting
outcome for exactly the goal type and exactly the scenario the architecture
document itself called out and asked a specific role to resolve or
explicitly accept before ship.

**Why this blocks the gate, not just a "flag for later" item.** Every other
deferred/accepted item in this phase (Performance Findings 2/3, Security's
two Low/informational items) was **explicitly reasoned about and explicitly
accepted** by the role with the authority to make that call, in a document
that says so. This item is different in kind: the design document itself
already made the decision that it needs *either* a fix *or* an explicit
accept — and neither happened. Approving this release as-is would mean the
Release Manager is the first role to actually notice a gap the codebase's
own paper trail already flagged as needing resolution, and would be making
that accept-the-gap call unilaterally, on a role's behalf, rather than
routing it back to whoever the design doc actually named (Backend
Engineer/Solution Architect).

**Required to close this gate (either is sufficient):**
1. A follow-up migration/script that runs the equivalent backfill `UPDATE`
   for `SAVINGS_RATE_TARGET` goals, using the same rolling-3-month-average
   formula `computeCurrentRollingSavingsRatePercent` already implements
   (now genuinely available, unlike at the time the original migration
   comment was written) — closing the gap for real, or
2. An explicit, documented accept-the-gap decision from Backend
   Engineer/Solution Architect (updating the risk register and the
   migration's own comment to stop saying "flagged... not silently decided
   here" while leaving it exactly that), if the actual production impact is
   judged negligible enough (e.g., confirmed no `SAVINGS_RATE_TARGET` goal
   existed at the time the migration ran).

Nothing else in this review found a defect that would independently block
release — see Sections 2-7.

---

## 2. Product acceptance criteria — independently checked against shipped code, holds except for Section 1

**Reports (`reports.md`).** Read the full spec and checked the shipped
`features/reports/**` against every AC/binding constraint:

- Binding constraint 1 (never imports `lib/ai/`) and binding constraint 2
  (never reads `MonthlySummary.citedFigures`): confirmed by grep — zero
  matches for either across `src/features/reports/**` outside of comments.
  The Monthly Report's narrative section
  (`server/data/monthly.ts`/`pdf/templates/monthly.tsx`) reads
  `getSummaryForMonth(userId, monthKey).narrative` verbatim, renders it as a
  plain `<Text>` node, and omits the section entirely (no placeholder) when
  `null` or when `period.isPartial` — matches Report 1's own Edge Cases
  exactly, including "doesn't distinguish failed from not-yet-generated."
- Cross-Cutting AC5 (no cross-user report generation/retrieval): confirmed
  structurally — no `Report` table, no report ID, no download-by-ID
  endpoint exists anywhere (`grep` across `prisma/schema.prisma`); every one
  of the six `assemble*ReportData(userId, period)` functions threads
  `userId` into every downstream call; `app/api/reports/route.ts` resolves
  `userId` from `getCurrentUser()` only, never a request param.
- Risk #22 (custom range upper bound): `MAX_CUSTOM_RANGE_DAYS = 3653`
  enforced in `validation.ts`'s `.superRefine`, with a dedicated passing
  test in `validation.test.ts`.
- Yearly Report's Investments section label bug (was hardcoded "This Year"
  regardless of requested year) — confirmed fixed:
  `pdf/templates/yearly.tsx` now interpolates `data.period.label`.
- `document-shell.tsx`'s "Generated" timestamp — confirmed fixed:
  `GENERATED_AT_FORMATTER` now pins `timeZone: "UTC"`, matching every
  sibling formatter in the feature.
- Tax Summary's disclaimer is unconditionally rendered by
  `document-shell.tsx`'s `disclaimer` prop, confirmed present in both the
  "with investments" and "no investments" fixtures in `render.test.ts`.
- `render.test.ts` covers all six report types against both a full-activity
  and a zero-activity fixture, satisfying the Definition of Done's own
  "full period... and a zero-activity period" bar for the rendering layer.
  **Note (non-blocking, consistent with this codebase's own established
  testing convention):** there is no dedicated test file for
  `server/data/*.ts`'s six DB-touching assemblers themselves — matching the
  same "DB-touching functions are integration-test territory, not unit-test
  territory" convention already established by
  `features/investments/server/service.test.ts`/
  `features/analytics/server/*.test.ts` (which likewise only unit-test the
  pure reshaping functions extracted from their DB-touching callers, never
  the DB-touching functions directly). Since every report figure is sourced
  from an already-existing, already-tested read function with no new
  aggregation logic of Reports' own, the "zero tolerance for a disagreeing
  number" DoD bar is satisfied by construction (there is no second
  computation path that could diverge), not by a redundant test — the same
  reasoning this codebase already accepted for Analytics/Investments. Not a
  blocking gap, flagged for completeness only.

**Notifications v2 (`notifications-v2.md`).** Read the full spec and checked
every trigger's AC/edge cases against shipped code:

- **Goal Achieved:** AC1 (fires exactly once, at transition) — enforced by
  the atomic `updateMany({ where: { ..., completionNotifiedAt: null } })`
  claim in `goal-achieved-trigger.ts`, never read-then-write. AC3 (scoped to
  own goals) — `userId` filter throughout. AC4 (archived goal never fires) —
  `getFinancialGoalCompletionStatus`'s unconditional `archivedAt: null`
  filter. **No-retroactive-fire edge case — holds for two of three goal
  types, fails for the third; see Section 1 (blocking).**
- **Large Purchase:** AC1 (split-parent exclusion via
  `EXCLUDE_SPLIT_PARENTS`, the same predicate Transaction
  Auto-Categorization already uses) — confirmed in
  `large-purchase-trigger.ts`. AC2/dedup — the `@@unique([transactionId,
  type])` constraint, no separate latch. Recency-window edge case (no flood
  from bulk historical CSV import) — filtered on `Transaction.date`, not
  `createdAt`, with a 7-day `RECENCY_WINDOW_DAYS` — confirmed this
  correctly and structurally prevents old, historically-dated bulk-imported
  transactions from ever qualifying, regardless of import timing.
- **Low Balance:** AC1 (eligible types) — `ELIGIBLE_ACCOUNT_TYPES =
  ["CHECKING", "SAVINGS", "CASH"]`, `getAccounts`'s default archived
  exclusion. AC3/AC4 (crossing + re-arm) — `Account.lowBalanceNotifiedAt`
  as the sole latch, atomically claimed/cleared via conditional
  `updateMany`, never read-then-write. **Does-fire-retroactively edge
  case — confirmed correct**: the field's own default `null` state on every
  existing/new row produces the "armed to fire" behavior with zero
  migration needed (correctly, no backfill script exists for this one,
  matching the design doc's own explicit "no equivalent backfill is needed"
  note — the deliberate mirror-image of Section 1's Goal Achieved gap).
- **Monthly Summary:** AC1 (fires once per calendar month, only when
  narrative is non-null) and the regeneration-doesn't-re-fire edge case —
  confirmed correct, and confirmed the evaluation-gap bug (only checking the
  single most-recent row, permanently dropping older unnotified months) is
  fixed: `getRecentSummaries(userId, 6)` now checks a bounded 6-month
  window, with the `@@unique([monthlySummaryId, type])` constraint making
  re-checking an already-notified month a guaranteed no-op. Two new,
  substantive regression tests (`monthly-summary-trigger.test.ts`) actually
  construct the two-unnotified-row gap scenario and assert both rows get
  their own `createNotificationIfNew` attempt — this is a real behavioral
  test, not a trivial assertion.
- **Email Delivery Channel AC1/AC4** (off by default for every trigger, for
  every user): confirmed — `NotificationPreference.emailEnabled` defaults
  `false` at the schema level, and `getNotificationPreferences`'s
  materialize-missing-rows logic applies the same default for any row that
  doesn't yet exist.
- **AC7** (email failure never blocks in-app delivery): confirmed
  structurally — the in-app `Notification` row is created before
  `dispatchNotificationEmail` is ever called in `service.ts`'s
  `ensureNotifications`, and `sendNotificationEmail` never throws (catches
  every failure path, including the new timeout, into `{ sent: false,
  error }`).

## 3. Review-gate fix commits — verified landed in current source, not just claimed

**Security (`docs/security/phase-4b-security-review.md`, APPROVE, 2
Low/informational, both explicitly left as future hardening).** Confirmed
both are genuinely informational and correctly not fixed in this pass:

- The `no-restricted-imports` dynamic-`import()` gap — confirmed no dynamic
  `import()` of `lib/ai/` exists anywhere in `features/reports/**` or
  `features/notifications/**` today (the only `await import(` hits are test
  files dynamically importing their own mocked module under test, unrelated
  to `lib/ai/`). Correctly non-blocking.
- The five cron routes' `!==` secret comparison (not
  `crypto.timingSafeEqual`) — confirmed pre-existing across all five routes
  (including the new `evaluate-notifications`, which matches the other
  four's exact pattern, not a regression), correctly flagged as a future
  uniform hardening pass rather than a Phase-4b-specific defect.

**Performance (`docs/performance/phase-4b-performance-review.md`, APPROVE
with follow-ups). Findings 1, 4, 5, 6 — verified genuinely fixed, not just
claimed:**

- **Finding 1** (Expense Report's unused income aggregate) — confirmed
  fixed: `getExpenseTotalForMonth` (`dashboard/server/service.ts`) is a new,
  expense-only read; `expense.ts`'s monthly-trend loop now calls it instead
  of `getMonthlySummary`.
- **Finding 4** (`getNotificationThresholdSettings` queried twice per poll)
  — confirmed fixed: `service.ts`'s `ensureNotifications` now resolves it
  once and threads the same `thresholdSettings` value into both
  `evaluateLargePurchaseTriggers`/`evaluateLowBalanceTriggers` as a
  parameter.
- **Finding 5** (Goal Achieved's full-progress-view cost on every poll) —
  confirmed fixed, and the highest-impact fix of the four: a new
  `getFinancialGoalCompletionStatus` (via `buildProgressContext({
  includeTrend: false })`) skips `buildTotalNetWorthTrend` — the one
  page-display-only read this trigger never used — while reusing the exact
  same `isCompleted` computation. `getFinancialGoals`/`getFinancialGoalById`'s
  own contract is confirmed unchanged (not a behavior change for the page
  that already used them).
- **Finding 6** (no timeout on the outbound Resend call) — confirmed fixed:
  `EMAIL_SEND_TIMEOUT_MS = 8000` via `Promise.race`, flowing into the
  existing never-throws `catch` block; the still-pending original promise
  gets a no-op `.catch` to avoid an unhandled-rejection warning. Two new
  tests genuinely exercise both the timeout-fires path (fake timers,
  advances exactly to the boundary, asserts `sent: false` +
  `/timed out/i`) and the doesn't-false-positive path (resolves 1s before
  the timeout, asserts `sent: true`) — this is real behavioral coverage,
  not a placeholder assertion.

**Findings 2 and 3 — confirmed genuinely deferred, not silently forgotten.**
Both are explicitly called out in the fix commit (`655d837`) as "left
deferred per the review's own explicit non-blocking framing," matching the
Performance review's own Disposition section, which frames Finding 2
(Cash Flow/Expense `ALL_TIME` unbounded loop) as "flag now, fix if
profiling ever shows it matters" (an evidence-first posture this codebase
already applies elsewhere, e.g. Analytics' own identical `ALL_TIME` shape,
already accepted at the 3b gate) and Finding 3 (Risk #23's own fixture-test
commitment not yet implemented) as "low-cost/low-risk housekeeping." Neither
regressed or reappeared as a new class of issue in this review's own
independent pass.

**Bug Hunter (4 bug reports, all 4 fixed) — verified fixed, not just
claimed, by reading current source:**

1. Yearly Report's hardcoded "Gain/Loss This Year" label — fixed (Section 2
   above).
2. Monthly Summary notification's evaluation-gap bug — fixed (Section 2
   above), with genuine regression test coverage.
3. Notification Preferences' shared-mutation race — confirmed fixed:
   `PreferenceToggleButton` now calls its own
   `useUpdateNotificationPreference()` instance per button (14 independent
   `useMutation` instances via React's normal one-hook-per-component-instance
   behavior), rather than one shared instance hoisted at the list level —
   this structurally eliminates the `variables`-overwrite race the bug
   report described, not just a guard-condition patch on top of the same
   shared instance.
4. Report PDF's non-UTC "Generated" timestamp — fixed (Section 2 above).

## 4. Automated checks — re-run independently, myself, this pass

- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings (including the two new
  `no-restricted-imports` boundary rules for `features/reports/**`/
  `features/notifications/**`).
- `npx vitest run` → **569/569 tests passing, 45 test files** — matches the
  fix commit's own claimed number exactly, re-run fresh, not accepted on
  the strength of the commit message.
- `npm run build` → succeeds, all routes generated including the new
  `/reports`, `/settings/notifications`, `/api/reports`, and
  `/api/cron/evaluate-notifications`/`/api/notifications/unsubscribe`
  routes, no regressions.
- `npx prisma migrate status` → "Database schema is up to date!" (9
  migrations, including `20260728082118_phase_4b_reports_notifications_v2`).
- `git status` → clean, nothing uncommitted; `git log` for the Phase 4b
  commit range (`6b1ceef`..`f6001fc`) is a coherent, linear sequence
  matching the stated build-then-review-gate sequence with no gaps or
  out-of-order artifacts.

## 5. Module-boundary discipline — held, confirmed by direct inspection

- No file under `features/reports/**` or `features/notifications/**`
  imports from `lib/ai/`, directly or (per the ESLint ImportExpression gap
  Security already flagged as informational, checked here too) via a
  dynamic `import()` — confirmed by grep, both static and dynamic import
  forms, zero real matches (only doc-comment references).
- `app/api/cron/evaluate-notifications/route.ts` uses the identical
  shared-secret `CRON_SECRET` pattern as all four pre-existing cron routes —
  confirmed by direct reading, both branches (wrong secret / unconfigured
  secret) collapse to 401.
- Neither new Server Action's Zod schema
  (`UpdateNotificationPreferenceSchema`,
  `UpdateNotificationThresholdSettingsSchema`) nor `reports.md`'s
  `GenerateReportRequestSchema` has a `userId` field of any kind — confirmed
  by direct reading of `validation.ts` in both features; every downstream
  write/read uses the server-resolved session's `user.id` only.

## 6. Risks #19-23 — status confirmed current, not stale

- **#19/#20** (zero new `lib/ai/` call sites; Large Purchase/Low Balance
  fully independent of Spending Insights) — confirmed still true (Section
  5), unaffected by any fix-commit churn.
- **#21** (cron's externally-visible failure mode) — confirmed the
  structural mitigations (single-data-object-per-user-per-event, no batch
  email API, sequential per-user iteration) are actually implemented, per
  Security's own §6 verification, independently re-confirmed by this
  review's own reading of `service.ts`/`email-dispatch.ts`.
- **#22** (custom range upper bound) — confirmed enforced in code (Section
  2).
- **#23** (silent truncation risk in `@react-pdf/renderer`'s pagination) —
  confirmed **not fully closed**: the design doc's own committed mitigation
  ("testing every `<ReportTable>`-composing template against a
  high-row-count fixture") is not yet implemented (Performance Finding 3,
  correctly still open, correctly non-blocking per the same evidence-first
  posture applied elsewhere in this codebase). Flagged here again only to
  keep it visible for the next phase gate, not as a new finding.

## 7. What is NOT blocking this gate

For clarity, since Section 1 is this document's only blocking finding: the
Performance-deferred items (#2, #3 / Findings 2, 3), the Security
informational items, and the `@react-pdf/renderer` fixture-testing gap
(Risk #23) are all correctly, explicitly, already-accepted non-blocking
items with a clear owner and a clear "fix if it matters" framing from a role
with the authority to make that call. Section 1 is categorically different:
it is a gap the codebase's own paper trail already said needed a decision
that never actually got made by anyone.

---

## Release Manager Decision

**REJECT.** One specific, actionable, self-identified-but-never-closed gap
blocks this release: `SAVINGS_RATE_TARGET` Financial Goals were not included
in the required one-time `completionNotifiedAt` backfill migration, so any
user with a pre-existing, already-completed goal of that type receives one
incorrect retroactive "goal achieved" notification — a direct violation of
notifications-v2.md's own explicit, binding Goal Achieved edge case, and a
requirement the architecture design document itself flagged as needing
either a follow-up fix or an explicit accept decision from Backend
Engineer/Solution Architect before `goal-achieved-trigger.ts` shipped.
Neither happened.

Every other item this gate checked — every other product acceptance
criterion (Reports and Notifications v2 in full), every review-gate finding
across Security/Performance/Bug Hunter, the automated build/test/typecheck/
lint/migration status, module-boundary discipline (no `lib/ai/` leakage, no
cron auth bypass, no client-supplied `userId`), and the substance (not just
presence) of the newest regression tests — holds up under this independent
re-verification and requires no further changes.

**Path to APPROVE:** close Section 1 (a follow-up backfill migration for
`SAVINGS_RATE_TARGET` goals, or an explicit, documented accept-the-gap
decision from Backend Engineer/Solution Architect with the risk register
updated accordingly), then re-run this gate. Given the narrow blast radius
and the fact that everything else already passes, this should be a fast
follow-up, not a rebuild.

See `docs/release/phase-4b-checklist.md` for the itemized deployment
checklist.
