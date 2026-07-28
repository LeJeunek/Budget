import { formatMonthKey } from "@/features/analytics/server/period"
import { getBudgetMonth } from "@/features/budgeting/server/service"
import { getMonthlySummary, getSpendingByCategory } from "@/features/dashboard/server/service"
import { getNetWorthAsOf } from "@/features/dashboard/server/net-worth-history"
import { getSummaryForMonth } from "@/features/dashboard/server/monthly-summary"

import type { MonthlyReportData, ReportNetWorthChange } from "../../types"
import { assertConcretePeriodStart, type ResolvedPeriod } from "../period"

/**
 * Monthly Report (reports.md §1) — thin data assembly only, per
 * phase-4b-technical-design.md §3's "ONLY calls other domains' already-
 * existing, already-reviewed read functions" rule. Every figure here is
 * sourced from an already-existing service; this file adds no new
 * aggregation logic of its own beyond plain composition/reshaping.
 */

/** `income !== 0 || expenses !== 0` — mirrors
 * `dashboard.server/monthly-summary.ts`'s `computeHasActivity` formula
 * exactly (that function is private to its own module, so this is a small,
 * deliberate one-line re-derivation of the identical rule, not a new
 * definition of "activity" — see this codebase's established
 * "small duplication is the accepted alternative to cross-importing another
 * feature's internals" convention). */
function computeHasActivity(income: number, expenses: number): boolean {
  return income !== 0 || expenses !== 0
}

/** `end.netWorth - start.netWorth`, or `null` when either boundary is
 * unavailable — mirrors `dashboard.server/monthly-summary.ts`'s
 * `computeNetWorthChange` formula exactly, for the same "small, deliberate
 * duplicate of an already-established one-line formula" reason as
 * `computeHasActivity` above. */
function buildNetWorthChange(
  start: { date: string; netWorth: number } | null,
  end: { date: string; netWorth: number } | null,
): ReportNetWorthChange {
  return {
    start,
    end,
    change: start && end ? end.netWorth - start.netWorth : null,
  }
}

/**
 * Assembles the Monthly Report's content (everything but `ReportMeta`,
 * which `server/service.ts` supplies) for `period` — always a single
 * calendar month (`server/period.ts`'s `resolveMonthlyReportPeriod`).
 */
export async function assembleMonthlyReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<MonthlyReportData, "type" | "period" | "generatedAt">> {
  const monthStart = assertConcretePeriodStart(period)
  const monthKey = formatMonthKey(monthStart)

  const [monthTotals, spendingByCategory, netWorthStart, netWorthEnd, budgetMonth, recap] =
    await Promise.all([
      getMonthlySummary(userId, monthStart),
      getSpendingByCategory(userId, monthStart),
      // "Start of the month": the closest already-captured snapshot at or
      // before this month's first day.
      getNetWorthAsOf(userId, monthStart),
      // "End of the month": the closest snapshot at or before the period's
      // own (possibly month-to-date-clamped) end date.
      getNetWorthAsOf(userId, period.end),
      getBudgetMonth(userId, monthKey),
      // reports.md §1: "this can only exist for a fully closed month" — the
      // current, in-progress month never has a `MonthlySummary` row (AC3),
      // so this call is skipped entirely rather than issuing a query that
      // will always resolve to `null` anyway.
      period.isPartial ? Promise.resolve(null) : getSummaryForMonth(userId, monthKey),
    ])

  return {
    summary: {
      income: monthTotals.income,
      expenses: monthTotals.expenses,
      cashFlow: monthTotals.cashFlow,
      savingsRate: monthTotals.savingsRate,
      hasActivity: computeHasActivity(monthTotals.income, monthTotals.expenses),
    },
    netWorth: buildNetWorthChange(netWorthStart, netWorthEnd),
    spendingByCategory,
    budgetVsActual: budgetMonth.hasAnyBudgetData ? budgetMonth : null,
    narrative: recap?.narrative ?? null,
  }
}
