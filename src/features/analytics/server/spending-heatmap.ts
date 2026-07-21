import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"

import type { DailySpendingHeatmapPoint, ReportingPeriodRange } from "../types"
import { formatDateKey } from "./period"

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Daily Spending Heatmap (analytics.md AC12): each day's total spending
 * relative to the user's own typical daily spending over the selected
 * period.
 *
 * Kept in its own file per Architecture.md's "Analytics module structure"
 * section: `Transaction.date` is already day-granular (a `@db.Date`
 * column), so — unlike Category Trends' two-dimensional bucketing — this is
 * a plain single-column `groupBy`, sharing no meaningful logic with any
 * other metric in this module.
 *
 * **`relativeIntensity`'s denominator** (`averageDailySpendOverPeriod`, per
 * api-contracts.md): total period spend divided by the **total number of
 * calendar days in the period** (not just the days that had any spending).
 * This is a deliberate choice, not an arbitrary one — dividing only by
 * "days with spending" would push every single day's relative intensity
 * toward ~1.0 regardless of how spiky or flat the user's actual pattern is,
 * defeating the whole point of a heatmap ("the 1st and 15th are
 * consistently high" only means something if quiet days between them
 * genuinely pull the average down). Days with $0 spending are simply
 * omitted from the returned array (see `../types.ts`'s
 * `DailySpendingHeatmapPoint` doc) — the frontend treats any date absent
 * from this array as zero, without this function needing to emit a
 * (potentially year-spanning) explicit zero row for every quiet day.
 */
export async function getDailySpendingHeatmap(
  userId: string,
  period: ReportingPeriodRange,
): Promise<DailySpendingHeatmapPoint[]> {
  const groups = await db.transaction.groupBy({
    by: ["date"],
    where: {
      userId,
      amount: { lt: 0 },
      date: period.start ? { gte: period.start, lte: period.end } : { lte: period.end },
      ...EXCLUDE_SPLIT_PARENTS,
    },
    _sum: { amount: true },
  })

  const dailyAmounts = groups
    .map((group) => ({
      date: group.date,
      amount: -(group._sum.amount?.toNumber() ?? 0) || 0,
    }))
    .filter((day) => day.amount > 0)

  if (dailyAmounts.length === 0) {
    return []
  }

  // "All Time" (period.start === null) has no fixed floor to measure the
  // period's day-count from — fall back to the earliest day that actually
  // had spending, the same "resolve the real floor from this user's own
  // data" pattern `spending-trends.ts`/`budget-comparison.ts` use for their
  // own All Time cases.
  const effectiveStart =
    period.start ??
    dailyAmounts.reduce(
      (earliest, day) => (day.date < earliest ? day.date : earliest),
      dailyAmounts[0].date,
    )

  const totalDays =
    Math.round((period.end.getTime() - effectiveStart.getTime()) / MS_PER_DAY) + 1
  const totalSpend = dailyAmounts.reduce((sum, day) => sum + day.amount, 0)
  const averageDailySpend = totalDays > 0 ? totalSpend / totalDays : 0

  return dailyAmounts
    .map((day) => ({
      date: formatDateKey(day.date),
      amount: day.amount,
      // Defensive only: `averageDailySpend` can only be 0 here if
      // `totalDays <= 0`, which can't happen once `dailyAmounts` is
      // non-empty (a day with spend implies `period.end` is at least that
      // day, so `totalDays >= 1`) — guarded anyway rather than trusting
      // that invariant silently.
      relativeIntensity: averageDailySpend > 0 ? day.amount / averageDailySpend : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
