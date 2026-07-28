# Phase 4b Performance Review — Reports & Notifications v2

**Reviewer:** Performance Engineer
**Scope:** the full Phase 4b shipped surface — `src/features/reports/**`,
`src/features/notifications/**`, `src/app/api/reports/route.ts`,
`src/app/api/cron/evaluate-notifications/route.ts`,
`src/app/api/notifications/route.ts`, `src/lib/email/**`, and the two new
pages (`app/(dashboard)/reports`, `app/(dashboard)/settings/notifications`).
Read against `docs/architecture/phase-4b-technical-design.md` (§2 synchronous
on-demand PDF generation, §6 lazy + cron notification evaluation, Risk
#21–#23) as the intended design.

**Recommendation: APPROVE, with three non-blocking follow-ups recommended
before/soon after general rollout** (Findings 1, 2, 5 below). Nothing found
is a correctness defect or a blocking regression; the findings are bounded,
measurable cost items consistent with this codebase's existing "flag it,
don't preemptively rebuild it" performance-review posture (see
`docs/database/performance-considerations.md`'s own Phase 3a/3b framing).

---

## Findings

### 1. MEDIUM — Expense Report's monthly trend loop pays for an unused income aggregate on every month

`assembleExpenseReportData` (`src/features/reports/server/data/expense.ts:40-48`)
loops the resolved period's months and calls
`dashboard.service.getMonthlySummary(userId, monthStart)` to get each month's
`expenses` figure — but `getMonthlySummary` unconditionally runs **two**
`db.transaction.aggregate` calls per month (`income` sum + `expense` sum,
`src/features/dashboard/server/service.ts:122-158`), and this report only
ever reads `.expenses`. Cash Flow and Yearly legitimately need both figures
from the same call; Expense does not.

**Estimated impact:** exactly 2x the necessary query count for this report
type's trend section — for a 10-year "All Time" Expense Report (~120 months,
see Finding 2), that's ~120 avoidable `aggregate` calls in a single request.
For a typical 1-year Expense Report, ~12 avoidable calls — small in absolute
terms, but a pure waste with a one-line fix (a dedicated
`getExpenseTotalForMonth`/reuse of the existing `_sum` shape, expense-only).

### 2. MEDIUM (non-blocking) — Cash Flow/Expense "All Time" has no upper bound on the per-month loop, unlike the Custom range

