// Client-safe return shapes for `features/analytics/server/*.ts`, per
// docs/architecture/api-contracts.md's Analytics section and
// docs/architecture/folder-tree.md's Phase 3b file layout note ("types.ts —
// ReportingPeriod, SubscriptionCandidate, SubscriptionStatus, etc."). Every
// field here is already a plain, serializable value — Prisma's `Decimal`
// never leaks past `server/*.ts`, matching every other feature module's
// `types.ts` convention (see e.g. `features/dashboard/types.ts`).
//
// This file held only Pass 1's types (analytics.md's Yearly Spending,
// Category Trends, Expense Distribution, Budget vs. Actual, Top Merchants,
// Largest Purchases, Daily Spending Heatmap) until this section. Pass 2's
// types (Income Growth, Income Sources, Savings Growth, Subscription Cost
// Detection) are appended below, at the bottom of this file, rather than
// interleaved with Pass 1's types above — keeps each pass's additions a
// single contiguous diff, matching how `server/` is split into per-pass
// files rather than reshuffled Pass 1 files.

import type { IncomeType } from "@prisma/client"

// Re-exported so consumers of this feature (hooks, and later the UI
// Component Engineer's components) never need to import from
// "@prisma/client" directly — mirrors `features/recurring-income/types.ts`'s
// own `IncomeType` re-export, per folder-tree.md's "Prisma stays an
// implementation detail behind features/<domain>/server" convention.
export type { IncomeType }

/**
 * The shared reporting-period control's four options (analytics.md AC2),
 * per docs/architecture/naming-standards.md's Phase 3b enum list. The
 * `?period=` searchParam's kebab-case values (`this-year` etc.) are parsed
 * into this union by `server/validation.ts`'s `ReportingPeriodSchema` — nothing
 * outside that one parse boundary ever handles the raw kebab-case string.
 */
export type ReportingPeriod =
  | "THIS_YEAR"
  | "LAST_12_MONTHS"
  | "YEAR_TO_DATE"
  | "ALL_TIME"

/**
 * A resolved, concrete date range for one reporting period, per
 * `server/period.ts`'s `resolveReportingPeriodRange`. `start: null` means
 * "All Time" — open-ended, bounded in practice by that one user's own data
 * (see Architecture.md's Risk #11 resolution) rather than by any fixed
 * calendar floor. `end` is always a concrete `Date` (never open-ended on the
 * upper bound — every period has a "now").
 */
export interface ReportingPeriodRange {
  start: Date | null
  end: Date
}

/** One row of `spending-trends.getYearlySpending`'s result — per
 * api-contracts.md, always all-time by definition (AC6: "across all years
 * the user has data for"), so this metric takes no `period` argument at
 * all. */
export interface YearlySpendingPoint {
  year: number
  /** Positive amount (already absolute-valued — a spend total, not a
   * signed transaction amount), matching `features/dashboard/types.ts`'s
   * `CategorySpending.amount` convention. */
  totalExpenses: number
}

/** One category's spending trended over the months of the selected period —
 * `spending-trends.getCategoryTrends`'s per-category row. */
export interface CategoryTrend {
  /** A real `Category.id`, or `UNCATEGORIZED_CATEGORY_ID`
   * (`features/dashboard/types.ts`) for the "Uncategorized" bucket — same
   * sentinel-id convention Dashboard's `getSpendingByCategory` already
   * uses, per analytics.md AC4/Edge Cases' "no new, parallel definition." */
  categoryId: string
  categoryName: string
  /** One point per calendar month in the selected period, in chronological
   * order — every month appears even when that category had $0 spend that
   * month (never silently skipped), mirroring
   * `features/dashboard/server/service.ts`'s `getMonthlyTrends` "true
   * gap/flat period" convention. */
  points: { month: string; amount: number }[]
}

/** One row of `expense-breakdown.getExpenseDistribution`'s result — the same
 * shape as `features/dashboard/types.ts`'s `CategorySpending`, analyzable
 * across a user-selected period instead of fixed to the current month
 * (analytics.md AC8). */
export interface ExpenseDistributionEntry {
  categoryId: string
  categoryName: string
  amount: number
}

/** One category line within one month of `budget-comparison.getBudgetVsActual`'s
 * result. */
export interface BudgetVsActualCategoryLine {
  categoryId: string
  categoryName: string
  /** `null` = no allocation was ever set for this category this month —
   * never conflated with an intentional $0 allocation, matching
   * `features/budgeting/types.ts`'s `BudgetCategoryLine.allocated` convention
   * exactly (this metric reuses Budgeting's own per-month view, not a
   * re-derived figure). */
  allocated: number | null
  actual: number
}

/** One month's Budget vs. Actual table row — analytics.md AC9's "each month
 * in the selected period, each category's allocated amount against its
 * actual spend." */
export interface BudgetVsActualMonth {
  /** `"YYYY-MM"`, matching Budgeting's own month string convention. */
  month: string
  categories: BudgetVsActualCategoryLine[]
}

/** One row of `expense-breakdown.getTopMerchants`'s result. */
export interface TopMerchant {
  /** The normalized grouping key (`lib/merchant-normalization.ts`'s
   * `normalizeMerchantName` output) — not itself meant for display. */
  normalizedMerchantName: string
  /** The most-recent raw `Transaction.merchant` string within this group,
   * for display (analytics.md's own "most-recent raw merchant string ...
   * for display" convention, shared with Subscription Cost Detection's
   * `SubscriptionCandidate.displayName`). */
  displayName: string
  totalSpend: number
  transactionCount: number
}

