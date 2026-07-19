// Client-safe return shapes for `features/dashboard/server/service.ts`, per
// docs/architecture/api-contracts.md's Dashboard section. These functions are
// called directly from Server Components (no Server Actions/routes in Phase
// 1 — see api-contracts.md's note that nothing client-side needs to refetch
// them independently of a full page load), so every field here is already a
// plain, serializable value — Prisma's `Decimal` never leaks past
// server/service.ts, following the same convention as
// features/accounts/server/service.ts's `toAccount()`.

/**
 * Sentinel `categoryId`/`categoryName` used for the "Uncategorized" bucket in
 * `getSpendingByCategory`. Real `Category` rows are Prisma `cuid()`s, which
 * never take this literal form, so this cannot collide with an actual
 * category id. A sentinel (rather than omitting uncategorized spending, or
 * returning `categoryId: null`) is required because:
 *   - docs/product/dashboard-overview.md AC7 mandates an explicit
 *     "Uncategorized" bucket so no spending is silently excluded from the
 *     chart's total.
 *   - api-contracts.md types `categoryId` as `string` (non-nullable) on the
 *     `getSpendingByCategory` return shape, so `null` is not a valid value
 *     to hand back to callers.
 */
export const UNCATEGORIZED_CATEGORY_ID = "uncategorized"
export const UNCATEGORIZED_CATEGORY_NAME = "Uncategorized"

/** Per-account contribution to Net Worth. See `NetWorth.byAccount` below for
 * the sign convention. */
export interface NetWorthByAccount {
  accountId: string
  /**
   * The account's *signed contribution* to Net Worth, not its raw stored
   * balance — i.e. already negated for `CREDIT_CARD` accounts per
   * docs/product/accounts.md's sign convention (Credit Card balances are
   * stored as a positive liability amount, but subtracted here). This is a
   * deliberate reading of the api-contracts.md shape: since this array omits
   * `type`, a consumer summing/rendering these values has no other way to
   * know which entries are liabilities, so the values themselves must
   * already be signed such that `total === byAccount.reduce((s, a) => s +
   * a.balance, 0)` holds exactly.
   */
  balance: number
}

/** Return shape of `service.getNetWorth`. */
export interface NetWorth {
  /** Sum of every non-archived account's signed contribution (see
   * `NetWorthByAccount.balance`). Archived accounts are excluded entirely —
   * per dashboard-overview.md AC11, archiving removes an account from
   * *current* Net Worth without rewriting the historical months it
   * occurred in (those are handled separately by the monthly aggregations,
   * which are not account-archival-aware since they key off transaction
   * date, not account state). */
  total: number
  byAccount: NetWorthByAccount[]
}

/**
 * Return shape of `service.getMonthlySummary`.
 *
 * `savingsRate` is `number | null` rather than always `number`: per
 * dashboard-overview.md AC6, when Income is $0 for the period the UI must
 * show an explicit "not enough data" state, never a misleading `0%`, a
 * `NaN`, or a thrown error. `null` is the sentinel this service returns for
 * that case — the Frontend Lead renders it as the "not enough data" state
 * instead of formatting it as a percentage. See `computeSavingsRate` in
 * `server/service.ts` for the implementation.
 */
export interface MonthlySummary {
  /** Sum of money-in transactions for the requested month, capped at "today"
   * when the requested month is the current month (month-to-date framing —
   * see dashboard-overview.md AC2/AC3 and the future-dated-transaction edge
   * case). Always the full calendar month for past months. */
  income: number
  /** Sum of the absolute value of money-out transactions for the requested
   * month, same month-to-date/future-dated framing as `income`. */
  expenses: number
  /** `income - expenses` for the same period. */
  cashFlow: number
  /** `(income - expenses) / income`, or `null` when `income` is 0. */
  savingsRate: number | null
}

/** One row of `service.getSpendingByCategory`'s result. */
export interface CategorySpending {
  categoryId: string
  categoryName: string
  /** Positive amount (already absolute-valued — this is a spending total,
   * not a signed transaction amount). */
  amount: number
}

/** One row of `service.getMonthlyTrends`'s result. */
export interface MonthlyTrend {
  /** ISO-like `"yyyy-MM"` key (e.g. `"2026-07"`), built from UTC year/month
   * components — never via a local-timezone-dependent formatter — so the
   * key is stable regardless of the server process's local timezone. The
   * Frontend Lead is responsible for any display formatting (e.g. "Jul
   * 2026"). */
  month: string
  income: number
  expenses: number
}
