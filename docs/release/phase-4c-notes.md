# Phase 4c Release Notes — Calendar v2, Customization, Admin

**Reviewer:** Release Manager
**Scope:** Calendar v2 (`docs/product/calendar-v2.md`), User Customization
(`docs/product/customization.md`), and Admin (`docs/product/admin.md`), per
`docs/architecture/phase-4c-technical-design.md` and `roadmap.md`'s Phase 4c
kickoff/resolution passes. This is a full, independent re-verification —
every acceptance criterion, review-gate finding, and automated check below
was checked directly against current source and re-run myself, not accepted
on the strength of any prior agent's summary, following the same discipline
`phase-4b-notes.md`'s first pass established.

**Decision: REJECT.**

Everything this phase's own review gate claims to have closed — both High
Bug Hunter findings, the P2025 gap, the `TimezoneSchema` gap, the
seed-demo-data precondition gap, the six missing indexes, the Calendar page
redundant-read fix, the `maxDuration` fix, and the Dashboard
accent-color/card-layout wiring — genuinely is closed, verified directly
against current source below (Sections 2–7). Admin authorization, this
phase's headline security concern, holds up under independent inspection.

But one of Customization's four capabilities has a real, unacknowledged,
binding acceptance-criteria violation that no prior gate (Security,
Performance, Bug Hunter) caught: **Currency Display is fully built —
schema, validation, Server Action, settings UI, and a live preview — but is
never actually consumed anywhere else in the product.** Every one of the
~160 other `formatCurrency` call sites across Dashboard, Transactions,
Accounts, Budgeting, Bills, Debt Tracker, Investments, Goals, Analytics, all
six Report PDF templates, and all six notification/email templates still
renders unconditional USD, regardless of what a user selects. This is not a
CTO-descoped, tracked, accepted gap the way Timezone's consuming-logic
deferral is — it directly contradicts `customization.md`'s own explicit,
unconditional AC4 ("no exceptions carved out") and Definition of Done, and
the shipped Settings page's own copy ("changes how amounts are shown
**throughout the app**") is factually false as shipped. See Section 1.

---

## 1. BLOCKING — Currency Display is not wired to any surface outside its own settings-page preview

### What the spec requires, unconditionally, with no descope

`customization.md`'s Currency Display capability, AC4 (quoted in full,
nothing paraphrased): *"The preference applies to every currency-formatted
figure in the product, with no exceptions carved out: Dashboard cards,
Transactions, Accounts, Budgeting, Bills, Debt Tracker, Investments, Savings
Goals, Financial Goals, Analytics, all six Reports PDF types (including
their tabular/numeric content), and notification/email content (Large
Purchase, Low Balance, and any other currency-figure-bearing notification or
email). A user who sets a display currency and still sees a stray
`$`-formatted figure anywhere is a defect."*

Its Definition of Done is equally explicit: *"Currency display is verified,
by test, to change rendered symbol/grouping only — the exact same underlying
numeric values, calculations, and threshold comparisons... are confirmed
unaffected by a currency-display change, across every surface listed in AC4
above."*

Unlike the Timezone Preference capability in this same spec — which carries
its own explicit "Scope note — descoped by the Phase 4c CTO resolution pass"
section, is tracked as risk-register.md #29, and had its spec text itself
edited to mark AC2/AC4 as deferred target-state design — **Currency Display
has no such scope note, no CTO descope decision, and no risk-register entry
acknowledging incomplete rollout.** Risk #28 (the only currency-related risk
row) is about confirming the capability's *scope* is formatting-only, not
multi-currency data support — it explicitly says "Product Owner's
Customization spec must reflect this scope explicitly... confirmed... no
spec edit needed," which is a different question from whether the scoped
work was actually finished. Nothing anywhere authorizes shipping this
capability partially.

### What is actually in source, verified directly

