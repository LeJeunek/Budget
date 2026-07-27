import type { AccountType, Prisma } from "@prisma/client"

/**
 * Account Balance Auto-Adjustment (docs/product/accounts-balance-auto-adjustment.md).
 *
 * WHY this module exists: `Account.balance` is a stored, manually-entered
 * column (prisma/schema.prisma) that historically was never touched by
 * Transactions — logging a $1,000 paycheck never moved the account's
 * balance. This module is the single, shared implementation of "how a
 * transaction's signed `amount` maps to a change in `Account.balance,`" used
 * by every mutation path that creates/edits/deletes/splits a `Transaction`
 * row (`server/actions.ts`) and by CSV import (`server/import.ts`). Kept as
 * one pure/testable module rather than inlined per call site so the single
 * highest-risk detail in the spec — the Credit Card sign inversion — has
 * exactly one implementation to get right and one place to unit-test it.
 *
 * Design principles (see the spec's own "Concurrent edits" edge case and
 * Criterion 1's atomicity requirement):
 *   - Every DB write in this module is a Prisma `{ increment }` (or
 *     `{ decrement }`-equivalent negative increment) against the CURRENT
 *     stored value, never a client-computed absolute replacement value.
 *     This is what makes two near-simultaneous adjustments against the same
 *     account both land correctly — Postgres, not this code, is what
 *     guarantees the row-level atomicity of an `UPDATE ... SET balance =
 *     balance + $1`-shaped statement.
 *   - Every exported DB-writing function takes a Prisma
 *     `Prisma.TransactionClient` (`tx`), never the top-level `db` singleton
 *     — callers are required to run it inside the SAME `$transaction` as the
 *     `Transaction` row's own create/update/delete, per Criterion 1's "both
 *     succeed or both fail together."
 *   - All money math is done in integer cents internally (mirrors
 *     `server/actions.ts`'s existing `splitTransaction` precedent) to avoid
 *     floating-point drift when many transactions' effects are summed
 *     together (CSV import's aggregate path, the split-parent-reversal
 *     exact-equality property).
 */

// ---------------------------------------------------------------------------
// Scope guard (Criterion 6)
// ---------------------------------------------------------------------------

/**
 * The account types this feature is allowed to ever adjust the balance of.
 * Investment/Retirement/Crypto accounts are deliberately excluded — their
 * balance is exclusively derived/written by
 * `features/accounts/server/service.ts`'s `setDerivedBalance`/
 * `recalculateContainerBalance` (Investments' own write path). Gated on
 * account TYPE, never on "does it currently have active holdings" (per the
 * spec's explicit warning: a container with zero active holdings must not
 * briefly become writable by this mechanism).
 */
const BALANCE_ADJUSTABLE_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "CHECKING",
  "SAVINGS",
  "CASH",
  "CREDIT_CARD",
])

/**
 * Whether this mechanism is ever allowed to touch `accountType`'s balance.
 * Every DB-writing function below calls this before issuing any Prisma
 * write — see `applyBalanceDelta`'s guard, which is what the
 * Investment/Retirement/Crypto regression test in
 * `balance-adjustment.test.ts` asserts against directly.
 */
export function isBalanceAdjustableAccountType(accountType: AccountType): boolean {
  return BALANCE_ADJUSTABLE_ACCOUNT_TYPES.has(accountType)
}

// ---------------------------------------------------------------------------
// Sign convention (docs' "Sign Convention" section) — pure, cents-based math
// ---------------------------------------------------------------------------

/** Converts a dollar amount (at most 2 decimal places, per
 * `server/validation.ts`'s `amountSchema`) to an exact integer cents value —
 * the same `Math.round(value * 100)` technique already used by
 * `server/actions.ts`'s `splitTransaction`. */
function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Converts an integer cents value back to a dollar `number`. */
function fromCents(cents: number): number {
  return cents / 100
}

/**
 * The core sign-convention mapping, in integer cents: given a transaction's
 * signed `amount` (positive = money in, negative = money out, per
 * docs/product/transactions.md — unchanged by this feature) and the account
 * it's logged against, returns the resulting change to `Account.balance`,
 * in cents.
 *
 * Deliberately an explicit `switch` over every `AccountType` enum value
 * (prisma/schema.prisma) rather than an `if`/`else` with a fallthrough
 * default — the spec calls this out as the single highest-risk detail in
 * the feature ("Backend Engineer must treat Credit Card as its own explicit
 * branch, not a default case"): a `default: return amountCents` would
 * silently move every Credit Card balance in the wrong direction, and a
 * `default: return 0` would silently make it a no-op instead of failing
 * loudly. TypeScript's exhaustiveness checking on this switch (every
 * `AccountType` member has its own case) means adding a new enum value in
 * the future without also updating this function is a compile error, not a
 * silent gap.
 *
 * Investment/Retirement/Crypto branches return 0 as a defensive fallback
 * only — the real gate is `isBalanceAdjustableAccountType`, checked by every
 * DB-writing function below before this is ever reached in practice.
 */
function computeBalanceDeltaCents(accountType: AccountType, amountCents: number): number {
  switch (accountType) {
    case "CHECKING":
    case "SAVINGS":
    case "CASH":
      // Asset accounts: balance adjustment equals the transaction amount,
      // unchanged in sign (a $1,000 paycheck: amount=+1000, balance +1000).
      return amountCents
    case "CREDIT_CARD":
      // Liability account: balance adjustment is the INVERSE of the
      // transaction amount (a $50 purchase: amount=-50, balance +50 debt
      // owed; a $200 payment: amount=+200, balance -200 debt owed).
      return -amountCents
    case "INVESTMENT":
    case "RETIREMENT":
    case "CRYPTO":
      // Out of scope entirely (Criterion 6) — never reached in practice,
      // see this function's JSDoc.
      return 0
  }
}

