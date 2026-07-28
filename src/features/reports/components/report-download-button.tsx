"use client"

/**
 * `<ReportDownloadButton>` — thin placeholder only.
 *
 * Per this feature's task brief: the Frontend Lead owns the real
 * in-progress-state/download/honest-failure-toast behavior (reports.md's
 * Acceptance Criteria #2 and Cross-Cutting Requirement #6), fetching
 * `GET /api/reports` and triggering a `Blob` download on a `200` response
 * with `Content-Type: application/pdf`, or reading the `ApiResult<never>`
 * JSON body on a non-2xx response. This stub is a placeholder only.
 */
export function ReportDownloadButton() {
  return null
}
