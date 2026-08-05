import type { Transaction } from "@/features/transactions/types"
import type { HoldingDetail } from "@/features/investments/types"
import { UNCATEGORIZED_CATEGORY_ID, UNCATEGORIZED_CATEGORY_NAME } from "@/features/dashboard/types"
import type {
  CategoryTrend,
  DailySpendingHeatmapPoint,
  ExpenseDistributionEntry,
  IncomeGrowthPoint,
  IncomeSourceEntry,
  SavingsGrowthPoint,
  YearlySpendingPoint,
} from "@/features/analytics/types"

/**
 * The subset of Analytics metrics the demo Analytics page shows — only the
 * seven metrics backing the reused chart components
 * public-demo-technical-design.md §3.1/§3.2 lists (`YearlySpendingChart`,
 * `CategoryTrendsChart`, `ExpenseDistributionChart`, `IncomeGrowthChart`,
 * `IncomeSourcesChart`, `SavingsGrowthChart`, `DailySpendingHeatmap`) — Top
 * Merchants, Largest Purchases, Budget vs. Actual, and Subscription Cost
 * Detection are deliberately not derived here, since no demo component
 * consumes them (§3.2's own "Deliberately omitted" column).
 *
 * Every formula mirrors its real counterpart in
 * `features/analytics/server/{spending-trends,expense-breakdown,
 * income-analytics,savings-growth,spending-heatmap}.ts` exactly (all under
 * `features/analytics/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule, hence
 * this reimplementation — flagged per §2.2). Rather than resolving a
 * `ReportingPeriod` the way the real page's period selector would (Analytics'
 * own period control is inert in the demo per public-demo.md Capability 5
 * AC3 — present for visual authenticity, wired to a no-op), every metric
 * below is computed once, over this fixture's entire ~6-month transaction
 * history — the demo has no period selector round-trip to serve, so there is
 * nothing to recompute per range.
 *
 * **Income Growth/Sources' "Untracked" convention**: this fixture module has
 * no Recurring Income (`IncomeStream`/`IncomeOccurrence`) fixture data —
 * Recurring Income is one of public-demo.md's explicitly out-of-scope pages
 * (`/income`) — so every dollar of income counted here is, correctly,
 * `"UNTRACKED"` (the real metric's own residual bucket for money-in activity
 * with no linked income stream), never a fabricated tracked-by-type split.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/** Every `"yyyy-MM"` key from `start`'s month through `end`'s month,
 * inclusive — mirrors `features/analytics/server/period.ts`'s
 * `enumerateMonthKeys`. */
function enumerateMonthKeys(start: Date, end: Date): string[] {
  const keys: string[] = []
  let cursor = utcMonthStart(start)
  const endMonthStart = utcMonthStart(end)
  while (cursor.getTime() <= endMonthStart.getTime()) {
    keys.push(formatMonthKey(cursor))
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return keys
}

function earliestTransactionDate(transactions: Transaction[]): Date | null {
  if (transactions.length === 0) return null
  return transactions.reduce((earliest, txn) => (txn.date < earliest ? txn.date : earliest), transactions[0].date)
}

// ---- Yearly Spending --------------------------------------------------------

export function deriveYearlySpending(transactions: Transaction[], now: Date): YearlySpendingPoint[] {
  const earliest = earliestTransactionDate(transactions)
  if (!earliest) return []

  const startYear = earliest.getUTCFullYear()
  const endYear = now.getUTCFullYear()

  const totalsByYear = new Map<number, number>()
  for (const txn of transactions) {
    if (txn.amount >= 0) continue
    const year = txn.date.getUTCFullYear()
    totalsByYear.set(year, (totalsByYear.get(year) ?? 0) + -txn.amount)
  }

  const points: YearlySpendingPoint[] = []
  for (let year = startYear; year <= endYear; year++) {
    points.push({ year, totalExpenses: totalsByYear.get(year) ?? 0 })
  }
  return points
}

// ---- Category Trends ---------------------------------------------------------

export function deriveCategoryTrends(transactions: Transaction[], now: Date): CategoryTrend[] {
  const earliest = earliestTransactionDate(transactions)
  if (!earliest) return []

  const monthKeys = enumerateMonthKeys(earliest, now)
  const buckets = new Map<string, Map<string, number>>()
  const categoryNames = new Map<string, string>()

  for (const txn of transactions) {
    if (txn.amount >= 0) continue
    const monthKey = formatMonthKey(txn.date)
    const categoryKey = txn.category?.id ?? UNCATEGORIZED_CATEGORY_ID
    categoryNames.set(categoryKey, txn.category?.name ?? UNCATEGORIZED_CATEGORY_NAME)

    const monthMap = buckets.get(monthKey) ?? new Map<string, number>()
    monthMap.set(categoryKey, (monthMap.get(categoryKey) ?? 0) + -txn.amount)
    buckets.set(monthKey, monthMap)
  }

  const rows = [...categoryNames.entries()].map(([categoryId, categoryName]) => {
    const points = monthKeys.map((monthKey) => ({
      month: monthKey,
      amount: buckets.get(monthKey)?.get(categoryId) ?? 0,
    }))
    const total = points.reduce((sum, p) => sum + p.amount, 0)
    return { categoryId, categoryName, points, total }
  })

  return rows.sort((a, b) => b.total - a.total).map(({ categoryId, categoryName, points }) => ({
    categoryId,
    categoryName,
    points,
  }))
}

// ---- Expense Distribution ------------------------------------------------

export function deriveExpenseDistribution(transactions: Transaction[]): ExpenseDistributionEntry[] {
  const totals = new Map<string, { categoryName: string; amount: number }>()

  for (const txn of transactions) {
    if (txn.amount >= 0) continue
    const categoryId = txn.category?.id ?? UNCATEGORIZED_CATEGORY_ID
    const categoryName = txn.category?.name ?? UNCATEGORIZED_CATEGORY_NAME
    const existing = totals.get(categoryId)
    totals.set(categoryId, { categoryName, amount: (existing?.amount ?? 0) + -txn.amount })
  }

  return [...totals.entries()]
    .map(([categoryId, { categoryName, amount }]) => ({ categoryId, categoryName, amount }))
    .sort((a, b) => b.amount - a.amount)
}

// ---- Income Growth / Income Sources ---------------------------------------

export function deriveIncomeGrowth(transactions: Transaction[], now: Date): IncomeGrowthPoint[] {
  const earliest = earliestTransactionDate(transactions)
  if (!earliest) return []

  const monthKeys = enumerateMonthKeys(earliest, now)
  const totalsByMonth = new Map<string, number>()
  for (const txn of transactions) {
    if (txn.amount <= 0) continue
    const monthKey = formatMonthKey(txn.date)
    totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) ?? 0) + txn.amount)
  }

  return monthKeys.map((monthKey) => {
    const total = totalsByMonth.get(monthKey) ?? 0
    // No Recurring Income fixture data exists (see this file's module doc) —
    // every dollar is the "UNTRACKED" residual, matching
    // `buildIncomeGrowthPoint`'s own `max(0, total - trackedSum)` rule with
    // `trackedSum` always 0 here.
    return {
      month: monthKey,
      total,
      bySource: total > 0 ? [{ type: "UNTRACKED" as const, amount: total }] : [],
    }
  })
}