`validation.ts`'s `MAX_CUSTOM_RANGE_DAYS` (3653 days / 10 years, Risk #22's
mitigation) only guards the **Custom start/end** branch of
`FlexiblePeriodParamsSchema`. The **`ALL_TIME` preset** branch resolves
`period.start = null`, and both `cash-flow.ts` and `expense.ts` then fall
back to `getEarliestTransactionDate(userId)` — the user's actual first
transaction date, with no ceiling at all. For a genuinely long-tenured
account (the task's own "10-year power-user" framing), that's
`enumerateMonthKeys` returning ~120 month keys, each firing its own
`Promise.all`-wrapped `getMonthlySummary` call (2 aggregates apiece before
Finding 1's fix, 1 after) — up to ~240 concurrent `aggregate` queries fired
from a single request.

This is not a newly-invented risk: it is the identical shape Analytics'
`savings-growth.ts` already established in Phase 3b (also unbounded on
`ALL_TIME`, already reviewed and accepted at that gate under this codebase's
"thousands, not millions, of rows per user" scale assumption). What Phase 4b
changes is **exposure**: Reports adds three more directly-reachable,
user-triggered entry points to this same unbounded-months pattern
(Cash Flow, Expense, and indirectly Income via `getIncomeGrowth`), and unlike
a dashboard page — which renders whatever already resolved and never blocks
on a single slow metric — a report request is one synchronous
generate-then-respond round trip with nothing streamed back until the whole
PDF buffer is ready. `GET /api/reports` also declares no explicit
`runtime`/`maxDuration` override (contrast with every `app/api/cron/*` route,
which sets `maxDuration = 60` deliberately), so its effective ceiling today
is whatever Next.js/Vercel's platform default resolves to for this route,
not a value anyone chose for this feature.

**Estimated impact:** at this app's own documented per-user scale (thousands,
not millions, of transaction rows), ~240 concurrent indexed
`[userId, date]` aggregate queries is very unlikely by itself to blow a
10–60s serverless timeout under normal DB latency (rough order of magnitude:
low hundreds of ms to a couple of seconds of DB-bound time, dominated by
Prisma's connection-pool queueing rather than raw query cost) — this is
**not assessed as blocking**. It is, however, the single most expensive
request shape in this entire feature, and the first place to look if a
timeout or DB-connection-pressure incident is ever reported in production.

**Recommendation (either is sufficient, not both required):**
(a) apply the same order-of-magnitude ceiling Risk #22 already applies to
custom ranges to the `ALL_TIME`-resolved floor specifically for Cash
Flow/Expense's own per-month loop (e.g., clamp the loop's start to
`max(earliestTransactionDate, today - 10y)`, independent of whether
Analytics' own `ALL_TIME` semantics change), or (b) replace the per-month
loop with a single grouped query (`groupBy`/`date_trunc('month', date)`),
the same "future query-shape refinement" already flagged and deferred for
Category Trends/Subscription Detection in
`docs/database/performance-considerations.md`'s Phase 3b section — i.e.,
treat this the same evidence-first way that precedent was treated, not as
something to fix reactively today.

### 3. LOW — Risk #23's own documented test mitigation was not implemented

`phase-4b-technical-design.md` §8's Risk #23 explicitly commits to
"testing every `<ReportTable>`-composing template against a high-row-count
fixture account as part of this feature's own test suite." `render.test.ts`
covers all six templates but only with 1–2 row fixtures per section — no
test exercises what a 100+-row `monthlyTrend` (a multi-year Cash Flow/Expense
report) or a large `largestPurchases`/`topMerchants` list actually renders
as. `report-table.tsx`'s own doc comment already discloses one known,
accepted cosmetic gap (no repeated header row across a page break) — that
gap, and the more important "does a long table ever silently truncate
instead of paginating" question Risk #23 exists to answer, is currently
unverified by any automated test.

**Estimated impact:** no runtime cost — this is a coverage gap, not a
performance defect. Flagged because the design doc treats this as a required
mitigation, not an optional one, and it's a cheap fixture addition (one
`monthlyTrend` array of ~120 synthetic rows passed through the existing
`expectValidPdf` helper) relative to the risk it closes out.

### 4. LOW — `getNotificationThresholdSettings` is queried twice per poll for the same user

`large-purchase-trigger.ts` and `low-balance-trigger.ts` each independently
call `getNotificationThresholdSettings(userId)` (`preferences.ts:97-107`,
a single indexed `findUnique`). Both run inside `ensureNotifications`'s own
top-level `Promise.all` (`service.ts:46-52`), so every poll and every cron
iteration fires this identical single-row lookup twice instead of once.

**Estimated impact:** negligible in isolation (one extra indexed
point-lookup on a table with at most one row per user) — noted as a trivial,
easy dedup opportunity (thread one resolved value into both triggers, or
accept as-is) rather than something worth restructuring the trigger
interface for.

### 5. MEDIUM — Goal Achieved trigger meaningfully increases per-poll cost for users with Net-Worth/Savings-Rate goals

`goal-achieved-trigger.ts` calls `financial-goals.service.getFinancialGoals(userId)`
on **every** `ensureNotifications` call — i.e., every 60-second bell poll for
every open tab, plus every cron-sweep iteration — solely to read each goal's
already-computed `isCompleted` boolean. For a user with no
`NET_WORTH_SAVINGS_TARGET`/`SAVINGS_RATE_TARGET` goals this is cheap (one
indexed `findMany`, `buildProgressContext`'s conditional reads all
short-circuit to `Promise.resolve(null/[])`). But for a user who **does**
have such a goal, `buildProgressContext` (`financial-goals/server/service.ts:328-`)
additionally runs, every single poll:
- `getNetWorth(userId)` (2 queries) + `buildTotalNetWorthTrend` (a
  `resolveDefaultRange` + `getNetWorthHistory` range read) for any
  `TOTAL_NET_WORTH`-basis goal, and
- `computeCurrentRollingSavingsRatePercent` for any `SAVINGS_RATE_TARGET`
  goal — a `db.user.findUnique` plus **three more `getMonthlySummary` calls**
  (6 more aggregate queries) for the trailing 3-month window.

None of this data (net worth, rolling savings rate) moves on a
sub-minute cadence — it is being fully recomputed from scratch every 60
seconds purely to answer a boolean ("did this goal just newly complete")
that only the `isCompleted` field itself needs.

**Estimated impact:** v1's poll baseline was ~2 cheap, already-optimized
reads (`getOverBudgetCategories`, `getUpcomingOccurrences`). For a user with
a qualifying goal, this one new trigger alone can add ~10–12 additional
queries to every 60-second poll and every cron-sweep iteration for that
user — the largest single per-poll cost increase Phase 4b introduces,
concentrated on a subset of users (anyone with at least one Net-Worth or
Savings-Rate financial goal) rather than universal.

**Recommendation:** `goal-achieved-trigger.ts` only needs a narrower
"is this goal newly complete" read than `getFinancialGoals`'s full
progress-view materialization (which also builds the mini trend line and
account-subset detail this trigger never looks at). A dedicated,
completion-only read path (skip `buildTotalNetWorthTrend`/account-subset
enrichment entirely, keep only the boolean-producing comparison) would cut
this trigger's cost back down to roughly its v1-baseline-comparable size for
the affected user subset, without changing `getFinancialGoals`'s own
contract for its other (page-rendering) caller.

### 6. MEDIUM — No timeout on the outbound Resend call; email dispatch is synchronous relative to both the poll response and the cron sweep

`sendNotificationEmail` (`lib/email/send-notification-email.ts:45-72`) awaits
`resend.emails.send(...)` with no explicit timeout/`AbortSignal` — a network
stall or provider-side hang has no bounded upper wait. This call sits inside
`dispatchNotificationEmail`, which `ensureNotifications` awaits **sequentially**
per newly-created notification (`service.ts:56-69`, deliberately not
`Promise.all`, per that file's own "no unbounded fan-out" comment) — and
`ensureNotifications` itself is awaited by both:
- `getNotifications`/`getUnreadCount`, called synchronously on every
  `GET /api/notifications` poll (every open tab, every 60s), and
- `evaluateNotificationsForAllUsers`'s fully **sequential** per-user loop
  (`service.ts:91-112`), where a hang on one user's email directly delays
  every subsequent user in the same cron invocation.

This does **not** violate AC7's correctness guarantee — the in-app
`Notification` row is already durably persisted before `dispatchNotificationEmail`
is ever called, so a hung/failed email can never roll back or block the
in-app write itself. The exposure is purely **latency**, not correctness:
an unbounded wait inside a request a real user's browser is polling on, and
inside the same shared-secret cron invocation the design doc's own
`maxDuration = 60` comment already flags as a future scaling concern once the
user base grows ("this invocation can run longer than a typical serverless
default timeout well before the user base is large").

**Estimated impact:** in steady state (0–1 new notifications per poll, per
`service.ts`'s own "at most a handful of newly-created rows" framing) this
costs nothing extra beyond Resend's normal response time (typically
sub-second). The risk is the *unbounded tail*: a single slow/hung Resend
response currently has no ceiling, so it can add an arbitrary, unpredictable
delay to one user's poll and to the cron sweep's total wall-clock time,
compounding linearly with however many emailed users are affected in the
same sweep.

**Recommendation:** add an explicit timeout to the Resend call (e.g. an
`AbortSignal.timeout(...)`-equivalent passed through the SDK, in the
5–10s range) so a hung provider fails fast into the already-correct
`{ sent: false, error }` path instead of stalling the caller indefinitely.
This is a small, targeted addition to `send-notification-email.ts` only —
no restructuring of the sequential-dispatch design (which is a deliberate,
reasonable choice at this app's email volume) is needed.

---

## Confirmed fine (checked directly, no issue found)

- **Low Balance's per-account `updateMany` inside `Promise.all`**
  (`low-balance-trigger.ts:82-89`) is an acceptable pattern, not a batching
  gap — accounts-per-user is the same small, bounded list class as
  `Debt`/`Goal`/`IncomeStream` already established throughout
  `performance-considerations.md`; there is no realistic per-user account
  count where N concurrent single-row `updateMany` claims would matter.
  Batching would also complicate the atomic-claim-per-account semantics
  §6's own "atomic conditional update, never read-then-write" rule requires.
- **`Notification.@@unique` constraints and the `completionNotifiedAt`/
  `lowBalanceNotifiedAt` latches** are correctly used as atomic
  conditional-update claims (`updateMany(... where: { ..., latch: null })`,
  checking `count === 1`) everywhere, never read-then-write — confirmed in
  `goal-achieved-trigger.ts` and `low-balance-trigger.ts` directly.
- **The cron sweep (`evaluate-notifications`) iterates users sequentially**,
  matching the already-established `captureAllUsersNetWorthSnapshots`/
  `generateMonthlySummariesForAllUsers` precedent, with per-user failure
  isolation (`try`/`catch` inside the loop) — consistent with every other
  all-users cron in this codebase.
- **`@react-pdf/renderer`, `resend`, and `@react-email/*` never reach the
  client bundle** — confirmed no `features/reports/components/**` or
  `features/notifications/components/**` file imports from
  `@react-pdf/renderer`, `resend`, `@react-email/*`, or `lib/email/**`; both
  third-party dependencies are correctly isolated to server-only files
  (`render.ts`, `lib/email/client.ts`) per the design doc's own "one file
  owns the third-party import" convention.
- **`use-report-download.ts`'s blob-download pattern has no memory concern**:
  `URL.createObjectURL`/`URL.revokeObjectURL` are correctly paired in the
  same function call, the anchor element is transient (appended, clicked,
  removed synchronously), and nothing retains the blob/object URL beyond the
  single download — a report PDF at this feature's realistic size (a few
  hundred KB at most, plain text/tables only, no embedded images) held
  briefly in memory during download is a non-issue regardless.
- **`app/(dashboard)/reports/page.tsx` and `.../settings/notifications/page.tsx`**
  have no waterfall-fetch regression: Reports' page does no data-fetching of
  its own (correct, per reports.md's "no persisted artifact to list");
  Notification Preferences' page fetches both of its reads via one
  `Promise.all`, matching every other Server Component page's established
  pattern in this codebase.
- **Report PDF templates (`document-shell.tsx`, `report-table.tsx`, all six
  `templates/*.tsx`) have no structural rendering waste** — `StyleSheet.create`
  calls are module-scope (evaluated once per warm invocation, not per
  render), each template is a pure `data → JSX` mapping with no repeated
  computation, and `renderReportPdf` renders each report type exactly once
  per request via a single `switch` dispatch, never re-rendering the same
  tree.
- **Monthly, Yearly, and Tax Summary Reports' data assemblers are all
  correctly bounded** (single month / single calendar year / single calendar
  year respectively) — no unbounded-range exposure exists for these three
  report types; Finding 2 above applies only to the three flexible-period
  types (Income/Expense/Cash Flow).
- **`getNotifications`'s `NOTIFICATION_INCLUDE`** joins all six possible
  relations in a single query (Prisma `include`), not one query per relation
  per row — correctly a single indexed `findMany`, not an N+1.

---

## Disposition

Findings 1, 2, and 5 are worth addressing before this feature sees load from
a meaningfully long-tenured user base — Finding 1 is a trivial one-line fix,
Finding 5 has the clearest per-poll cost impact of anything in this review
and a straightforward fix (a completion-only goal read, skipping progress/trend
enrichment), and Finding 2 is a "flag now, fix if profiling ever shows it
matters" item consistent with this codebase's own established evidence-first
performance posture — not a blocking gate item. Finding 6 (email timeout) is
a small, cheap, unambiguous hardening addition. Findings 3 and 4 are
low-cost/low-risk housekeeping, appropriate to pick up opportunistically
rather than as a dedicated pass.
