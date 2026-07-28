"use client"

/**
 * `<ReportTypeSelect>` — thin placeholder only.
 *
 * Per this feature's task brief: the Frontend Lead owns the actual report
 * type + period picker UI (wiring it to `GET /api/reports`'s query-string
 * contract, per api-contracts.md's Phase 4b Reports row). This stub exists
 * only so `features/reports/components/` isn't an empty, undiscoverable
 * folder for the next agent picking up the frontend half of this feature —
 * it renders nothing meaningful and must be replaced, not extended.
 *
 * Backend Engineer scope note: no styling, no UI logic, and no data-fetching
 * belongs in this file or its sibling — see `server/service.ts` for the one
 * function (`generateReport`) the real component should ultimately drive via
 * `app/api/reports/route.ts`.
 */
export function ReportTypeSelect() {
  return null
}