`src/lib/utils.ts`'s `formatCurrency(amount, currency = "USD")` already
accepted a `currency` parameter before this phase (confirmed by its own
JSDoc, added this phase): *"every existing call site simply never passed
one... updating every other existing call site across the app (Dashboard,
Transactions, Reports, notifications, etc.) to pass the caller's resolved
`UserPreference.currencyDisplay` is explicitly out of scope for this
dispatch — real, broad call-site plumbing work, not a signature change."*
This comment is the implementing engineer's own admission that the
call-site rollout `phase-4c-technical-design.md` §3.6 itself calls for
("every call site across the app is updated to pass the caller's resolved
`UserPreference.currencyDisplay`... this is real, if broad, work") was never
done — it is not a misunderstanding on my part, it is documented in the
code by whoever wrote it.

Grepped every `formatCurrency(` call site in `src/` (excluding test files):
**162 total, of which exactly 2** — both inside
`src/features/settings/components/currency-display-select.tsx`, the
settings page's own live preview widget — pass a `currency` argument at
all. Every other call site (**160**, spanning every surface AC4 names)
calls `formatCurrency(amount)` with no second argument, silently defaulting
to `"USD"`:

- **Dashboard**: every stat card, all three charts (`chart-format.ts`),
  Monthly Summary card — unwired.
- **Transactions, Accounts, Budgeting, Bills, Debt Tracker, Investments,
  Savings Goals, Financial Goals, Analytics** — unwired (spot-checked
  `features/transactions/server/actions.ts`'s own `Intl.NumberFormat` usage
  for confirmation; same hardcoded pattern).
- **All six Reports PDF templates**
  (`features/reports/pdf/templates/{monthly,yearly,tax-summary,income,expense,cash-flow}.tsx`)
  — every `formatCurrency(...)` call in all six files takes one argument.
- **All six notification/email templates**
  (`lib/email/templates/{bill-due-soon,bill-late,budget-over,large-purchase,low-balance}.tsx`,
  `lib/email/templates/format.ts`) — same, one-argument calls throughout.
- A repo-wide grep for `currencyDisplay` across `src/` returns exactly the
  Settings module's own files (`types.ts`, `validation.ts`, `service.ts`,
  `actions.ts`, `currency-display-select.tsx`) plus two unrelated doc-comment
  mentions in `dashboard-cards.ts`/`lib/feature-flags.ts` (both just citing
  it as a precedent for the String-not-enum pattern, not consuming it) — **no
  hook, context, or wrapper reads this field anywhere else in the app.**

### Why this is a real defect, not a nitpick

