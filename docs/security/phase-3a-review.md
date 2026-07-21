# Security Review — Phase 3a (Debt Tracker, Investments, Recurring Income, Net Worth Snapshot)

**Reviewer:** Security Architect
**Scope:** Backend server-side code only (service/actions/validation layers, the pure calculation
files, the cron route, and the shared cross-domain guard). Frontend rendering code was not in
scope for this pass beyond a targeted grep for obvious XSS sinks.

**Files inspected:**
- `src/features/debt/server/service.ts`, `actions.ts`, `validation.ts`, `src/features/debt/payoff-math.ts`
- `src/features/investments/server/service.ts`, `actions.ts`, `validation.ts`
- `src/features/recurring-income/server/service.ts`, `actions.ts`, `validation.ts`, `occurrence.ts`
- `src/features/dashboard/server/snapshot.ts`, `src/app/api/cron/net-worth-snapshot/route.ts`
- `src/lib/transaction-link-guard.ts`, `src/lib/recurrence.ts`
- `src/features/accounts/server/service.ts` (`setDerivedBalance`, read for context)
- `src/features/dashboard/server/service.ts` (`getNetWorth`, read for context)
- `src/app/api/investments/route.ts` (read for context)
- `prisma/schema.prisma` (relevant models, read for context)

## Overall recommendation: **PASS**

I did not find an exploitable authorization or injection vulnerability in this phase's code. Every
mutating Server Action authenticates via `getCurrentUser()` and fails closed, and every
read/write query I traced scopes by `userId` (or is transitively scoped through a row that was
already ownership-checked). The one new non-session-authenticated write path (the cron route) is
correctly fail-closed. Findings below are hardening/defense-in-depth recommendations only — none
of them are blocking in my assessment.

---

## Findings

### 1. (Low / Hardening) Cron secret compared with `!==`, not a timing-safe comparison
**File:** `src/app/api/cron/net-worth-snapshot/route.ts` (line 42)

```ts
if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
```

A plain string `!==` comparison is not constant-time, which in theory allows a timing side-channel
to leak how many leading characters of a guessed secret are correct. In practice this is a
low-severity, low-likelihood concern here: there's no per-attempt rate limiting either (see #2),
but the secret is expected to be a long, high-entropy random value provisioned by DevOps, not a
user-chosen password, so brute-forcing it byte-by-byte via network timing is impractical over the
jitter of a real HTTP round trip. Recommend `crypto.timingSafeEqual` (with a length check first,
since it throws on mismatched buffer lengths) as a low-cost hardening improvement, not a blocking
fix.

### 2. (Low / Hardening) No rate limiting on the cron route (or anywhere else in the app)
**File:** `src/app/api/cron/net-worth-snapshot/route.ts`

There is no rate limiting or lockout on repeated failed `Authorization: Bearer` attempts against
this route. This is consistent with the rest of the codebase (no rate limiting exists anywhere yet
per my grep — this is a pre-existing, app-wide gap, not something newly introduced by Phase 3a).
Flagging it here because this route is the first non-session-authenticated write endpoint, so an
unlimited guessing budget is a slightly more attractive target than a login form protected by
Better Auth's own defaults. Recommend a general rate-limiting pass (e.g. at the edge/middleware
level) be tracked as a cross-cutting follow-up rather than a Phase 3a blocker, since it isn't
specific to this phase's feature set.

### 3. (Informational) `CRON_SECRET` absence correctly fails closed
**File:** `src/app/api/cron/net-worth-snapshot/route.ts` (lines 42-44)

Verified: an unconfigured `CRON_SECRET` env var returns the same 401 as a wrong secret, and the
data-fetching call (`captureAllUsersNetWorthSnapshots()`) only happens after the check. No
timing/branch difference leaks "secret not configured" vs. "wrong secret" to the caller. This is
exactly the fail-closed behavior it should have — no action needed, noted for the record since the
task explicitly asked me to verify it.

### 4. (Informational) Ownership checks are correctly applied everywhere I checked
Specifically verified, per the task's numbered concerns:

- **Debt-to-Account linking (`linkDebtToAccount`)**: verifies the Debt belongs to `user.id`
  *and* the Account belongs to `user.id` as two separate `findFirst` ownership checks before
  writing the link (`src/features/debt/server/actions.ts` lines 237-259). The one query that is
  *not* userId-scoped — the "is this account already linked to a different debt" check
  (`db.debt.findFirst({ where: { accountId } })`, line 256) — is safe by construction: `accountId`
  has already been confirmed to belong to the caller in the preceding query, and `Debt.accountId`
  is `@unique` in the schema, so any row it could find was necessarily created by a prior link
  action that itself required ownership of both sides. This is not a leak, just worth documenting
  why the omission is safe.
