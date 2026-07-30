# Phase 4c Security Review — Calendar v2, Customization, Admin

**Reviewer:** Security Architect
**Scope:** Full pre-ship review of Phase 4c as shipped to `master`:

- Admin authorization: `src/lib/auth.ts` (`getCurrentAdminUser`, `User.role`
  Better Auth wiring), `src/app/admin/layout.tsx` and every `src/app/admin/**/
  page.tsx`, `src/features/admin/server/**` (`actions.ts`, `users.ts`,
  `audit-log.ts`, `feature-flags.ts`, `demo-data.ts`, `validation.ts`),
  `src/features/categories/server/template.ts`, `src/features/reports/server/
  audit.ts`, `src/lib/feature-flags.ts`, `scripts/grant-admin.ts`
- Customization: `src/features/settings/server/{actions,validation,service}.ts`,
  `src/features/settings/hooks/**`, `src/features/settings/components/**`
- Calendar v2: `src/features/calendar/server/service.ts`,
  `src/app/(dashboard)/calendar/page.tsx`, and its composed reads in
  `src/features/bills/server/service.ts`/`src/features/recurring-income/
  server/service.ts`
- Supporting schema (`prisma/schema.prisma`'s `User.role`, `UserPreference`,
  `DashboardCardPreference`, `SystemCategoryTemplate`, `ReportGenerationEvent`,
  `FeatureFlag`, `AdminActionLog` sections)

Reviewed against `docs/planning/roadmap.md`'s Phase 4c CTO kickoff/resolution
passes, `docs/product/{calendar-v2,customization,admin}.md`,
`docs/architecture/phase-4c-technical-design.md`, `docs/planning/
risk-register.md` rows #25–#38, and this codebase's standing review bar
(`docs/security/phase-4b-security-review.md` most recently).

**Recommendation: APPROVE.**

No High or Medium findings. Admin authorization — this codebase's first
privilege/authorization tier and this gate's headline concern — holds up
under direct inspection, not merely by its own doc comments' claims. One
Low/informational item is noted below; it does not block release.

---

## 1. Admin authorization mechanism — `role` cannot be client-set (the headline item)

**Verified directly against Better Auth's own source, not taken on the code
comment's word.** `src/lib/auth.ts` wires `role` via `additionalFields` with
`input: false, defaultValue: "USER"`. Read `better-auth`'s actual
`parseInputData` (`node_modules/better-auth/dist/db/schema.mjs`, the function
both `sign-up` and `update-user` route through via `parseUserInput`):

```js
if (fields[key].input === false) {
  if (fields[key].defaultValue !== void 0) {
    if (action !== "update") {
      parsedData[key] = fields[key].defaultValue;   // sign-up: silently forced to "USER"
      continue;
    }
  }
  if (data[key]) throw APIError.from("BAD_REQUEST", {
    message: `${key} is not allowed to be set`        // update-user: hard rejected
  });
  continue;
}
```

Two independent, mechanically-enforced outcomes, confirmed by reading the
library code itself:
- **Sign-up:** a client-supplied `role` value in the sign-up payload is
  silently discarded and replaced with `defaultValue: "USER"` — there is no
  way to register a new account already holding `ADMIN`.
- **Update-user:** a client-supplied `role` value on the update-user endpoint
  throws a 400 `FIELD_NOT_ALLOWED` error outright — there is no way for an
  authenticated non-admin (or a compromised admin-adjacent client script) to
  self-promote via that endpoint.

`grep`'d the whole `src/` tree for any call to `auth.api.signUp`/
`auth.api.updateUser` or a raw `/sign-up`/`/update-user` fetch that might
attach a `role` field from a different code path — none exists; every
sign-up/profile-update flow in this codebase goes through Better Auth's own
client SDK with no custom `role`-setting call site anywhere.

**Conclusion: a client genuinely cannot supply or modify its own `role`
through any Better Auth endpoint.** The only way to grant `ADMIN` is
`scripts/grant-admin.ts`, a direct `db.user.update({ data: { role: "ADMIN" }
})` run outside the request/response cycle entirely (§4 below).

## 2. `getCurrentAdminUser()` — single source of truth, live per request

`src/lib/auth.ts`'s `getCurrentAdminUser()` calls `getCurrentUser()` (which
re-resolves the session via `auth.api.getSession({ headers: await headers()
})` — a live database lookup, not a JWT/stateless check) and returns the user
only if `role === "ADMIN"`, else `null`. No memoization (`cache()`,
`unstable_cache`, or a module-level variable) wraps either function anywhere
in the codebase — confirmed by inspection of the full file and a grep for
`unstable_cache`/`React.cache` near either function. Because this app's
session strategy is DB-backed (a `Session.token` row joined live to `User`
row on every call), a `role` flip takes effect on the very next request with
no additional invalidation step — the claim in the file's own doc comment is
accurate, not aspirational.