The Settings page's own shipped copy makes an affirmative, false claim to
every real user who touches this control: *"Changes how amounts are shown
throughout the app — your data stays in USD"*
(`currency-display-select.tsx`'s `CardDescription`). A user who sets their
display currency to EUR and then visits their Dashboard, Transactions,
Budgeting, or any Report sees every figure still rendered in USD with no
indication their change did anything at all outside the one settings card
they just left. This is exactly the "a stray `$`-formatted figure anywhere
is a defect" outcome AC4 names by its own words — except it is not a stray
exception, it is the *entire product surface* outside one preview line.

This is the same category of gap the Performance Engineer's review already
caught once this phase, for Dashboard's accent-color/card-layout
preferences — and that gap **was** found and fixed (commit `f93abcc`,
verified in Section 4 below). Currency Display is the one sibling
preference in the same capability set that went through an identical
"built the preference, never wired the consumption" pattern and was **not**
caught by any of the three review-gate passes (Security, Performance, Bug
Hunter) or the two fix-pass commits. Nothing in this pass's own review
artifacts (`phase-4c-security-review.md`, `phase-4c-performance-review.md`,
the six bug reports) mentions it at all.

### What closing this requires (Backend Engineer + Frontend Lead, not this review)

Per `phase-4c-technical-design.md` §3.6's own framing, this is real but
non-architectural: `formatCurrency`'s signature already supports the fix.
Every Server Component/service call site that currently formats a currency
figure needs to resolve the caller's `UserPreference.currencyDisplay`
(`getUserPreference(userId)`, already built and already used by
`app/(dashboard)/layout.tsx` for accent color) and thread it through to
`formatCurrency`, mirroring exactly how `f93abcc` threaded
`getDashboardCardPreferences` into the Dashboard page. This spans:
Dashboard's cards/charts, Transactions, Accounts, Budgeting, Bills, Debt
Tracker, Investments, Goals, Analytics, all six Report PDF templates
(`generateReport` already resolves `userId` — the same call site that would
resolve the report's currency), and all six email templates (the
notification-send pipeline already resolves `userId` per recipient). This
review's Definition of Done bar for calling this closed: the same
by-test verification `customization.md`'s own DoD already specifies —
confirm a non-USD display currency changes only the rendered
symbol/grouping, with the identical underlying numeric values, across every
surface AC4 lists — not merely that the settings page's own preview renders
correctly.

**This is the sole blocking finding of this review.** Every other item
below is independently re-verified and holds.

---

## 2. Product acceptance criteria — Calendar v2 and Admin hold in full; Customization holds except Section 1

### Calendar v2 (`docs/product/calendar-v2.md`)

Read the full spec and checked the shipped code directly, not just the
architecture doc's description of it:

- **AC1–3 (bill occurrences unchanged)**: `features/calendar/server/service.ts`
  re-exports `bills.service.getCalendarMonth`'s output verbatim — confirmed
  zero Prisma imports, zero status-computation calls in this file (grepped
  for `computeOccurrenceStatus`/`isOccurrencePaid`/`@/lib/db` — none found),
  matching the architecture doc's "verified by construction" claim.
- **AC4–7 (paydays)**: `recurring-income.service.getIncomeCalendarMonth`
  (new this phase) computes status via the existing, unmodified
  `computeOccurrenceStatus`/`isOccurrenceReceived`; Irregular/One-off events
  are queried directly by date with no generation step (confirmed no
  `ensureOccurrencesGenerated` call wraps the irregular-event read), matching
  AC7's "only for events actually logged, never projected" requirement.
- **AC5 (visual distinction)**: `payday-entry.tsx` read directly — three
  independent signals confirmed present (emerald color treatment, a distinct
  `ArrowDownToLine` icon vs. `BillEntry`'s `Receipt`, and an explicit status
  label), not color alone.
- **AC8–11 (budget reset marker)**: `isBudgetResetDay` is a pure
  `day === "-01"` string check inside `getCalendarMonth`'s composition step,
  always present regardless of data (AC10), confirmed no conditional branch
  skips it for an empty month.
- **AC12 (no filter control)**, **AC13 (findability)**: `/calendar` is a new,
  first-class nav destination (`components/shared/sidebar.tsx`), distinct
  from Bills' own unmodified `?view=calendar` tab.
- **Combined empty state**: `app/(dashboard)/calendar/page.tsx` composes
  `hasAnyBills`/`hasAnyIncomeStreams` (the Performance Engineer's Finding 2
  fix, verified in Section 5) into `hasNoDataAnywhere`, passed to
  `CalendarGrid`.
- **Timezone note**: confirmed `features/calendar/server/service.ts` never
  imports or reads `UserPreference.timezone` anywhere — Calendar v2
  correctly renders dates exactly as Bills'/Recurring Income's own
  server/UTC-based logic already does, per the CTO resolution pass's Risk
  #29 descope, restated in the architecture doc §2.4 and confirmed
  unmodified by this pass's own diff.

**Calendar v2: every AC holds, verified directly.**

### Customization (`docs/product/customization.md`)

- **Theme & Accent Color (AC1–4)**: verified — `accent-color-picker.tsx`
  offers 6 presets (within the "five to eight" bar), independent of the
  existing `ThemeToggle` (confirmed unmodified — `git diff` against the base
  of this phase shows zero changes to `theme-toggle.tsx`/`theme-provider.tsx`),
  and — the one part of this capability that required a fix pass to actually
  take effect — `app/(dashboard)/layout.tsx` now resolves `getUserPreference`
  and applies `data-accent`, composing with `globals.css`'s new
  `[data-accent="..."]` blocks that override `--primary`/`--primary-foreground`/
  `--ring`/`--chart-1` (confirmed these are the tokens buttons, focus rings,
  and chart series actually key off — spot-checked all four Dashboard chart
  components import `--chart-1`). This capability's own "applies consistently
  everywhere the product uses a primary/accent color token" bar (AC4) is
  met.
- **Dashboard Layout (AC1–5)**: verified — `updateDashboardCardVisibility`'s
  "at least one visible" guard (AC3) is now genuinely race-safe (Section 3),
  `resetDashboardLayout` is a single `deleteMany` (AC4), and — the same fix
  pass — `app/(dashboard)/page.tsx` now genuinely reads
  `getDashboardCardPreferences` and renders through
  `_lib/dashboard-card-groups.tsx`'s registry, confirmed by direct reading
  (Section 4). Charts and stat cards are members of the same set (confirmed
  in the registry, both kinds have entries).
- **Currency Display (AC1–5)**: AC1 (six-currency list), AC2 (never touches
  a stored/computed value), AC3 (label/copy distinguishing formatting from
  conversion) are met in isolation. **AC4 and the Definition of Done's
  cross-surface verification are not met — see Section 1, blocking.**
- **Timezone Preference (AC1, AC3, Edge Cases)**: verified — field is a
  validated IANA name (now genuinely restricted after the fix pass, Section
  3), browser-inferred once via `timezoneConfirmed`'s race-safe latch,
  UTC fallback confirmed as the column default. AC2/AC4 are correctly,
  explicitly, and traceably deferred (Risk #29, `customization.md`'s own
  Scope note) — **not** treated as a gap by this review, per this task's own
  explicit instruction, and correctly distinguished in this review from
  Section 1's Currency Display finding, which has no equivalent descope.

### Admin (`docs/product/admin.md`)

All six capabilities checked against shipped code:

- **Capability 1 (Access Control)**: `app/admin/layout.tsx` guards first,
  live, no caching (Section 6). No self-service role-assignment UI anywhere
  (grepped `src/app/` and `src/features/admin/` for `role`-setting UI — the
  only `role=` hits are unrelated ARIA `role="switch"`/`role="status"`
  attributes). `scripts/grant-admin.ts` confirmed unreachable from any
  product code path (Section 8).
- **Capability 2 (View Users)**: `getUsers`' explicit `select` allow-list
  (`id, email, name, emailVerified, createdAt`) confirmed to exclude every
  credential/token field, cross-checked directly against `User`'s actual
  Prisma fields.
- **Capability 3 (Audit Logs)**: all four named event types surfaced;
  immutability confirmed (grepped for any `adminActionLog.update`/`.delete`
  anywhere — zero matches, the only write is `.create`); the one known,
  accepted imprecision (cross-source cursor tie-timestamp) is correctly
  still open and documented, not silently dropped (Section 7).
- **Capability 4 (Feature Flags)**: `isFeatureEnabled` fails open on both a
  missing row and a genuine read error (confirmed in its own `catch`
  block); both kill switches wired at their single existing choke points
  (`lib/ai/generate-structured-output.ts`, `lib/email/send-notification-email.ts`),
  confirmed via direct grep, producing the same already-defined degraded
  state (no new broken state).
- **Capability 5 (Manage Categories)**: the "never zero entries" guard is
  now genuinely race-safe (Section 3); AC7's non-retroactivity holds by
  construction — confirmed no relation of any kind exists between
  `SystemCategoryTemplate` and `Category` (grepped `prisma/schema.prisma`
  for any FK between the two — none).
- **Capability 6 (Seed Demo Data)**: fixed target only (`triggerDemoDataSeed`
  takes zero parameters, confirmed by its actual signature), non-production
  gated server-side (confirmed `isDemoDataSeedAvailable()` is called both at
  the page level and again inside the trigger itself), and the false-success
  gap is now closed (Section 3).

**Admin: every AC holds, verified directly.**

---

## 3. Bug Hunter's six findings — all six genuinely resolved, re-verified against current source, not the fix commit's own message

- **`dashboard-card-visibility-toctou-empty-dashboard.md` (High)** —
  `updateDashboardCardVisibility` (`features/settings/server/actions.ts`)
  now wraps the read, guard, and write in one `db.$transaction` under
  `Prisma.TransactionIsolationLevel.Serializable`, with the guard
  (`wouldHideLastVisibleCard`) re-evaluated against a **fresh in-transaction
  read** (`tx.dashboardCardPreference.findMany`), not the pre-transaction
  snapshot — confirmed this is not merely "the same check wrapped in an
  ordinary transaction" (which would not fix a write-skew anomaly across two
  disjoint rows): `Serializable` isolation is what forces one of two
  concurrent transactions to abort with `P2034` when their read sets are
  invalidated by the other's write, and that abort is caught and translated
  to a friendly retry message, never a raw error.
