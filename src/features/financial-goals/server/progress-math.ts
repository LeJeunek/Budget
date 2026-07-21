import type { AccountType } from "@prisma/client"

/**
 * PURE progress-calculation math for the Financial Goals feature, per
 * docs/product/financial-goals.md's Type 1/2/3 formulas and
 * docs/architecture/api-contracts.md's `FinancialGoalWithProgress` field
 * docs. No Prisma query, no `lib/db.ts`/`lib/auth.ts` import — every function
 * here is a plain, side-effect-free function of its arguments, fully
 * unit-testable with fixture data, the same testability bar
 * `features/debt/payoff-math.ts` and
 * `features/analytics/server/subscription-detection.ts` both established.
 * `server/service.ts` is this file's only caller: it fetches the live source
 * data (Debt, Net Worth, Monthly Summary) and hands plain numbers to these
 * functions rather than duplicating any of this math inline.
 */

// ---------------------------------------------------------------------------
// Type 1 — Debt Payoff
// ---------------------------------------------------------------------------

/**
 * `(startingBalance - currentEffectiveBalance) / startingBalance`, expressed
 * as a 0-100 percentage (financial-goals.md's own wording: "expressed as a
 * percentage"), clamped to `[0, 100]`.
 *
 * The floor handles the "linked Debt's balance increases after the goal was
 * created" edge case (e.g. new credit card charges): progress never goes
 * negative — shown as 0% with a plain note, per the spec, rather than a
 * negative percentage. The ceiling is a defensive bound for the case of the
 * debt being overpaid past $0 (`currentEffectiveBalance` negative) — once a
 * debt is fully paid off, `isDebtPayoffComplete` below is the field that
 * actually matters; a percentage beyond 100 would only ever be a meaningless
 * artifact at that point.
 *
 * `startingBalance <= 0` is defensive only: `createFinancialGoal` rejects
 * linking to a Debt that's already Paid Off at creation time
 * (financial-goals.md's own "select one of their existing, active ... not
 * already Paid Off" requirement), so a real `FinancialGoal` row should never
 * reach this function with a non-positive `startingBalance`. Treated as
 * "already complete" (100%) rather than a division-by-zero/NaN if it ever
 * does.
 */
export function computeDebtPayoffPercent(
  startingBalance: number,
  currentEffectiveBalance: number,
): number {
  if (startingBalance <= 0) {
    return 100
  }

  const rawPercent =
    ((startingBalance - currentEffectiveBalance) / startingBalance) * 100

  return Math.min(Math.max(rawPercent, 0), 100)
}

/**
 * Type 1's completion rule (financial-goals.md: "automatically marked
 * Completed the moment the linked Debt's balance reaches $0 ... mirroring
 * Debt Tracker's own auto-Paid-Off detection"). `<= 0` (not `=== 0`) matches
 * `DebtWithProjection.isPaidOff`'s own convention exactly
 * (`features/debt/server/service.ts`), so an overpaid debt is also
 * considered fully paid off here.
 */
export function isDebtPayoffComplete(currentEffectiveBalance: number): boolean {
  return currentEffectiveBalance <= 0
}

// ---------------------------------------------------------------------------
// Type 2 — Net Worth / Savings Target
// ---------------------------------------------------------------------------

/**
 * Type 2's distance-to-target and completion rule, combined into one
 * function since both are trivial, always-computed-together derivations of
 * the same two inputs (financial-goals.md: "current measured value ...
 * against the target amount" / "automatically marked Completed once the
 * measured value meets or exceeds the target").
 *
 * `distanceToTarget` is never clamped — a deeply negative
 * `currentMeasuredValue` (the Edge Cases' own example) produces a large
 * positive distance, shown plainly, per the Dashboard's "never hide a
 * negative number" convention this spec explicitly follows.
 */
export function computeNetWorthTargetProgress(
  currentMeasuredValue: number,
  targetAmount: number,
): { distanceToTarget: number; isCompleted: boolean } {
  return {
    distanceToTarget: targetAmount - currentMeasuredValue,
    isCompleted: currentMeasuredValue >= targetAmount,
  }
}

/**
 * Type 2's `ACCOUNT_SUBSET` measurement basis: the live, sign-adjusted sum of
 * a user-selected Account subset, applying the exact same `CREDIT_CARD`
 * sign-adjustment convention `dashboard.service.getNetWorth` already inlines
 * for its own Account sum (api-contracts.md's Phase 3b note: "the
 * sign-adjustment (`CREDIT_CARD` balances subtracted) is applied by the
 * caller, matching the existing convention already inlined in
 * `dashboard.service.getNetWorth`").
 *
 * `accounts` is expected pre-filtered by `server/service.ts` to exactly the
 * goal's own subset — this function does not re-verify ownership/archival
 * state, both of which are that caller's responsibility (the join table
 * itself, plus `accounts.service.getAccounts`'s own non-archived-by-default
 * read).
 */
export function sumAccountSubsetBalances(
  accounts: { type: AccountType; balance: number }[],
): number {
  return accounts.reduce(
    (sum, account) =>
      sum + (account.type === "CREDIT_CARD" ? -account.balance : account.balance),
    0,
  )
}

// ---------------------------------------------------------------------------
// Type 3 — Savings Rate Target
// ---------------------------------------------------------------------------

/**
 * Type 3's rolling-average calculation (financial-goals.md: "evaluates a
 * rolling 3-month average of that same underlying calculation rather than
 * the latest single month" — the Product Owner's own stated design, "to
 * smooth month-to-month noise").
 *
 * `monthlyRates` is each qualifying month's
 * `dashboard.service.getMonthlySummary(...).savingsRate` value, in the same
 * fraction scale that function already returns (e.g. `0.14` for 14%,
 * matching `dashboard/server/service.ts`'s `computeSavingsRate` convention)
 * — `null` entries (a $0-income month, per that function's own "not enough
 * data" sentinel) are excluded from the average entirely rather than counted
 * as `0`, per the spec's own explicit "a month with $0 income ... is
 * excluded from the average rather than counted as 0%" rule.
 *
 * Returns `null` (financial-goals.md's "not enough data yet" state) when
 * every month in the window was excluded this way — including the trivial
 * case of an empty `monthlyRates` array. The separate "fewer than 3
 * qualifying months since signup" case (the account itself isn't 3 calendar
 * months old yet) is filtered out by `server/service.ts` *before* this
 * function is ever called — see that module's
 * `computeCurrentRollingSavingsRatePercent` JSDoc.
 */
export function computeRollingSavingsRateAverage(
  monthlyRates: Array<number | null>,
): number | null {
  const qualifyingRates = monthlyRates.filter(
    (rate): rate is number => rate !== null,
  )

  if (qualifyingRates.length === 0) {
    return null
  }

  const sum = qualifyingRates.reduce((total, rate) => total + rate, 0)
  return sum / qualifyingRates.length
}

/**
 * Type 3's completion rule (financial-goals.md: "automatically marked
 * Completed once the rolling 3-month average meets or exceeds the target").
 *
 * Both arguments must already be on the same 0-100 scale —
 * `server/service.ts` converts `computeRollingSavingsRateAverage`'s
 * fraction-scale result to a percentage before calling this, matching
 * `FinancialGoal.targetPercent`'s own stored 0-100 convention. `null`
 * ("not enough data") is never completed, regardless of `targetPercent`.
 */
export function isSavingsRateTargetComplete(
  rollingAverageRatePercent: number | null,
  targetPercent: number,
): boolean {
  return (
    rollingAverageRatePercent !== null &&
    rollingAverageRatePercent >= targetPercent
  )
}
