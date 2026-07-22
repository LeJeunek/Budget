# Phase 3b Security Review — Net Worth History, Analytics Suite, Financial Goals

**Reviewer:** Security Architect
**Scope:** `src/features/dashboard/server/net-worth-history.ts`,
`src/app/api/dashboard/net-worth-history/route.ts`,
`src/features/analytics/server/*.ts`,
`src/features/financial-goals/server/*.ts`,
`src/lib/merchant-normalization.ts`, plus their direct call chains
(`features/accounts/server/service.ts#getAccounts`,
`features/debt/server/service.ts#getDebtById`, `prisma/schema.prisma`).

**Recommendation: PASS**

No High or Critical findings. Two Low/Informational notes below, neither of
which blocks this phase gate — both are pre-existing, platform-wide
characteristics of the codebase, not regressions introduced by Phase 3b.

---

## Findings

### 1. Financial Goals — ACCOUNT_SUBSET / linkedDebtId ownership (checked, no issue)

**Risk Level: None (verified correct)**

- `createNetWorthSavingsTargetGoal` (`financial-goals/server/actions.ts:127-168`)
  validates every supplied `accountId` against `getAccounts(userId)` (which
  itself filters `where: { userId }`, `accounts/server/service.ts:39-49`)
  before creating any `FinancialGoalAccount` row. A supplied id belonging to
  another user is rejected with `"One or more selected accounts could not be
  found"` — it is never distinguished from "doesn't exist," preventing
  enumeration.
- `updateFinancialGoal`'s account-subset branch (`actions.ts:308-322`)
  re-runs the identical ownership check on every update, not just at
  creation — a later attempt to swap in another user's account id is
  rejected the same way.
- `createDebtPayoffGoal` (`actions.ts:77-114`) resolves `linkedDebtId` via
  `getDebtById(userId, data.linkedDebtId)` (`debt/server/service.ts:127-137`,
  itself scoped `where: { id, userId }`), so a goal can never be created
  against another user's Debt; a foreign or nonexistent id both resolve to
  `"Debt not found"`.
- Defense in depth on the read path: `computeProgressForGoal`'s
  `ACCOUNT_SUBSET` branch (`service.ts:422-428`) looks up each `accountId`
  in `context.accountsById`, itself built only from that same
  `getAccounts(userId)` call — even if a foreign account id ever ended up
  in the join table via some other bug, it would silently drop out of the
  balance sum rather than leak another user's account balance.

Both of the task's flagged hypotheticals (a cross-user `Account` id in an
`ACCOUNT_SUBSET`, a cross-user `Debt` id via `linkedDebtId`) are correctly
blocked at write time and are additionally inert at read time.

### 2. Subscription dismissal — upsert scoping (checked, no issue)

**Risk Level: None (verified correct)**

