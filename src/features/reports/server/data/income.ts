import { deriveIncomeSourcesFromGrowth, getIncomeGrowth } from "@/features/analytics/server/income-analytics"
import { resolveMonthKeyRange } from "@/features/analytics/server/period"
import { getIncomeStreams, getStreamById } from "@/features/recurring-income/server/service"

import type { IncomeReportData, ReportIncomeStreamActivity } from "../../types"
import type { ResolvedPeriod } from "../period"

/**
 * Income Report (reports.md §4) — the selected period reuses Analytics'
 * shared reporting-period presets plus the custom-range extension
 * (`server/period.ts`'s `resolveFlexibleReportPeriod`), so `period` here may
 * legitimately have a `null` start ("All Time").
 */

/** Mirrors `yearly.ts`'s identical helper — see that file's JSDoc. Kept as a
 * small, deliberate duplicate rather than a shared export: both call sites
 * are the only two in this feature, and a shared helper module for exactly
 * two three-line callers would be a needless extra file for this feature's
 * actual size (see `folder-tree.md`'s "avoid duplication" guidance applied
 * proportionally, not dogmatically). */
async function buildStreamActivity(
  userId: string,
  streamId: string,
  streamName: string,
  type: string,
  start: Date,
  end: Date,
): Promise<ReportIncomeStreamActivity> {
  const detail = await getStreamById(userId, streamId)
  const inRange = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  let occurrenceCount = 0
  let receivedCount = 0
  let receivedTotal = 0

  if (detail && "occurrences" in detail) {
    for (const occurrence of detail.occurrences) {
      if (!inRange(occurrence.expectedDate)) continue
      occurrenceCount += 1
      if (occurrence.status === "RECEIVED" && occurrence.receivedAmount !== null) {
        receivedCount += 1
        receivedTotal += occurrence.receivedAmount
      }
    }
  } else if (detail && "events" in detail) {
    for (const event of detail.events) {
      if (!inRange(event.date)) continue
      occurrenceCount += 1
      receivedCount += 1
      receivedTotal += event.amount
    }
  }

  return { streamId, streamName, type, occurrenceCount, receivedCount, receivedTotal }
}

/**
 * Assembles the Income Report's content. `bySource` is derived from the same
 * `getIncomeGrowth` call used for `monthlyTrend` (via
 * `deriveIncomeSourcesFromGrowth`), per that function's own JSDoc: "avoid[s]
 * the redundant fetch ... a second, fully redundant `getIncomeGrowth` call."
 * Reports.md's own "a user with no Recurring Income streams" edge case is
 * satisfied structurally: `bySource`'s `"UNTRACKED"` bucket still carries
 * the period's full total-income figure regardless of `hasStreams`.
 */
export async function assembleIncomeReportData(
  userId: string,
  period: ResolvedPeriod,
): Promise<Omit<IncomeReportData, "type" | "period" | "generatedAt">> {
  const [monthlyTrend, incomeStreams] = await Promise.all([
    getIncomeGrowth(userId, period),
    getIncomeStreams(userId),
  ])

  const bySource = deriveIncomeSourcesFromGrowth(monthlyTrend)

  // Individual receipt-history listing (reports.md §4's "a list of
  // individual received income occurrences/events") needs a concrete
  // `[start, end]` window. For an "All Time" period (`period.start === null`),
  // `getIncomeGrowth`'s own already-resolved bounded month list (its "All
  // Time" floor, per that function's own JSDoc) is reused here rather than
  // issuing a second, independent floor-resolution query — the earliest
  // month it actually returned *is* this period's real floor. `null` only
  // when there is genuinely zero income activity ever (an empty
  // `monthlyTrend`), in which case there is nothing to list.
  const rangeStart = period.start ?? (monthlyTrend[0] ? resolveMonthKeyRange(monthlyTrend[0].month).start : null)
  const streams =
    rangeStart === null
      ? []
      : await Promise.all(
          incomeStreams.map((stream) =>
            buildStreamActivity(userId, stream.id, stream.name, stream.type, rangeStart, period.end),
          ),
        )

  return { monthlyTrend, bySource, streams, hasStreams: incomeStreams.length > 0 }
}
