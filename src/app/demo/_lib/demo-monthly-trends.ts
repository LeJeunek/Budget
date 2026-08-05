import type { MonthlyTrend } from "@/features/dashboard/types"
import type { Transaction } from "@/features/transactions/types"
import { deriveMonthlySummary } from "@/features/demo/fixtures/derive/monthly-summary"
import { relativeMonthStart } from "@/features/demo/fixtures/relative-date"

/**
 * Builds `/demo`'s Dashboard "Monthly Trends" chart data — six months (the
 * current, in-progress month plus five full prior months, matching
 * `features/demo/fixtures/transactions.ts`'s own authored history depth) of
 * `{ month, income, expenses }`, one row per month, computed by calling the
 * fixture layer's own `deriveMonthlySummary` once per month.
 *
 * Route-private (`src/app/demo/_lib/`, a Next.js-ignored path segment): no
 * `features/demo/fixtures/derive/*.ts` module computes this multi-month
 * shape today (every existing derive function resolves exactly one month at
 * a time), and this dispatch is scoped to read `src/features/demo/
 * fixtures/**` — not modify it. This file is page-level assembly over that
 * existing, already-reviewed `deriveMonthlySummary` function (the same
 * "shared computation, not independently authored" figure Dashboard's other
 * stat cards already use), never a new business rule of its own — the same
 * "route-private `_lib`, not a features/ addition" boundary
 * `app/(dashboard)/_lib/dashboard-card-groups.tsx` already establishes for
 * the real Dashboard page.
 */

const TREND_MONTHS_OF_HISTORY = 6

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function buildDemoMonthlyTrends(
  transactions: Transaction[],
  now: Date,
): MonthlyTrend[] {
  const monthsAgoOldestFirst = Array.from(
    { length: TREND_MONTHS_OF_HISTORY },
    (_, index) => TREND_MONTHS_OF_HISTORY - 1 - index,
  )

  return monthsAgoOldestFirst.map((monthsAgo) => {
    const monthStart = relativeMonthStart(monthsAgo, now)
    const summary = deriveMonthlySummary(transactions, monthStart, now)
    return {
      month: formatMonthKey(monthStart),
      income: summary.income,
      expenses: summary.expenses,
    }
  })
}