`dismissSubscriptionCandidate` (`analytics/server/actions.ts:36-55`) upserts
via the compound key `userId_normalizedMerchantName`, which matches
`DismissedSubscriptionMerchant`'s `@@unique([userId, normalizedMerchantName])`
constraint (`prisma/schema.prisma:1131`) exactly, and both the `where` and
`create` payload include `user.id` from `getCurrentUser()` — a client can
only ever affect its own dismissal row, regardless of what
`normalizedMerchantName` string it supplies (that field only controls
which of *that user's own* rows is touched, never whose row).

### 3. Analytics Route Handler surface (checked, no issue)

**Risk Level: None (verified correct)**

The only new Route Handler introduced anywhere in this phase is
`GET /api/dashboard/net-worth-history` — confirmed by `git log --oneline
-- src/app/api/` (no other route added in the Phase 3b commit). It checks
`getCurrentUser()` and returns 401 before any query. Every Analytics metric
is a Server-Component-direct call from `app/(dashboard)/analytics/page.tsx`,
which itself calls `getCurrentUser()` and redirects to `/login` when absent,
matching the Solution Architect's intended "no client-refetchable Analytics
endpoint" design. No client-exposed endpoint skips auth.

### 4. Merchant normalization — regex DoS risk (checked, no issue)

**Risk Level: None (verified correct)**

`normalizeMerchantName` (`lib/merchant-normalization.ts`) uses only three
regexes, all anchored or single-character-class, none with nested/overlapping
quantifiers capable of catastrophic backtracking:
- `/\.(com|net|org|io|co)$/i` — anchored at the end, alternation of fixed
  literals, linear-time.
- `/[.,*#]/g` — single-character-class, linear-time.
- `/\s+/g` — single-character-class repetition, linear-time.

Each transaction's `merchant` string is bounded by realistic bank-import
field lengths (this function is called once per already-fetched
transaction row, not on attacker-supplied unbounded input), so there is no
practical amplification vector even though this runs across a user's full
transaction history for Top Merchants / Subscription Detection.

### 5. Net Worth History "All Time" range query (checked, no issue)

**Risk Level: None (verified correct)**

The `?range=` param is validated by `NetWorthHistoryRangeSchema`
(`z.enum(["30d","90d","1y","all"])`) — no free-form value reaches the
query, and no injection surface exists since every query goes through
Prisma's typed query builder (no `$queryRaw`/`$executeRaw` anywhere in this
phase's files, confirmed by search). For `"all"`, `resolveRangeStart`
returns `null`, so the query has no lower bound, but the row count is
naturally bounded by one row per day since that user's account existed
(the existing `NetWorthSnapshot` idempotent-per-day cron job, Phase 3a) —
"thousands, not millions" per Architecture.md, not attacker-influenceable.
`thinRows` then caps the *returned* payload at ~120 points regardless of
how many rows were fetched. There is no page-size-like parameter exposed
to the client that could inflate the underlying `findMany`; thinning is
applied server-side after a bounded fetch, not client-controlled.

### 6. No application-level rate limiting on mutating endpoints

**Risk Level: Low / Informational — pre-existing, not a Phase 3b regression**

**Affected files:** `src/features/analytics/server/actions.ts`
(`dismissSubscriptionCandidate`), `src/features/financial-goals/server/actions.ts`
(`createFinancialGoal`, `updateFinancialGoal`, `archiveFinancialGoal`,
`unarchiveFinancialGoal`), and in fact every Server Action/Route Handler in
the codebase — confirmed no rate-limiting middleware or per-route throttle
exists anywhere in `src/` (`middleware.ts` does not exist; no
rate-limit-related code found by search).

This is a standing, application-wide gap that predates Phase 3b and applies
equally to every prior phase's mutations (Accounts, Transactions, Bills,
Goals, Debt, Investments) — not something introduced or worsened by this
phase's code. Flagging for the roadmap's general backlog, not as a
Phase-3b-specific blocker.

**Recommended fix (not implemented, per role scope):** introduce a shared
rate-limiting layer (e.g. an IP/user-keyed token bucket at the edge/
middleware level, or a per-Server-Action wrapper) as its own
cross-cutting initiative, rather than bolted onto this phase's files
individually.

### 7. CSRF / secrets / authorization — baseline checks

**Risk Level: None (verified correct)**

- CSRF: all mutations are Next.js Server Actions (`"use server"`), which
  carry Next's built-in same-origin enforcement, plus the one Route Handler
  is a `GET` (no state change) gated on session auth — no state-changing
  `GET`/unprotected form-post surface introduced.
- Secrets: no hardcoded credentials, API keys, or connection strings in any
  reviewed file; `db`/`getCurrentUser` are the only imports touching
  configuration, both from existing shared `lib/` modules.
- Authorization: every server function across all three features takes a
  pre-resolved `userId`/calls `getCurrentUser()` at its own boundary
  (Server Action or Route Handler) and scopes every Prisma call by it —
  confirmed individually across `net-worth-history.ts`, all eleven
  `analytics/server/*.ts` files, and all five
  `financial-goals/server/*.ts` files. No function trusts a client-supplied
  user id.

---

## Summary Table

| # | Area | Risk Level | Status |
|---|------|-----------|--------|
| 1 | Financial Goals cross-user Account/Debt id in ACCOUNT_SUBSET / linkedDebtId | None | Verified correct |
| 2 | Subscription dismissal upsert scoping | None | Verified correct |
| 3 | Analytics Route Handler surface / accidental client-exposed endpoint | None | Verified correct |
| 4 | Merchant normalization regex DoS | None | Verified correct |
| 5 | Net Worth History "All Time" range query bound | None | Verified correct |
| 6 | No app-level rate limiting on mutating endpoints | Low / Informational | Pre-existing, all phases — not a 3b regression |
| 7 | CSRF / Secrets / Authorization baseline | None | Verified correct |

## Phase Gate Recommendation

**PASS.**

Every standing rule ("every server query must scope by `getCurrentUser().id`")
holds across all reviewed files, including the two specific cross-user
reference scenarios called out for this gate (Financial Goals'
`ACCOUNT_SUBSET` and `linkedDebtId`). The one gap found (#6, missing
rate-limiting) is a pre-existing, codebase-wide condition unrelated to this
phase's own changes and does not warrant blocking v1's final phase on its
own; it belongs on the general roadmap backlog as a cross-cutting follow-up.