/**
 * Dollar-denominated wrapper around `computeBalanceDeltaCents` — the
 * function every other export in this module is built from. Exported
 * primarily for direct unit testing of the sign convention in isolation
 * (no Prisma/DB involved).
 */
export function computeBalanceDeltaForAmount(
  accountType: AccountType,
  amount: number,
): number {
  return fromCents(computeBalanceDeltaCents(accountType, toCents(amount)))
}

/**
 * The combined effect of an entire batch of transaction amounts against one
 * account, computed in a single pass (summed in cents, converted back to
 * dollars once at the end — never per-amount float arithmetic accumulated
 * across a large batch).
 *
 * This is what makes CSV import's aggregate-update optimization (Criterion
 * 5: "free to apply the whole import's net effect as a single aggregate
 * balance update ... provided the net result is identical to summing every
 * valid row's individual effect") provably correct rather than merely
 * convenient: because `computeBalanceDeltaCents` is linear in its `amount`
 * argument (multiplication by a constant +1 or -1 per account type), summing
 * each row's individual signed effect and computing one effect for the
 * row's total are mathematically identical for any account type — see
 * `balance-adjustment.test.ts`'s exact-equality assertion.
 */
export function computeAggregateBalanceDelta(
  accountType: AccountType,
  amounts: readonly number[],
): number {
  const totalCents = amounts.reduce(
    (sum, amount) => sum + computeBalanceDeltaCents(accountType, toCents(amount)),
    0,
  )
  return fromCents(totalCents)
}

// ---------------------------------------------------------------------------
// DB writes — always atomic increments against the current stored value
// ---------------------------------------------------------------------------

/**
 * Applies a pre-computed balance delta (dollars, may be negative) to one
 * account, as a single atomic Prisma `{ increment }` update. This is the one
 * function in this module that actually touches the database — every other
 * "adjust"/"reverse" helper below is a thin wrapper that computes a delta
 * and calls this.
 *
 * Guards (Criterion 6) are checked here, not just by callers, so that even a
 * future call site that forgets to pre-filter by account type cannot write
 * to an Investment/Retirement/Crypto account's balance — this is the
 * function `balance-adjustment.test.ts`'s regression test asserts against
 * directly (a fake `tx` whose `account.update` is a spy that must never be
 * called for an out-of-scope account type).
 *
 * `where: { id: accountId, userId }` mirrors
 * `features/accounts/server/service.ts`'s `setDerivedBalance` — combining
 * the unique `id` with a non-unique ownership filter fails closed (Prisma's
 * P2025 "record not found") rather than silently adjusting a mismatched
 * user's row.
 *
 * A zero delta is a no-op (no DB round-trip) — harmless either way, but
 * avoids an unnecessary write when, e.g., an edit's reversal and
 * reapplication happen to cancel out exactly.
 */
export async function applyBalanceDelta(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
  accountType: AccountType,
  deltaDollars: number,
): Promise<void> {
  if (!isBalanceAdjustableAccountType(accountType)) {
    return
  }
  if (deltaDollars === 0) {
    return
  }

  await tx.account.update({
    where: { id: accountId, userId },
    data: { balance: { increment: deltaDollars } },
  })
}

/**
 * Applies ONE transaction's own signed `amount` to its account's balance,
 * using that account's own sign rule (Criterion 1: create; also the "apply
 * the new effect" half of Criterion 2: edit; also each split child's own
 * effect, Criterion 4).
 */
export async function adjustBalanceForTransactionAmount(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
  accountType: AccountType,
  amount: number,
): Promise<void> {
  const delta = computeBalanceDeltaForAmount(accountType, amount)
  await applyBalanceDelta(tx, userId, accountId, accountType, delta)
}

/**
 * Reverses ONE transaction's previously-applied effect (Criterion 2's "undo
 * the old effect" half; Criterion 3: delete; Criterion 4: the split parent's
 * original create-time effect).
 *
 * Implemented as `adjustBalanceForTransactionAmount` called with the
 * amount's sign flipped, rather than a second copy of the sign-convention
 * switch — negating the input to a linear function and negating its output
 * are equivalent, so "reverse the effect of amount X" and "apply the effect
 * of amount -X" are the exact same operation. This is what guarantees
 * reversal always exactly undoes the original effect: there is only one
 * sign-convention implementation in this entire module, `-amount` is just
 * ordinary arithmetic on plain numbers with no separate rule to keep in
 * sync.
 */
export async function reverseBalanceForTransactionAmount(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
  accountType: AccountType,
  amount: number,
): Promise<void> {
  await adjustBalanceForTransactionAmount(tx, userId, accountId, accountType, -amount)
}

/**
 * Applies a whole batch of amounts against ONE shared account as a single
 * atomic increment (Criterion 5: CSV import's aggregate-update allowance;
 * also used by `server/actions.ts`'s `splitTransaction` to apply every
 * split child's combined effect in one write, since split children always
 * share the parent's `accountId`).
 *
 * Deliberately takes the raw `amounts` array and computes the aggregate
 * delta itself (via `computeAggregateBalanceDelta`), rather than accepting
 * a pre-summed number — keeps "how the aggregate is computed" and "how it's
 * written" each a single-responsibility step, and keeps the exact-equality
 * property (aggregate vs. per-row sum) testable against this module's own
 * public function rather than something each caller re-derives.
 */
export async function applyAggregateBalanceDelta(
  tx: Prisma.TransactionClient,
  userId: string,
  accountId: string,
  accountType: AccountType,
  amounts: readonly number[],
): Promise<void> {
  const delta = computeAggregateBalanceDelta(accountType, amounts)
  await applyBalanceDelta(tx, userId, accountId, accountType, delta)
}