export function deriveIncomeSources(growth: IncomeGrowthPoint[]): IncomeSourceEntry[] {
  const amountByType = new Map<string, number>()
  for (const point of growth) {
    for (const entry of point.bySource) {
      amountByType.set(entry.type, (amountByType.get(entry.type) ?? 0) + entry.amount)
    }
  }

  const total = [...amountByType.values()].reduce((sum, amount) => sum + amount, 0)
  if (total === 0) return []

  return [...amountByType.entries()]
    .map(([type, amount]) => ({
      type: type as IncomeSourceEntry["type"],
      amount,
      percent: (amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount)
}

// ---- Savings Growth ---------------------------------------------------------

/** One month's investment gain/loss — sums `(newValue - previousValue)`
 * across every `HoldingValueHistoryEntry` recorded within `[start, end]`,
 * mirroring `features/investments/server/service.ts`'s
 * `getGainLossForPeriod`. */
function investmentGainLossForMonth(holdings: HoldingDetail[], start: Date, end: Date): number {
  let total = 0
  for (const holding of holdings) {
    for (const entry of holding.valueHistory) {
      if (entry.recordedAt >= start && entry.recordedAt <= end) {
        total += entry.newValue - entry.previousValue
      }
    }
  }
  return total
}

export function deriveSavingsGrowth(
  transactions: Transaction[],
  holdings: HoldingDetail[],
  now: Date,
): SavingsGrowthPoint[] {
  const earliest = earliestTransactionDate(transactions)
  if (!earliest) return []

  const monthKeys = enumerateMonthKeys(earliest, now)

  return monthKeys.map((monthKey) => {
    const [yearStr, monthStr] = monthKey.split("-")
    const year = Number(yearStr)
    const monthIndex = Number(monthStr) - 1
    const monthStart = new Date(Date.UTC(year, monthIndex, 1))
    const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0))
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const monthEnd = lastDayOfMonth < today ? lastDayOfMonth : today

    const monthTxns = transactions.filter((txn) => txn.date >= monthStart && txn.date <= monthEnd)
    const income = monthTxns.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
    if (income === 0) {
      return { month: monthKey, actualSavings: null }
    }
    const expenses =
      -monthTxns.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0) || 0
    const gainLoss = investmentGainLossForMonth(holdings, monthStart, monthEnd)

    return { month: monthKey, actualSavings: income - expenses - gainLoss }
  })
}

// ---- Daily Spending Heatmap ------------------------------------------------

export function deriveDailySpendingHeatmap(
  transactions: Transaction[],
  now: Date,
): DailySpendingHeatmapPoint[] {
  const dailyTotals = new Map<string, number>()
  for (const txn of transactions) {
    if (txn.amount >= 0) continue
    const key = formatDateKey(txn.date)
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + -txn.amount)
  }

  if (dailyTotals.size === 0) return []

  const earliest = earliestTransactionDate(transactions)
  if (!earliest) return []

  const totalDays = Math.round((now.getTime() - earliest.getTime()) / MS_PER_DAY) + 1
  const totalSpend = [...dailyTotals.values()].reduce((sum, amount) => sum + amount, 0)
  const averageDailySpend = totalDays > 0 ? totalSpend / totalDays : 0

  return [...dailyTotals.entries()]
    .map(([date, amount]) => ({
      date,
      amount,
      relativeIntensity: averageDailySpend > 0 ? amount / averageDailySpend : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
