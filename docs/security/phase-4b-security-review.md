# Phase 4b Security Review — Reports & Notifications v2

**Reviewer:** Security Architect
**Scope:** Full pre-ship review of Phase 4b as shipped to `master`:

- Reports: `src/features/reports/**`, `src/app/api/reports/route.ts`
- Notifications v2: `src/features/notifications/**`, `src/lib/email/**`,
  `src/app/api/cron/evaluate-notifications/route.ts`,
  `src/app/api/notifications/unsubscribe/route.ts`,
  `src/app/api/notifications/route.ts`
- Supporting schema (`prisma/schema.prisma`'s `Notification`/`Account`/
  `NotificationPreference`/`NotificationThresholdSettings` sections) and the
  Phase 4b ESLint boundary rules (`eslint.config.mjs`)

Reviewed against `docs/product/reports.md`, `docs/product/notifications-v2.md`,
and `docs/architecture/phase-4b-technical-design.md`, and against this
codebase's standing review bar (`docs/security/phase-4a-review.md`,
`docs/security/phase-3a-review.md`, `docs/security/phase-3b-review.md`).

**Recommendation: APPROVE.**

No High or Medium findings. Two Low/informational items noted below —
neither is exploitable today and neither blocks release; both are flagged as
hardening recommendations for a future pass, not as gate-blocking defects.

---

## 1. Reports — cross-user data scoping (reports.md AC5)

**Verified: every read in the generation path is scoped to the
session-authenticated `userId`, with no client-supplied identifier anywhere
in the request shape.**

- `src/app/api/reports/route.ts` calls `getCurrentUser()` first, fails closed
  with a 401 `UNAUTHENTICATED` `ApiResult` on `null`, and passes only
  `user.id` (never a query param) into `generateReport(user.id, rawParams)`.
  The query string (`type`, `month`, `year`, `period`, `start`, `end`) carries
  no identity field of any kind — confirmed by reading
  `RawReportQueryParams`/`GenerateReportRequestObjectSchema`
  (`src/features/reports/server/validation.ts`) end to end; there is no
  `userId`/`accountId`/report-id field for a crafted request to smuggle.
- `generateReport` (`src/features/reports/server/service.ts`) threads that
  same `userId` straight through to `assembleReportData`, which dispatches to
  exactly one of the six `assemble*ReportData(userId, period)` functions in
  `src/features/reports/server/data/*.ts`. Read all six files in full: every
  one of them passes `userId` as the first argument to every downstream read
  (`dashboard.service.getMonthlySummary`, `getSpendingByCategory`,
  `getNetWorthAsOf`, `getSummaryForMonth`, `budgeting.service.getBudgetMonth`,
  `analytics.*` breakdown/trend functions, `debt.service.getDebts`,
  `investments.service.getPortfolioOverview`/`getAllocation`/
  `getGainLossForPeriod`/`getDividendIncomeForPeriod`,
  `recurring-income.service.getIncomeStreams`/`getStreamById`). None of the
  six data assemblers issues a raw Prisma query of its own — every number is
  sourced from an already-existing, already-reviewed per-domain read
  function, each of which filters by `userId` in its own `where` clause (spot
  checked `getNetWorthAsOf`/`getNetWorthHistory` in
  `dashboard/server/net-worth-history.ts`, `getSummaryForMonth` in
  `dashboard/server/monthly-summary.ts`, and the new
  `getDividendIncomeForPeriod` in `investments/server/service.ts` — all three
  are the genuinely new Phase 4b read functions per the design doc's §3, and
  all three filter `where: { userId, ... }` directly).
- No `Report` table, no report ID, no download-by-ID endpoint exists anywhere
  in the shipped code — matches the technical design's "no stored artifact to
  leak" claim exactly (`grep` across `prisma/schema.prisma` confirms no
  `Report` model). The only surface that could leak cross-user data is the
  ordinary one every Route Handler already has (scope every read by
  `getCurrentUser().id`), and that is upheld here by construction, not by
  convention that could regress unnoticed.

