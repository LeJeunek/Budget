import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import type { Transaction } from "@/features/transactions/types"
import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"

import { DEMO_DEBT_IDS, DEMO_FINANCIAL_GOAL_IDS, DEMO_USER_ID } from "./ids"
import { relativeDate, relativeMonthStart } from "./relative-date"
import { deriveNetWorth } from "./derive/net-worth"
import { deriveNetWorthHistory } from "./derive/net-worth-history"
import { deriveMonthlySummary } from "./derive/monthly-summary"

/**
 * The demo household's three Financial Goals — one of each type
 * (`DEBT_PAYOFF`, `NET_WORTH_SAVINGS_TARGET`, `SAVINGS_RATE_TARGET`), all
 * in progress at a real, partial value — satisfying public-demo.md
 * Capability 2 AC4's "at least one in-progress Financial Goal of a type
 * other than debt-payoff" with margin (two non-debt-payoff types).
 *
 * Every per-type progress formula below (`computeDebtPayoffPercent`,
 * `isDebtPayoffComplete`, `computeNetWorthTargetProgress`,
 * `computeRollingSavingsRateAverage`, `isSavingsRateTargetComplete`) is a
 * line-for-line mirror of `features/financial-goals/server/progress-math.ts`
 * (that file lives under `features/financial-goals/server/`, blocked by
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule, hence
 * this reimplementation — flagged per §2.2, same treatment as
 * `savings-goals.ts`'s mirror of `goals/server/service.ts`).
 *
 * `currentMeasuredValue`/`trend` (Type 2) and `currentRollingAverageRate`
 * (Type 3) are computed by calling this module's own `derive/net-worth.ts`/
 * `derive/net-worth-history.ts`/`derive/monthly-summary.ts` functions
 * directly — the same "shared computation, not independently authored"
 * figures Dashboard's Net Worth stat and Monthly Summary already use, so
 * this page's numbers can never silently drift from theirs.
 */

function computeDebtPayoffPercent(startingBalance: number, currentEffectiveBalance: number): number {
  if (startingBalance <= 0) {
    return 100
  }
  const rawPercent = ((startingBalance - currentEffectiveBalance) / startingBalance) * 100
  return Math.min(Math.max(rawPercent, 0), 100)
}

function isDebtPayoffComplete(currentEffectiveBalance: number): boolean {
  return currentEffectiveBalance <= 0
}

function computeNetWorthTargetProgress(
  currentMeasuredValue: number,
  targetAmount: number,
): { distanceToTarget: number; isCompleted: boolean } {
  return {
    distanceToTarget: targetAmount - currentMeasuredValue,
    isCompleted: currentMeasuredValue >= targetAmount,
  }
}

function computeRollingSavingsRateAverage(monthlyRates: Array<number | null>): number | null {
  const qualifying = monthlyRates.filter((rate): rate is number => rate !== null)
  if (qualifying.length === 0) {
    return null
  }
  return qualifying.reduce((sum, rate) => sum + rate, 0) / qualifying.length
}

function isSavingsRateTargetComplete(
  rollingAverageRatePercent: number | null,
  targetPercent: number,
): boolean {
  return rollingAverageRatePercent !== null && rollingAverageRatePercent >= targetPercent
}

/** Trailing 3-month rolling window (current, in-progress month plus the two
 * before it) — mirrors `financial-health-score/server/service.ts`'s
 * `resolveThreeMonthWindow`'s window shape (also blocked by §4.1, hence a
 * small, self-contained loop here rather than an import). */
function resolveTrailingThreeMonths(now: Date): Date[] {
  return [2, 1, 0].map((monthsAgo) => relativeMonthStart(monthsAgo, now))
}

