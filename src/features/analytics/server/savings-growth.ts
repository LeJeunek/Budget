import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"
import { getMonthlySummary } from "@/features/dashboard/server/service"
import { getGainLossForPeriod } from "@/features/investments/server/service"

import type { ReportingPeriodRange, SavingsGrowthPoint } from "../types"
import { enumerateMonthKeys, resolveMonthKeyRange } from "./period"

// Savings Growth (analytics.md AC15) is kept in its own file, per
// docs/architecture/folder-tree.md's Phase 3b file layout — the one Pass 2
// metric with *two* outbound cross-domain calls (Dashboard's
// `getMonthlySummary` and Investments' `getGainLossForPeriod`), mirroring
// `budget-comparison.ts`'s "isolate the metric with an outbound cross-domain
// dependency" precedent from Pass 1.

/** All-time floor for `getSavingsGrowth` when `period.start === null` — the
 * earliest month with *any* transaction activity (income or expense), not
 * expense-only (unlike `spending-trends.ts`'s equivalent helper): a month
 * with only income transactions is still a meaningful "how much did I
 * actually save" data point. Mirrors `budget-comparison.ts`'s
 * `resolveEarliestActivityDate` exactly, for the identical reason. */
async function resolveEarliestActivityDate(userId: string): Promise<Date | null> {
  const result = await db.transaction.aggregate({
    where: { userId, ...EXCLUDE_SPLIT_PARENTS },
    _min: { date: true },
  })
  return result._min.date ?? null
}

/**
 * Savings Growth (analytics.md AC15): the trend, over the selected period,
 * of the user's actual month-by-month savings — `(actual income - actual
 * expenses) - that same month's investment gain/loss` — so unrealized
 * market appreciation is never mistaken for "you saved more" (this metric's
 * entire reason for being Pass 2, per analytics.md's Data-Dependency Split
 * section).
 *
 * **`getMonthlySummary` is the single source of truth for a month's
 * income/expenses** (never re-derived independently here) — this metric's
 * `actualSavings` therefore always agrees with what `cashFlow` would show
 * for that same month on the Dashboard, before the investment-gain
 * adjustment is subtracted, satisfying analytics.md's Success Metrics
 * "never disagree with the Dashboard" bar.
 *
 * **`$0` income month (Edge Cases):** excluded from the trend as `null`,
 * mirroring `dashboard.service`'s own `computeSavingsRate` null-on-zero-
 * income convention exactly — never a divide-by-zero (this metric doesn't
 * divide by income at all, but a `$0`-income month is still not a
 * meaningful "did you save more" data point, per analytics.md's own explicit
 * edge case) and never a misleading `0`.
 *
 * **Investments' gain/loss data unavailable (Edge Cases):**
 * `getGainLossForPeriod` already returns a plain `0` for a user with no
 * holdings/no history in range (see that function's own JSDoc) — this
 * function needs no special-casing for that at all, it falls out for free.
 *
 * Every month in the period is included (even a `$0` or excluded-as-`null`
 * one) — the same "true gap, not a missing month" convention every other
 * per-month metric in this module follows.
 */
export async function getSavingsGrowth(
  userId: string,
  period: ReportingPeriodRange,
): Promise<SavingsGrowthPoint[]> {
  const start = period.start ?? (await resolveEarliestActivityDate(userId))
  if (!start) {
    return []
  }

  const monthKeys = enumerateMonthKeys(start, period.end)

  return Promise.all(
    monthKeys.map(async (monthKey): Promise<SavingsGrowthPoint> => {
      const { start: monthStart, end: monthEnd } = resolveMonthKeyRange(monthKey)

      const [summary, gainLoss] = await Promise.all([
        getMonthlySummary(userId, monthStart),
        getGainLossForPeriod(userId, { start: monthStart, end: monthEnd }),
      ])

      if (summary.income === 0) {
        return { month: monthKey, actualSavings: null }
      }

      const actualSavings = summary.income - summary.expenses - gainLoss
      return { month: monthKey, actualSavings }
    }),
  )
}