- **`category-template-delete-toctou-zero-entries.md` (High)** —
  `deleteTemplateEntry` (`features/categories/server/template.ts`) has the
  identical fix shape: existence check, count, and delete all inside one
  `Serializable` transaction, the count re-verified against the
  transaction's own consistent snapshot, `P2034` translated to
  `CategoryTemplateConcurrentModificationError`. Confirmed genuine, not a
  relabeled ordinary transaction.
- **`category-template-update-delete-race-unhandled-error.md` (Medium)** —
  `updateTemplateEntry` and `reorderTemplateEntries` both now catch
  Prisma's `P2025` (`isRecordNotFoundError`) and re-throw
  `CategoryTemplateEntryNotFoundError`, the same friendly failure the
  earlier-timed version of the identical scenario already produced.
  `reorderCategoryTemplateEntries` (`admin/server/actions.ts`), which
  previously had no error handling at all, is confirmed to now have this
  same translation.
- **`timezone-schema-accepts-raw-utc-offsets.md` (Medium)** —
  `TimezoneSchema` (`features/settings/server/validation.ts`) now requires
  **both** `Intl.DateTimeFormat` resolution success **and** membership in
  `Intl.supportedValuesOf("timeZone")` (or the explicit `"UTC"` carve-out) —
  confirmed this closes the raw-offset (`"+05:00"`) and legacy-alias
  (`"PST"`, `"US/Pacific"`) holes the bug report demonstrated, while
  preserving `"UTC"`'s validity as the column's own documented safety-net
  default.
