# Phase 4c Performance Review — Calendar v2, Customization, Admin

**Reviewer:** Performance Engineer
**Scope:** the full Phase 4c shipped surface — `src/features/calendar/**`,
`src/features/settings/**`, `src/features/admin/**`, `src/lib/feature-flags.ts`,
`src/features/reports/server/audit.ts` (the one Reports-owned file this phase
adds), and the four new route trees (`app/(dashboard)/calendar`,
`app/(dashboard)/settings/**`, `app/admin/**`). Read against
`docs/architecture/phase-4c-technical-design.md` (§2 Calendar v2 composition,
§3 Customization/`UserPreference`/`DashboardCardPreference`, §6
`lib/feature-flags.ts`, §7 Admin module, §9 cross-cutting closeout) and
`docs/planning/risk-register.md` rows #25–#38 as the intended design and
already-flagged concerns. `docs/database/performance-considerations.md`'s own
Phase 4c section (Database Architect's own indexing rationale) was also read
directly and cross-checked against `prisma/schema.prisma` and the actual query
call sites below, not taken on faith.

**Recommendation: APPROVE, with three non-blocking follow-ups recommended**
(Findings 1–3 below). Nothing found is a correctness defect or a blocking
regression at this app's current, early-production scale. Finding 1 is the
most concrete and highest-value follow-up in this review — a real, specific,
cheaply-fixable indexing gap on the exact new cross-user access pattern this
phase introduces — consistent with this codebase's standing evidence-first
performance posture (`docs/database/performance-considerations.md`'s own
framing, `phase-4b-performance-review.md`'s identical disposition style).

---

## Findings

### 1. MEDIUM (non-blocking, highest-value follow-up) — 6 of Admin Audit Log's 8 composed sources have no index supporting the exact query shape `getAuditLog` now runs against them

`features/admin/server/audit-log.ts`'s merge algorithm is itself well
designed: every source fetcher is correctly bounded (`take: PAGE_SIZE` = 50,
per source, before merging — this is the standard "top-K per stream, merge"
keyset technique, not an unbounded fetch-then-truncate). That part of the
task's own concern is **confirmed fine** — see the "Confirmed fine" section
below.

The gap is different: it's in the *indexing*, not the *merge algorithm*. Of
the 8 sources `getAuditLog` fans out to, only the **two tables this very
phase created** (`ReportGenerationEvent`, `AdminActionLog`) were given a
single-column index on their own timestamp column
(`@@index([generatedAt])` / `@@index([createdAt])` respectively) — and
`docs/database/performance-considerations.md`'s Phase 4c section explicitly
names the reason: "this table's actual read shape... filters by an ad hoc,
admin-chosen combination... rather than one fixed, predictable filter shape."
That reasoning is correct and was deliberately applied to those two tables.
**It was never carried back to the six pre-existing tables `getAuditLog` also
now reads**, because those six tables (`CategorySuggestion`, `Notification`,
`BudgetAdvisorCache`, `MonthlySummary`, `SpendingInsightsCache`,
`FinancialHealthScoreSnapshot`) were designed in 4a/4b under this codebase's
then-universal assumption that every query is scoped to one authenticated
user's own `userId` — an assumption Admin's Audit Log is the very first
reader to break (risk-register.md #33, confirmed directly in both
`audit-log.ts`'s and `users.ts`'s own header comments).

Verified directly against `prisma/schema.prisma`, every one of the six
fetchers below runs `ORDER BY <timestamp column> DESC LIMIT 50`, filtered
*only* by an optional `[gte, lt)` window on that same timestamp column — never
by `userId` — against a table whose only indexes all lead with `userId` (or,
for `CategorySuggestion`, with `transactionId`):

| Source (`audit-log.ts` fetcher) | Table | Query shape | Existing indexes | Covers this shape? |
|---|---|---|---|---|
| `fetchCategorySuggestionEntries` | `CategorySuggestion` | `WHERE createdAt IN window ORDER BY createdAt DESC LIMIT 50` | `[userId]`, `[transactionId, status]`, `[userId, source, status]` | **No** |
| `fetchNotificationEmailEntries` | `Notification` | `WHERE createdAt IN window AND (emailSentAt IS NOT NULL OR emailSendError IS NOT NULL) ORDER BY createdAt DESC LIMIT 50` | `[accountId]`, `[userId, readAt]`, `[userId, createdAt]` | **No** |
| `fetchBudgetAdvisorEntries` | `BudgetAdvisorCache` | `WHERE generatedAt IN window ORDER BY generatedAt DESC LIMIT 50` | `[userId, month]` (unique + index) | **No** |
| `fetchMonthlySummaryEntries` | `MonthlySummary` | same shape, `generatedAt` | `[userId, month]` (unique + index) | **No** |
| `fetchSpendingInsightsEntries` | `SpendingInsightsCache` | same shape, `generatedAt` | `[userId, period]` (unique + index) | **No** |
| `fetchHealthScoreNarrativeEntries` | `FinancialHealthScoreSnapshot` | same shape, `capturedAt` | `[userId, capturedDate]` (unique), `[userId, capturedAt]` | **No** |
| `fetchReportGenerationEntries` | `ReportGenerationEvent` | same shape, `generatedAt` | `[userId]`, `[type]`, **`[generatedAt]`** | Yes |
| `fetchAdminActionEntries` | `AdminActionLog` | same shape, `createdAt` | **`[action]`**, **`[createdAt]`** | Yes |

A composite index whose leading column is `userId` cannot be used by Postgres
to satisfy an `ORDER BY <timestamp> DESC LIMIT 50` that has no `userId`
predicate at all — the planner falls back to a sequential scan + sort (or, at
best, a full index scan in whatever order the index stores rows, still
touching every row) across the *entire table, every user combined*, not just
the 50 rows actually needed. This is a real behavioral difference from every
other query in this codebase to date: `docs/database/performance-considerations.md`'s
Phase 1–4b sections repeatedly justify "no extra index needed" specifically
*because* every prior read was `userId`-scoped and small-per-user — that
justification does not transfer to Admin's Audit Log, which is `userId`-unscoped
by design (risk-register.md #33).

On the unfiltered "view everything, first page" load (the default state of
`app/admin/audit-log/page.tsx`), all 8 fetchers run concurrently via
`Promise.all` with an effectively empty `where` clause on 6 of them (no
`start`/`end`/`cursor` supplied), so this is not an edge case — it is the
literal first thing an admin sees.

**Estimated impact:** at this app's current row counts (an early-production
account base, "thousands, not millions" per this codebase's own standing
scale assumption), a sequential scan + sort of a few hundred to a few
thousand rows costs low single-digit milliseconds — **not a blocking
concern today**, and the 8 sources run concurrently, so total request latency
is bounded by the slowest single source, not their sum. The concern is
*trajectory*, not present-day latency: `CategorySuggestion` and `Notification`
are the two sources here populated by **automated, cross-user background
activity** (the categorization cron across every user's transactions; the
notification poll/cron across every user's triggered events) rather than
low-frequency, human-triggered admin actions — the same "grows with total app
activity, not with how often an admin visits a screen" profile
`docs/database/performance-considerations.md` already flags as the reason
`ReportGenerationEvent`/`AdminActionLog` got dedicated indexes. Left
unaddressed, these two sources specifically are the most likely to eventually
turn "a few milliseconds" into "a real, admin-visible page-load stall" as the
user base and transaction/notification volume grow — the same "first place to
look if this is ever reported slow" framing `phase-4b-performance-review.md`'s
Finding 2 already established for this codebase's other unbounded-shaped
reads.

**Recommendation:** add one single-column index per affected timestamp column
— `@@index([createdAt])` on `CategorySuggestion` and `Notification`,
`@@index([generatedAt])` on `BudgetAdvisorCache`/`MonthlySummary`/
`SpendingInsightsCache`, `@@index([capturedAt])` on
`FinancialHealthScoreSnapshot` — mirroring exactly what Database Architect
already did for `ReportGenerationEvent`/`AdminActionLog` in this same phase,
for the identical reason. This is a small, low-risk, purely additive
migration (six `CREATE INDEX` statements, no data change, no application-code
change) that brings the other six sources up to the same standard the two
newest ones already meet. Non-blocking because current row counts don't yet
make this measurable, but cheap enough that closing it now (rather than
waiting for a profiling signal) is reasonable given how directly it maps to
this phase's own stated intent for the two sibling tables.

### 2. LOW-MEDIUM (non-blocking) — Calendar page's empty-state check quadruples an already N+1-shaped read, on every calendar page load

`app/(dashboard)/calendar/page.tsx` issues five reads in one `Promise.all`:
`calendar.service.getCalendarMonth` (itself already composing
`bills.service.getCalendarMonth` + `recurring-income.service.getIncomeCalendarMonth`),
plus **four more** — `bills.service.getBills` (active), `getBills`
(archived), `recurring-income.service.getIncomeStreams` (active), and
`getIncomeStreams` (archived) — used *solely* to compute one boolean
(`hasNoDataAnywhere`, the combined "never set up a bill or income stream
anywhere" empty state).

This redundancy compounds an existing, already-reviewed pattern rather than
introducing a new one: `ensureOccurrencesGenerated` (both `bills/server/service.ts`
and `recurring-income/server/service.ts`) runs one `findFirst` query **per
active bill / per active stream** inside a `Promise.all` — an N+1 shape
`docs/database/performance-considerations.md`'s Phase 2 section already
accepted at this app's expected small-per-user-list scale ("a dozen bills,"
the same volume class as `Debt`/`Goal`). Calendar v2's page now triggers this
exact N+1 loop **twice** for the same active-bill/active-stream set on every
single page load: once inside `getCalendarMonth`'s own composed reads, and a
second time inside the page's own `getBills(user.id)`/`getIncomeStreams(user.id)`
calls (the archived-list calls are cheap by comparison — archived bills/streams
short-circuit `ensureOccurrencesGenerated` immediately, per its own
`bill.archivedAt`/`stream.archivedAt` early-return).

**Estimated impact:** for a user with, say, 10 active bills and 5 active
income streams, this is roughly 15 extra indexed `findFirst` point-lookups
(cheap individually, sub-millisecond each with this schema's existing
`@@unique([billId, dueDate])`/`@@unique([streamId, expectedDate])`-backed
index support) plus 2 extra `Bill`/`IncomeStream` list queries and 2 extra
unpaid/unreceived-occurrence range queries — all on every calendar page
visit, purely to answer a boolean that is `true` for essentially no user past
their very first week using the product (calendar-v2.md's own framing: "the
user has genuinely never set up any bill or income stream anywhere in the
app"). Not blocking at this app's per-user list sizes (this is the same small,
bounded volume class as `Debt`/`Goal`, never `Transaction`-scale), but a clean,
low-risk-to-fix waste: the common case (a user who has ever added one bill or
one income stream) pays this cost on every visit for a check that will almost
always resolve to `false`.

**Recommendation:** replace the four extra `getBills`/`getIncomeStreams` calls
with two lightweight existence checks scoped to exactly what
`hasNoDataAnywhere` needs (e.g. `db.bill.count({ where: { userId }, take: 1 })`-style
existence probes, or a dedicated `hasAnyBillOrIncomeStream(userId)` read that
does two `findFirst`/`count` calls with no `ensureOccurrencesGenerated` loop
at all) — the boolean only needs to know "does at least one row of either
kind exist, active or archived," never each row's next-occurrence detail
`getBills`/`getIncomeStreams` compute for the ordinary list views. This drops
the page's total query count from ~5 base + up to ~2N (N = active bills +
streams) down to ~5 base + 2 trivial existence checks.

### 3. MEDIUM (non-blocking, environment-scoped) — Seed Demo Data's internal 120s timeout has no corresponding platform-level duration override

`features/admin/server/demo-data.ts`'s `triggerDemoDataSeed` correctly spawns
`npm run seed:showcase` as a genuinely separate child process via `exec`
(confirmed: this does **not** block the Node.js event loop — `child_process.exec`
is asynchronous, and `await`ing its promisified form only suspends the
calling async function, not the server's ability to handle other concurrent
requests). That specific concern from the task is **confirmed fine**.

A different, adjacent concern was found instead: this function `await`s that
child process for up to `SEED_TIMEOUT_MS = 120_000` (2 minutes) inside a
Server Action (`seedDemoData`, `features/admin/server/actions.ts`), and
neither `app/admin/demo-data/page.tsx` nor any ancestor layout
(`app/admin/layout.tsx`, the root layout) declares an `export const maxDuration`.
This codebase's four cron routes are the only place `maxDuration` is set
anywhere in the repo (confirmed by a repo-wide search — `app/api/cron/*/route.ts`,
each explicitly `60`+ seconds, per their own doc comments citing exactly this
concern for background jobs). This project's confirmed deployment target is
Vercel (risk-register.md #5, `phase-4b-technical-design.md`'s email-provider
comparison). Vercel's own platform default for an unconfigured Server
Action/Route Handler is well below 120 seconds on both the Hobby tier (10s)
and an unconfigured Pro deployment (15s default, configurable up to 300s) —
meaning this Server Action is very likely to be killed by the **platform**
well before its own internal `SEED_TIMEOUT_MS` ceiling is ever reached,
whenever it's exercised against an actual Vercel deployment (staging/preview;
Capability 6 AC2 already restricts this to non-production only, so this is
never reachable in production regardless).

**Estimated impact:** scoped entirely to non-production environments
(Capability 6's own guardrail), so this is not a production-facing risk. But
within that scope, it is a real, likely-to-fire gap: if a platform-level kill
happens mid-seed, the admin who triggered it gets **no** `{ success, error }`
result at all (the function is terminated, not returned-from) — directly
undermining this same file's own doc comment, which cites Capability 6 AC4's
"a clear failure message... never hidden" requirement as the reason a spawned
child process was chosen over a direct in-process import in the first place.
This is the same category of gap `phase-4b-performance-review.md`'s Finding 2
flagged for `GET /api/reports` (no explicit `runtime`/`maxDuration` override,
left to whatever the platform default resolves to rather than a value anyone
chose for the feature) — here the stakes are lower (dev/staging only, not a
production request path), but the mismatch between the code's own stated
120s ceiling and the platform's actual, much lower unconfigured ceiling is
concrete and easily verified.

**Recommendation:** add `export const maxDuration = 120` (or higher, with
margin) to `app/admin/demo-data/page.tsx` (or `app/admin/layout.tsx`, if
Next.js resolves Server Action duration from the invoking route's own
segment config, which should be confirmed during implementation of this fix)
so the platform's own ceiling is deliberately set to match — or exceed —
`SEED_TIMEOUT_MS`, the same "someone chose this number for this feature"
discipline the cron routes already established, rather than leaving it to an
unconfigured platform default.

---

## Confirmed fine (checked directly, no issue found)

- **Calendar v2's composition layer (`features/calendar/server/service.ts`)
  has no N+1 pattern, and no O(n²) merge.** `getCalendarMonth` zips
  `bills.service.getCalendarMonth`'s and `recurring-income.service.getIncomeCalendarMonth`'s
  already-day-keyed outputs via a single `Map` lookup (`paydaysByDay.get(billDay.day)`)
  inside one `.map()` pass — O(n) in the number of days in the month (≤31),
  never a nested loop. Confirmed zero Prisma imports in this file, per its own
  documented "pure composition" contract.
- **`bills.service.getCalendarMonth` and `recurring-income.service.getIncomeCalendarMonth`
  themselves have no *new* N+1 pattern** — both reuse the identical,
  already-reviewed `ensureOccurrencesGenerated`-per-bill/stream shape Calendar
  v1 (Phase 2) and `getBills`/`getIncomeStreams` already established and this
  codebase already accepted at the small-per-user-list scale documented in
  `docs/database/performance-considerations.md`'s Phase 2 section. Calendar
  v2 does not make this pattern worse on its own — Finding 2 above is about
  the *page* redundantly triggering it twice, not about the pattern itself
  being new.
- **`materializeDashboardCardPreferences` (`features/settings/server/service.ts`)
  is O(n), not O(n²).** The merge builds one `Map` keyed by `cardKey`
  (`rowsByKey`), then does a single `.map()` over `DASHBOARD_CARD_KEYS`
  (a small, fixed-size, code-owned list) doing `Map.get()` lookups — no
  nested `.find()`/`.filter()` inside the loop. At this table's realistic
  size (a handful of dashboard cards, per `dashboard-cards.ts`), this would
  be trivial even if it were O(n²), but it isn't.
- **`lib/feature-flags.ts`'s in-process TTL cache introduces no memory-growth
  risk.** `FeatureFlagKey` is a closed, two-member TS union
  (`"AI_FEATURES" | "EMAIL_DELIVERY"`) — the `Map` this cache uses can never
  hold more than 2 entries, regardless of call volume or process uptime; this
  is genuinely bounded, not an unbounded per-key cache. The 30s TTL adds no
  meaningful per-request latency to the AI/email hot path in the steady
  state (cache hit = a `Map.get()`), and the fail-open behavior on both a
  missing row and a genuine read error (confirmed directly in
  `isFeatureEnabled`'s `catch` block) matches risk-register.md #34's binding
  requirement exactly.
- **`getAuditLog`'s cross-source merge is correctly bounded, not
  unbounded-then-truncated.** Every one of the 8 source fetchers applies
  `take: PAGE_SIZE` (50) at the database layer *before* the in-memory merge —
  the standard "top-K per stream" keyset technique, confirmed to produce a
  globally-correct top-50 page (not an approximation) given the shared
  `[gte, lt)` window every source is bound by. The one documented imprecision
  (a same-millisecond tie across two different sources on a page boundary) is
  a narrow, accepted, non-financial-data tradeoff, not a scalability concern.
  See Finding 1 for the distinct (and real) indexing gap this same file has.
- **`getUsers`'s `Session.groupBy` (`features/admin/server/users.ts`) is
  correctly scoped to the current page's `userIds`, not the whole table.**
  `db.session.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, ... })`
  filters to exactly the ≤50 user ids already resolved by the page's own
  `db.user.findMany` call — this does **not** scale with total `Session` row
  count across the whole user base, only with `PAGE_SIZE`. No index gap
  either: `Session.userId` is already indexed (Better Auth's own schema, an
  FK to `User`).
- **`AdminActionLog` and `ReportGenerationEvent` (this phase's two genuinely
  new, cross-user-read tables) are correctly indexed for their actual access
  pattern from day one** — confirmed directly against `prisma/schema.prisma`
  (`@@index([action])`/`@@index([createdAt])` and
  `@@index([userId])`/`@@index([type])`/`@@index([generatedAt])`
  respectively). These are the two sources Finding 1 does *not* flag.
- **Zero new npm dependencies were added in Phase 4c** (confirmed via
  `git diff` against the prior phase's `package.json` — the only change is a
  new `grant:admin` script entry, no new `dependencies`/`devDependencies`).
  No bundle-size regression from this phase: `DashboardLayoutEditor`'s
  reorder UI deliberately uses plain up/down buttons instead of a
  drag-and-drop library specifically to avoid this cost (confirmed in its own
  doc comment), and no chart/table/PDF-rendering library was introduced.
- **Admin introduces zero new Route Handlers** (confirmed against
  `features/admin/`'s full file list and `phase-4c-technical-design.md` §7.2's
  own claim) — every read is a Server Component direct call, every write a
  Server Action. This means Admin adds no new client-side refetch/polling
  surface and no new hydration-relevant client data-fetching hook beyond the
  handful of small `useMutation`-only hooks already reviewed (`use-user-preference.ts`,
  `use-dashboard-card-preferences.ts`) — both follow the existing
  "Server Component seeds `initialData`, mutations write via `setQueryData`,
  never a live refetch" pattern already established for Notification
  Preferences in Phase 4b.
- **`TimezoneAutoCapture`'s cost is negligible and does not fire per page
  load.** Mounted once in `app/(dashboard)/layout.tsx`, which (per Next.js
  App Router's layout-persistence behavior) does not remount on client-side
  navigation between pages within the same authenticated segment — this
  effect fires roughly once per browser session/full page load, not once per
  page visit. Its own `hasFired` ref additionally guards against React
  Strict Mode's dev-only double-invoke. The action it calls
  (`captureInferredTimezone`) is a single conditional `updateMany` (zero rows
  affected in the steady state, after a user's very first session) plus one
  indexed `findUnique` re-read — two trivial, indexed queries per session,
  not per page.
- **`CalendarGrid` and `DashboardLayoutEditor` have no rendering-scale
  concern.** Both render small, fixed-upper-bound lists (≤~35 calendar-grid
  cells including padding; a handful of dashboard cards) with stable `key`
  props and no unmemoized expensive computation in the render path — at this
  scale, `React.memo`/`useMemo` would add complexity without a measurable
  benefit, consistent with this codebase's existing approach elsewhere (no
  premature memoization pattern anywhere else in the reviewed feature set).
- **No new caching-layer precedent beyond `lib/feature-flags.ts`'s own
  narrow, already-justified exception** — confirmed directly against every
  new read in this phase (`calendar.service.getCalendarMonth`,
  `settings.service.getUserPreference`/`getDashboardCardPreferences`,
  `admin.server/*`, `reports/server/audit.ts`'s `getReportGenerationEvents`):
  all are on-read, uncached Prisma queries, matching
  `docs/database/performance-considerations.md`'s own Phase 4c closing
  statement.
- **`Dashboard`/`Customization` note (out of strict performance scope, flagged
  for completeness since it directly answers a question this review was
  asked):** `getUserPreference`/`getDashboardCardPreferences` are **not**
  currently called from `app/(dashboard)/page.tsx` at all — they're read only
  from `app/(dashboard)/settings/appearance/page.tsx` and
  `.../settings/preferences/page.tsx`. From a pure performance standpoint
  this means **zero added read cost on the Dashboard's own render path
  today** (the question "is this an acceptable added read" is moot — there is
  no added read yet). Whether the Dashboard is *supposed* to already be
  consuming these preferences to actually show/hide/reorder its own cards is
  a functional-completeness question for whoever owns Dashboard/Frontend Lead
  review, not a performance finding — noted here only so the factual answer
  to the task's own question is on record.

---

## Disposition

Findings 1–3 are all non-blocking, evidence-first follow-ups, not gate items
— none is reachable at a cost that matters at this app's current scale, and
two of the three (Findings 1 and 2) are cheap, low-risk, mechanical fixes
(index additions; replacing four full list reads with two existence checks)
that are reasonable to schedule opportunistically rather than block release
on. Finding 3 is scoped entirely to non-production environments by Capability
6's own design and has no production exposure at all. This matches the same
disposition style `phase-4b-performance-review.md` used for its own Findings
1–2 and 6 — flag, estimate, recommend, don't block.