**`grep`'d every call site of `getCurrentAdminUser`:** it is called (a) once
per request inside `src/app/admin/layout.tsx`, and (b) as the first statement
of each of the six exported mutations in `src/features/admin/server/
actions.ts`. No other call site exists anywhere in `src/`.

## 3. `src/app/admin/layout.tsx` — the guard runs first, on every request

```ts
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdminUser()
  if (!admin) {
    redirect("/")
  }
  ...
}
```

`getCurrentAdminUser()` is the first statement in the layout's async body,
and `redirect()` is called before any nav/content JSX is constructed. This is
Next.js App Router's officially sanctioned "protect a route segment from its
layout" pattern: a Server Component layout's async function body must
resolve before the tree beneath it (including every nested `page.tsx`'s own
async body) is rendered, so `redirect()` here genuinely prevents any child
page's own data fetch or render from ever executing for a non-admin — not
merely a client-side hide. Confirmed all six `src/app/admin/**/page.tsx`
files (`page.tsx`, `users/page.tsx`, `audit-log/page.tsx`, `feature-flags/
page.tsx`, `categories/page.tsx`, `demo-data/page.tsx`) rely on exactly this
layout-level guard and perform no redundant per-page `getCurrentAdminUser()`
call of their own — correct, not a gap, since a second check would be dead
code given the layout's guarantee, and this codebase's own established
"resolve authorization once, at the boundary" convention (already used
identically for ordinary `getCurrentUser()` gating elsewhere).

No caching wrapper exists anywhere in this call chain (§2), so "on every
request" holds literally, not just at first load.

## 4. `scripts/grant-admin.ts` — confirmed unreachable from product code

`grep`'d the entire `src/` tree for `grant-admin` — zero matches. The script
is not imported by anything under `src/features/admin/`, `src/app/admin/`,
or anywhere else; it is only reachable via `npm run grant:admin -- <email>`,
a direct terminal invocation against the database.

**Injection/misuse review of the script itself:**
- `db.user.findUnique({ where: { email } })` / `db.user.update({ where: {
  email }, data: { role: "ADMIN" } })` — both go through Prisma's
  parameterized client, `email` is never interpolated into a raw SQL string.
  No SQL injection surface.
- `email` comes from `process.argv[2]` — a local operator's own shell
  argument, not network-facing/attacker-controlled input. No shell
  interpolation of `email` occurs (no `exec`/`spawn` call anywhere in this
  script) — command-injection is not applicable here.
- Idempotent (`role === "ADMIN"` short-circuits to a no-op log line rather
  than a redundant write) — a re-run cannot corrupt state.
- No secret/credential is read, logged, or embedded — the script relies on
  `lib/db.ts`'s ordinary `DATABASE_URL`-based connection, the same one every
  other script/route already uses.

