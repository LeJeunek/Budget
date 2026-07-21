import type {
  Holding as PrismaHolding,
  HoldingValueHistoryEntry as PrismaHoldingValueHistoryEntry,
  DividendEntry as PrismaDividendEntry,
  AssetType,
  Sector,
} from "@prisma/client"

import type { Account } from "@/features/accounts/types"

// Client-safe shapes for the Investments module. Prisma's `Decimal`
// (costBasis, currentValue, previousValue, newValue, amount) is a decimal.js
// class instance, not a plain serializable value — passing it as-is across
// the Server Component / Client Component boundary or through a Server
// Action's response is unsafe. `server/service.ts` always converts
// Decimal -> number before returning data (see `toHolding`/
// `toHoldingValueHistoryEntry`/`toDividendEntry`), mirroring
// `features/accounts/types.ts`'s `Account`/`toAccount()` pattern exactly.

// Re-export the Prisma-generated enums so consumers of this feature (hooks,
// and later the UI Component Engineer's components) never need to import
// from "@prisma/client" directly — Prisma stays an implementation detail
// behind features/investments/server, per folder-tree.md's module boundary.
export type { AssetType, Sector }

/**
 * Client-safe representation of a Holding row, with gain/loss (AC6) folded
 * directly in — unlike Goals' separate `Goal` / `GoalWithProgress` split,
 * there is no reachable product use case for a bare Holding without its
 * gain/loss (every read path in investments.md's acceptance criteria shows
 * it), so `server/service.ts`'s `toHolding()` always computes it rather than
 * this module offering two shapes callers could pick the wrong one of.
 *
 * `gainLossAmount = currentValue - costBasis`, never stored (AC6 — dividend
 * income, AC8, is never folded into this figure).
 * `gainLossPercent` is `null` only when `costBasis === 0` (the same
 * divide-by-zero guard `payoff-math.ts` uses for a 0% interest rate) — a
 * $0-cost-basis holding still has a real gainLossAmount, it just has no
 * meaningful percentage to divide by.
 */
export type Holding = Omit<PrismaHolding, "costBasis" | "currentValue"> & {
  costBasis: number
  currentValue: number
  gainLossAmount: number
  gainLossPercent: number | null
}

/** Client-safe representation of a single current-value update record
 * (AC4) — what `growth-chart.tsx` (Frontend Lead territory) will eventually
 * render per holding. */
export type HoldingValueHistoryEntry = Omit<
  PrismaHoldingValueHistoryEntry,
  "previousValue" | "newValue"
> & {
  previousValue: number
  newValue: number
}

/** Client-safe representation of a single logged dividend receipt (AC8). */
export type DividendEntry = Omit<PrismaDividendEntry, "amount"> & {
  amount: number
}

/** `service.getHoldingById`'s return shape per api-contracts.md: a `Holding`
 * plus its full value-history (most-recent-first, for the detail view) and
 * dividend history. `null` when the holding doesn't exist or belongs to a
 * different user, matching `goals.service.getGoalById`'s convention. */
export type HoldingDetail = Holding & {
  valueHistory: HoldingValueHistoryEntry[]
  dividends: DividendEntry[]
}

/**
 * Options for `service.getHoldingsForContainer`. `includeClosed`
 * false/omitted (default) returns only active (non-Closed) holdings —
 * AC5/AC9's "current allocation and portfolio overview" scope; `true`
 * returns only Closed holdings, the dedicated "Closed holdings" view (Edge
 * Cases) — the same non-union toggle semantics as
 * `features/accounts/types.ts`'s `GetAccountsOptions`.
 */
export interface GetHoldingsOptions {
  includeClosed?: boolean
}

/**
 * One Investment/Retirement/Crypto `Account` row, extended with the two
 * fields the container list (AC1) needs to decide what to show/message:
 * `holdingCount` (active holdings only) and `hasHoldings` — the trigger for
 * "this account's balance is now calculated from its holdings below"
 * messaging, per `Account.balance`'s Phase 3a derived-balance doc comment in
 * prisma/schema.prisma.
 */
export type ContainerSummary = Account & {
  holdingCount: number
  hasHoldings: boolean
}

/** One container's contribution to the portfolio-wide totals in
 * `PortfolioOverview.byContainer` (AC10). `dividendIncome` includes dividends
 * from Closed holdings under this container (Edge Cases: "a dividend logged
 * on a Closed holding ... still counts toward that holding's and the
 * portfolio's total dividend income"), while `currentValue`/`gainLoss`
 * reflect active holdings only (AC9's active-only allocation/overview
 * scope). */
export interface PortfolioContainerBreakdown {
  accountId: string
  accountName: string
  currentValue: number
  gainLoss: number
  dividendIncome: number
}

/** `service.getPortfolioOverview`'s return shape, per
 * docs/architecture/api-contracts.md's Investments section. Every total is
 * computed at read time from active holdings (plus, for dividend income
 * only, Closed holdings too — see `PortfolioContainerBreakdown`'s note),
 * never stored. */
export interface PortfolioOverview {
  totalCurrentValue: number
  totalGainLoss: number
  totalDividendIncome: number
  byContainer: PortfolioContainerBreakdown[]
}

/** `service.getAllocation`'s grouping dimension — asset-type allocation or
 * sector allocation (AC9). */
export type AllocationBy = "assetType" | "sector"

/** One slice of an allocation breakdown (AC9). `percent` values across a
 * single `service.getAllocation` call always sum to 100 (barring floating-
 * point rounding), since sector allocation's "Other / Not Applicable" bucket
 * (see `server/service.ts`) ensures every active holding's value is counted
 * exactly once. */
export interface AllocationEntry {
  label: string
  value: number
  percent: number
}

/** Options for `service.getGrowthHistory`. Omit `holdingId` for the
 * portfolio-level aggregate growth series (AC7); pass it for a single
 * holding's own growth series. */
export interface GetGrowthHistoryOptions {
  holdingId?: string
}

/** One point on a growth chart (AC7) — `date` is a `"YYYY-MM-DD"` UTC
 * calendar-date string (matching this app's established date-string
 * convention, e.g. `features/goals/server/service.ts`'s month keys). A
 * one-entry array is a valid, expected response for a holding with only its
 * initial value recorded (AC7's "not enough history yet" state) — never a
 * broken or empty chart. */
export interface GrowthPoint {
  date: string
  value: number
}

/**
 * Options for `service.getGainLossForPeriod` — **(Phase 3b)**, per
 * docs/architecture/api-contracts.md's Investments section: "sums
 * `(HoldingValueHistoryEntry.newValue - previousValue)` across every entry
 * recorded within `[start, end]`." Both bounds are required (unlike
 * `features/analytics/server/types.ts`'s `ReportingPeriodRange`, whose
 * `start` may be `null` for "All Time") — this function's only caller,
 * `features/analytics/server/savings-growth.ts`, always resolves a concrete
 * per-month `[start, end]` before calling it.
 */
export interface GetGainLossForPeriodOptions {
  start: Date
  end: Date
}
