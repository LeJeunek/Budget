import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import type { Transaction } from "@/features/transactions/types"
import type { BudgetHealthScore } from "@/features/budgeting/types"
import type {
  FinancialHealthScoreBreakdown,
  FinancialHealthScoreComponentKey,
  FinancialHealthScoreComponents,
  FinancialHealthScoreHistoryPoint,
  FinancialHealthScoreLabel,
} from "@/features/financial-health-score/types"

import { relativeDate, relativeMonthStart } from "../relative-date"
import { deriveNetWorth } from "./net-worth"
import { deriveMonthlySummary } from "./monthly-summary"
import { buildMasterSeries } from "./net-worth-history"

/**
 * Mirrors `features/financial-health-score/server/formula.ts` (the pure
 * scoring math) and `features/financial-health-score/server/service.ts`
 * (the component-gathering orchestration) exactly — both files live under
 * `features/financial-health-score/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule, hence
 * this reimplementation (flagged per §2.2). `budgetAdherence` reuses
 * `derive/budget-health-score.ts`'s own output verbatim (never
 * independently recomputed), matching the real Feature 5's own DoD
 * requirement; `netWorthTrend` reuses `derive/net-worth.ts`'s output for
 * both the "now" and "3 months ago" ends of its window, so this score can
 * never silently disagree with Dashboard's own Net Worth figure.
 */

// ---- Formula thresholds (formula.ts's CTO-resolved figures, restated) -----
const DEBT_TO_INCOME_RATIO_AT_SCORE_100 = 0.15
const DEBT_TO_INCOME_RATIO_AT_SCORE_0 = 0.5
const SAVINGS_RATE_AT_SCORE_0 = 0
const SAVINGS_RATE_AT_SCORE_100 = 0.2
const NET_WORTH_TREND_PERCENT_AT_SCORE_0 = -0.15
const NET_WORTH_TREND_PERCENT_AT_SCORE_100 = 0.15
const LABEL_GOOD_THRESHOLD = 70
const LABEL_FAIR_THRESHOLD = 40
const TRAILING_WINDOW_MONTHS = 3

const ALL_COMPONENT_KEYS: readonly FinancialHealthScoreComponentKey[] = [
  "debtToIncome",
  "savingsRate",
  "budgetAdherence",
  "netWorthTrend",
]

function linearInterpolateScore(value: number, scoreZeroAt: number, scoreHundredAt: number): number {
  const fraction = (value - scoreZeroAt) / (scoreHundredAt - scoreZeroAt)
  const clampedFraction = Math.min(1, Math.max(0, fraction))
  return Math.round(clampedFraction * 100)
}

function deriveFinancialHealthScoreLabel(score: number): FinancialHealthScoreLabel {
  if (score >= LABEL_GOOD_THRESHOLD) return "Good"
  if (score >= LABEL_FAIR_THRESHOLD) return "Fair"
  return "Needs attention"
}

function computeDebtToIncomeScore(totalMinimumPayments: number, totalMonthlyIncome: number): number | null {
  if (totalMinimumPayments <= 0) return 100
  if (totalMonthlyIncome <= 0) return null
  const ratio = totalMinimumPayments / totalMonthlyIncome
  return linearInterpolateScore(ratio, DEBT_TO_INCOME_RATIO_AT_SCORE_0, DEBT_TO_INCOME_RATIO_AT_SCORE_100)
}

function computeSavingsRateScore(monthlyRates: ReadonlyArray<number | null>): number | null {
  const qualifying = monthlyRates.filter((rate): rate is number => rate !== null)
  if (qualifying.length === 0) return null
  const average = qualifying.reduce((sum, rate) => sum + rate, 0) / qualifying.length
  return linearInterpolateScore(average, SAVINGS_RATE_AT_SCORE_0, SAVINGS_RATE_AT_SCORE_100)
}

function computeNetWorthTrendScore(params: {
  priorNetWorth: number | null
  currentNetWorth: number
  trailingIncome: number
}): number | null {
  if (params.priorNetWorth === null) return null
  if (params.trailingIncome <= 0) return null
  const change = params.currentNetWorth - params.priorNetWorth
  const percentOfTrailingIncome = change / params.trailingIncome
  return linearInterpolateScore(
    percentOfTrailingIncome,
    NET_WORTH_TREND_PERCENT_AT_SCORE_0,
    NET_WORTH_TREND_PERCENT_AT_SCORE_100,
  )
}

function aggregateFinancialHealthScore(components: FinancialHealthScoreComponents): {
  score: number | null
  label: FinancialHealthScoreLabel | null
  undefinedComponents: FinancialHealthScoreComponentKey[]
} {
  const undefinedComponents = ALL_COMPONENT_KEYS.filter((key) => components[key] === null)
  const definedValues = ALL_COMPONENT_KEYS.map((key) => components[key]).filter(
    (value): value is number => value !== null,
  )

  if (definedValues.length === 0) {
    return { score: null, label: null, undefinedComponents }
  }

  const score = Math.round(definedValues.reduce((sum, value) => sum + value, 0) / definedValues.length)
  return { score, label: deriveFinancialHealthScoreLabel(score), undefinedComponents }
}

