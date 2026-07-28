"use client"

/**
 * <ReportDownloadButton> — triggers `GET /api/reports` for the currently
 * resolved report selection and downloads the returned PDF (reports.md
 * Acceptance Criteria #2: "The UI shows a clear in-progress state while a
 * report is being produced"; Cross-Cutting Requirement #6: "A generation
 * failure is honest and recoverable").
 *
 * All the actual fetch/blob-download/error-parsing work lives in
 * `useReportDownload` (`features/reports/hooks/use-report-download.ts`) —
 * this component is only responsible for the button's own disabled/loading
 * presentation and surfacing a failed generation as a `sonner` toast, the
 * same pattern `notification-bell.tsx` already established for this
 * codebase.
 */

import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { GenerateReportRequest } from "@/features/reports/types"
import { useReportDownload } from "@/features/reports/hooks/use-report-download"
import { Button } from "@/components/ui/button"

export interface ReportDownloadButtonProps {
  /** The currently resolved request, or `null` while the selection is
   * incomplete (e.g. a custom range with one date still unfilled) —
   * `report-type-select.tsx`'s own `resolveReportRequest` produces this. */
  request: GenerateReportRequest | null
}

export function ReportDownloadButton({ request }: ReportDownloadButtonProps) {
  const download = useReportDownload()

  function handleClick() {
    if (!request) return
    download.mutate(request, {
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Report generation failed. Please try again.",
        ),
    })
  }

  return (
    <Button
      type="button"
      disabled={!request || download.isPending}
      onClick={handleClick}
      className="self-start"
    >
      {download.isPending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Generating report...
        </>
      ) : (
        <>
          <Download aria-hidden="true" />
          Download report
        </>
      )}
    </Button>
  )
}
