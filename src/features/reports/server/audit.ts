import { db } from "@/lib/db"
import type { ReportGenerationEvent, ReportType } from "@prisma/client"

/**
 * Reports' first-ever cross-user query (docs/architecture/
 * phase-4c-technical-design.md §5.3, resolving risk-register.md #30).
 *
 * **This function is deliberately, explicitly `userId`-unscoped** — the
 * first read function in this entire codebase that is not filtered to a
 * single authenticated user's own data, a genuine, narrow exception to
 * risk-register.md #4's standing "every query scoped by the authenticated
 * user's own ID" rule. This is safe **only** because it is never called from
 * anywhere except Admin's own, already-`getCurrentAdminUser()`-gated Server
 * Component (`app/admin/audit-log/page.tsx`, a later Backend Engineer/
 * Frontend Lead dispatch) — the same "checked live, on every request"
 * discipline every other admin surface relies on, applied here to a read
 * instead of a write. Flagged for the Security Architect's Phase 4c review
 * gate (risk-register.md #33) — verification that this exception is never
 * reachable outside `app/admin/` is required before release, not assumed
 * from this file's own doc comment alone.
 *
 * This function stays inside `features/reports/server/` (Reports owns the
 * table it reads) rather than living in `features/admin/`, matching the
 * "owning domain exposes the cross-cutting read, consuming domain calls it"
 * shape already established for `getDividendIncomeForPeriod`/
 * `getSummaryForMonth` in Phase 4b — Admin is simply this pattern's newest,
 * and most cross-user, consumer.
 */

/** The audit-log-safe projection of a `ReportGenerationEvent` row — every
 * field Admin's Audit Log needs to render "a Monthly Report was generated
 * for July 2026," and nothing more (no report bytes, no report ID a client
 * could use to re-fetch/replay a specific generation — see this model's own
 * schema comment). */
export interface ReportGenerationEventSummary {
  id: string
  userId: string
  type: ReportType
  periodLabel: string
  generatedAt: Date
}

export interface GetReportGenerationEventsOptions {
  type?: ReportType
  start?: Date
  end?: Date
  /** The `id` of the last row from a previous page — cursor-based pagination,
   * the same `?cursor=` searchParam-navigation convention Admin's other
   * cross-user list (`getUsers`) uses. Omit for the first page. */
  cursor?: string
}

/** Bounded page size — this table has no natural upper bound on total row
 * count over time (one row per successful report generation, across every
 * user, forever — risk-register.md #31's "indefinite retention" decision),
 * so every read here is paginated, never a full-table fetch. */
const PAGE_SIZE = 50

/**
 * Returns up to `PAGE_SIZE` events, most-recently-generated first, optionally
 * filtered by `type` and/or a `[start, end)` `generatedAt` range. The last
 * returned row's `id` is the next page's `cursor`.
 */
export async function getReportGenerationEvents(
  options: GetReportGenerationEventsOptions = {},
): Promise<ReportGenerationEventSummary[]> {
  const { type, start, end, cursor } = options

  const events: ReportGenerationEvent[] = await db.reportGenerationEvent.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(start || end
        ? {
            generatedAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lt: end } : {}),
            },
          }
        : {}),
    },
    orderBy: { generatedAt: "desc" },
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  return events.map((event) => ({
    id: event.id,
    userId: event.userId,
    type: event.type,
    periodLabel: event.periodLabel,
    generatedAt: event.generatedAt,
  }))
}
