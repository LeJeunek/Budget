import { assembleCashFlowReportData } from "./data/cash-flow"
import { assembleExpenseReportData } from "./data/expense"
import { assembleIncomeReportData } from "./data/income"
import { assembleMonthlyReportData } from "./data/monthly"
import { assembleTaxSummaryReportData } from "./data/tax-summary"
import { assembleYearlyReportData } from "./data/yearly"
import { resolveReportPeriod, toReportPeriodView } from "./period"
import type { ResolvedPeriod } from "./period"
import { renderReportPdf } from "./render"
import { parseGenerateReportRequest, type RawReportQueryParams } from "./validation"
import type { GenerateReportRequest, ReportData, ReportMeta } from "../types"

/**
 * `generateReport(userId, params)` — orchestrates validate -> resolve period
 * -> reject a not-yet-started future period -> dispatch to the matching
 * `data/*.ts` assembler -> `render.ts` -> return, per
 * phase-4b-technical-design.md §3's `service.ts` module doc: "This is the
 * ONLY function `app/api/reports/route.ts` calls."
 *
 * Never throws for an ordinary validation/business-rule failure (a bad
 * query param, a future period) — those are `{ status: "error" }` outcomes
 * the Route Handler maps to an ordinary `ApiResult<never>` 400, per
 * reports.md Cross-Cutting Requirement #6 ("a generation failure is honest
 * and recoverable"). A genuine, unexpected rendering/database failure is
 * left to propagate and is caught by the Route Handler itself (mapped to a
 * 500), matching this codebase's usual "let an unexpected error propagate to
 * the one boundary that turns it into an `ApiResult`" convention.
 */
export type GenerateReportOutcome =
  | { status: "ok"; buffer: Buffer; filename: string }
  | { status: "error"; message: string }

const REPORT_TYPE_FILENAME_SEGMENT: Record<GenerateReportRequest["type"], string> = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
  TAX_SUMMARY: "tax-summary",
  INCOME: "income",
  EXPENSE: "expense",
  CASH_FLOW: "cash-flow",
}

/** `"<type>-<period>.pdf"`, per api-contracts.md's `Content-Disposition`
 * contract — `period.start`/`period.end` (already `"yyyy-MM-dd"` strings)
 * are reused directly rather than the human-readable `label` (which may
 * contain spaces/punctuation unsuitable for a filename). */
function buildFilename(request: GenerateReportRequest, period: ReportMeta["period"]): string {
  const typeSegment = REPORT_TYPE_FILENAME_SEGMENT[request.type]
  const periodSegment = period.start ? `${period.start}_to_${period.end}` : period.end
  return `${typeSegment}-${periodSegment}.pdf`
}

async function assembleReportData(
  userId: string,
  request: GenerateReportRequest,
  period: ResolvedPeriod,
  meta: ReportMeta,
): Promise<ReportData> {
  switch (request.type) {
    case "MONTHLY": {
      const content = await assembleMonthlyReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    case "YEARLY": {
      const content = await assembleYearlyReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    case "TAX_SUMMARY": {
      const content = await assembleTaxSummaryReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    case "INCOME": {
      const content = await assembleIncomeReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    case "EXPENSE": {
      const content = await assembleExpenseReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    case "CASH_FLOW": {
      const content = await assembleCashFlowReportData(userId, period)
      return { ...meta, type: request.type, ...content }
    }
    default: {
      const exhaustive: never = request
      throw new Error(`Unhandled report request type: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export async function generateReport(
  userId: string,
  rawParams: RawReportQueryParams,
): Promise<GenerateReportOutcome> {
  const parsed = parseGenerateReportRequest(rawParams)
  if (!parsed.success) {
    return { status: "error", message: parsed.error }
  }
  const request = parsed.data

  const resolution = resolveReportPeriod(request)
  if (resolution.status === "future") {
    // reports.md's own Edge Case: "a plain 'this period hasn't happened yet'
    // message rather than generating an empty or fabricated report."
    return { status: "error", message: "This period hasn't happened yet." }
  }

  const meta: ReportMeta = {
    period: toReportPeriodView(resolution.period),
    generatedAt: new Date().toISOString(),
  }

  const data = await assembleReportData(userId, request, resolution.period, meta)
  const buffer = await renderReportPdf(data)
  const filename = buildFilename(request, meta.period)

  return { status: "ok", buffer, filename }
}
