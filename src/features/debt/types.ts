import type { Debt as PrismaDebt, DebtType } from "@prisma/client"

// Re-export the Prisma-generated enum so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — Prisma stays an implementation detail
// behind features/debt/server, per folder-tree.md's module boundary.
export type { DebtType }

/**
 * Client-safe representation of a Debt row.
 *
 * Prisma's `Decimal` (balance, interestRate, minimumPayment) is a decimal.js
 * class instance, not a plain serializable value. Passing it as-is across the
 * Server Component / Client Component boundary or through a Server Action's
 * response is unsafe. `server/service.ts` always converts Decimal -> number
 * before returning data, mirroring `features/accounts/types.ts`'s `Account`/
 * `toAccount()` and `features/investments/types.ts`'s `Holding`/`toHolding()`
 * pattern exactly.
 *
 * `balance` here is the *raw, manually-maintained* column — it is stale/
 * unused whenever `accountId` is set (see prisma/schema.prisma's comment on
 * `Debt.balance`). Every read-time consumer should use `DebtWithProjection`'s
 * `effectiveBalance` instead, never this field directly, which is why this
 * plain `Debt` type is not itself exported from `server/service.ts`'s public
 * read functions (`getDebts`/`getDebtById`) — only `DebtWithProjection` is.
 */
export type Debt = Omit<PrismaDebt, "balance" | "interestRate" | "minimumPayment"> & {
  balance: number
  interestRate: number
  minimumPayment: number
}

/**
 * Options for `service.getDebts`. Same non-union toggle semantics as
 * `features/accounts/types.ts`'s `GetAccountsOptions`/`features/goals`'s
 * equivalent: `includeArchived` false/omitted (default) returns only active
 * debts (debt-tracker.md AC2); `true` returns only archived debts, the
 * dedicated archived view (AC10).
 */
export interface GetDebtsOptions {
  includeArchived?: boolean
}

/**
 * `service.getDebts`/`getDebtById`'s return shape, per
 * docs/architecture/api-contracts.md's Debt Tracker section. Every derived
 * field below is computed at read time in `server/service.ts` (via
 * `../payoff-math.ts`), never stored — same rule as `GoalWithProgress`/
 * `BudgetHealthScore`/Bill and Income occurrence status/`Holding`'s
 * gain-loss.
 */
export type DebtWithProjection = Debt & {
  /** `Debt.balance`, OR the linked Account's live balance if `accountId` is
   * set — read via the join, never copied (same "read live, never copied"
   * precedent as `BillOccurrence`/`IncomeOccurrence`). This is the number
   * every other derived field below is computed from. */
  effectiveBalance: number
  /** `"YYYY-MM"`, assuming minimum-payment-only (AC4); `null` if
   * `isNegativeAmortization`. */
  payoffDate: string | null
  /** Total interest that will accrue between now and payoff at
   * minimum-payment-only pace; `null` if `isNegativeAmortization`. */
  totalInterestRemaining: number | null
  /** Minimum payment doesn't cover accruing interest at the current balance
   * (Edge Cases) — the debt would never pay itself off at that pace. */
  isNegativeAmortization: boolean
  /** `effectiveBalance <= 0` (AC9) — auto-detected, never a manually-set
   * flag/column. */
  isPaidOff: boolean
  /** `true` only for `type === "CREDIT_CARD"` (AC5's revolving-credit
   * caveat: the payoff date/total interest are an estimate that assumes no
   * new purchases are added going forward). */
  isEstimate: boolean
}

/**
 * The minimal, plain-number shape `../payoff-math.ts`'s pure functions need
 * per debt — deliberately narrower than `DebtWithProjection` (no
 * userId/timestamps/accountId) since `payoff-math.ts` must stay isomorphic
 * (importable from a Client Component) and has no reason to know about this
 * feature's Prisma-shaped fields at all.
 */
export interface PayoffDebtInput {
  id: string
  balance: number
  /** Annual percentage rate, e.g. `4.25` means 4.25% APR — matches
   * `Debt.interestRate`'s stored convention exactly (not a decimal fraction
   * like `0.0425`). */
  interestRate: number
  minimumPayment: number
}

/** `../payoff-math.ts`'s `computeAmortization` return shape — one debt's
 * minimum-payment-only projection (AC4), reused both for a single debt's
 * `DebtWithProjection` fields and internally by `compareSnowballAndAvalanche`
 * (its `extraPayment === 0` fast path, see that function's JSDoc). */
export interface AmortizationResult {
  /** `"YYYY-MM"`; `null` when `isNegativeAmortization`. */
  payoffDate: string | null
  /** Total interest that will accrue between now and payoff; `null` when
   * `isNegativeAmortization`. */
  totalInterestRemaining: number | null
  /** Number of whole months until the balance reaches $0; `null` when
   * `isNegativeAmortization`. Exposed mainly so `compareSnowballAndAvalanche`
   * can reuse this function's output without re-deriving month counts from a
   * date string. */
  monthsToPayoff: number | null
  isNegativeAmortization: boolean
}

/** One strategy's (snowball or avalanche) result within a
 * `StrategyComparisonResult` (AC7/AC8). */
export interface StrategySummary {
  monthsToDebtFree: number
  totalInterestPaid: number
  /** Debt IDs in the order they are actually paid off under this strategy
   * (chronological finish order — see `payoff-math.ts`'s JSDoc for why this
   * is not always identical to the strategy's nominal targeting order). */
  payoffOrder: string[]
}

/** `../payoff-math.ts`'s `compareSnowballAndAvalanche` return shape, per
 * docs/architecture/api-contracts.md's `StrategyComparisonResult` shape —
 * pure output, never persisted, recomputed client-side on every
 * extra-payment keystroke. */
export interface StrategyComparisonResult {
  extraPayment: number
  snowball: StrategySummary
  avalanche: StrategySummary
  /** `true` when `extraPayment === 0` or there is only one (or zero) active
   * debt (Edge Cases) — drives the "add an extra payment amount to see how
   * each strategy differs" messaging rather than a UI implying one strategy
   * "wins" when the numbers are mathematically forced to tie. */
  isIdentical: boolean
}
