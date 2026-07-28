import { renderToBuffer } from "@react-pdf/renderer"

import { CashFlowReportTemplate } from "../pdf/templates/cash-flow"
import { ExpenseReportTemplate } from "../pdf/templates/expense"
import { IncomeReportTemplate } from "../pdf/templates/income"
import { MonthlyReportTemplate } from "../pdf/templates/monthly"
import { TaxSummaryReportTemplate } from "../pdf/templates/tax-summary"
import { YearlyReportTemplate } from "../pdf/templates/yearly"
import type { ReportData } from "../types"

/**
 * `renderReportPdf(data): Promise<Buffer>` — the one function that calls
 * `@react-pdf/renderer`'s `renderToBuffer`, dispatching to the matching
 * template by `data.type`, per phase-4b-technical-design.md §3: "THE ONLY
 * file in this module that imports `@react-pdf/renderer` directly (mirrors
 * `lib/ai/client.ts`'s 'one file owns the third-party import' convention)
 * ... good practice for a future library swap to touch one file."
 *
 * Every `data.type` branch below hands its own already-typed DTO to its own
 * template component — a plain `switch` rather than a lookup table keyed by
 * a loosely-typed union, so TypeScript's exhaustiveness check (the
 * `default` branch's `never` assertion) fails to compile if a seventh report
 * type is ever added to `ReportType` without a matching template being wired
 * in here.
 */
export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  switch (data.type) {
    case "MONTHLY":
      return renderToBuffer(MonthlyReportTemplate({ data }))
    case "YEARLY":
      return renderToBuffer(YearlyReportTemplate({ data }))
    case "TAX_SUMMARY":
      return renderToBuffer(TaxSummaryReportTemplate({ data }))
    case "INCOME":
      return renderToBuffer(IncomeReportTemplate({ data }))
    case "EXPENSE":
      return renderToBuffer(ExpenseReportTemplate({ data }))
    case "CASH_FLOW":
      return renderToBuffer(CashFlowReportTemplate({ data }))
    default: {
      const exhaustive: never = data
      throw new Error(`Unhandled report type: ${JSON.stringify(exhaustive)}`)
    }
  }
}