**Conclusion: genuinely unreachable from any HTTP-facing code path, and
presents no injection or misuse risk beyond "whoever can run a script against
the production database can grant admin" — which is the explicitly intended,
CTO-approved operational model (roadmap.md's kickoff pass, risk-register.md
#18's "no self-service admin-role-assignment UI" scope call), not a defect.**

## 5. Risk #33 — cross-user, `userId`-unscoped reads: reachability confirmed

`getUsers` (`features/admin/server/users.ts`), `getAuditLog` (`features/
admin/server/audit-log.ts`), and `getReportGenerationEvents` (`features/
reports/server/audit.ts`) are this codebase's first query functions not
filtered by a single authenticated user's own `userId`. Grepped every call
site of all three across `src/`:

| Function | Call sites | Behind admin gate? |
|---|---|---|
| `getUsers` | `src/app/admin/users/page.tsx` only | Yes — child of `app/admin/layout.tsx` |
| `getAuditLog` | `src/app/admin/audit-log/page.tsx` only | Yes — same layout |
| `getReportGenerationEvents` | `src/features/admin/server/audit-log.ts`'s `fetchReportGenerationEntries` only, which is itself only reached via `getAuditLog` | Yes — transitively, same layout |

No call site exists in any Route Handler, any non-admin Server Component, or
any Server Action outside `features/admin/server/`. All three files'
functions themselves perform no authorization check internally (by design,
per this codebase's "authorize once, at the boundary" convention) — their
safety depends entirely on this reachability property, which holds by direct
inspection, not by trusting their own doc comments.

## 6. `getUsers` — credential/token field exposure check

Read Better Auth's actual Prisma models (`prisma/schema.prisma` lines 77–200):
`User` carries `id, name, email, emailVerified, image, role, createdAt,
updatedAt` (no password/token field on `User` itself); credentials live on
`AuthAccount.password` (local email/password) and
`AuthAccount.{accessToken,refreshToken,idToken}` (OAuth); `Session.token` is
the live session identifier.

`getUsers`' `select` allow-list is:
```ts
select: { id: true, email: true, name: true, emailVerified: true, createdAt: true }
```
— an explicit, exhaustive projection, never a bare `db.user.findMany()`. It
never selects from `AuthAccount` at all, and its one `Session` read
(`db.session.groupBy({ by: ["userId"], _max: { updatedAt: true } })`) touches
only the aggregate `updatedAt` timestamp — `Session.token`/`ipAddress`/
`userAgent` are never selected or returned. **No credential, session token,
or OAuth access/refresh token can leak through this view**, confirmed against
the actual schema, not assumed from the file's own comment.

## 7. Audit log tamper-resistance — no edit/delete path exists

Grepped `src/` for `adminActionLog.update`/`.delete`/`.deleteMany`/
`.updateMany`/`.upsert` — zero matches anywhere. The only write to
`AdminActionLog` in the entire codebase is `db.adminActionLog.create(...)`,
called from exactly four places inside `features/admin/server/actions.ts`
(`toggleFeatureFlag`, `seedDemoData`, and the four category-template actions
collectively). No Server Action, Route Handler, or script anywhere exposes a
mutation on this table beyond insertion. This satisfies Risk #18's
tamper-resistance requirement by construction (no code path exists, not
merely "no UI wired up for it") — matches `admin.md` Capability 3's audit-log
design intent.

## 8. Feature-flag access control

`toggleFeatureFlag` (`features/admin/server/actions.ts`) calls
`getCurrentAdminUser()` as its literal first statement (see §9's table) and
fails closed with `fail(UNAUTHORIZED)` before any Zod parsing or database
read. `isFeatureEnabled` (`lib/feature-flags.ts`), the AI/email hot-path
check, takes only a compile-time `FeatureFlagKey` union
(`"AI_FEATURES" | "EMAIL_DELIVERY"`) as its sole parameter — there is no
request-derived string, unauthenticated input, or client-influenced value
that reaches this function's `key` argument anywhere in the codebase (its
two callers, `lib/ai/generate-structured-output.ts` and `lib/email/
send-notification-email.ts`, both pass a hardcoded literal). A non-admin
therefore has no path to influence which flag is checked, and no path to
influence the checked value's *result* either — the only write to
`FeatureFlag.enabled` is `toggleFeatureFlag`'s admin-gated `db.$transaction`.

## 9. `features/admin/server/actions.ts` — all six mutations verified

Read the full file. Every exported function's literal first statement is
`const admin = await getCurrentAdminUser()` followed immediately by
`if (!admin) return fail(UNAUTHORIZED)`, before any Zod parsing or database
access:

| Action | First statement is the admin check? | Fails closed? |
|---|---|---|
| `toggleFeatureFlag` | Yes (line 71) | Yes |
| `seedDemoData` | Yes (line 120) | Yes |
| `createCategoryTemplateEntry` | Yes (line 146) | Yes |
| `updateCategoryTemplateEntry` | Yes (line 177) | Yes |
| `reorderCategoryTemplateEntries` | Yes (line 217) | Yes |
| `deleteCategoryTemplateEntry` | Yes (line 247) | Yes |

No code path in this file reaches a `db` call or a downstream
`features/categories/server/template.ts`/`features/admin/server/
demo-data.ts` mutation before this check. `features/categories/server/
template.ts`'s own four mutations (`createTemplateEntry`, etc.) perform no
authorization check themselves, by design — they are only ever called from
this file's admin-gated wrappers (confirmed by grep: their only call sites
are inside `actions.ts`).

## 10. Customization — every Settings Server Action verified session-scoped

Read `src/features/settings/server/actions.ts` in full. Every one of the
seven exported actions (`updateAccentColor`, `updateCurrencyDisplay`,
`updateTimezone`, `captureInferredTimezone`, `updateDashboardCardVisibility`,
`reorderDashboardCards`, `resetDashboardLayout`) opens with
`const user = await getCurrentUser(); if (!user) return fail("UNAUTHENTICATED")`,
and every downstream `db.userPreference.upsert`/`db.dashboardCardPreference
.upsert`/`.deleteMany` call uses `user.id` — the server-resolved session's own
id — as its `where`/`create` key. Read every one of the seven input schemas
in `server/validation.ts`: **none has a `userId` field of any kind**, so
there is no way for a hand-crafted client call to target another user's
`UserPreference`/`DashboardCardPreference` row. This is the identical pattern
already verified for Phase 4a/4b's own Server Actions.

**`captureInferredTimezone`'s client-supplied timezone string is validated
before being trusted.** It parses its input against the bare `TimezoneSchema`
(`server/validation.ts`), which rejects any value that isn't a real,
`Intl`-resolvable IANA timezone identifier:

```ts
function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions()
    return true
  } catch {
    return false
  }
}
```

A malformed or arbitrary string (e.g. an oversized payload, HTML/script
content, a SQL-metacharacter-laden string) throws inside the `Intl`
constructor and is rejected with a `fail(...)` `ApiResult` before ever
reaching `db.userPreference.updateMany`. Even if this validation were
bypassed, the value is written via Prisma's parameterized client (no raw SQL)
and — per §12 below — is never rendered anywhere via
`dangerouslySetInnerHTML`, so neither injection nor stored-XSS is reachable
through this field regardless. The race-safety mechanism itself
(`updateMany({ where: { userId, timezoneConfirmed: false } })`, a single
atomic conditional write, never read-then-write) is sound and not a security
concern — it only affects which of two near-simultaneous writes "wins," never
which user's row is written.

## 11. Calendar v2 — cross-user scoping confirmed throughout

`calendar.service.getCalendarMonth(userId, month)` takes `userId` as an
explicit parameter and passes it straight through to both composed reads
(`bills.service.getCalendarMonth(userId, month)` and `recurring-income
.service.getIncomeCalendarMonth(userId, month)`) with no independent query of
its own (confirmed: the file is pure array/map composition, zero `@/lib/db`
import, matching its own header comment and the architecture doc's "verified
by construction" claim). Both composed services' underlying Prisma queries
filter `where: { userId, ... }` directly (`bill.findMany`,
`billOccurrence.findMany`, `incomeStream.findMany`, the equivalent income
occurrence reads) — spot-checked directly in `features/bills/server/
service.ts` and `features/recurring-income/server/service.ts`, not merely
assumed from the design doc.

The one call site, `src/app/(dashboard)/calendar/page.tsx`, resolves `user`
via `getCurrentUser()` and passes `user.id` — never a route param or
searchParam — into `getCalendarMonth`. The `?month=` searchParam is validated
against a strict `^\d{4}-(0[1-9]|1[0-2])$` regex before use, and the
underlying `bills.service.getCalendarMonth` independently re-validates its
own `month` argument via `MonthSchema.parse(month)`, so a malformed value
cannot reach the database query malformed either. No request-shape anywhere
in Calendar v2 carries an `accountId`/`userId`/any other identifier a caller
could substitute to view another user's bills or paydays.

## 12. General OWASP sweep

- **Injection (`demo-data.ts`):** `triggerDemoDataSeed()` calls
  `execAsync("npm run seed:showcase", { cwd: process.cwd(), timeout:
  SEED_TIMEOUT_MS })` — a fixed, literal command string with zero
  interpolation of any kind. The function takes no parameters at all (by
  construction, per its own header comment, confirmed by its actual
  signature: `(): Promise<DemoDataSeedResult>`), so there is no user input of
  any shape — not even an admin-supplied one — that could reach this command
  string. `isDemoDataSeedAvailable()` (server-side `NODE_ENV` check) gates it
  independently at both the page level and inside `triggerDemoDataSeed`
  itself. Grepped every call site of `triggerDemoDataSeed` — the only caller
  is `seedDemoData` in `actions.ts`, itself admin-gated (§9). No command
  injection surface.
- **XSS:** grepped `dangerouslySetInnerHTML` across `src/` — the only hits
  are pre-existing Phase 4a/4b email-template/AI-narrative files, none of
  which this phase touches. No component in `features/admin/`,
  `features/settings/`, or `features/calendar/` uses it. Every user/admin
  -authored string this phase introduces — `SystemCategoryTemplate.name`/
  `.color` (admin-authored, Zod-validated: name is length-bounded plain text,
  color is regex-constrained to `^#[0-9a-fA-F]{6}$`), `UserPreference
  .accentColor`/`currencyDisplay` (both constrained to a fixed, code-owned
  enum-like option list — never freeform text), `UserPreference.timezone`
  (Intl-validated, §10) — is rendered through ordinary JSX text
  interpolation (React's default escaping), never through raw HTML
  injection. `hexColor`'s regex additionally forecloses any CSS-injection
  angle if a color value were ever interpolated into an inline `style`
  attribute (confirmed the six-character hex pattern admits no `;`, `url(`,
  `expression(`, or similar).
- **SQL Injection:** no raw `$queryRaw`/`$executeRaw` anywhere in
  `features/admin/`, `features/settings/`, or `features/calendar/` (grep
  confirmed) — every read/write in all three modules goes through Prisma's
  parameterized client.
- **CSRF:** no new Route Handler exists for any of the three domains (grepped
  `src/app/api/` for every `export async function GET/POST/PUT/DELETE/PATCH`
  — the sixteen existing routes are all pre-Phase-4c; zero new ones under
  `app/admin/` or for Settings/Calendar). Every mutation in this phase is a
  Next.js Server Action (`"use server"`, confirmed the only file under
  `features/admin/` with that directive is `actions.ts`, and both
  `features/settings/server/actions.ts` and Calendar v2's read-only
  `service.ts` follow the same shape), which inherits Next.js's built-in
  Origin-header CSRF protection — the same protection every other mutating
  action in this codebase already relies on. Nothing in this phase
  reintroduces a GET-based state change or a form action bypassing Server
  Actions.
- **Rate limiting:** Admin's six mutations and Settings' seven mutations have
  no dedicated per-user/per-admin rate limit of their own. This matches this
  codebase's already-accepted, standing convention for ordinary
  (non-AI-cost, non-external-API-cost) CRUD actions — Admin is additionally a
  small, internal-operations-only surface reachable by a deliberately tiny
  set of trusted accounts (Risk #27's own scope call), and none of its six
  mutations has an amplification or cross-user-impact shape (feature-flag
  toggle, category-template edit, and the demo-data trigger are all
  single-row or single-fixed-target writes). Not a finding.
- **Secrets:** no new secret/env var is introduced by this phase (grepped
  `.env.example` for a Phase 4c entry — none needed; Admin/Customization/
  Calendar v2 introduce no third-party integration). `BETTER_AUTH_SECRET`
  continues to be the only auth-adjacent secret, unchanged by the `role`
  field addition.
- **Authentication:** every non-Admin action in this phase (`getCurrentUser`)
  and every Admin action (`getCurrentAdminUser`) fails closed on `null`,
  confirmed throughout §§9–10 above. No route or action in this phase trusts
  a client-supplied identity value.

---

## Summary of findings

| # | Severity | Area | Description | Status |
|---|---|---|---|---|
| 1 | Low / informational | `features/admin/server/actions.ts`, `seedDemoData` | The `seedDemoData` action logs its `AdminActionLog` entry (success or failure) via a separate, non-transactional `db.adminActionLog.create` call *after* `triggerDemoDataSeed()` resolves — unlike the other five actions, which write their `AdminActionLog` row in the same operation/transaction as the mutation itself (`toggleFeatureFlag`'s `$transaction`) or immediately after a successfully-completed database write (the four category-template actions). If the Node process crashes or the request is aborted between `triggerDemoDataSeed()` completing and the subsequent `adminActionLog.create` call, a real seed attempt could go unrecorded. This is an acceptable, narrow gap — `seedDemoData` unavoidably straddles an external child-process boundary that cannot itself participate in a Prisma transaction, and a missed audit row here has no authorization or data-exposure consequence (the seed target is fixed and non-production-only regardless of whether this row gets written, per §12) — informational only, not a defect worth blocking release over. | Not blocking; no action recommended beyond awareness. |

No High or Medium severity findings. Admin authorization — the headline
concern — is enforced correctly at every layer verified: `role` is
mechanically un-settable by any client (verified against Better Auth's own
source), the layout guard runs first on every request with no caching, all
six Admin mutations check `getCurrentAdminUser()` as their literal first
statement, all three cross-user read functions (`getUsers`, `getAuditLog`,
`getReportGenerationEvents`) are reachable only from behind that guard,
`getUsers`' projection cannot leak a credential/token field, `AdminActionLog`
has no edit/delete path anywhere in the product, and `scripts/grant-admin.ts`
is confirmed unreachable from any code path under `src/app/` or
`src/features/`. Customization's Server Actions are all session-scoped with
no client-suppliable `userId`, and `captureInferredTimezone`'s input is
validated before it is trusted. Calendar v2 is read-only and scoped to the
authenticated user's own `userId` throughout its full composed-read chain.
No injection (SQLi or the `demo-data.ts` child-process command), XSS, or
CSRF gap was found across any of the three domains.

**Recommendation: APPROVE for release.**
