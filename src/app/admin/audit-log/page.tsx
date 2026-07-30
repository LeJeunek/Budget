import { getAuditLog } from "@/features/admin/server/audit-log"
import type { AuditLogEventType } from "@/features/admin/types"
import { AUDIT_LOG_EVENT_TYPE_LABELS } from "@/features/admin/lib/audit-log-labels"
import { AuditLogFilters } from "@/features/admin/components/audit-log-filters"
import { AuditLogTable } from "@/features/admin/components/audit-log-table"
import { CursorPaginationControls } from "@/features/admin/components/cursor-pagination-controls"
import {
  cursorStateToSearchParams,
  getNextState,
  getPrevState,
  parseCursorState,
} from "@/features/admin/lib/cursor-pagination"

/**
 * Audit Logs (admin.md Capability 3). A Server Component: reads
 * `?type=`/`?start=`/`?end=`/`?cursor=`/`?history=` off `searchParams`,
 * calls `admin.server/audit-log.getAuditLog(...)` directly, and renders
 * exactly one page via `AuditLogTable` plus this file's own Prev/Next links
 * — same shape as `app/admin/users/page.tsx`, see that file's JSDoc and
 * `features/admin/lib/cursor-pagination.ts`'s header comment for why.
 *
 * `AuditLogFilters` (a small Client Component) drives `?type=`/`?start=`/
 * `?end=` via `router.push` on change — the actual filtered read still only
 * ever happens here, server-side.
 */

const VALID_EVENT_TYPES = new Set(Object.keys(AUDIT_LOG_EVENT_TYPE_LABELS))

function isValidEventType(value: string | undefined): value is AuditLogEventType {
  return value !== undefined && VALID_EVENT_TYPES.has(value)
}

/** `getAuditLog`'s window is `[start, end)` (exclusive upper bound) — a
 * date-only `?end=` input (e.g. "2026-07-26") is widened by one day here so
 * it includes every event that happened ON that day, not just up to its own
 * UTC midnight boundary. */
function endOfDayExclusive(dateOnly: string): Date {
  return new Date(new Date(`${dateOnly}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
}

export interface AdminAuditLogPageProps {
  searchParams: Promise<{
    type?: string
    start?: string
    end?: string
    cursor?: string
    history?: string
  }>
}

function buildHref(
  filters: { type?: AuditLogEventType; start?: string; end?: string },
  params: Record<string, string>,
): string {
  const query = new URLSearchParams()
  if (filters.type) query.set("type", filters.type)
  if (filters.start) query.set("start", filters.start)
  if (filters.end) query.set("end", filters.end)
  for (const [key, value] of Object.entries(params)) query.set(key, value)
  const qs = query.toString()
  return qs ? `/admin/audit-log?${qs}` : "/admin/audit-log"
}

export default async function AdminAuditLogPage({ searchParams }: AdminAuditLogPageProps) {
  const resolved = await searchParams
  const type = isValidEventType(resolved.type) ? resolved.type : undefined
  const start = resolved.start ? new Date(`${resolved.start}T00:00:00.000Z`) : undefined
  const end = resolved.end ? endOfDayExclusive(resolved.end) : undefined
  const cursorState = parseCursorState(resolved)

  const { entries, nextCursor } = await getAuditLog({
    type,
    start,
    end,
    cursor: cursorState.cursor,
  })

  const prevState = getPrevState(cursorState)
  const nextState = getNextState(cursorState, nextCursor)
  const filterHrefParams = { type, start: resolved.start, end: resolved.end }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          A history of AI feature usage, report generation, notification email sends, and
          Admin&apos;s own actions. Never a raw financial figure — only enough to identify what
          happened, to whom, and its outcome.
        </p>
      </div>

      <AuditLogFilters type={type} start={resolved.start} end={resolved.end} />

      <AuditLogTable entries={entries} />

      <CursorPaginationControls
        prevHref={
          prevState ? buildHref(filterHrefParams, cursorStateToSearchParams(prevState)) : null
        }
        nextHref={
          nextState ? buildHref(filterHrefParams, cursorStateToSearchParams(nextState)) : null
        }
      />
    </div>
  )
}