/** A net-worth value from an already-resolved `{ daysAgo, netWorth }` series,
 * closest to (but not after) `cutoffDaysAgo` — mirrors
 * `features/dashboard/server/net-worth-history.ts`'s
 * `getNetWorthValueOnOrBefore` shape, applied to this fixture's own
 * synthesized trajectory instead of a `NetWorthSnapshot` table read. */
function netWorthValueOnOrBefore(
  series: { daysAgo: number; netWorth: number }[],
  cutoffDaysAgo: number,
): number | null {
  const eligible = series.filter((point) => point.daysAgo >= cutoffDaysAgo)
  if (eligible.length === 0) return null
  // Smallest `daysAgo` still `>= cutoffDaysAgo` is the closest point at or
  // before the cutoff date.
  return eligible.reduce((closest, point) => (point.daysAgo < closest.daysAgo ? point : closest))
    .netWorth
}

export function deriveFinancialHealthScore(params: {
  now: Date
  accounts: Account[]
  debts: DebtWithProjection[]
  transactions: Transaction[]
  budgetHealthScore: BudgetHealthScore | null
}): FinancialHealthScoreBreakdown {
  const { now, accounts, debts, transactions, budgetHealthScore } = params

  // ---- Debt-to-Income -------------------------------------------------
  const totalMinimumPayments = debts
    .filter((debt) => debt.archivedAt === null)
    .reduce((sum, debt) => sum + debt.minimumPayment, 0)
  const currentMonthIncome = deriveMonthlySummary(transactions, relativeMonthStart(0, now), now).income
  const debtToIncome = computeDebtToIncomeScore(totalMinimumPayments, currentMonthIncome)

  // ---- Savings Rate (trailing 3-month rolling average) -----------------
  const trailingMonths = [2, 1, 0].map((monthsAgo) => relativeMonthStart(monthsAgo, now))
  const trailingRates = trailingMonths.map(
    (month) => deriveMonthlySummary(transactions, month, now).savingsRate,
  )
  const savingsRate = computeSavingsRateScore(trailingRates)

  // ---- Budget Adherence (reused verbatim) -------------------------------
  const budgetAdherence = budgetHealthScore?.score ?? null

  // ---- Net Worth Trend ---------------------------------------------------
  const netWorth = deriveNetWorth(accounts, debts)
  const currentNetWorth = netWorth.total
  // The same synthesized trajectory `derive/net-worth-history.ts` builds for
  // the chart itself — reused here rather than a second, independently
  // computed historical series, so this component's "3 months ago" figure
  // can never disagree with what the Net Worth History chart shows for that
  // same date.
  const netWorthSeries = buildMasterSeries(currentNetWorth, netWorth.totalUnlinkedDebtLiability)
  const cutoffDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - TRAILING_WINDOW_MONTHS, now.getUTCDate()),
  )
  const cutoffDaysAgo = Math.round((now.getTime() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000))
  const priorNetWorth = netWorthValueOnOrBefore(netWorthSeries, cutoffDaysAgo)
  const trailingIncome = trailingMonths.reduce(
    (sum, month) => sum + deriveMonthlySummary(transactions, month, now).income,
    0,
  )
  const netWorthTrend = computeNetWorthTrendScore({
    priorNetWorth,
    currentNetWorth,
    trailingIncome,
  })

  const components: FinancialHealthScoreComponents = {
    debtToIncome,
    savingsRate,
    budgetAdherence,
    netWorthTrend,
  }
  const { score, label, undefinedComponents } = aggregateFinancialHealthScore(components)

  return { score, label, components, undefinedComponents }
}

/**
 * A plausible ~6-month score trend converging to `breakdown.score` "today" —
 * the real `snapshot.getFinancialHealthScoreHistory` reads persisted daily
 * `FinancialHealthScoreSnapshot` rows, which have no fixture-entity
 * equivalent in this module; this synthesizes a smooth, deterministic
 * monthly trajectory instead (same "hand-authored, never `Math.random`"
 * discipline as `derive/net-worth-history.ts`). Returns `[]` when today's
 * score itself is `null` (nothing computable) — never a fabricated history
 * for an undefined score.
 */
export function deriveFinancialHealthScoreHistory(
  breakdown: FinancialHealthScoreBreakdown,
  now: Date,
): FinancialHealthScoreHistoryPoint[] {
  if (breakdown.score === null) {
    return []
  }

  const startScore = Math.max(0, Math.min(100, breakdown.score - 12))
  const monthOffsets = [5, 4, 3, 2, 1, 0]

  return monthOffsets.map((monthsAgo, index) => {
    const fraction = index / (monthOffsets.length - 1)
    const score =
      monthsAgo === 0
        ? breakdown.score!
        : Math.round(startScore + (breakdown.score! - startScore) * fraction)

    const date = relativeDate(monthsAgo * 30, now)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")

    return { date: `${year}-${month}-${day}`, score }
  })
}
