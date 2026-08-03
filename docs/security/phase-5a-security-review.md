# Phase 5a Security Review — Accessibility & Responsive Foundation

**Reviewer:** Security Architect
**Scope:** Standing per-phase review, lighter-touch per the Product Owner
spec's own Definition of Done ("no new data-egress/auth surface... though
the new Playwright suite's own test-credential handling gets a quick look").
Scoped to what Phase 5a actually changed — commits `f55cb7b..HEAD`
(`74ac88f` CTO resolution pass through `ea5a102` accessibility
re-verification closeout):

- New Playwright/E2E test infrastructure's credential handling:
  `tests/e2e/**`, `prisma/seed-e2e-test-user.ts`, `prisma/e2e-test-accounts.ts`,
  `playwright.config.ts`, `.gitignore`'s new entries, `.env.example`'s new
  `E2E_TEST_USER_PASSWORD` entry.
- Confirmation that no new Server Action/Route Handler/API surface was
  introduced (verified directly, not taken on the architecture doc's word).
- `components/ui/` primitives touched by the accessibility structural-fix
  pass: `avatar.tsx`, `button.tsx`, `badge.tsx`, `dropdown-menu.tsx`,
  `progress.tsx`, `table.tsx`, `tabs.tsx`; and
  `features/transactions/components/receipt-uploader.tsx`'s UploadThing
  `appearance` override.
- `BottomNav`/responsive-layout changes' effect on Admin route reachability.

Reviewed against `docs/product/phase-5a-accessibility-responsive.md`,
`docs/architecture/phase-5a-technical-design.md`, `docs/testing/e2e/
accessibility-run-report.md`, and this codebase's standing review bar
(`docs/security/phase-4c-security-review.md` most recently).

**Recommendation: APPROVE.**

No High or Medium findings. One Low/informational item is noted below; it
does not block release.

---

## 1. Playwright/E2E credential handling

### 1.1 No password literal anywhere — confirmed by direct inspection, not by trusting comments

Grepped `tests/e2e/`, `prisma/seed-e2e-test-user.ts`, `prisma/
e2e-test-accounts.ts`, and `playwright.config.ts` for any hardcoded
password-shaped string literal — zero matches. `prisma/e2e-test-accounts.ts`
exports only the two fixed **email** constants (`E2E_TEST_EMAIL`,
`E2E_TEST_ADMIN_EMAIL`) — no password.

`E2E_TEST_USER_PASSWORD` is genuinely env-var-sourced at every read site:

- `prisma/seed-e2e-test-user.ts`'s `main()` reads
  `process.env.E2E_TEST_USER_PASSWORD` and **throws** if unset — never
  falls back to a literal (`"E2E_TEST_USER_PASSWORD is not set... this
  script never falls back to a hardcoded literal password."`).
- `tests/e2e/support/auth.setup.ts`'s `requirePassword()` reads the same
  env var and throws identically if unset, before any login attempt.
- `playwright.config.ts` loads `.env` into `process.env` via Node's
  built-in `loadEnvFile` (not a new secrets mechanism — the same "generate
  a real secret in `.env`, never commit it" convention `CRON_SECRET`/
  `BETTER_AUTH_SECRET` already use) so Playwright's separate test-runner
  process (distinct from `npm run dev`'s own `.env` auto-load) can see it.
- `.env.example` gains `E2E_TEST_USER_PASSWORD=""` — an empty placeholder,
  matching every other secret's existing convention in that file, never a
  real value.
- `.gitignore` already excludes `.env*` (pre-existing, unchanged), so a
  populated `.env` is never committed by construction.

**Conclusion: no password is ever a committed literal anywhere in this
phase's diff.** This is a genuine env-var-sourced credential, sourced
identically to every other secret this codebase already manages.

### 1.2 The ordinary `e2e-test@lkbudget.dev` account never holds `ADMIN` — no new grant mechanism introduced

Read `prisma/seed-e2e-test-user.ts` in full. `createOrReplaceUser` (the one
function that creates both accounts) never sets `role` at all — it calls
Better Auth's `auth.api.signUpEmail`, the same mechanism Phase 4c's own
review already confirmed forces `role` to `defaultValue: "USER"` server-side
regardless of client input (`phase-4c-security-review.md` §1). The admin
account (`e2e-test-admin@lkbudget.dev`) is created by the identical
`createOrReplaceUser` call — **no fixture data, no `ADMIN` role** — with the
script's own comment and `main()`'s console output explicitly deferring the
`ADMIN` grant to a required, separate manual step:
`npm run grant:admin -- e2e-test-admin@lkbudget.dev`.

Confirmed **no new admin-grant mechanism was introduced this phase**:
`git diff f55cb7b..HEAD -- scripts/grant-admin.ts` is empty — the script is
byte-for-byte unchanged from the version Phase 4c's own review already
audited (parameterized Prisma query, no shell interpolation, unreachable
from any HTTP-facing code path, idempotent). `package.json`'s new
`grant:admin` script entry (`tsx scripts/grant-admin.ts`) is only a run-alias
for the same, already-reviewed file — not a new code path. Grepped `tests/
e2e/`, `prisma/seed-e2e-test-user.ts`, and `prisma/e2e-test-accounts.ts` for
any `role`/`ADMIN` string — the only occurrences are the seed script's own
`main()` echoing the required follow-up command as console output, and
`route-inventory.ts`'s `requiresAdmin` field, which only selects which of
two already-authenticated `storageState` files a generated test runs under
— it has no bearing on the account's actual `role` value in the database.

**Conclusion: the ordinary account is mechanically incapable of holding
`ADMIN` (same server-side enforcement Phase 4c already verified), and the
only path to `ADMIN` for either test account is the existing,
already-reviewed `scripts/grant-admin.ts` — no new grant path exists.**

### 1.3 Production guard — read directly, genuinely refuses to run, not merely documented as doing so

`prisma/seed-e2e-test-user.ts`'s `main()`:

```ts
if (process.env.NODE_ENV === "production") {
  throw new Error(
    "seed-e2e-test-user.ts refuses to run with NODE_ENV=production — this " +
      "script creates real, loggable-in test accounts and is intended for " +
      "local/CI test environments only.",
  )
}
```

This is the literal first statement of `main()`, executed before the
password-env-var check, before `createOrReplaceUser`, and before any
database write. A `throw` inside an `async function` rejects the promise
`main().catch(...)` at the bottom of the file already handles
(`process.exitCode = 1`) — this is a genuine hard failure, not a silent
no-op and not a comment-only claim. Matches `phase-5a-technical-design.md`
§1.5's stated rationale (a defensive addition beyond `seed-showcase.ts`'s
own precedent, justified because an E2E seed script is more plausible to
end up wired into an automated pipeline).

### 1.4 `storageState` session files — properly gitignored, confirmed never committed

`.gitignore` gains:

```
# Playwright (tests/e2e/) — generated run artifacts, and the storageState
# files auth.setup.ts writes (real, live session cookies for the two
# e2e-test@/e2e-test-admin@lkbudget.dev accounts — never committed...)
/playwright-report/
/test-results/
/tests/e2e/support/.auth/
```

`tests/e2e/support/storage-state.ts` defines the two paths written by
`auth.setup.ts` — `tests/e2e/support/.auth/user.json` and `.../admin.json`
— both falling under the ignored `/tests/e2e/support/.auth/` directory.
Confirmed directly, not assumed from the ignore rule alone: `git ls-files`
returns zero matches for any path under `tests/e2e/support/.auth/`, and
`git log --all --full-history -- "tests/e2e/support/.auth/*"` returns no
history — these files have never been committed, in the current tree or at
any prior point in this repository's history. `.auth/user.json` and
`.auth/admin.json` do exist on disk locally (generated by a prior local
`auth.setup.ts` run) but are correctly untracked.

### 1.5 No test-only auth bypass — a real login is the only mechanism

`tests/e2e/support/auth.setup.ts` authenticates via the actual `/login` UI
form (`page.goto("/login")`, fills the real `Email`/`Password` fields,
clicks the real "Sign in" button) — never a direct API/DB session
injection, never a `NODE_ENV`-gated bypass endpoint or header. Grepped
`src/lib/auth.ts` and the full `src/app/api/` tree for any new
environment-gated branch, test-only header check, or bypass route — none
exists; `src/lib/auth.ts` is untouched by this phase's diff. The resulting
session is an ordinary, DB-backed `Session` row — the same live-joined
session `getCurrentUser()`/`getCurrentAdminUser()` read for every real user,
per Phase 4c's own already-verified "no caching wrapper" finding
(`phase-4c-security-review.md` §2), which still holds since neither
function was touched this phase.

### 1.6 Fixture-data creation — no cross-user leakage, standing per-user scoping discipline preserved

`prisma/seed-e2e-test-user.ts`'s `createFixtureData(userId)` writes every
record (`Account`, `Transaction`, `Budget`/`BudgetCategory`, `Bill`/
`BillOccurrence`, `IncomeStream`/`IncomeOccurrence`, `Goal`/
`GoalContribution`, `Debt`, `Holding`, `FinancialGoal`) with `userId`
explicitly set to the one account just created — no query or write in this
function references any other user's id, and the function takes exactly one
`userId` parameter, threaded through consistently. `createOrReplaceUser`
deletes-and-recreates by `email` lookup scoped to that one account (Prisma's
`onDelete: Cascade` relations clean up only that user's own prior rows), so
repeated runs cannot accumulate or leak data belonging to another account.
The two test accounts (`e2e-test@lkbudget.dev`, `e2e-test-admin@lkbudget.dev`)
are fully independent `User` rows — the admin account receives zero fixture
data of its own — so there is no shared-ownership row either account's
tests could read cross-scope. This matches the standing per-user-scoping
discipline every prior phase's review has verified for product code
(`phase-4c-security-review.md` §§10–11); the seed script itself introduces
no new query pattern that could violate it.

One informational note, not a finding: `tests/e2e/support/fixture-ids.json`
is checked into the repo, but only as an explicit, self-documented
placeholder (`"_comment": "Checked-in PLACEHOLDER only... NOT real database
ids"`, with literal values like `"placeholder-transaction-id"`) — real
fixture ids are written to this same path by `seed-e2e-test-user.ts` at
local/CI seed time and are not database record ids of any material
sensitivity in any case (opaque cuids belonging to disposable test-account
rows, not a credential or PII). No action needed.

---

## 2. No new data-egress surface — verified directly

Grepped every file changed between `f55cb7b` and `HEAD` for `"use server"` —
zero matches. Diffed `src/app/api/` between the same two commits — zero
changes (`git diff --stat f55cb7b..HEAD -- src/app/api/` returns empty).
The full 67-file changed-file list for this phase (`git diff --stat
f55cb7b..HEAD`) contains no new file under `src/app/api/`, no new
`actions.ts`/`*-actions.ts` file, and no modification to any existing
Server Action file (`features/*/server/actions.ts` do not appear in the
diff at all). Every changed file is one of: test infrastructure with no
production API surface (`tests/e2e/**`, `prisma/seed-e2e-test-user.ts`,
`prisma/e2e-test-accounts.ts`, `playwright.config.ts`, `vitest.config.ts`),
a presentation-layer component consuming existing props/data
(`components/ui/*`, `components/shared/bottom-nav.tsx`,
`components/shared/data-table/*`, `components/shared/
scroll-affordance-container.tsx`, `features/calendar/components/
day-detail-sheet.tsx`, `day-entry-indicators.tsx`), or a layout-composition
change (`(dashboard)/layout.tsx`, `dashboard-shell.tsx`). This independently
confirms the architecture doc's own §8 claim ("no new entry is required —
this phase introduces zero new Server Actions, Route Handlers, or
Server-Component-direct-call read functions") rather than taking it on
faith.

---

## 3. `components/ui/` accessibility fixes and the UploadThing widget — no injection surface introduced

### 3.1 `Progress`'s new default `aria-label` — numeric-only, cannot carry injected content

`components/ui/progress.tsx`'s new default:

```ts
const clamped = Math.min(100, Math.max(0, value ?? 0))
// ...
aria-label={ariaLabel ?? `${Math.round(clamped)}% complete`}
```

`value` is clamped into `[0, 100]` and passed through `Math.round` before
ever reaching the template string — the computed default can only ever be
one of 101 fixed strings (`"0% complete"` through `"100% complete"`). There
is no code path by which an arbitrary/attacker-controlled string reaches
this `aria-label`: a caller who does supply their own `aria-label` overrides
the computed default entirely (an ordinary React prop, rendered as a plain
HTML attribute value, not `dangerouslySetInnerHTML` — React's default
escaping applies regardless of the string's content). Not an XSS or
injection surface.

### 3.2 `TabsTrigger`'s `hasAssociatedPanel` — controls only an internal ARIA attribute's presence, no information disclosure

`hasAssociatedPanel={false}` only changes whether an explicit
`aria-controls: undefined` key is spread into `TabsPrimitive.Trigger`'s
props, which causes React to omit the `aria-controls` attribute entirely
rather than render Radix's default (a dangling reference to a
`TabsContent` id that will never exist). This is strictly a *removal* of an
already-broken ARIA relationship — it introduces no new attribute, no new
data source, and no way to reference or leak any DOM structure that
wouldn't already be visible in the rendered page's own markup (`aria-
controls` values are not secret; they are ordinary, publicly-visible DOM
ids). No information-disclosure or DOM-structure-leak concern.

### 3.3 `avatar.tsx`/`badge.tsx`/`button.tsx`/`dropdown-menu.tsx`/`table.tsx` — contrast/focus fixes only, no behavioral or data-flow change

All five files' diffs are scoped to Tailwind class-string changes
(`text-muted-foreground` → `text-foreground`, `text-destructive` →
`text-red-700`/`dark:text-red-400`, and `table.tsx`'s new `tabIndex`
wrapper prop/default) plus explanatory comments. None introduces a new prop
that accepts a raw HTML string, a new `dangerouslySetInnerHTML` call (grepped
the full changed-file set for this phase — zero matches anywhere), a new
data fetch, or a new authorization-relevant code path. `table.tsx`'s new
`wrapperTabIndex` prop only toggles the wrapping `<div>`'s `tabIndex` between
`0` (default, keyboard-focusable, for real scrollable tables) and `-1` (for
`TableSkeleton`'s `aria-hidden` subtree) — a purely presentational/keyboard-
navigation concern with no security dimension.

### 3.4 `receipt-uploader.tsx`'s UploadThing `appearance` override — static Tailwind strings, no new upload/auth surface

The diff is confined to the `appearance.button`/`content.button` object
literals passed to `<UploadButton>` — fixed, hardcoded Tailwind class
strings and a fixed content-callback (`isUploading ? "Uploading..." :
"Attach receipt"`), neither of which incorporates any request-derived or
user-authored value. `endpoint`, `input={{ transactionId }}`, and the
`onClientUploadComplete`/`onUploadError` handlers are all unchanged by this
phase's diff (confirmed by `git diff f55cb7b..HEAD -- src/features/
transactions/components/receipt-uploader.tsx` — the changed lines are
exclusively inside `appearance`); the actual upload authorization/validation
boundary (`app/api/uploadthing/core.ts`'s `.middleware()`/file-type/size
constraints) is untouched by this phase and was not re-reviewed here as a
result — it is outside this phase's diff.

---

## 4. Admin route reachability — `BottomNav`/responsive changes confirmed not to touch it

Read `src/app/admin/layout.tsx` directly (unchanged by this phase's diff —
does not appear in `git diff --stat f55cb7b..HEAD`'s file list at all): its
`getCurrentAdminUser()` guard, `redirect("/")` on `null`, and its own
header/`AdminNav` chrome are byte-for-byte the same as Phase 4c's own
already-approved review found them.

`BottomNav` is mounted exactly once, inside `src/app/(dashboard)/
dashboard-shell.tsx` (itself only rendered from `(dashboard)/layout.tsx`) —
grepped every file under `src/app/admin/` for `BottomNav`/`bottom-nav`: zero
matches. `grep -rln "bottom-nav" src/` returns exactly three files
(`dashboard-shell.tsx`, `bottom-nav.tsx` itself, and `sidebar.tsx`'s
`isActivePath` export it imports) — none under `src/app/admin/`. Admin's
layout tree (`app/admin/`) is structurally separate from `(dashboard)/`
(confirmed sibling route groups, per both this phase's and Phase 4c's own
architecture docs) and never imports `dashboard-shell.tsx` or `BottomNav`
at all — this is true by construction (Admin's layout composes only its own
`header` + `AdminNav`), not an exclusion check that could be bypassed or
misconfigured. `BottomNav` itself (`components/shared/bottom-nav.tsx`)
contains no route-gating logic of its own — its four hardcoded items
(`/`, `/transactions`, `/budgeting`, `/bills`) are all ordinary,
already-non-admin-gated routes, and its "More" button only opens the
existing hamburger `Sheet`, which itself renders `<Sidebar mobile />` —
`Sidebar`'s own `NAV_SECTIONS` list (unchanged by this phase) has never
included any `/admin/*` entry.

**Conclusion: the architecture doc's stated intent ("Admin's own chrome...
has no bottom-nav equivalent and is not in scope for one") holds in the
actual shipped code, verified directly — no non-admin surface gained any
new route or UI reachability into `/admin/*`, and no admin-only UI/route
became reachable through the new responsive chrome.**

---

## 5. General OWASP sweep (scoped to this phase's actual diff)

- **Authentication:** no change to `src/lib/auth.ts`, `getCurrentUser()`, or
  `getCurrentAdminUser()` this phase. The new E2E suite's authentication is
  a real login through the existing form (§1.5) — zero new code path in the
  authentication mechanism itself.
- **Authorization:** no change to any admin-gate or per-user-scoping check
  this phase; `BottomNav`/responsive changes verified not to alter Admin
  route reachability (§4).
- **Rate limiting:** no new mutation/Server Action/Route Handler this phase
  (§2) — nothing new to rate-limit.
- **Secrets:** `E2E_TEST_USER_PASSWORD` is the only new secret this phase
  introduces, handled per the existing `.env`/`.env.example` convention
  (§1.1) — genuinely env-sourced, never committed.
- **CSRF:** no new Server Action or form-based mutation this phase; nothing
  new inherits or bypasses Next.js's existing Origin-header CSRF protection.
- **XSS:** no `dangerouslySetInnerHTML` in any file this phase touches
  (grepped, §3.3); `Progress`'s new `aria-label` default is numeric-only
  (§3.1); every other UI change is a static class-string/JSDoc change.
- **SQL Injection:** `prisma/seed-e2e-test-user.ts` uses Prisma's
  parameterized client exclusively (`findUnique`, `delete`, `create`,
  `findMany` — no `$queryRaw`/`$executeRaw` anywhere in the file); `email`
  values passed to Better Auth's `signUpEmail` are fixed, hardcoded
  constants (`E2E_TEST_EMAIL`/`E2E_TEST_ADMIN_EMAIL`), not attacker- or even
  request-controlled input.

---

## Summary of findings

| # | Severity | Area | Description | Status |
|---|---|---|---|---|
| 1 | Low / informational | `tests/e2e/support/fixture-ids.json` | A committed placeholder file with obviously-fake string values (`"placeholder-transaction-id"`, etc.), self-documented as such in its own `_comment` field, overwritten with real (non-sensitive, opaque) database ids by `npm run seed:e2e` at run time. Not a secret and not PII, but flagged for completeness since it is the one test-infrastructure file this phase commits real database-shaped identifiers into (as placeholders) rather than keeping entirely out of version control. | Not blocking; no action recommended. |

No High or Medium severity findings. The new Playwright/E2E test-credential
handling holds up under direct inspection: `E2E_TEST_USER_PASSWORD` is
genuinely env-var-sourced with a hard failure (never a fallback literal) at
every read site, no password literal exists anywhere in the diff, the
ordinary `e2e-test@lkbudget.dev` account is mechanically incapable of
holding `ADMIN` and no new admin-grant mechanism was introduced
(`scripts/grant-admin.ts` is byte-for-byte unchanged), `prisma/
seed-e2e-test-user.ts`'s production guard is a real, first-statement
`throw` (not a comment-only claim), the `storageState` session files are
confirmed gitignored and have never been committed at any point in this
repository's history, and the fixture-data seed script writes exclusively
to its own two isolated test accounts with no cross-user query pattern.
This phase introduces zero new Server Actions, Route Handlers, or
externally-reachable API surface (verified directly, not taken on the
architecture doc's claim). The accessibility structural fixes touching
`components/ui/` primitives and the UploadThing `appearance` override are
confirmed to be presentational/ARIA-only changes with no injection surface
or weakened security-relevant behavior. `BottomNav`/the responsive layout
changes are confirmed, by direct inspection of the actual shipped code, not
to alter Admin route/UI reachability for non-admin users.

**Recommendation: APPROVE for release.**