**Conclusion: reports.md AC5 holds.** No request path — crafted query param,
guessed identifier, or otherwise — can produce a report scoped to another
user's data.

## 2. Reports — query param validation / injection / DoS surface

- `src/features/reports/server/validation.ts`'s `GenerateReportRequestSchema`
  (a Zod discriminated union) rejects, rather than defaults, on any
  missing/malformed field — every branch is exhaustively validated
  (`MonthParamSchema`'s regex, `YearParamSchema`'s `1970`–`2999` bound,
  `DateParamSchema`'s regex + `Date.UTC` construction, never the
  timezone-dependent `new Date(string)` constructor per this codebase's
  standing risk-register.md #8 convention).
- **Risk #22 (custom date-range upper bound) is enforced in code, not just
  documented.** `MAX_CUSTOM_RANGE_DAYS = 3653` (10 years) is checked inside
  `FlexiblePeriodParamsSchema`'s `.superRefine`, rejecting any `start`/`end`
  pair whose span exceeds it before the request ever reaches a data
  assembler's per-month loop. Confirmed covered by a dedicated test
  (`src/features/reports/server/validation.test.ts`, "rejects a custom range
  exceeding the maximum bound (Risk #22)"). Every per-month loop in
  `data/yearly.ts`/`expense.ts`/`cash-flow.ts` is therefore bounded to at most
  ~120 iterations even at the custom range's maximum, the same bounded-loop
  shape Analytics' own `budget-comparison.ts`/`savings-growth.ts` already use
  at the identical scale — not a new, unbounded aggregation surface.
- Malformed input fails cleanly: `parseGenerateReportRequest` returns a
  `{ success: false, error }` result (never throws) on any validation
  failure, which the Route Handler maps to an ordinary 400 `ApiResult`
  error — never a 500, a crash, or a partially-rendered PDF. A genuine,
  unexpected failure inside `assembleReportData`/`renderReportPdf` is caught
  by the Route Handler's own `try/catch` and mapped to a 500 with a generic
  message (no stack trace or internal error detail returned to the client;
  the raw error is only `console.error`-logged server-side).
- No SQL injection surface: every read in this feature goes through Prisma's
  parameterized query builder, with no raw `$queryRaw`/`$executeRaw` calls
  anywhere in `src/features/reports/**` (confirmed by inspection of every
  `data/*.ts` file — all reads are typed Prisma client calls via other
  domains' service functions, never a string-built query).
- PDF generation DoS: the one attacker-controlled dimension (`start`/`end`)
  is capped at 10 years by the schema above, and every report type's
  row-count ceiling is otherwise this codebase's already-accepted
  "thousands, not millions, of rows per user" scale assumption (not a new
  surface Phase 4b introduces). No user-controlled `limit`/`pageSize`-style
  parameter exists on this endpoint that could be inflated to force an
  oversized render. This bound is what keeps `@react-pdf/renderer`'s
  in-process rendering cost within a knowable ceiling — the deeper
  cost/latency profiling of that renderer itself is the Performance
  Engineer's territory (Risk #23), not re-litigated here since it does not
  cross into an unbounded, security-relevant DoS vector.

## 3. Reports — `lib/ai/` isolation (Monthly narrative)

- The Monthly Report's narrative section (`src/features/reports/server/data/monthly.ts`)
  reads `getSummaryForMonth(userId, monthKey)` — a plain Prisma `findUnique`
  in `dashboard/server/monthly-summary.ts` that returns the already-persisted
  `MonthlySummary.narrative` field verbatim, with no generation call in its
  path. Skipped entirely (not even queried) when `period.isPartial` is true,
  matching the "current month never has a narrative" rule.
  `pdf/templates/monthly.tsx` renders `narrative` as a plain `<Text>` node,
  omitted entirely (no placeholder) when `null` — no markdown/HTML pipeline,
  no `dangerouslySetInnerHTML` anywhere in `src/features/reports/**` (grep
  confirmed).
- `eslint.config.mjs` adds a `no-restricted-imports` rule scoped to
  `src/features/reports/**/*.{ts,tsx}` (and a matching one for
  `src/features/notifications/**`) blocking any import matching
  `@/lib/ai`/`@/lib/ai/*`. Confirmed no file under either directory imports
  from `lib/ai/` today (grep across both trees for `lib/ai` returns zero
  matches).
- **Finding (Low): the ESLint rule's "verified by construction" claim is
  narrower than advertised — it does not cover dynamic `import()`
  expressions.** ESLint's built-in `no-restricted-imports` rule (confirmed by
  reading `node_modules/eslint/lib/rules/no-restricted-imports.js`) only
  registers a listener for static `ImportDeclaration`/`ExportNamedDeclaration`/
  `ExportAllDeclaration` nodes — it has no `ImportExpression` listener, so a
  hypothetical `await import("@/lib/ai/client")` written inside
  `features/reports/**` or `features/notifications/**` would compile and lint
  clean, silently bypassing the guard the design doc (§8) and both product
  specs' Definition of Done describe as "verified by construction, not
  convention." No such dynamic import exists anywhere in the shipped code
  today (`grep -rn "await import(" src/features/reports src/features/notifications`
  returns only a comment reference, not an actual dynamic import), so this is
  not a live vulnerability — it is a gap in the strength of a build-time
  guarantee that both product specs' Definition of Done sections rely on as
  their primary enforcement mechanism. **Recommendation (not implemented by
  this review, per role scope):** either add a supplementary check that also
  catches `ImportExpression` (a small custom ESLint rule, or a
  `dependency-cruiser`/`madge`-based CI check that walks the full transitive
  import graph — including dynamic imports — of `features/reports/**` and
  `features/notifications/**` and fails the build if any edge reaches
  `lib/ai/`), or explicitly downgrade the Definition of Done's own "verified
  by construction" wording to reflect what is actually enforced. This is a
  process/tooling completeness gap, not a data-exposure or authorization
  defect, and does not block this release.
- Large Purchase (`triggers/large-purchase-trigger.ts`) and Low Balance
  (`triggers/low-balance-trigger.ts`) are confirmed to import only
  `@/lib/db`, their own feature's `accounts.service`/`transactions.service`
  reads, and sibling notification-module files — no import from
  `features/analytics/server/insights.ts` or any `lib/ai/*` path in either
  file, matching binding constraint 1.

## 4. Notifications v2 — cron route authentication

`src/app/api/cron/evaluate-notifications/route.ts` uses the identical
shared-secret pattern as all four pre-existing cron routes
(`net-worth-snapshot`, `categorize-transactions`, `monthly-summary`,
`financial-health-score-snapshot`) — confirmed by diffing all five routes'
auth blocks:

```
const cronSecret = process.env.CRON_SECRET
const providedSecret = getBearerToken(request.headers.get("authorization"))
if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

Both branches (wrong secret vs. unconfigured secret) collapse to the same
401 response, so an unconfigured deployment is never mistaken for "no auth
required" — the correct, already-established behavior, applied consistently
here.

**Observation (informational, not a new Phase 4b finding):** the secret
comparison is a plain `!==` string comparison, not `crypto.timingSafeEqual`.
This is a pre-existing pattern across all five cron routes (not something
`evaluate-notifications` introduces or regresses) and was implicitly already
accepted at the gate for the four prior routes (`docs/security/phase-3a-review.md`,
`docs/security/phase-4a-review.md`). A remote timing attack against a
32+ byte random secret compared over an internet round-trip is a low-practicality
attack in isolation, but since all five routes now share this shape,
it is worth a single, uniform hardening pass across `app/api/cron/*`
(switch to `timingSafeEqual` with a length-equalized buffer, mirroring
`lib/email/unsubscribe-token.ts`'s own correct use of it) at some future
point — flagged here for completeness since the task asked this route be
checked against the existing pattern, not as a Phase-4b-specific defect
worth blocking this release over, and not something this role should fix
piecemeal for one route while leaving the other four inconsistent.

## 5. Notifications v2 — email content / PII minimization

Read every template in `src/lib/email/templates/*.tsx` against
notifications-v2.md §5/AC6 ("only the same data already shown in the
equivalent in-app notification... never raw account numbers or any data
beyond what the in-app version already displays"):

| Template | Props | Matches in-app fields only? |
|---|---|---|
| `budget-over.tsx` | `categoryName`, `allocated` | Yes |
| `bill-due-soon.tsx` / `bill-late.tsx` | `billName`, `dueDate`, `expectedAmount` | Yes |
| `goal-achieved.tsx` | `goalName` | Yes |
| `large-purchase.tsx` | `merchant`, `amount`, `date` | Yes |
| `low-balance.tsx` | `accountName`, `balance` | Yes — no account number, no routing/institution detail |
| `monthly-summary-ready.tsx` | `month`, `narrative` (verbatim) | Yes, per AC4's explicit allowance for verbatim narrative reuse |

Every template renders every prop as a plain `<Text>`/inline-JSX text node
(`@react-email/components`'s `Text`) — no `dangerouslySetInnerHTML`, no
markdown pipeline anywhere in `src/lib/email/**` (grep confirmed; the two
doc-comment hits are prohibition notes, not usage). `shared-layout.tsx`'s own
`previewText` prop is likewise plain interpolated text, never beyond what the
in-app card shows.

No template's prop type includes anything beyond what `notification-mapper.ts`'s
`toNotification()` already exposes to the in-app inbox — confirmed by
comparing each template's props interface against the matching branch of
`toNotification`'s `switch` in `src/features/notifications/server/notification-mapper.ts`.

## 6. Notifications v2 — cross-user leakage in trigger evaluation

Verified the design doc's mandated "one data object per user per event,
reused for both the in-app row and the email" pattern is actually followed,
not just documented, across every trigger evaluator:

- `goal-achieved-trigger.ts`, `large-purchase-trigger.ts`,
  `low-balance-trigger.ts`, `monthly-summary-trigger.ts`, and
  `budget-bill-triggers.ts` (v1, unchanged) are each called with a single
  `userId` parameter from `service.ts`'s `ensureNotifications(userId)`, and
  every Prisma read inside each trigger filters by that same `userId`
  (`getFinancialGoals(userId)`, `db.transaction.findMany({ where: { userId, ... } })`,
  `getAccounts(userId)`, `getMostRecentSummary(userId)`). No trigger file
  issues a query without a `userId` filter, and none accepts a list of
  multiple users' data in one call.
- `createNotificationIfNew` (`notification-mapper.ts`) is the single write
  path every trigger uses, and its dedup key is always the DB-level unique
  constraint (`P2002` catch-and-ignore) — never a read-then-write — matching
  §6's atomicity requirement. `goal-achieved-trigger.ts`/`low-balance-trigger.ts`
  additionally win an atomic `updateMany({ where: { id, userId, <latch>: null } })`
  claim before ever calling `createNotificationIfNew`, so two concurrent
  callers (a user's own poll and the cron sweep) racing for the same user
  cannot double-fire.
- `service.ts`'s `ensureNotifications` collects all newly-created rows from
  all five trigger calls (`Promise.all`, but each trigger call is itself
  scoped to the one `userId` argument it received — the `Promise.all` here
  parallelizes *trigger types* for one user, not *users*) and dispatches
  email **sequentially**, one `dispatchNotificationEmail(userId, notification)`
  call per newly-created row. `email-dispatch.ts`'s own JSDoc and actual code
  confirm the `notification` object passed in is the exact same in-memory
  object the trigger just built — no second, independently-scoped
  "re-fetch this user's data" query exists anywhere in the email-dispatch
  path; the only additional read is `db.user.findUnique({ where: { id: userId } })`
  for the recipient's own email address, scoped by the identical `userId`.
- `evaluateNotificationsForAllUsers` (the cron entry point) iterates
  `db.user.findMany()` results **sequentially** (a plain `for` loop, not
  `Promise.all`), matching the design doc's explicit "no batch/merge-variable
  email API, ever" rule — confirmed no call to Resend's batch-send API
  anywhere in `src/lib/email/**` (only `sendNotificationEmail`'s single-recipient
  `resend.emails.send({ to, ... })` call exists).

**Conclusion: no code path exists that could construct or send one user's
notification/email content using another user's data.** The structural
mitigation the design doc describes (single data object per user per event,
no batch API, sequential per-user iteration) is actually implemented, not
just asserted.

## 7. Notifications v2 — unsubscribe token (`lib/email/unsubscribe-token.ts`)

- **Algorithm:** HMAC-SHA256 via Node's `createHmac`, signed with the
  dedicated `EMAIL_UNSUBSCRIBE_SECRET` env var — confirmed distinct from
  `BETTER_AUTH_SECRET` (separate `.env.example` entry, separate `getSigningSecret()`
  read), so rotating one secret never forces rotating the other and a leak of
  one does not compromise the other.
- **Payload:** exactly `{ userId, type }`, base64url-encoded, with the
  signature computed over the encoded payload and appended after a `.`
  separator. `verifyUnsubscribeToken` re-derives the expected signature from
  the received payload and compares it against the provided signature using
  `timingSafeEqual` (length-checked first, since `timingSafeEqual` throws on
  mismatched buffer lengths) — the correct, standard defense against a
  timing side-channel on HMAC verification, and notably **better** than the
  cron routes' own plain `!==` comparison (§4 above).
- **Tamper/forgery resistance:** any modification to either the payload or
  the signature fails verification (`timingSafeEqual` returns `false`, or the
  `JSON.parse`/Zod re-validation of the decoded payload fails), and
  `verifyUnsubscribeToken` returns `null` uniformly for every failure mode —
  a malformed token, a tampered payload, and a bad signature are all
  indistinguishable to the caller, so this endpoint gives an attacker no
  oracle to iteratively refine a forgery attempt against.
- **No cross-user pivot:** the route
  (`src/app/api/notifications/unsubscribe/route.ts`) only ever calls
  `db.notificationPreference.upsert` with `payload.userId`/`payload.type` —
  values that came exclusively from a signature-verified token, never from
  any other request input (there is no second `userId` query param this
  route reads). It is therefore impossible to unsubscribe an arbitrary other
  user's preference by manipulating the URL: any `userId` substitution
  invalidates the signature, and the route has no session-based identity to
  fall back to or confuse with the token's own payload.
- **Scope containment:** the route writes only `emailEnabled: false` for the
  token's exact `(userId, type)` pair — `inAppEnabled` and every other
  trigger type's preference are untouched, confirmed by reading the
  `upsert`'s `create`/`update` blocks directly.
- **`userId` enumeration via the token:** the token's payload is
  base64url-encoded, not encrypted, so a party who already possesses one
  valid token can decode it and read the plaintext `userId`/`type` it
  contains. This is not a new information disclosure — the token is only
  ever delivered inside an email already addressed to that exact user, so
  anyone in a position to read the token already has access to the email
  (and therefore already knows far more about that user than a bare user
  ID). Decoding one's own token does not help forge a token for a
  *different* `userId`, since the signature is what's checked, not the
  payload's plausibility — no action needed here.
- **No expiry:** unsubscribe tokens do not expire. This is intentional and
  correct for this use case (an unsubscribe link that stops working after 30
  days would be a usability regression, and — per the analysis above — a
  non-expiring token grants no privilege beyond disabling email for the one
  `(userId, type)` pair it was minted for, which is exactly what re-clicking
  an old link should still do). Not a finding.

## 8. Notifications v2 — Server Actions (`updateNotificationPreference` / `updateNotificationThresholdSettings`)

Both actions (`src/features/notifications/server/actions.ts`) call
`getCurrentUser()` first and fail closed with `UNAUTHENTICATED` on `null`.
Both `UpdateNotificationPreferenceSchema` and
`UpdateNotificationThresholdSettingsSchema`
(`src/features/notifications/server/validation.ts`) were read in full:
**neither schema has a `userId` field of any kind** — `updateNotificationPreference`'s
input is `{ type, inAppEnabled?, emailEnabled? }`, and
`updateNotificationThresholdSettings`'s is `{ largePurchaseThreshold?, lowBalanceThreshold? }`.
Every downstream `db.notificationPreference.upsert`/`db.notificationThresholdSettings.upsert`
call uses `user.id` (from the server-resolved session, never `parsed.data`)
as the `where`/`create` key. There is no field in either schema a compromised
or hand-crafted client call could use to target another user's row — the
identical pattern already verified for the five Phase 4a Server Actions in
`docs/security/phase-4a-frontend-followup-review.md`'s Verified Control B.

`markNotificationRead`/`dismissNotification` (unchanged v1 actions, re-read
for completeness) both re-verify ownership via
`db.notification.findFirst({ where: { id, userId: user.id } })` before any
write, and `markAllNotificationsRead`'s `updateMany` scopes its `where` by
`userId: user.id` directly — no regression introduced by this phase's
additions to this file.

## 9. `Account.lowBalanceThresholdOverride` — no new gap in `updateAccount`

Read `src/features/accounts/server/actions.ts`'s `updateAccount` in full.
The new field follows the exact same guarded path as every pre-existing
field on this action:

1. `getCurrentUser()` — fail closed with `UNAUTHENTICATED`.
2. `UpdateAccountSchema.safeParse(input)` — `lowBalanceThresholdOverrideSchema`
   (`validation.ts`) bounds the value to `[0, MAX_BALANCE_ABS]` with
   two-decimal precision, `.nullable().optional()` (matching `interestRate`'s
   own established "`null` explicitly clears, `undefined` leaves unchanged"
   convention).
3. `const existing = await db.account.findFirst({ where: { id, userId: user.id } })`
   — ownership is verified **before** any write; a `null` result (account
   doesn't exist, or belongs to a different user) returns `fail("Account not found")`
   and the function returns without ever reaching the `update` call.
4. The final `db.account.update({ where: { id }, data: { ... } })` only
   executes after step 3's ownership check has already passed — `id` here is
   the same `id` just proven to belong to `user.id`, so this is not an
   unguarded `where: { id }` update reachable with an arbitrary `id`.

No authorization gap — old or new — exists in this action. The new field is
additive and inherits every existing guard on the action it was added to.

## 10. General OWASP-category sweep

- **Authentication:** every non-cron, non-token-authenticated route in this
  phase (`GET /api/reports`, `GET /api/notifications`, both new Server
  Actions) calls `getCurrentUser()` and fails closed. No route trusts a
  client-supplied identity value anywhere in this phase's code.
- **Authorization:** covered in depth in §§1, 6, 8, 9 above — every read and
  write is scoped to the resolved session's `userId` (or, for the
  unsubscribe route, to a cryptographically-bound token payload). No
  IDOR-shaped gap found.
- **Rate limiting:** the two new AI-adjacent surfaces from Phase 4a
  (reasoning-model calls) already have dedicated per-user/project-wide rate
  limiting reused unchanged; Phase 4b introduces zero new `lib/ai/` calls, so
  that limiter is not relevant here. `GET /api/reports` and the notification
  Server Actions have no dedicated per-user rate limit of their own, but this
  matches this codebase's existing, already-accepted convention for ordinary
  (non-AI-cost, non-external-API-cost) CRUD/read endpoints elsewhere in the
  product — Reports' worst case is bounded, self-inflicted CPU/memory cost on
  the requester's own already-bounded dataset (§2), not an amplification or
  cross-user impact vector. Not a finding.
- **Secrets:** `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, and
  `EMAIL_UNSUBSCRIBE_SECRET` are documented in `.env.example` with the same
  "never commit a real value" comment convention as every existing secret.
  `RESEND_API_KEY` is read in exactly one file (`lib/email/client.ts`),
  matching the established "one file owns the third-party import/secret"
  convention. `EMAIL_UNSUBSCRIBE_SECRET` is read in exactly one file
  (`unsubscribe-token.ts`). No secret is logged, echoed in an error message,
  or embedded in any client-shipped bundle (`lib/email/**` and
  `features/reports/server/**` are both server-only by this codebase's
  established convention — never imported from `app/`, a Client Component,
  or any `hooks/*.ts`).
- **CSRF:** `GET /api/reports` and `GET /api/notifications/unsubscribe` are
  both `GET`-only, read/state-changing-via-token routes with no
  cookie-implicit-trust mutation risk beyond what a plain link click already
  implies (the unsubscribe route's only effect is disabling email for one
  trigger type — an intentionally link-clickable, low-blast-radius action by
  design, consistent with how every other unsubscribe-link implementation in
  the industry treats this exact tradeoff). The two new Server Actions
  inherit Next.js Server Actions' built-in CSRF protections (Origin-header
  verification), the same protection every other mutating action in this
  codebase already relies on — no new exception introduced.
- **XSS:** covered in §§3, 5 above — every AI-or-user-adjacent string
  (narrative text, merchant names, category/goal/account names) is rendered
  as a plain text node in both the PDF renderer (`@react-pdf/renderer`'s
  `<Text>`, which has no HTML-injection surface at all — it is not a DOM/HTML
  renderer) and the email renderer (`@react-email/components`'s `<Text>`).
  No `dangerouslySetInnerHTML` anywhere in either new subsystem.
- **SQL Injection:** no raw SQL anywhere in either new subsystem — every read
  and write goes through Prisma's parameterized client (confirmed by
  inspection of all `data/*.ts`, `triggers/*.ts`, `actions.ts`, and
  `service.ts` files in both features).
- **Injection via merchant/category/goal names into email/PDF:** these are
  the same user-authored strings already reviewed for the transactions/
  budgeting/goals features' own storage paths (unchanged by this phase) —
  Phase 4b only adds new *rendering* surfaces for them, and both new
  renderers treat every value as an opaque text node, never as markup or a
  template string that could reinterpret its contents.

---

## Summary of findings

| # | Severity | Area | Description | Status |
|---|---|---|---|---|
| 1 | Low | Reports/Notifications `lib/ai/` boundary | `no-restricted-imports` does not catch dynamic `import()` expressions — the "verified by construction" guarantee is narrower than the Definition of Done implies. No live exploit; no dynamic import exists in shipped code today. | Recommend supplementary CI check or corrected documentation in a future pass — not blocking. |
| 2 | Informational | All 5 cron routes (pre-existing, `evaluate-notifications` matches the established pattern exactly) | `CRON_SECRET` comparison uses `!==` rather than `timingSafeEqual`. Consistent with prior, already-approved routes; not a regression introduced by this phase. | Recommend a single uniform hardening pass across `app/api/cron/*` at a future date — not blocking. |

No High or Medium severity findings. No cross-user data leakage path was
found in Reports or Notifications v2, in any of the areas the task asked to
be specifically checked (report generation/retrieval, email content
construction, the unsubscribe token, the two new Server Actions, or the
`Account.lowBalanceThresholdOverride` addition to `updateAccount`).

**Recommendation: APPROVE for release.** Both noted items are hardening
recommendations for a future pass, not conditions for this gate.
