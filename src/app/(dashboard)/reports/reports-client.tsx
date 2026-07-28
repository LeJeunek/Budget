"use client"

/**
 * ReportsClient — client-side composition root for the Reports page: owns
 * the shared `ReportSelectionState` both `<ReportTypeSelect>` (the picker)
 * and `<ReportDownloadButton>` (the trigger) need, resolving it into a
 * `GenerateReportRequest` (or `null` while incomplete) on every change via
 * `resolveReportRequest`. Mirrors `bills-client.tsx`/`transactions-client.tsx`'s
 * established Server-Component-page + colocated-Client-Component split —
 * `page.tsx` stays a Server Component purely for the standing auth guard,
 * since this feature has no server-fetched data of its own to hand down
 * (see that file's own JSDoc).
 */

import { useState } from "react"

import {
  ReportTypeSelect,
  createDefaultReportSelection,
  resolveReportRequest,
} from "@/features/reports/components/report-type-select"
import { ReportDownloadButton } from "@/features/reports/components/report-download-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ReportsClient() {
  const [selection, setSelection] = useState(createDefaultReportSelection())
  const request = resolveReportRequest(selection)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate a PDF report of your financial activity for a specific
          month, year, or custom date range — a self-contained document you
          can save, print, or hand to an accountant.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Generate a report</CardTitle>
          <CardDescription>
            Every report reflects a live snapshot of your data at the moment
            you generate it — regenerating the same period later may show
            different numbers if you&apos;ve since edited a transaction, added
            an account, or logged a dividend.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ReportTypeSelect value={selection} onChange={setSelection} />
          <ReportDownloadButton request={request} />
        </CardContent>
      </Card>
    </div>
  )
}
