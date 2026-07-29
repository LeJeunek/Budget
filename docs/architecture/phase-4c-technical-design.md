# FinanceOS — Phase 4c Technical Design: Calendar v2, Customization, Admin

**Author:** Solution Architect, joint architecture pass with Database Architect, per `roadmap.md`'s Phase 4c milestone 3.
**Status:** design-stage. No production code has been written against this document yet. Database Architect's schema/migration pass is the next dispatch; backend implementation is gated on both this document and that schema being finalized.
**Scope:** the five schema/design questions the CTO's kickoff pass (2026-07-29) and resolution pass (2026-07-29) routed to this combined pass — the admin-authorization mechanism, Calendar v2's zero-new-model composition layer, Customization's per-user preferences model, the DB-backed system-category-template model, and Reports' new generation-event log — plus the module boundaries, data flow, folder layout, and API surface all three sub-areas need, and the standing feature-flag-primitive recommendation. Mirrors `phase-4b-technical-design.md`'s depth/structure — same "substantial cross-cutting decision earns its own file, `Architecture.md` just points to it" pattern. Does not cover: Calendar v2/Settings/Admin UI visual design (Frontend Lead, UI Component Engineer), or the exact CLI mechanics of granting the `ADMIN` tier (an operational script, Backend Engineer's implementation detail, flagged but not fully specified below).

This document assumes the reader has already read `roadmap.md`'s Phase 4c kickoff and resolution passes, `docs/product/calendar-v2.md`, `docs/product/customization.md` (including its Timezone Preference Scope note), and `docs/product/admin.md` — reasoning already settled there (the single-flat-tier scope, the timezone consuming-logic descope, the three Admin Open-Questions resolutions, the seed-demo-data guardrails) is not re-litigated here.

---

## 1. Admin authorization mechanism

### 1.1 Decision

**A plain `role` column on the existing `User` model — `enum UserRole { USER ADMIN }`, `User.role UserRole @default(USER)` — wired into Better Auth via its native `additionalFields` mechanism. Better Auth's official `admin` plugin (already installed, `better-auth@^1.6.23`) is evaluated in full and rejected**, for reasons specific to this codebase's binding scope, not a generic preference against it.

### 1.2 Options considered