/** One row of `expense-breakdown.getLargestPurchases`'s result. */
export interface LargestPurchase {
  transactionId: string
  /** `"yyyy-MM-dd"`, built from UTC components — see `server/period.ts`'s
   * `formatDateKey`, matching this codebase's established UTC-calendar-date
   * convention (risk-register.md #8). */
  date: string
  merchant: string
  categoryName: string
  amount: number
}

/** One row of `spending-heatmap.getDailySpendingHeatmap`'s result. Only days
 * with actual expense activity are included — a day with no spending is
 * never emitted as an explicit `{ amount: 0 }` entry, since a period can
 * span years and most days would be zero; the Frontend Lead treats any date
 * absent from this array as "no spending that day." */
export interface DailySpendingHeatmapPoint {
  date: string
  amount: number
  /** `amount / averageDailySpendOverPeriod` — see
   * `spending-heatmap.ts`'s JSDoc for exactly how the denominator is
   * computed. `0` when the period's average is `0` (defensive only; if the
   * average were genuinely `0`, no day could have `amount > 0` to report in
   * the first place). */
  relativeIntensity: number
}

// ---------------------------------------------------------------------------
// Pass 2 — Income Growth, Income Sources, Savings Growth, Subscription Cost
// Detection (analytics.md AC13–AC16). See `server/income-analytics.ts`,
// `server/savings-growth.ts`, `server/subscriptions.ts`, and
// `server/subscription-detection.ts` for the implementations that produce
// these shapes.
// ---------------------------------------------------------------------------

/**
 * `"UNTRACKED"` is the residual bucket analytics.md AC13/AC14 both require:
 * "money-in activity never associated with any tracked income stream" is
 * still counted in the overall total, but broken out under this explicit
 * label rather than silently folded into one of the six real `IncomeType`
 * values or silently dropped. Shared by both `IncomeGrowthPoint.bySource` and
 * `IncomeSourceEntry`, per analytics.md's "the same 'Untracked/Other'
 * residual bucket... applies here too."
 */
export type IncomeSourceType = IncomeType | "UNTRACKED"

/** One income-type slice of one month's total, within
 * `income-analytics.getIncomeGrowth`'s per-month `bySource` breakdown. */
export interface IncomeGrowthBySourceEntry {
  type: IncomeSourceType
  amount: number
}

/** One row of `income-analytics.getIncomeGrowth`'s result (analytics.md
 * AC13). `total` is every month's actual money-in activity (comparable to
 * pre-3a history, per AC13's own "the trend line stays complete" requirement
 * — see `income-analytics.ts`'s JSDoc for exactly how this is kept
 * consistent with `dashboard.service.getMonthlySummary`'s income figure for
 * the same month). `bySource` always accounts for the same `total`: every
 * named `IncomeType` present that month, plus `"UNTRACKED"` for the
 * remainder — never a bySource sum that silently disagrees with `total`. */
export interface IncomeGrowthPoint {
  month: string
  total: number
  bySource: IncomeGrowthBySourceEntry[]
}

/** One row of `income-analytics.getIncomeSources`'s result (analytics.md
 * AC14) — the selected period's share of total actual-received income
 * attributable to each `IncomeType`, plus the same `"UNTRACKED"` residual.
 * `percent` values across one `getIncomeSources` call sum to 100 (barring
 * floating-point rounding), the same convention as
 * `features/investments/types.ts`'s `AllocationEntry.percent`. */
export interface IncomeSourceEntry {
  type: IncomeSourceType
  amount: number
  percent: number
}

/** One row of `savings-growth.getSavingsGrowth`'s result (analytics.md
 * AC15). `actualSavings` is `null` for any month excluded per the "$0
 * income month" edge case (mirroring
 * `features/dashboard/server/service.ts`'s `computeSavingsRate`'s
 * null-on-zero-income convention) — never a divide-by-zero or a misleading
 * `0`. Otherwise: `(actual income - actual expenses) - investment gain/loss
 * for that same month`, per AC15's "netting out" requirement. */
export interface SavingsGrowthPoint {
  month: string
  actualSavings: number | null
}

/** `subscriptions.getSubscriptionCandidates`'s/`subscription-detection.ts`'s
 * detected cadence bucket (analytics.md's Subscription Cost Detection
 * heuristic — "weekly, monthly, quarterly, or annually"). */
export type SubscriptionInterval = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY"

/** Per docs/architecture/naming-standards.md's Phase 3b enum list: "never
 * persisted, computed at read time... same 'never a stored column' rule as
 * `IncomeOccurrenceStatus`/Bills' `OccurrenceStatus`." */
export type SubscriptionStatus = "ACTIVE" | "POSSIBLY_CANCELLED"

/** One detected subscription candidate, per api-contracts.md's
 * `SubscriptionCandidate` shape — computed entirely at read time from
 * `Transaction` data plus one `DismissedSubscriptionMerchant` exclusion-set
 * lookup (`subscriptions.ts`), never itself persisted. */
export interface SubscriptionCandidate {
  normalizedMerchantName: string
  /** The most-recent raw `Transaction.merchant` string for this group, for
   * display — same convention as `TopMerchant.displayName`. */
  displayName: string
  /** The average amount of the *most recent* price segment (see
   * `subscription-detection.ts`'s JSDoc on price-change handling) — reflects
   * what the subscription currently costs, not a lifetime average across a
   * price increase. */
  averageAmount: number
  detectedInterval: SubscriptionInterval
  /** `"yyyy-MM-dd"`, built from UTC components — see `server/period.ts`'s
   * `formatDateKey`. */
  firstDetectedDate: string
  mostRecentChargeDate: string
  estimatedAnnualizedCost: number
  status: SubscriptionStatus
}