export function buildDemoFinancialGoals(params: {
  now: Date
  accounts: Account[]
  debts: DebtWithProjection[]
  transactions: Transaction[]
}): FinancialGoalWithProgress[] {
  const { now, accounts, debts, transactions } = params

  // ---- Type 1 — Debt Payoff (linked to the Student Loan) ------------------
  const studentLoan = debts.find((debt) => debt.id === DEMO_DEBT_IDS.studentLoan)
  if (!studentLoan) {
    throw new Error("demo financial-goals: student loan debt not found")
  }
  // Captured once, at creation — a fixed anchor higher than the debt's
  // current balance, so payoff progress reads as genuinely partial.
  const debtPayoffStartingBalance = 26000

  const debtPayoffGoal: FinancialGoalWithProgress = {
    id: DEMO_FINANCIAL_GOAL_IDS.studentLoanPayoff,
    userId: DEMO_USER_ID,
    name: "Pay Off Student Loan",
    type: "DEBT_PAYOFF",
    linkedDebtId: studentLoan.id,
    startingBalance: debtPayoffStartingBalance,
    targetAmount: null,
    measurementBasis: null,
    targetPercent: null,
    targetDate: null,
    archivedAt: null,
    createdAt: relativeDate(400, now),
    updatedAt: relativeDate(3, now),
    completionNotifiedAt: null,
    accountIds: [],
    currentEffectiveBalance: studentLoan.effectiveBalance,
    percentPaidOff: computeDebtPayoffPercent(debtPayoffStartingBalance, studentLoan.effectiveBalance),
    linkedDebtArchived: studentLoan.archivedAt !== null,
    isCompleted: isDebtPayoffComplete(studentLoan.effectiveBalance),
  }

  // ---- Type 2 — Net Worth Savings Target (Total Net Worth basis) ----------
  const netWorth = deriveNetWorth(accounts, debts)
  const netWorthTargetAmount = 50000
  const netWorthProgress = computeNetWorthTargetProgress(netWorth.total, netWorthTargetAmount)
  const netWorthHistoryByRange = deriveNetWorthHistory(
    netWorth.total,
    netWorth.totalUnlinkedDebtLiability,
    now,
  )

  const netWorthGoal: FinancialGoalWithProgress = {
    id: DEMO_FINANCIAL_GOAL_IDS.netWorthMilestone,
    userId: DEMO_USER_ID,
    name: "Reach $50,000 Net Worth",
    type: "NET_WORTH_SAVINGS_TARGET",
    linkedDebtId: null,
    startingBalance: null,
    targetAmount: netWorthTargetAmount,
    measurementBasis: "TOTAL_NET_WORTH",
    targetPercent: null,
    targetDate: null,
    archivedAt: null,
    createdAt: relativeDate(175, now),
    updatedAt: relativeDate(1, now),
    completionNotifiedAt: null,
    accountIds: [],
    currentMeasuredValue: netWorth.total,
    distanceToTarget: netWorthProgress.distanceToTarget,
    isCompleted: netWorthProgress.isCompleted,
    trend: netWorthHistoryByRange.all.points.map((point) => ({
      date: point.date,
      value: point.netWorth,
    })),
  }

  // ---- Type 3 — Savings Rate Target ----------------------------------------
  const savingsRateTargetPercent = 20
  const trailingMonths = resolveTrailingThreeMonths(now)
  const trailingMonthlyRates = trailingMonths.map(
    (month) => deriveMonthlySummary(transactions, month, now).savingsRate,
  )
  const rollingAverageFraction = computeRollingSavingsRateAverage(trailingMonthlyRates)
  const rollingAveragePercent = rollingAverageFraction === null ? null : rollingAverageFraction * 100

  const savingsRateGoal: FinancialGoalWithProgress = {
    id: DEMO_FINANCIAL_GOAL_IDS.savingsRateTarget,
    userId: DEMO_USER_ID,
    name: "Save 20% of Income",
    type: "SAVINGS_RATE_TARGET",
    linkedDebtId: null,
    startingBalance: null,
    targetAmount: null,
    measurementBasis: null,
    targetPercent: savingsRateTargetPercent,
    targetDate: null,
    archivedAt: null,
    createdAt: relativeDate(150, now),
    updatedAt: relativeDate(1, now),
    completionNotifiedAt: null,
    accountIds: [],
    currentRollingAverageRate: rollingAveragePercent,
    isCompleted: isSavingsRateTargetComplete(rollingAveragePercent, savingsRateTargetPercent),
  }

  return [debtPayoffGoal, netWorthGoal, savingsRateGoal]
}