| Option | Rejected / accepted because |
|---|---|
| **Better Auth's official `admin` plugin** (`better-auth/plugins/admin`, confirmed present in `node_modules/better-auth/dist/plugins/admin/` at the installed version) | **Rejected.** Inspected directly (`admin.d.mts`) before deciding, not assumed from documentation alone: enabling it mounts **fourteen** endpoints under the existing `/api/auth/[...all]` catch-all — `set-role`, `create-user`, `remove-user`, `set-user-password`, `update-user`, `ban-user`, `unban-user`, `impersonate-user`, `stop-impersonating`, `list-users`, `list-user-sessions`, `revoke-user-session(s)`, `has-permission`, `get-user` — plus a full `access`-package permission-statement system for multi-role/per-resource grants. This is a categorically bigger surface than the single-flat-tier scope the CTO's kickoff pass bound this mechanism to (Risk #27: "no per-resource RBAC, no tiered admin roles"). Three concrete, binding-constraint violations, not just "more than needed": (1) `admin.md` Capability 1's carried-over scope item #2 states granting the `ADMIN` tier is "never a button, form, or endpoint reachable through the product itself" — the plugin's own `/api/auth/admin/set-role` endpoint **is** exactly such an endpoint, reachable by any authenticated admin via a raw request the moment the plugin is enabled, regardless of whether a UI button ever calls it; (2) Capability 1's Edge Cases state "no view-as/impersonation capability appears anywhere in this document" — the plugin ships `impersonate-user`/`stop-impersonating` unconditionally; (3) the plugin's `ban-user`/`unban-user`/`set-user-password`/`remove-user` endpoints introduce four operational concepts (account bans, admin-driven password resets, admin-triggered account deletion) that appear nowhere in `admin.md`'s six capabilities — adopting the plugin "as-is" silently grants capabilities no spec asked for and no Security Architect review was scoped to cover. Making the plugin safe under this phase's scope would require the Backend Engineer to individually identify and block roughly ten of its fourteen endpoints, one by one, forever keeping that block-list in sync with future `better-auth` upgrades that might add more — a larger, more fragile, higher-residual-risk undertaking (one forgotten endpoint = a live privilege-escalation bug) than the four-line alternative below. |
| **A separate `AdminUser` marker/permissions table** (`AdminUser { userId String @unique }` or richer) | **Considered, not chosen.** Would add a join (`db.adminUser.findUnique({ where: { userId } })`) to every single authorization check this phase introduces, for no benefit the single-flat-tier scope can actually use — a separate table earns its keep only when admin-specific metadata needs to live somewhere (grant reason, granted-by, a second tier), none of which this phase's explicitly flat, binary scope calls for (Risk #27). If a genuine need for admin-specific audit metadata (who granted the tier, when) emerges later, the lowest-friction extension is two more nullable columns directly on `User` (`roleGrantedAt`, `roleGrantedByUserId`) — not a second table — since the relationship is still exactly one-to-one with `User`, never one-to-many. |
| **A plain `role` column on `User`** | **Chosen.** Exactly the shape the CTO's kickoff pass named as the leading candidate ("a `role` field on `User` scoped to `USER \| ADMIN`, or an equivalent mechanism"). Confirmed compatible with Better Auth without the plugin: Better Auth's `additionalFields` config option (`node_modules/better-auth/dist/db/field.d.mts`) lets any Prisma-backed column be declared on the `user` config block and be automatically included in `auth.$Infer.Session.user` — no plugin required for a session to carry a custom field. Critically, `additionalFields` supports a per-field **`input: false`** flag, which the installed version's own `update-user`/`sign-up` routes both honor via `parseUserInput` (confirmed by reading `update-user.mjs` directly: `additionalFields = parseUserInput(ctx.context.options, rest, "update")`, and the field-inference type `RemoveFieldsWithInputFalse` strips any `input: false` field from what a client can ever submit). Declaring `role` with `input: false` means Better Auth's own sign-up and profile-update endpoints **mechanically cannot** accept a client-supplied `role` value, at the framework level — this is what satisfies "no self-service admin-role-assignment UI... never an endpoint reachable through the product itself" by construction, not by remembering not to expose it. |

### 1.3 Wiring, in full

**`prisma/schema.prisma`** (Database Architect's exact DDL, this is the requirement):
```
enum UserRole {
  USER
  ADMIN
}
```
`User` gains: `role UserRole @default(USER)`.

**`src/lib/auth.ts`** gains one new config block and one new exported helper, alongside the existing `getCurrentUser()`:
```ts
user: {
  additionalFields: {
    role: { type: "string", input: false, defaultValue: "USER" },
  },
},
```
`type: "string"` (not a Prisma-enum-aware type — Better Auth's `additionalFields` API only knows primitive TS types) is a minor, harmless type-boundary detail: the value flowing through Better Auth's session/`$Infer` typing is a plain string that happens to always be `"USER"` or `"ADMIN"`, the same category of boundary every other Prisma-enum-as-plain-string consumer in this codebase already crosses (e.g. `BillSchedule` consumed as a plain string union outside Prisma-aware files).

**New exported helper**, sibling to `getCurrentUser()`, same "return `null`, never throw" contract:
```ts
export async function getCurrentAdminUser(): Promise<AuthUser | null> {
  const user = await getCurrentUser()
  return user?.role === "ADMIN" ? user : null
}
```
Every Admin Server Action and every Admin page's layout-level guard calls this, never `getCurrentUser()` plus an inline `role` check duplicated ad hoc — one helper, one place the "what counts as admin" definition lives, mirroring `getCurrentUser()`'s own "the single entry point every domain's server code must call" status.

**Why this satisfies Capability 1 AC2/Edge Case's "checked live, on every request, never on stale session data" requirement, by construction, not by added effort:** `lib/auth.ts` configures Better Auth with the Prisma adapter and no JWT/stateless session plugin — sessions are the **database** strategy (a `Session.token` row looked up fresh on every `auth.api.getSession()` call, joined live to its `User` row). This is already how `getCurrentUser()` behaves today for every existing authorization check in this codebase; `role` being a plain column on that same live-joined `User` row means a mid-session revocation (an admin's `role` flipped back to `USER` via a direct database update) takes effect on the *very next request*, with zero additional mechanism required — the "live check" guarantee Capability 1's Edge Case asks for is a free consequence of this codebase's existing session strategy, not a new thing this phase has to build.

**Granting the tier** (Capability 1 AC5 — "an operational action... a seed script or a direct database update, never a UI path"): a small, one-off script (e.g. `scripts/grant-admin.ts`, run via `npm run grant:admin -- <email>`, mirroring `prisma/seed-showcase.ts`'s existing "operational script, not a product feature" precedent) that does exactly one `db.user.update({ where: { email }, data: { role: "ADMIN" } })`. Left to the Backend Engineer's implementation — the mechanism only needs to exist and be documented in a deploy runbook, per this project's standing pattern for operational (not product) actions.

### 1.4 Route/layout guard

`app/admin/` is a **new, top-level route segment — sibling to `(auth)/` and `(dashboard)/`, not nested inside either.** This is a deliberate placement choice, not an oversight: Admin's own Business Value states operational tooling must stay "completely separate from the consumer product every regular user experiences" (Capability 1), and nesting it inside `(dashboard)`'s existing authenticated shell would entangle Admin's layout with the ordinary sidebar/nav chrome every other feature composes into — a structurally different concern that deserves its own layout tree, the same reasoning that already separates `(auth)/` (unauthenticated, no sidebar) from `(dashboard)/` (authenticated, sidebar+nav).

`app/admin/layout.tsx` calls `getCurrentAdminUser()` once, at the top of the tree: `null` → `redirect("/")` (Capability 1 AC4 — no error message, no partial render, the redirect happens before any admin content is composed, since Server Component layouts resolve data before rendering children). A non-admin who lands on any `/admin/*` URL — typed, bookmarked, or guessed — never sees anything admin-shaped, satisfying AC3/AC4 together without a second, per-page check (every admin page is a child of this one guarded layout).

No admin-facing nav link is added to the ordinary `(dashboard)` sidebar by this design — Frontend Lead's discretion whether an admin user, once authenticated, sees a small discreet link somewhere in their own chrome (nothing in `admin.md` requires or forbids this; it only forbids a **non-admin** ever seeing a trace, which this design already guarantees independent of whatever the Frontend Lead chooses here).

---

## 2. Calendar v2 — composition layer, zero new models

### 2.1 Where Calendar v1 actually lives today (read before designing v2)

Calendar v1 has **no dedicated module.** Its one function, `getCalendarMonth(userId, month): Promise<CalendarDay[]>`, lives inside `features/bills/server/service.ts`, and its types (`CalendarDay`, `CalendarOccurrence`) live inside `features/bills/types.ts`. This was the correct call for v1 — a single-source, read-only view over data Bills already owns end-to-end earns no module of its own, the same reasoning that keeps the Net Worth Snapshot job inside `features/dashboard/` rather than its own module.

**That reasoning does not extend to v2.** Calendar v2 composes **three** independent domains (Bills, Recurring Income, and a pure date fact about Budgeting's month boundary) — and this codebase's own already-established dependency graph explicitly forbids a direct import between two of them: `Architecture.md`'s Phase 3a section states "Bills ←→ Recurring Income NOT a direct import in either direction — both instead depend one-directionally on `lib/transaction-link-guard.ts`." If Calendar v2's composition function were added inside `features/bills/server/service.ts` (extending v1's existing home), it would need to import `features/recurring-income/server/service.ts` directly — a new edge the dependency graph does not permit today, introduced for a feature that has no reason to live inside Bills' ownership in the first place. **Calendar v2 is therefore a new feature module, `features/calendar/`** — a pure "leaf" consumer, structurally identical to Financial Goals, Financial Health Score, and Reports (each reads across multiple domains; nothing reads from any of them). This is not a new pattern; it is the fourth instance of an already-proven module shape.

### 2.2 The composition function

```
features/calendar/server/service.ts

export async function getCalendarMonth(
  userId: string,
  month: string,          // "YYYY-MM", same convention/validation shape as Bills'/Budgeting's own
): Promise<CalendarMonthView>
```

`CalendarMonthView` (`features/calendar/types.ts`):
```ts
export interface CalendarMonthDay {
  day: string                         // "YYYY-MM-DD"
  bills: CalendarOccurrence[]         // re-exported verbatim from features/bills/types.ts — never
                                       //   redefined a second time
  paydays: PaydayCalendarEntry[]      // NEW shape, see §2.3 — Recurring Income's own vocabulary
  isBudgetResetDay: boolean           // true only when day === that month's "01"
}

export interface CalendarMonthView {
  days: CalendarMonthDay[]
  budgetResetMonth: string            // the same "YYYY-MM" passed in — the reset marker's link
                                       //   target is `/budgeting?month=${budgetResetMonth}`
}
```

**The function's entire body is composition, never computation:**
```
getCalendarMonth(userId, month):
  1. billDays  = bills.service.getCalendarMonth(userId, month)              — EXISTING, unchanged
  2. paydayDays = recurringIncome.service.getIncomeCalendarMonth(userId, month)  — NEW, §2.3
  3. zip billDays/paydayDays by `day` key (both already return one entry per calendar day —
     Bills' existing "every day of the month, even zero-occurrence days" contract, mirrored by
     the new Recurring Income function below) into CalendarMonthDay[]
  4. set isBudgetResetDay = true for the entry whose `day` ends in "-01", false for every other day
  5. return { days, budgetResetMonth: month }
```

**This is verified by construction, not convention: `features/calendar/server/service.ts` contains zero Prisma imports and zero calls to `computeOccurrenceStatus`/`isOccurrencePaid`/`isOccurrenceReceived` or any other status-math function.** It only imports two other domains' already-exported service functions and does array/map bookkeeping. This is the concrete answer to "how does it avoid becoming a place where Bills/Recurring Income/Budgeting's own business logic gets duplicated" — there is no business logic in this file *to* duplicate; every occurrence's status, amount, and identity is computed exactly once, inside the domain that owns it, exactly as it already is for Calendar v1 today. The budget-reset marker carries no business logic either — "is this the 1st of the month" is a string-suffix check, not a Budgeting-owned computation, so it requires no call into `features/budgeting/` at all (Budgeting's own month-boundary *definition* is never re-derived here — the marker is a pure calendar-grid annotation of a fact about the calendar itself, the 1st of every month, not a query against Budgeting's data). Recommended for the Backend Engineer implementing this: an ESLint `no-restricted-imports` rule scoped to `features/calendar/server/**` disallowing `@/lib/db` and any `@/features/*/server/occurrence` /-adjacent pure-math import, turning this "leaf, composition-only" guarantee into a build-time check — the same discipline already applied to Reports'/Notifications' zero-`lib/ai/`-import guarantee in `phase-4b-technical-design.md` §8.

### 2.3 One new, narrow read function required on Recurring Income (no schema change)

`features/recurring-income/server/service.ts` gains `getIncomeCalendarMonth(userId, month): Promise<PaydayCalendarDay[]>` — the exact structural sibling of Bills' existing `getCalendarMonth`, required because none of Recurring Income's four existing read functions (`getIncomeStreams`, `getStreamById`, `getExpectedUpcomingIncome`, `getActualReceivedIncomeBySource`) group a month's occurrences **by day across every stream**, which a calendar grid needs. This is a small, narrow, new read function alongside existing ones — the same category of addition `getDividendIncomeForPeriod`/`getSummaryForMonth` were for Reports in Phase 4b — never new business logic:

```
export interface PaydayCalendarEntry {
  streamId: string
  streamName: string
  amount: number
  status: IncomeOccurrenceStatus   // re-exported, unchanged — "UPCOMING" | "EXPECTED_TODAY" |
                                    //   "NOT_YET_RECEIVED" | "RECEIVED", computed by the EXISTING
                                    //   occurrence.ts's computeOccurrenceStatus, never reimplemented
}
```

Its body mirrors `bills.service.getCalendarMonth`'s exact shape: (1) fetch active, non-`IRREGULAR` streams, lazily `ensureOccurrencesGenerated` through month-end (the same existing helper `getExpectedUpcomingIncome` already calls), (2) query `IncomeOccurrence` rows due within the month, computing each one's status via the **existing, unchanged** `computeOccurrenceStatus`/`isOccurrenceReceived` (`occurrence.ts`) — reused, never reimplemented, and (3) **separately**, query `IrregularIncomeEvent` rows dated within the month directly (no generation step — per calendar-v2.md AC7, an irregular event only ever appears on the calendar once actually logged, never projected). Irregular events surface with no `status` field at all (there is no Upcoming/Received distinction for a fact that, by definition, is already a completed, logged event) — modeled as a `paydays` entry with `status` omitted or a fixed literal, Frontend Lead's exact rendering call.

**No schema change is required.** `IncomeOccurrence` and `IrregularIncomeEvent` already carry every column this function reads — this is a new query shape over existing, already-reviewed tables, the identical "new function, no schema change" category as every prior phase's equivalent additions (3a's `getTotalActiveDebtBalanceForNetWorth`, 4b's `getGainLossForPeriod`/`getDividendIncomeForPeriod`).

### 2.4 Timezone / date-boundary note (binding constraint, restated so it isn't silently reopened)

Per the CTO resolution pass's descope (Risk #29) and calendar-v2.md's own Open Question, resolved: **Calendar v2 renders dates exactly as Bills' and Recurring Income's own occurrence-generation/status logic already compute them today (server/UTC-based) — this design introduces no timezone-aware date logic of its own, and does not read `UserPreference.timezone` (§3) anywhere.** `getCalendarMonth`'s `month` parameter and every date key it produces are plain `"YYYY-MM"`/`"YYYY-MM-DD"` strings passed through unchanged from its two composed sources — there is no second, independent "what day is it" computation anywhere in `features/calendar/` to accidentally drift out of sync with Bills'/Recurring Income's own. If a future, dedicated pass eventually rewires Bills/Recurring Income/Budgeting's date-boundary logic to consume `UserPreference.timezone` (Risk #29's deferred scope), Calendar v2 inherits that fix automatically and for free, exactly as its own Open Question already anticipated — no change to this module is required when that happens.

### 2.5 Route, nav, and empty-state composition

`app/(dashboard)/calendar/page.tsx` — a **new, first-class nav destination** (AC13's explicit "not effectively hidden as a sub-toggle inside Bills" requirement), `?month=YYYY-MM` searchParam navigation (the same convention Budgeting's month-navigator and Bills' own `?view=list|calendar` toggle already established — no new pattern). Reads `calendar.service.getCalendarMonth(userId, month)` directly (Server Component call, no client hook — this is a read-only, no-mutation feature, the same "no `hooks/` folder" call already made for Reports in Phase 4b).

**Bills' own existing `?view=calendar` embedded toggle (Calendar v1) is untouched by this design** — `api-contracts.md`'s Calendar v1 row already states it is "unchanged through Phase 4b — no phase requests extending Calendar v1 (Calendar v2 is Phase 4c)," and nothing in this design changes that: `bills.service.getCalendarMonth` is reused, not modified, and Bills' own calendar tab continues to exist as a bills-only view for a user who only cares about bills. Calendar v2 is a genuinely new, richer, separately-discoverable destination, not a replacement for or a modification of Bills' existing view.

**The combined empty state** (calendar-v2.md's Edge Cases: "never set up any bill or income stream anywhere in the app") requires no new function either — the page composes two already-existing list reads (`bills.service.getBills(userId)`, `recurring-income.service.getIncomeStreams(userId)`), checks both lengths are zero, and renders the combined empty-state prompt. This is page-level composition (Frontend Lead's `page.tsx`), not a `calendar.service` concern — `getCalendarMonth` itself always returns a full day array (with the reset marker) regardless, per AC10.

**Folder layout:**
```
features/calendar/
├── types.ts                     # CalendarMonthView, CalendarMonthDay (re-exports bills' own
│                                 #   CalendarOccurrence, imports recurring-income's own
│                                 #   PaydayCalendarEntry — never redefines either)
├── server/
│   └── service.ts                # getCalendarMonth(userId, month) — pure composition, §2.2
└── components/
    ├── calendar-grid.tsx          # Client Component — month grid, reuses
    │                              #   components/shared/month-navigator.tsx directly (no new
    │                              #   month-stepper is built), per-day cell renders bills/paydays/
    │                              #   reset-marker per AC5/AC9's distinguishability requirements
    ├── bill-entry.tsx              # small presentational entry — status-colored, per Calendar v1's
    │                              #   existing STATUS_ENTRY_CLASSNAME treatment, unchanged
    ├── payday-entry.tsx            # small presentational entry — the "positive"/income-side
    │                              #   semantic-color treatment, AC5
    └── budget-reset-marker.tsx     # the day-1 structural annotation, AC9 (never rendered with the
                                    #   same entry-card treatment as a bill/payday)
```
Exact visual design (icon choice, color token, the divider/banner treatment) is the Frontend Lead's/UI Component Engineer's call, per AC5/AC9's own explicit deferral — this layout only fixes *where the logic and the component boundaries live*.

---

## 3. Customization — the `features/settings/` module and its preferences model

### 3.1 Naming: `features/settings/`, not `features/customization/`

Phase 4b already established a `/settings/notifications` route for the notification-preferences screen (`app/(dashboard)/settings/notifications/page.tsx`, live today). This phase's four new preferences are the same *kind* of thing — a durable, per-user, cross-device setting reachable from one dedicated settings surface, per `customization.md`'s own "Where These Preferences Live" section. Naming the new feature module `features/settings/` (housing accent color, dashboard layout, currency display, and timezone) rather than `features/customization/` keeps the module name aligned with the URL namespace this codebase has already committed to, and avoids two different names (`customization`, `settings`) for what a reader would otherwise reasonably expect to be one concept. `features/notifications/` keeps owning its own preferences (`preferences.ts`, unchanged) — this is not a merge of the two modules, only a shared route namespace, the same way `/monthly-recap` (Phase 4a) lives under `features/dashboard/` while sharing the dashboard route's general area.

### 3.2 `UserPreference` — one row per user, eagerly seeded at signup (unlike `NotificationPreference`'s lazy materialization)

```
model UserPreference {
  id                 String   @id @default(cuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  accentColor        String?           // null = product default (the edge case's explicit
                                        //   "unchanged from today" requirement) — a validated key
                                        //   into a small, fixed, code-owned palette (AC1's "five to
                                        //   eight preset options"), NOT a Prisma enum — see §3.4 for
                                        //   why a plain, app-validated string is deliberately chosen
                                        //   here over a DB enum.
  currencyDisplay    String   @default("USD")   // one of USD|EUR|GBP|CAD|AUD|JPY, app-validated —
                                        //   same String-not-enum reasoning, §3.4
  timezone           String   @default("UTC")   // an IANA name, app-validated — see §3.3
  timezoneConfirmed  Boolean  @default(false)    // see §3.3 — NOT part of any product-facing AC,
                                        //   purely the mechanism that makes browser-inference safe
                                        //   across multiple devices

  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@map("user_preference")
}
```

**Why eagerly seeded at signup (in the same `databaseHooks.user.create.after` hook that already seeds `Category` rows), unlike `NotificationPreference`'s/`NotificationThresholdSettings`' lazy-on-first-customization materialization:** this row needs to exist from the very first request onward specifically to support the browser-inferred-timezone capture below (§3.3), which needs a concrete, unambiguous starting state (`timezone: "UTC"`, `timezoneConfirmed: false`) to safely upgrade exactly once. `DashboardCardPreference` (§3.5) has no equivalent need and stays lazily materialized, matching `NotificationPreference`'s precedent exactly — the two models are seeded differently for a stated, structural reason, not inconsistently.

### 3.3 Timezone field: plain, app-validated `String`, browser-inferred once, race-safe across devices

**Type decision: a plain `String` column holding a validated IANA timezone name (e.g. `"America/New_York"`), never a Prisma enum.** IANA's tz database has roughly 400 entries and is revised periodically (new zone names are occasionally added/renamed by the tz database maintainers, independent of any decision this codebase ever makes) — a fixed-membership DB enum would need a schema migration every time that external database changes, for a set this application has no reason to constrain more tightly than "a real, valid IANA name." Validation happens at the application layer instead, using a mechanism that requires **no new dependency**: Node's built-in `Intl.supportedValuesOf("timeZone")` (available in this codebase's Node runtime) returns the current, complete list of valid IANA zone names at runtime — `TimezoneSchema` (`features/settings/server/validation.ts`) is a Zod `.refine()` against that list, always in sync with whatever Node/ICU version actually ships, never a hand-maintained array this project would have to update itself.

**The cross-device race, and why one extra boolean (`timezoneConfirmed`) closes it correctly:** `customization.md`'s own requirement is that a preference "persists across sessions and devices" — a naive "always auto-infer from the browser on every load if not explicitly set" design would silently overwrite a user's deliberate choice the next time they open the app from a different device with a different browser-reported timezone. The fix: a tiny client component (`features/settings/components/timezone-auto-capture.tsx`), mounted once in `app/(dashboard)/layout.tsx` (Frontend Lead wires it in, the identical "component built by UI/feature owner, mounted by Frontend Lead in the root/authenticated layout" split already established for `ThemeProvider`), fires a Server Action `captureInferredTimezone(browserTimezone: string)` on first authenticated mount. That action is a no-op unless `timezoneConfirmed === false`; if it applies the browser-inferred value, it also flips `timezoneConfirmed` to `true` in the same write. **Any** explicit user edit to the timezone setting (the ordinary settings-page Server Action, `updateTimezone`) also flips `timezoneConfirmed` to `true` unconditionally, whether or not auto-capture ever ran first. The net effect: the timezone is upgraded from the safety-net `"UTC"` default exactly once, by whichever happens first — a real browser inference or a manual choice — and never silently overwritten again by a later, different device's browser TZ. This is a small, deliberately-scoped addition to close a genuine correctness gap the product spec's own cross-device requirement would otherwise leave open — not scope creep, and not a mechanism the product spec needs to know about (it is purely how "persists correctly across devices" is kept true, invisible to the end user).

**Consuming logic is explicitly out of scope, restated:** per the CTO resolution pass's binding descope, nothing reads `UserPreference.timezone` to compute a date boundary anywhere in this phase — not Calendar v2 (§2.4), not Bills/Budgeting/Recurring Income/Dashboard/Analytics/Monthly Summaries/Notifications v2/Financial Goals/Reports/Net Worth History, and not any of the four cron jobs. The only consumer of this field in Phase 4c is its own settings-page display (read it back, show it in the dropdown) — exactly the narrow bar `customization.md`'s Definition of Done sets for this phase.

### 3.4 Accent color and currency display: the same String-not-enum call, for a different, complementary reason

Both fields are validated Zod string unions at the application layer (`AccentColorSchema`, `CurrencyDisplaySchema` in `features/settings/server/validation.ts`) rather than Prisma enums, for the same forward-compatibility reason as `timezone`, applied to a different kind of set: `customization.md` explicitly frames the accent palette and the currency list as **small, deliberately curated, and expected to grow later if real demand surfaces** ("expanding it later is a low-risk, additive change if real demand surfaces," AC1 of Currency Display) — a Prisma enum would force a schema migration for what the product spec itself describes as a routine, low-stakes future addition (adding a seventh currency, or a ninth accent color, is meant to be a one-line change to a constant array, not a migration). This mirrors the identical reasoning already applied to `DashboardCardPreference.cardKey` (§3.5) and `FeatureFlag.key` (§6) — every genuinely-expected-to-grow, code-owned enumeration in this phase's design uses the same pattern, consistently, rather than three different conventions for three structurally identical decisions.

### 3.5 Dashboard card show/hide/reorder: a dedicated per-card table, not a JSON column — following this schema's own established precedent

**Decision: `DashboardCardPreference`, one row per `(user, cardKey)` pair, lazily materialized — row absence = default (visible, positioned after every row the user does have, in the canonical code-defined order) — structurally identical to `NotificationPreference`'s existing shape, just with an added `order` column.**

```
model DashboardCardPreference {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  cardKey   String                    // validated against the canonical, code-owned card-key list
                                        //   at the application layer — see below for why String, not
                                        //   an enum, and why it lives in features/dashboard/, not here
  order     Int
  visible   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, cardKey])
  @@index([userId, order])
  @@map("dashboard_card_preference")
}
```

**Why a dedicated table, not a JSON array column on `UserPreference` (this codebase's existing precedent, applied deliberately, not just inherited):** `Architecture.md`'s Phase 3b section, deciding `DismissedSubscriptionMerchant`'s shape, already rejected "a JSON array field on `User`" for a per-user list, for three stated reasons that apply here without modification: it would (a) break this schema's consistent "one row per fact, one table per user-owned list" convention (every other per-user list — Accounts, Debts, Goals, Bills, Income Streams, and, this phase, `NotificationPreference`/`NotificationThresholdSettings` — is its own table with a `userId` FK, never a JSON blob), (b) provide no database-level protection against a duplicate/race-condition double-write (a `@@unique([userId, cardKey])` constraint does), and (c) a JSON blob for an *ordered, per-key* structure invites exactly the kind of ad hoc merge-at-read logic a plain table with a real `order` column avoids entirely. **A join-style table also directly solves the trickiest product requirement for free:** the "a new Dashboard card ships in a later phase → defaults to visible, appended to the end" edge case (`customization.md`) is exactly what "row absence = default" already means — a new card key that has no row for a given user simply materializes at read time as visible, positioned after every card that *does* have a row, with **zero migration or backfill required when a future phase ships a new card** (a JSON array, by contrast, would need every existing user's stored array actively rewritten — or an equivalent merge-at-read special case invented anyway — the moment a new card key is introduced, for no offsetting benefit over just doing the row-absence approach directly).

**`cardKey` is a `String`, not a Prisma enum, and the canonical list it validates against lives in `features/dashboard/`, not `features/settings/`.** `customization.md` states the card set itself "is expected to grow slightly over time as new phases ship" — the same forward-compatibility reasoning as §3.4, but the ownership direction matters here specifically: **Dashboard**, not Settings, is the domain that actually knows what cards exist (Settings only stores preferences *about* an enumeration it doesn't own). A new feature-root constant, `features/dashboard/dashboard-cards.ts`, exports the ordered canonical list (`DASHBOARD_CARD_KEYS: { key: string; label: string }[]`) — the single source of truth every future phase's Dashboard change updates directly, mirroring `DEFAULT_CATEGORIES`'s own "single source of truth, imported by X and Y, do not hardcode a third time" framing exactly, just relocated to the feature that actually owns the enumeration. `features/settings/server/service.ts`'s `getDashboardCardPreferences(userId)` imports this constant to perform the row-absence materialization described above; `features/dashboard/`'s own page imports the same constant to know the canonical default render order. Neither file hardcodes a second copy of "what cards exist."

**Materialization function** (`features/settings/server/service.ts`):
```ts
getDashboardCardPreferences(userId): Promise<DashboardCardView[]>
  // 1. read every DashboardCardPreference row for userId, keyed by cardKey
  // 2. for each key in DASHBOARD_CARD_KEYS (canonical order): use the row if one exists
  //    (its own order/visible), else synthesize { visible: true }, positioned after every
  //    key that DOES have a row, in DASHBOARD_CARD_KEYS' own relative order
  // 3. return the merged list, sorted by effective order
```
**Any write** (hide/unhide a card, reorder, or the AC3 "at least one visible" guard) materializes **every** card key into an explicit row for that user in one batch upsert at that point — the identical "lazy materialization on first customization" pattern already established for `NotificationThresholdSettings`. **"Reset to Default Layout" (AC4) is a single `deleteMany({ where: { userId } })`** — deleting every row returns the user to the pure row-absence default state (fully visible, canonical order) in one statement, with no separate "what is the default" logic to invoke a second time.

### 3.6 Route/folder layout

```
features/settings/
├── types.ts                       # UserPreferenceView, DashboardCardView, AccentColorOption
├── server/
│   ├── service.ts                  # getUserPreference(userId), getDashboardCardPreferences(userId)
│   ├── validation.ts               # AccentColorSchema, CurrencyDisplaySchema, TimezoneSchema
│   │                                #   (Intl.supportedValuesOf-backed, §3.3), UpdateDashboardCard
│   │                                #   VisibilitySchema, ReorderDashboardCardsSchema
│   └── actions.ts                  # updateAccentColor, updateCurrencyDisplay, updateTimezone,
│                                    #   captureInferredTimezone (§3.3, browser-inference only),
│                                    #   updateDashboardCardVisibility, reorderDashboardCards,
│                                    #   resetDashboardLayout
└── components/
    ├── timezone-auto-capture.tsx    # Client Component, mounted once in app/(dashboard)/layout.tsx
    │                                #   — no visible UI, fires captureInferredTimezone on mount
    ├── accent-color-picker.tsx      # Client Component — small preset swatch grid (AC1)
    ├── currency-display-select.tsx  # Client Component — AC3's explicit "formatting, not
    │                                #   conversion" label/copy requirement
    ├── timezone-select.tsx          # Client Component — searchable IANA-name dropdown (AC1)
    └── dashboard-layout-editor.tsx  # Client Component — show/hide + drag-reorder over
                                     #   getDashboardCardPreferences' merged view, "Reset to
                                     #   Default Layout" action, the AC3 last-visible-card guard

app/(dashboard)/settings/
├── appearance/page.tsx              # accent color + dashboard layout
└── preferences/page.tsx             # currency display + timezone
```
Two settings pages (grouping accent/layout together, currency/timezone together) is this Architect's organizational suggestion, consistent with `customization.md`'s explicit deferral of exact page layout/grouping to the Frontend Lead — a single combined page is an equally valid, equally supported alternative if preferred during implementation; nothing in this design depends on the page split above being exact.

**`formatCurrency`/`formatDate` (`src/lib/utils.ts`) are extended, not replaced:** `formatCurrency(amount, currency?)` already accepts a `currency` parameter (hardcoded to `"USD"` today only at its call sites, not in its own signature) — every call site across the app is updated to pass the caller's resolved `UserPreference.currencyDisplay` instead of relying on the default, per AC4's "every currency-formatted figure in the product, no exceptions" requirement. This is real, if broad, work (every Dashboard card, every table, all six Report templates, every notification/email template), but it is call-site plumbing, not a new architectural pattern — `formatCurrency`'s own signature already supports it.

---

## 4. DB-backed system-category-template model

### 4.1 Model

```
model SystemCategoryTemplate {
  id        String   @id @default(cuid())
  name      String   @unique   // case-insensitive uniqueness enforced at the application layer
                                 //   (Zod + a pre-write lookup), matching categories.md's own
                                 //   existing custom-category uniqueness rule exactly (AC2) — not
                                 //   a DB-level citext/lower-index requirement this phase introduces
  color     String
  order     Int                 // NEW relative to Category's own shape — Category itself has no
                                 //   order column (its display order today is implicitly creation
                                 //   order); the template needs an explicit, admin-reorderable order
                                 //   (AC4) that Category was never asked to support, so this is a
                                 //   deliberate, justified divergence from mirroring Category 1:1,
                                 //   not an oversight
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("system_category_template")
}
```

**This is this schema's first genuinely global, non-per-user table** — every other model in `prisma/schema.prisma` to date carries a `userId` FK (or is Better Auth's own `User`/`Session`/`AuthAccount`/`Verification`). Flagged explicitly for the Database Architect's visibility, the same way `NetWorthSnapshot` was flagged in Phase 3a as "the first not-request-triggered write path" and `DismissedSubscriptionMerchant` was flagged in Phase 3b as "the first durable exclusion rule over a computed concept" — a new, small, first-of-its-kind pattern worth naming rather than leaving implicit.

**Deliberately no relation to `Category` at all — this is the mechanism that makes AC7's non-retroactivity hold by construction, not by convention.** A `Category` row, once created at signup, has never had any live link back to the constant it was seeded from (`DEFAULT_CATEGORIES` is read once, at the moment `db.category.createMany` runs, and never referenced again) — this design continues that exact property unchanged. There is no `templateId` FK on `Category`, so there is no code path that could even attempt to propagate a later template edit onto an existing user's row; "an admin edit never reaches an already-seeded `Category`" is true because no join exists to reach through, the identical "no stored artifact to leak" style of guarantee Reports' zero-persistence design already relies on (`phase-4b-technical-design.md` §2).

### 4.2 Ownership: `features/categories/`, not `features/admin/`

`SystemCategoryTemplate` is owned and queried by the **Categories** feature module (`features/categories/server/template.ts`, a new sibling file to the existing `service.ts`/`actions.ts`) — not by `features/admin/` — for the same "one feature, one owner" discipline already applied to every other per-domain table in this codebase (the Transaction Auto-Categorization suggestion table is owned by Transactions and queried only from there; the Budget Advisor/Spending Insights caches are each owned by their own feature). The concrete, forcing reason this matters here specifically: `lib/auth.ts`'s signup hook is the **other** consumer of this table (§4.3), and `lib/auth.ts` is core infrastructure loaded on every signup, not an Admin-specific code path — having core auth infrastructure import from `features/admin/` (an intentionally small, internal-operations-only module) would be a backwards dependency, the same category of smell this document's module-boundary rules elsewhere exist to prevent (`lib/` and core infra are meant to be depended *on*, not to depend on a feature module, and especially not on the one feature module explicitly scoped to be the *last*, most narrowly-used thing in this app).

**`features/categories/server/template.ts` exports:**
- `getSystemCategoryTemplate(): Promise<SystemCategoryTemplateEntry[]>` — plain read, ordered by `order` ascending, **no admin check** (it's a read of non-sensitive, effectively-public configuration data — both `lib/auth.ts`'s signup hook and Admin's own display screen call it directly).
- `createTemplateEntry`, `updateTemplateEntry`, `reorderTemplateEntries`, `deleteTemplateEntry` — the four mutations, each enforcing AC2 (case-insensitive uniqueness), AC6 (never reducible to zero entries), and AC4 (explicit reorder). **These do not themselves check for the `ADMIN` tier** — per this codebase's existing, standing convention that authorization is resolved once, at the Server Action/Route Handler boundary (`getCurrentUser()`/`getCurrentAdminUser()`), with `service.ts`-level functions trusting a caller that has already been authorized, exactly as every other domain's `service.ts` already does. The admin gate lives in `features/admin/server/actions.ts`'s thin wrappers (§7), which call `getCurrentAdminUser()` first, then delegate to these four functions — Admin owns the *authorization*, Categories owns the *data and its business rules*, cleanly split.

### 4.3 Migrating `lib/auth.ts`'s signup hook, without changing behavior for existing users

**Required one-time data migration (not schema-only), run once at deploy time — the same category of required step as Phase 4b's `FinancialGoal.completionNotifiedAt` backfill:** a script that seeds `SystemCategoryTemplate` with exactly today's eleven `DEFAULT_CATEGORIES` entries, in their current array order (`order: 0..10`), **before** the signup hook is switched over. This is what guarantees zero behavior change for the very next signup after deploy — the template starts out identical to the constant it replaces, and only diverges once an admin makes their first edit.

**The signup hook change itself** (`src/lib/auth.ts`):
```diff
- import { DEFAULT_CATEGORIES } from "@/features/categories/default-categories"
+ import { getSystemCategoryTemplate } from "@/features/categories/server/template"
  ...
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
+           const template = await getSystemCategoryTemplate()
            await db.category.createMany({
-             data: DEFAULT_CATEGORIES.map((category) => ({
+             data: template.map((category) => ({
                ...category,
                userId: user.id,
                isSystem: true,
              })),
            })
          } catch (error) { ... }
        },
      },
    },
  },
```
A one-line swap of the data source, the shape of every downstream `Category` row this hook creates is completely unchanged (`name`, `color`, `userId`, `isSystem: true` — `order` is a template-only column, never copied onto `Category`, since `Category` has no such column and nothing about categories.md asks for one). `src/features/categories/default-categories.ts`'s `DEFAULT_CATEGORIES` constant and its remaining consumer, `prisma/seed.ts` (dev/demo data only, per its own header comment), are **left in place, untouched** — this is Database Architect/Backend Engineer's call whether to eventually retire it once `prisma/seed.ts` is also pointed at the new table, but that is not required for this phase's Admin capability to function, and is explicitly out of scope here (seed-data tooling is not part of the five schema questions this pass resolves).

**AC7 (never retroactive), verified against this design directly:** an admin edit through `features/admin/server/actions.ts`'s wrapped mutations only ever writes to `SystemCategoryTemplate` rows. `lib/auth.ts`'s signup hook only ever *reads* that table, and only at the exact moment a **new** user's `create.after` hook fires. An existing user's `Category` rows are never touched by any code path this design introduces — there is no batch job, no cascade, no trigger of any kind that reaches from `SystemCategoryTemplate` back into `Category`. This is true by the complete absence of a relation between the two models (§4.1), not by a business-rule check that could be gotten wrong.

---

## 5. Reports' generation-event log

### 5.1 Model

```
enum ReportType {
  MONTHLY
  YEARLY
  TAX_SUMMARY
  INCOME
  EXPENSE
  CASH_FLOW
}

model ReportGenerationEvent {
  id          String     @id @default(cuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        ReportType
  periodLabel String              // the report's own already-computed, human-readable period
                                    //   label (e.g. "June 2026", "2026", "Jan 1 – Mar 20, 2026") —
                                    //   the exact string features/reports/server/period.ts's
                                    //   toReportPeriodView already produces, reused verbatim, never
                                    //   recomputed a second time
  generatedAt DateTime   @default(now())

  @@index([userId])
  @@index([type])
  @@index([generatedAt])
  @@map("report_generation_event")
}
```

**`ReportType` is the first Prisma-persisted enum Reports has ever needed** — `features/reports/types.ts`'s existing `ReportType` TS union (`"MONTHLY" | "YEARLY" | ...`) was, until now, purely a compile-time concept with zero database representation, since nothing about report generation was ever persisted. The new Prisma enum's members match that existing TS union member-for-member — the Database Architect's implementation should treat this as formalizing an already-settled vocabulary, not inventing a new one; six report types is exactly the kind of small, rarely-changing, business-meaningful set this codebase's other Prisma enums (`NotificationType`, `DebtType`, `IncomeType`) already model this way, unlike the deliberately-String-typed, expected-to-grow sets in §3/§6.

**Why `periodLabel` (a string) and not the raw `start`/`end` dates:** `admin.md` Capability 3 AC4 sets the bar explicitly — "the audit log never displays the underlying financial figures... beyond what's needed to identify the event (e.g. 'a Monthly Report was generated for July 2026' is sufficient)." Storing the already-formatted label satisfies exactly that bar with zero extra computation (Reports' `service.ts` already has this string in hand at the moment of a successful generation, per `period.ts`'s `toReportPeriodView`) and, just as importantly, **keeps this table from ever becoming "a stored artifact to leak"** — `phase-4b-technical-design.md` §2's own explicit security property for Reports ("no stored artifact to leak... no `Report` table, no report ID, no download-by-ID endpoint"). This table does not reopen that property: it stores metadata about the *fact* that a generation happened (who, what type, what period, when), never the report's own bytes, never its numeric contents, and — critically — no report ID or any other value a client could use to re-fetch or replay a specific past generation. A row here answers "did user X generate a Monthly Report for June 2026, and when" for an admin, and nothing more.

### 5.2 Write site

`features/reports/server/service.ts`'s `generateReport` gains exactly one new statement, on the success path only, after `renderReportPdf` succeeds and immediately before returning:
```ts
await db.reportGenerationEvent.create({
  data: { userId, type: request.type, periodLabel: meta.period.label },
})
```
**Never on a validation/business-rule failure** (a bad query param, a not-yet-started future period) — those are not report generations, and `admin.md` Capability 3 AC1 only asks for "each PDF report generated," not every attempt. This mirrors reports.md's own Cross-Cutting Requirement #4 framing exactly: a row here represents a real, successful, live-data generation, the same standard the report's own "no cache, no reuse" rule already holds every generation to. A genuine, unexpected rendering/database failure (the `catch` block in `app/api/reports/route.ts`, mapped to a 500) never reaches this line at all, consistent with the existing control flow — no change needed there.

**No new Route Handler, no new Server Action.** This is a single additional Prisma write inside an already-existing function, at an already-existing call site — the smallest possible change that closes Risk #30.

### 5.3 The read side: Reports' first-ever cross-user query

`features/reports/server/audit.ts` (new file) exports the one function Admin's Audit Log needs:
```ts
getReportGenerationEvents(options: {
  type?: ReportType
  start?: Date
  end?: Date
  cursor?: string
}): Promise<ReportGenerationEventSummary[]>
```
**This is deliberately, explicitly `userId`-unscoped** — the first read function in this entire codebase that is not filtered to a single authenticated user's own data, a genuine, narrow, first-of-its-kind exception to Risk #4's standing "every query scoped by the authenticated user's own ID" rule. This is safe **only** because it is never called from anywhere except Admin's own, already-`requireAdmin()`-gated Server Component (`app/admin/audit-log/page.tsx`) — the same "checked live, on every request" discipline as every other admin surface, applied here to a read instead of a write. This function stays inside `features/reports/server/` (Reports owns the table it reads) rather than living in `features/admin/`, matching the exact "owning domain exposes the cross-cutting read, consuming domain calls it" shape already established for `getDividendIncomeForPeriod`/`getSummaryForMonth` in Phase 4b — Admin is simply this pattern's newest, and most cross-user, consumer.

---

## 6. Feature-flag primitive — recommendation: build it now, as shared `lib/` infrastructure

**Recommendation: yes, build a small, standalone feature-flag primitive now, in `lib/feature-flags.ts` — not scoped as an Admin-owned screen with its own private storage.** This is not merely the "nice architecture" answer to the CTO's standing recommendation; given this codebase's own already-binding module-boundary rules, it is close to the *only* answer that doesn't force a rule violation:

**The forcing argument:** Feature Flags AC2 requires the AI-features flag to "disable all of 4a's AI-generated content app-wide" and the email flag to "disable all outbound notification email app-wide" — both kill switches must be checked from inside `lib/ai/generate-structured-output.ts` and `lib/email/send-notification-email.ts` respectively (the single existing choke point each module already funnels every call through, per their own Phase 4a/4b design — checking in exactly one place each, rather than five AI call sites and six email template call sites independently, is the only way to keep this a one-line addition rather than a duplicated check smeared across every feature). But `Architecture.md`'s own module-boundary table states, twice, as a load-bearing rule: `lib/ai/` and `lib/email/` must **never** import from `app/`, `components/`, or any `features/*` — "this is the one direction that must never be crossed... `lib/ai/` never imports a feature back," extended verbatim to `lib/email/`. If the flag-check lived inside `features/admin/` (as data or as a function), both `lib/ai/` and `lib/email/` would have to import from a feature module to check it — breaking an already-established, binding acyclicity rule, not just a style preference. **The flag primitive must be `lib/`-level infrastructure for the existing architecture to remain internally consistent at all.**

### 6.1 Design

```
lib/feature-flags.ts

export type FeatureFlagKey = "AI_FEATURES" | "EMAIL_DELIVERY"
  // a plain TS string union, deliberately NOT a Prisma enum — for the identical
  // expected-to-grow-without-a-migration reasoning as §3.4/§3.5: Risk #32's own resolution
  // already frames this as "registered against the standalone feature-flag primitive" by
  // future phases, which must be able to add a new key as a one-line constant-array change

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean>
  // reads FeatureFlag.enabled for `key`; a MISSING row (the two initial flags are seeded at
  // deploy time, so this is the "not yet seeded" defensive case, not the expected path) and a
  // genuine read failure BOTH resolve to `true` (fail OPEN) — a transient database hiccup on
  // this one small table must never spuriously disable AI or email app-wide; that would be a
  // new, surprising failure mode this design must not introduce. Short in-process TTL cache
  // (e.g. 30s) recommended, non-binding, so this adds no meaningful latency to the AI/email hot
  // path — consistent with ai-features-design.md's own "cost/latency must be bounded" discipline,
  // extended here to a check that now sits in front of every one of those calls.
```

```
model FeatureFlag {
  id              String    @id @default(cuid())
  key             String    @unique
  enabled         Boolean   @default(true)
  updatedAt       DateTime  @updatedAt
  updatedByUserId String?
  updatedByUser   User?     @relation(fields: [updatedByUserId], references: [id], onDelete: SetNull)

  @@map("feature_flag")
}
```
Seeded once at deploy time with exactly the two rows Feature Flags AC2 requires (`AI_FEATURES`, `EMAIL_DELIVERY`, both `enabled: true`) — the same "seed the initial rows, deploy-time, one-off" shape as §4.3's template seed.

**Wiring (one line each, at the top of the existing single choke point — not a new call site into either module, a guard added inside the module's own existing entry point):**
- `lib/ai/generate-structured-output.ts`: if `!(await isFeatureEnabled("AI_FEATURES"))`, return the same `{ status: "unavailable" }` `AiFeatureResult` this function already returns on a genuine provider failure — **zero new degraded-state shape**, per Feature Flags AC3's own explicit requirement ("a flag is never a new, separately-designed broken state").
- `lib/email/send-notification-email.ts`: if `!(await isFeatureEnabled("EMAIL_DELIVERY"))`, return `{ sent: false }` — the same shape this function already returns on a genuine provider failure, satisfying AC3 identically for the email side.

This is a small, in-place addition to two already-existing files, not new call sites into either module from anywhere else — the binding "zero new `lib/ai/` call sites anywhere in 4c" constraint governs *features* newly reaching into `lib/ai/`, which this is not; nothing outside `lib/ai/` itself changes.

### 6.2 `AdminActionLog` — the model Feature Flags/Manage Categories/Seed Demo Data actually need for their own "this action is worth recording" requirement

**A genuine, small gap worth naming precisely: `admin.md` Capability 3 AC1 enumerates exactly four already-happening event types (AI usage, report generation, notification/email sends, category-suggestion decisions) — it does not list "a flag was toggled," "a template entry was edited," or "demo data was seeded" among them, yet Capabilities 4/5/6 each separately state their own action "is itself an admin action worth recording — see Capability 3."** Read together, Admin's Audit Log needs to surface a fifth, distinct family of event — Admin's own native actions — that none of the four already-shipped 4a/4b tables can represent (a flag toggle has no existing home; a template edit has no existing home). This is not one of the CTO's five enumerated schema questions, but it is a load-bearing prerequisite for Capabilities 4–6 to satisfy their own stated Definition of Done, so it is designed here rather than silently left for the Backend Engineer to discover mid-implementation — the same discipline this pass is itself built on.

```
enum AdminActionType {
  FEATURE_FLAG_TOGGLED
  CATEGORY_TEMPLATE_CHANGED
  DEMO_DATA_SEEDED
}

model AdminActionLog {
  id            String          @id @default(cuid())
  adminUserId   String?         // nullable + onDelete: SetNull — an admin action log entry must
  adminUser     User?           //   survive even if that admin account is later removed, the same
                                  //   "a historical record doesn't get deleted along with what it
                                  //   refers to" precedent as Capability 3's own "since-deleted
                                  //   user/record" edge case
  action        AdminActionType
  details       Json?            // small, heterogeneous per-action payload (e.g. { flagKey, from,
                                  //   to } or { templateEntryId, field, from, to } or { success:
                                  //   boolean }) — Json is already this schema's established
                                  //   representation for exactly this kind of "read-and-display-
                                  //   whole, never individually queried/joined" content
                                  //   (BudgetAdvisorCache.recommendations, MonthlySummary
                                  //   .citedFigures, SpendingInsightsCache.insights), not a new
                                  //   pattern introduced here
  createdAt     DateTime         @default(now())

  @@index([action])
  @@index([createdAt])
  @@map("admin_action_log")
}
```

**Not a generic, blanket "audit everything" table** — Capability 3 AC5 is explicit that this phase's audit log is scoped to specific, named event types, never a catch-all. `AdminActionLog` covers exactly the three native Admin actions named above; it is never written to by anything outside `features/admin/server/actions.ts`'s own three mutating wrappers (toggle flag, edit template, trigger demo seed), each writing one row in the same transaction/request as the action itself.

---

## 7. `features/admin/` — full module design

### 7.1 Folder layout

```
features/admin/
├── types.ts                       # AdminUserSummary, AuditLogEntry (the merged, cross-source
│                                    #   view — see §7.3), FeatureFlagView
├── server/
│   ├── users.ts                    # getUsers(options: { search?; cursor? }) — cross-user,
│                                    #   admin-only read over Better Auth's own User/Session models;
│                                    #   "last active" = MAX(Session.updatedAt) per user, falling
│                                    #   back to Session.createdAt, per the CTO resolution pass's
│                                    #   already-decided definition — no new schema, reads existing
│                                    #   Better Auth tables only
│   ├── audit-log.ts                # getAuditLog(options: { type?; start?; end?; cursor? }) —
│                                    #   merges four already-existing per-domain reads (Transactions'
│                                    #   CategorySuggestion history, Notifications' Notification
│                                    #   .emailSentAt/emailSendError, the AI generation-cache
│                                    #   tables' generatedAt/nullable-content-as-outcome signal,
│                                    #   Reports' NEW getReportGenerationEvents, §5.3) plus
│                                    #   AdminActionLog (§6.2) into one filterable, paginated view —
│                                    #   itself a pure composition layer, the same "leaf, zero
│                                    #   business logic of its own" shape as features/calendar/
│                                    #   (§2), just fanning in five sources instead of two
│   ├── feature-flags.ts            # getFeatureFlags() — thin read over lib/feature-flags.ts's
│                                    #   own FeatureFlag table (kept in lib/ since lib/ai//lib/email/
│                                    #   both need to read it — see §6 — Admin only needs to read/
│                                    #   write it, never gains its own copy)
│   ├── demo-data.ts                # triggerDemoDataSeed() — thin wrapper around the EXISTING
│                                    #   prisma/seed-showcase.ts script (never reimplemented, per
│                                    #   admin.md Capability 6 AC3); environment-gated (non-
│                                    #   production only, checked server-side, never client-side
│                                    #   only) and fixed-target (no parameter accepted at all — the
│                                    #   function takes no arguments, by construction, the same
│                                    #   "verified by construction, not convention" discipline as
│                                    #   Reports' zero-lib/ai import guarantee)
│   └── actions.ts                  # toggleFeatureFlag, seedDemoData, createCategoryTemplateEntry,
│                                    #   updateCategoryTemplateEntry, reorderCategoryTemplateEntries,
│                                    #   deleteCategoryTemplateEntry — every one of these calls
│                                    #   getCurrentAdminUser() FIRST (never trusts a caller), then
│                                    #   delegates to the owning domain's own function
│                                    #   (features/categories/server/template.ts for the four
│                                    #   category-template mutations, per §4.2's ownership split),
│                                    #   then writes one AdminActionLog row (§6.2) — this file is
│                                    #   the ONE place "is this caller an admin" is checked for every
│                                    #   mutation this module exposes
└── components/
    ├── user-table.tsx               # reuses components/ui/data-table/ directly, per admin.md
    │                                #   Capability 2 AC2's explicit "mirrors the same search/
    │                                #   pagination bar already established for Transactions"
    │                                #   requirement — no new table primitive
    ├── audit-log-table.tsx          # same data-table reuse, filterable by type/date range (AC3)
    ├── feature-flag-toggle.tsx
    ├── category-template-editor.tsx # add/edit/reorder/remove, the AC6 "never zero entries" guard
    └── seed-demo-data-button.tsx    # confirm-before-destructive-action pattern (AC4)
```

### 7.2 Route layout

```
app/admin/
├── layout.tsx           # getCurrentAdminUser() guard → redirect("/") if null, §1.4
├── page.tsx             # redirects to /admin/users (or a minimal landing summary — Frontend
│                          #   Lead's call)
├── users/page.tsx
├── audit-log/page.tsx
├── feature-flags/page.tsx
├── categories/page.tsx   # Manage Categories (the starter template) — deliberately NOT nested
│                          #   under /settings/ or /categories/, since it edits a global template,
│                          #   not a per-user resource; living under /admin/ keeps that distinction
│                          #   visually and structurally unambiguous
└── demo-data/page.tsx
```

**Zero new Route Handlers anywhere in this module** — every read is a Server Component direct call (View Users' search/pagination uses `?search=`/`?cursor=` searchParam navigation, the same convention Transactions/Bills/Budgeting already established, not a client-refetch hook), and every write is a Server Action. This is worth noting explicitly: Admin is the first feature-sized module in this codebase's history to introduce **no** new API route surface at all — a direct, favorable consequence of it needing no client-side cache-refetch behavior anywhere (View Users' search is page navigation, not a TanStack Query hook, the same "no `hooks/` folder" call already made for Reports and Calendar v2).

### 7.3 Dependency graph — Admin as this codebase's largest fan-in leaf yet

```
Better Auth's User/Session (existing)             Transactions' CategorySuggestion (4a, existing)
Budgeting's/Analytics'/Dashboard's/Financial       Notifications' Notification.emailSentAt (4b, existing)
  Health Score's AI generation-cache tables (4a)   Reports' NEW ReportGenerationEvent (§5)
        │              │                                  │                    │
        └──────┬───────┴───────────┬──────────────────────┴─────────┬──────────┘
               ↓                   ↓                                ↓
                          features/admin/server/{users,audit-log}.ts   (NEW leaf module — reads
                                     │                                  across six sources, writes
                                     ↓                                  only its own AdminActionLog
                          features/admin/server/actions.ts              and FeatureFlag rows)
                                     │
                                     ↓
        features/categories/server/template.ts  (owns SystemCategoryTemplate, §4)
        lib/feature-flags.ts                     (owns FeatureFlag, §6 — a NEW lib/ leaf, read by
                                                    lib/ai/ and lib/email/ too, never the reverse)

lib/auth.ts's signup hook  →  features/categories/server/template.ts.getSystemCategoryTemplate()
                                                    (existing dependency direction, §4.3 — only the
                                                     data source behind it changes)

features/calendar/server/service.ts  →  features/bills/server/service.ts (existing, unchanged)
                                      →  features/recurring-income/server/service.ts (NEW function
                                                                                        only, §2.3)

features/settings/server/service.ts  →  features/dashboard/dashboard-cards.ts (reads the canonical
                                                                                  card-key constant)
```
`features/admin/` is a pure fan-in leaf, structurally the same shape as Financial Goals/Financial Health Score/Reports (§7 already establishes this for the third time this codebase has needed it) — nothing outside `features/admin/` ever imports from it, so no cycle risk exists despite it reading across more sources than any single prior module has. `features/calendar/` is this codebase's fourth such leaf. `lib/feature-flags.ts` is a new, second `lib/`-level fan-in leaf alongside `lib/recurrence.ts`/`lib/merchant-normalization.ts`/`lib/ai/`/`lib/email/` — read by two of those (`lib/ai/`, `lib/email/`) and by `features/admin/`, never importing back into any of them.

---

## 8. API contracts summary (full detail belongs in `api-contracts.md`'s own Phase 4c section — see that file)

| Domain | Action | Mechanism | Notes |
|---|---|---|---|
| Calendar v2 | Get a month's combined calendar | Server Component direct call to `calendar.service.getCalendarMonth(userId, month)` | Read-only, no Server Action, no Route Handler |
| Settings | Get/update preferences | Server Component reads (`settings.service.getUserPreference`/`getDashboardCardPreferences`) + Server Actions (`updateAccentColor`, `updateCurrencyDisplay`, `updateTimezone`, `captureInferredTimezone`, `updateDashboardCardVisibility`, `reorderDashboardCards`, `resetDashboardLayout`) | No Route Handler |
| Admin — access | Guard | `app/admin/layout.tsx` calling `getCurrentAdminUser()` | Redirect, never an error page |
| Admin — users | List/search users | Server Component direct call to `admin.server/users.getUsers({ search?, cursor? })` | `?search=`/`?cursor=` searchParam navigation |
| Admin — audit log | List/filter audit entries | Server Component direct call to `admin.server/audit-log.getAuditLog({ type?, start?, end?, cursor? })` | Composition over 5 sources, §7.1 |
| Admin — feature flags | Get/toggle | Server Component read (`admin.server/feature-flags.getFeatureFlags`) + Server Action `toggleFeatureFlag({ key })` | Writes `AdminActionLog` |
| Admin — manage categories | CRUD + reorder | Server Actions `createCategoryTemplateEntry`/`updateCategoryTemplateEntry`/`reorderCategoryTemplateEntries`/`deleteCategoryTemplateEntry` | Admin-gated wrappers over `features/categories/server/template.ts`; writes `AdminActionLog` |
| Admin — seed demo data | Trigger | Server Action `seedDemoData()` | Non-production only, fixed target only, writes `AdminActionLog` |

---

## 9. Cross-cutting closeout

**Zero new `lib/ai/` call sites, confirmed by construction.** No file described anywhere in this document imports from `lib/ai/`, except the one, pre-existing choke point itself (`lib/ai/generate-structured-output.ts`) gaining an internal guard that reads `lib/feature-flags.ts` — a `lib/`-to-`lib/` dependency, not a new feature reaching into `lib/ai/`. Recommended for the Backend Engineer: extend the existing ESLint `no-restricted-imports` rule (already scoped to `features/reports/**`/`features/notifications/**` per `phase-4b-technical-design.md` §8) to also cover `features/calendar/**`, `features/settings/**`, and `features/admin/**`, turning this phase's own "none of the three touches AI-generated content" confirmation (the CTO kickoff pass's own words) into the same build-time-enforced guarantee the prior phase established, rather than a claim resting on this document's prose alone.

**No new caching-layer precedent beyond the one narrow, justified exception already named in §6.1.** Every new read in this design (`calendar.service.getCalendarMonth`, `settings.service.*`, `admin.server/*`) is on-read, uncached Prisma aggregation over already-bounded, per-user (or, for Admin specifically, whole-user-base-but-paginated) data, consistent with this codebase's standing default. `lib/feature-flags.ts`'s optional short-TTL in-process cache is the one deliberate exception, justified narrowly by its position on the AI/email hot path, not a reopening of Risk #11's general "no materialized aggregates" conclusion.

**No change to any of the nine already-shipped features' or four cron jobs' date-boundary logic**, confirmed against this document directly: `UserPreference.timezone` (§3.3) is written and read back only by Settings' own settings-page display; `features/calendar/` (§2.4) explicitly does not read it. Nothing in this document touches `features/bills/server/occurrence.ts`, `features/budgeting/server/service.ts`'s month-boundary logic, `features/recurring-income/server/occurrence.ts`, `features/dashboard/server/service.ts`'s month-to-date resolution, `features/analytics/server/period.ts`, the Monthly Summary/Financial Health Score Snapshot/Net Worth Snapshot/`evaluate-notifications` cron routes, or any other date-boundary computation named in Risk #29 — that deferral holds completely across this entire pass.

---

## 10. Risks — new items surfaced by this pass

Six genuinely new risks are surfaced by the specific choices in this document — added to `docs/planning/risk-register.md` as #33–#38 in the same dispatch as this document (full text there; summarized here for traceability):

- **#33** — `features/admin/server/users.ts`/`audit-log.ts`/`features/reports/server/audit.ts`'s `getReportGenerationEvents` are this codebase's first-ever query functions not scoped to a single authenticated user's own data, a deliberate, narrow exception to Risk #4's standing rule — flagged for the Security Architect's 4c review gate to verify these are reachable **only** from behind `getCurrentAdminUser()`, never from any ordinary session-authenticated path.
- **#34** — `lib/feature-flags.ts`'s `isFeatureEnabled` check sits on the AI/email hot path (§6.1) — a DB read failure here must fail *open* (features stay enabled), never *closed*, or a transient database hiccup on one small table becomes a novel, surprising way to silently disable AI/email app-wide; flagged as a specific implementation requirement, not left to be inferred.
- **#35** — `SystemCategoryTemplate` is this schema's first genuinely global (non-per-user) table, requiring a one-time deploy-time seed from today's `DEFAULT_CATEGORIES` constant (§4.3) before the signup hook is switched over — flagged as a required, ordered deploy step (seed, then deploy the code change), the same category of operational care Phase 4b's `completionNotifiedAt` backfill already required.
- **#36** — Several fields in this design (`DashboardCardPreference.cardKey`, `FeatureFlag.key`, `UserPreference.accentColor`/`currencyDisplay`) are deliberately plain, application-validated `String` columns rather than DB enums, for forward-compatibility reasons stated in §3.4/§3.5/§6.1 — a stale or renamed key (e.g. a Dashboard card removed in a later phase while old preference rows still reference it) must degrade gracefully (ignored at read time, never a thrown error/broken settings page) rather than crash a render; flagged as an explicit implementation requirement for whoever writes each field's materialization logic.
- **#37** — `AdminActionLog` (§6.2) is a genuinely new persistence need this pass identified, not one of the CTO's five enumerated schema questions but a load-bearing prerequisite for Admin Capabilities 4/5/6's own stated "this action is worth recording" requirement — flagged so it is built alongside the five enumerated schema items, not discovered as a gap only once Admin's own Definition of Done is checked against a shipped implementation.
- **#38** — Better Auth's `admin` plugin (rejected in §1.2) remains installed in `package.json` as a dependency of the base `better-auth` package but is never enabled via `plugins: [...]` in `lib/auth.ts` — flagged so a future engineer skimming `package.json` doesn't assume the plugin is active; the plain `role` column (§1.3) is the entire authorization mechanism, and no code path in this codebase ever calls `betterAuth({ plugins: [admin()] })`.
