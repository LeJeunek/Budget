"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { ReportingPeriod } from "@/features/analytics/types"
import type { GenerateReportRequest } from "@/features/reports/types"

/**
 * `useReportDownload` — triggers `GET /api/reports` for a resolved
 * `GenerateReportRequest` and downloads the returned PDF, per
 * docs/architecture/api-contracts.md's Phase 4b Reports row.
 *
 * This is deliberately a plain `fetch`-backed `useMutation`, **not** a
 * wrapper around a Server Action (unlike every other mutation hook in this
 * codebase, e.g. `features/transactions/hooks/use-transactions.ts`) — the
 * success response is raw `application/pdf` bytes with a
 * `Content-Disposition: attachment` header, not JSON a Server Action's RSC
 * payload channel can carry. The failure response *is* an ordinary
 * `ApiResult<never>` JSON body (reports.md Cross-Cutting Requirement #6),
 * parsed below and surfaced by the caller (`<ReportDownloadButton>`) as a
 * `sonner` toast, same pattern `notification-bell.tsx` already established.
 */

/** Same kebab-case <-> `ReportingPeriod` vocabulary
 * `report-type-select.tsx`'s `PRESET_OPTIONS` already duplicates from
 * `reporting-period-selector.tsx` — this file's own instance of that same
 * "small, deliberate duplication" convention, since this is the one place
 * a `GenerateReportRequest` gets serialized back into the wire's kebab-case
 * query string. */
const PRESET_TO_PARAM: Record<ReportingPeriod, string> = {
  THIS_YEAR: "this-year",
  YEAR_TO_DATE: "year-to-date",
  LAST_12_MONTHS: "last-12-months",
  ALL_TIME: "all-time",
}

/** `"yyyy-MM-dd"` from a UTC-midnight `Date` — the inverse of
 * `server/validation.ts`'s `DateParamSchema` transform. Safe to take
 * straight from `toISOString` here (no timezone risk) because every `Date`
 * this function receives was itself built from a `T00:00:00.000Z` literal
 * by `report-type-select.tsx`'s `resolveFlexiblePeriod`. */
function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Builds `GET /api/reports`'s query string from an already-resolved
 * `GenerateReportRequest` — the client-side inverse of
 * `features/reports/server/validation.ts`'s `parseGenerateReportRequest`.
 * Kept here rather than imported from that module: it lives under
 * `features/reports/server/`, which a Client Component can never import.
 */
function buildReportQueryString(request: GenerateReportRequest): string {
  const params = new URLSearchParams()

  switch (request.type) {
    case "MONTHLY":
      params.set("type", "monthly")
      params.set("month", request.month)
      break
    case "YEARLY":
      params.set("type", "yearly")
      params.set("year", String(request.year))
      break
    case "TAX_SUMMARY":
      params.set("type", "tax-summary")
      params.set("year", String(request.year))
      break
    case "INCOME":
    case "EXPENSE":
    case "CASH_FLOW": {
      params.set("type", request.type === "CASH_FLOW" ? "cash-flow" : request.type.toLowerCase())
      if (request.period.kind === "PRESET") {
        params.set("period", PRESET_TO_PARAM[request.period.preset])
      } else {
        params.set("start", toDateParam(request.period.start))
        params.set("end", toDateParam(request.period.end))
      }
      break
    }
    default: {
      const exhaustive: never = request
      throw new Error(`Unhandled report type: ${String((exhaustive as GenerateReportRequest).type)}`)
    }
  }

  return params.toString()
}

/** Pulls the server-supplied filename out of `Content-Disposition:
 * attachment; filename="<type>-<period>.pdf"` (api-contracts.md's Phase 4b
 * Reports row) — falls back to a generic name in the defensive case that
 * header is ever missing/malformed. */
function extractFilename(contentDisposition: string | null): string {
  const match = contentDisposition ? /filename="([^"]+)"/.exec(contentDisposition) : null
  return match?.[1] ?? "report.pdf"
}

async function downloadReport(request: GenerateReportRequest): Promise<void> {
  const response = await fetch(`/api/reports?${buildReportQueryString(request)}`)

  if (!response.ok) {
    const result = (await response.json()) as ApiResult<never>
    throw new Error(
      result.success === false ? result.error : "Report generation failed. Please try again.",
    )
  }

  const blob = await response.blob()
  const filename = extractFilename(response.headers.get("Content-Disposition"))

  // Standard blob-download pattern — this feature's own first use of it in
  // this codebase (the one other binary-download flow,
  // `transactions/components/receipt-list.tsx`, links directly to an
  // already-hosted uploadthing file URL instead, since a receipt has a
  // persisted, stable URL to link to; a generated report does not — per
  // reports.md's "no stored artifact to leak" design, `GET /api/reports`
  // produces its PDF synchronously, on demand, with nothing to link to
  // after the fact). A momentarily-appended, hidden `<a download>` anchor
  // triggers the browser's native save dialog without navigating away from
  // this page.
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

export function useReportDownload(): UseMutationResult<void, Error, GenerateReportRequest> {
  return useMutation({
    mutationFn: downloadReport,
  })
}