- **`seed-demo-data-false-success-on-swallowed-category-seed-failure.md`
  (Medium)** — `prisma/seed-showcase/index.ts`'s `main()` now asserts
  `Object.keys(categoryMap).length === 0` throws immediately after
  `getCategoryMap`, before any other domain is seeded against a possibly-empty
  map — confirmed this makes the script's existing `main().catch(() =>
  process.exit(1))` path fire, giving `triggerDemoDataSeed` an honest
  non-zero exit to report as failure.
- **`audit-log-cursor-boundary-skips-tied-timestamp-cross-source-entry.md`
  (Low-Medium)** — confirmed correctly left deferred, not silently dropped:
  the fix-commit message explicitly states "Deferred per its own
  Low-Medium, accepted-tradeoff framing," and `audit-log.ts`'s own header
  comment (read directly, lines 50–59) still documents the exact tradeoff
  and its reasoning. This is an open, documented, low-severity item with an
  explicit decision behind it — exactly what this review was asked to
  confirm, not a gap that fell through unnoticed.

**All six Bug Hunter findings: genuinely resolved or genuinely,
documented-ly deferred.**

---

## 4. Performance Engineer's three findings — all three genuinely addressed

- **Finding 1 (indexing gap)**: all six recommended single-column timestamp
  indexes confirmed present in `prisma/schema.prisma` and applied via
  `prisma/migrations/20260730015719_phase_4c_perf_followup_audit_log_timestamp_indexes/`
  — `@@index([createdAt])` on `CategorySuggestion` and `Notification`,
  `@@index([generatedAt])` on `BudgetAdvisorCache`/`MonthlySummary`/
  `SpendingInsightsCache`, `@@index([capturedAt])` on
  `FinancialHealthScoreSnapshot` — each read directly, not just grepped for
  existence.
- **Finding 2 (Calendar page redundant N+1)**: `hasAnyBills`
  (`features/bills/server/service.ts`) and `hasAnyIncomeStreams`
  (`features/recurring-income/server/service.ts`) confirmed to exist and to
  be exactly what `app/(dashboard)/calendar/page.tsx` now calls in place of
  the four full `getBills`/`getIncomeStreams` reads — confirmed via direct
  reading of the page (Section 2 above) and its own inline doc comment
  citing this exact finding.
- **Finding 3 (demo-data `maxDuration`)**: `app/admin/demo-data/page.tsx`
  now declares `export const maxDuration = 150` — above
  `SEED_TIMEOUT_MS` (120s) with margin, matching the fix commit's own stated
  intent, and the file's own comment correctly frames this as
  non-production-scoped (Capability 6 AC2 already restricts the whole page
  to non-production).

**Also independently confirmed, per this task's own specific ask**: the
Dashboard is genuinely wired to `getUserPreference`/`getDashboardCardPreferences`
— `app/(dashboard)/page.tsx` and `app/(dashboard)/layout.tsx` both read
directly, confirmed above in Sections 2/4, not merely trusted from the
`f93abcc` commit message.

---

## 5. Automated checks — re-run independently, this pass

- `npm run typecheck` → clean, zero errors.
- `npm run lint` → clean, zero errors/warnings.
- `npx vitest run` → **618/618 tests passing, 51 test files** — matches the
  fix commit's own claimed number exactly, re-run fresh.
- `npm run build` → succeeds; all routes generated, including the new
  `/calendar`, `/settings/appearance`, `/settings/preferences`, and six
  `/admin/**` routes.
- `npx prisma migrate status` → "Database schema is up to date!" — 11
  migrations, including both this phase's schema-pass migration
  (`20260729145632_phase_4c_calendar_customization_admin`) and its
  performance follow-up
  (`20260730015719_phase_4c_perf_followup_audit_log_timestamp_indexes`).
- `git status` → clean, nothing uncommitted.
- `git log` — the full Phase 4c commit range (`8861696` kickoff through
  `f93abcc` Dashboard wiring) is present, in order, with no gaps; every
  review-gate step (CTO kickoff/resolution, Product Owner, Solution
  Architect + Database Architect, Backend, Frontend, Security, Performance,
  Bug Hunter, two fix-pass commits) has its own commit.

**All green, matching every claimed number exactly.**

---

## 6. Admin authorization mechanism — independently re-verified, not accepted on the Security Architect's word alone

- `src/lib/auth.ts`'s `role` field is wired via Better Auth's
  `additionalFields` with `input: false, defaultValue: "USER"` — read
  directly, confirmed present exactly as the architecture doc and security
  review describe.
- `getCurrentAdminUser()` grepped across all of `src/`: called only in
  `app/admin/layout.tsx` and as the literal first statement of every one of
  the six exported mutations in `features/admin/server/actions.ts` — no
  other call site exists, and no admin Server Action reaches a database call
  before this check.
- `app/admin/layout.tsx` calls the guard before constructing any child JSX,
  redirecting to `/` on `null` — confirmed no error page, no partial render.
- No self-service role-assignment UI anywhere: grepped `src/app/` and
  `src/features/admin/` for any role-setting form/endpoint — none exists;
  the only `role=`-shaped matches are unrelated ARIA attributes.

---

## 7. Audit log cursor tie-timestamp gap — confirmed correctly deferred, not forgotten

Per this task's specific instruction to check this did not silently fall
through: confirmed `audit-log.ts`'s own header comment (lines 50–59) still
documents "the one accepted, documented imprecision" in full, the dedicated
bug report (`audit-log-cursor-boundary-skips-tied-timestamp-cross-source-entry.md`)
exists and was not deleted, and the fix-pass commit message explicitly names
this as deferred rather than silently omitted. This is exactly the "open,
documented, low-severity item" state this review was asked to confirm holds.

---

## 8. `scripts/grant-admin.ts` — confirmed still unreachable from any product code path

Grepped the entire `src/` tree for `grant-admin` — zero matches, confirming
the Security Architect's own finding still holds and nothing since has
changed it. The script itself (read in full) is idempotent, takes its one
argument from `process.argv`, uses Prisma's parameterized client throughout,
and is only invokable via `npm run grant:admin -- <email>`. The ADMIN-tier
grants made to `lejeunekyle@gmail.com` and `showcase@lkbudget.demo` in the
dev database during verification are the expected, user-approved use of
this exact mechanism — not a gate-blocking finding, per this task's own
framing, and this review does not treat them as one.

---

## Release Manager Decision

**REJECT.**

Every review-gate fix this phase claims — both High Bug Hunter TOCTOU races
(genuinely fixed with Serializable isolation, guard re-verified inside the
transaction, not merely wrapped), the P2025 gap, the `TimezoneSchema` gap,
the seed-demo-data precondition gap, all six missing indexes, the Calendar
page's redundant-read fix, the demo-data `maxDuration` fix, and the Dashboard
accent-color/card-layout wiring — is independently confirmed genuine against
current source, not accepted on any commit message's word. Admin
authorization, this phase's headline concern, holds up under direct,
independent inspection at every layer. All automated checks (typecheck,
lint, 618/618 tests, build, migration status, clean git status) pass,
re-run fresh this pass.

**The blocking gap is Section 1: Currency Display, one of Customization's
four capabilities, is built end-to-end but never actually applied to any
of the ~160 currency-formatted figures its own spec's AC4 unconditionally
requires it cover** — Dashboard, Transactions, Accounts, Budgeting, Bills,
Debt Tracker, Investments, Goals, Analytics, all six Reports, and all six
notification/email templates all continue to render fixed USD regardless of
a user's saved preference, and the settings page's own shipped copy
("changes how amounts are shown throughout the app") is false as currently
implemented. Unlike Timezone's consuming-logic deferral, this was never
CTO-descoped, never tracked in the risk register, and is not mentioned in
any of this phase's three review-gate documents — it is a genuine,
unacknowledged miss, not an accepted, documented trade-off.

**What must happen before this can be re-submitted for sign-off:** thread
each surface's resolved `UserPreference.currencyDisplay` into its existing
`formatCurrency` calls, per `phase-4c-technical-design.md` §3.6's own
already-written plan for this work, and verify (by test, per
`customization.md`'s own Definition of Done) that a non-USD display
currency changes only rendered symbol/grouping — never an underlying value
or threshold comparison — across every surface AC4 names. This is
call-site plumbing over an already-correct `formatCurrency` signature, not a
redesign; the same shape of fix `f93abcc` already applied to accent color
and Dashboard card layout.

See `docs/release/phase-4c-checklist.md` for the itemized gate checklist.