- **Investments derived-balance write-back**: `createHolding`/`updateHolding`/`closeHolding` all
  resolve `accountId` either from a freshly-created Account (owned by construction) or from a
  `findFirst({ id, userId })`-scoped lookup before ever calling
  `recalculateContainerBalance`/`setDerivedBalance`. `setDerivedBalance` itself
  (`src/features/accounts/server/service.ts`) adds a second layer of defense by using
  `where: { id: accountId, userId }` in its own `update` call, so even a hypothetical future caller
  that skipped the ownership check would fail with Prisma's not-found error rather than writing to
  another user's Account. No path exists for a crafted `accountId` to write an arbitrary balance
  onto another user's Account.
- **`transaction-link-guard.ts`**: all three cross-table lookups (`billOccurrence`,
  `incomeOccurrence`, `irregularIncomeEvent`) are scoped by `{ transactionId, userId }`, not just
  `transactionId`. Since `transactionId` itself is only ever reachable here after the caller
  already verified the Transaction belongs to `user.id`, this scoping is correctly defense-in-depth
  rather than the primary control — but it is present and correct, so a different user's link
  state can never be observed or leaked through this path.
- **Every other `service.ts`/`actions.ts` function reviewed** (Debt, Investments, Recurring
  Income) takes an id from client input and either scopes the initial lookup by
  `{ id, userId: user.id }` or derives the id from a row that was already so scoped. I did not find
  a function that trusts a client-supplied id without an ownership check somewhere in its call
  path.

### 5. (Informational) Numeric bounds on financial inputs are reasonable; amortization loop is safety-capped
`payoff-math.ts`'s `computeAmortization`/`simulateWithExtraPayment` both cap iteration at
`MAX_SIMULATION_MONTHS = 1200`. I checked the pathological case explicitly: a debt with
`interestRate: 0` (allowed — validation's `MIN_INTEREST_RATE` is 0) and the schema's maximum
`balance` (~$1 trillion) paired with the schema's minimum `minimumPayment` (any value `> 0`, e.g.
$0.01) would, without the cap, require an astronomically large number of iterations to reach zero.
The `while (remaining > EPSILON && months < MAX_SIMULATION_MONTHS)` guard means this instead
terminates in exactly 1200 cheap iterations and reports `isNegativeAmortization: true` via the
safety-backstop branch — not a true infinite loop or meaningful DoS vector. This function is also
not directly exposed to arbitrary attacker-controlled batch sizes: it's called either server-side
against one user's own bounded debt list, or client-side (per its own documented isomorphic
design) against data the client already fetched for the signed-in user. No action needed.

Validation ranges (`MAX_INTEREST_RATE = 100`, `MAX_DECIMAL_ABS`/`MAX_AMOUNT_ABS` matching each
column's `Decimal(14,2)`/`Decimal(5,2)` precision, `.gt(0)`/`.min(0)` sign constraints matched to
each field's real-world meaning) are consistent and appropriately bound the DB write path against
Decimal-column overflow. No negative balances/rates/payments can reach the database where the
product doesn't call for them.

### 6. (Informational) No SQL injection or XSS surface found
No `$queryRaw`/`$executeRaw` usage anywhere under `src/features` — every query goes through
Prisma's parameterized query builder. No `dangerouslySetInnerHTML`, `eval(`, or `new Function(`
in the Debt/Investments/Recurring Income feature directories.

### 7. (Informational) CSRF
All mutations go through Next.js Server Actions (`"use server"`), which get the framework's
built-in Origin-header same-origin enforcement for POST-based Server Action invocations — this is
an existing, already-accepted app-wide control, not something Phase 3a needs to add anything for.
The one new Route Handler (the cron POST) is deliberately not session/cookie-authenticated at all
(shared-secret only), so CSRF (which relies on ambient browser credentials) does not apply to it.

---

## Summary

| # | Finding | Severity | Blocking? |
|---|---|---|---|
| 1 | Cron secret compared with `!==` instead of timing-safe compare | Low | No |
| 2 | No rate limiting on cron route (or app-wide) | Low | No |
| 3 | `CRON_SECRET` absence fails closed | Informational (verified correct) | N/A |
| 4 | Ownership/authorization checks verified correct across Debt/Investments/Recurring Income/link-guard | Informational (verified correct) | N/A |
| 5 | Financial input bounds + amortization loop cap verified safe against overflow/DoS | Informational (verified correct) | N/A |
| 6 | No SQL injection / XSS surface found | Informational (verified correct) | N/A |
| 7 | CSRF handled by existing Server Action framework behavior | Informational (verified correct) | N/A |

**Gate recommendation: PASS.** Items 1 and 2 are recommended as low-priority hardening follow-ups
(the timing-safe compare is a one-line change worth picking up opportunistically; the rate-limiting
gap is app-wide and better tracked as its own cross-cutting item than solved piecemeal per route).
Neither is a real, exploitable vulnerability in this codebase's actual deployment shape, and
neither should block Phase 3b from starting.
