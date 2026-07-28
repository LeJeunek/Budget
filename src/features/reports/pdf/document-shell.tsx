import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import type { ReactNode } from "react"

import type { ReportPeriodView, ReportType } from "../types"

/**
 * `<ReportDocument>` — the shared page frame every one of the six PDF
 * templates wraps its content in, per phase-4b-technical-design.md §3's
 * `pdf/document-shell.tsx` module doc: "type/period/generatedAt header
 * (Cross-Cutting Requirement #5), footer, and the disclaimer-banner slot the
 * Tax Summary Report always renders into (never conditionally hidden)."
 *
 * This file, along with every other file under `pdf/`, is rendered
 * exclusively by `server/render.ts` inside a Route Handler's request
 * lifecycle — never imported by `app/`, a Client Component, or shipped to the
 * client bundle (naming-standards.md's "server-only by convention" rule).
 */

const REPORT_TYPE_TITLES: Record<ReportType, string> = {
  MONTHLY: "Monthly Report",
  YEARLY: "Yearly Report",
  TAX_SUMMARY: "Tax Summary Report",
  INCOME: "Income Report",
  EXPENSE: "Expense Report",
  CASH_FLOW: "Cash Flow Report",
}

/** reports.md §1's "month to date" / every other type's "year to date"
 * labeling convention for a still-in-progress period, appended to the
 * header's period label. Cash Flow/Income/Expense's flexible periods never
 * set `isPartial` (see `server/period.ts`'s `resolveFlexibleReportPeriod`),
 * so this suffix only ever appears for Monthly/Yearly/Tax Summary. */
function partialSuffix(type: ReportType): string {
  return type === "MONTHLY" ? " (Month to Date)" : " (Year to Date)"
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#333333", borderBottomStyle: "solid", paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2, color: "#111111" },
  subtitle: { fontSize: 10, color: "#444444" },
  generatedAt: { fontSize: 8, color: "#777777", marginTop: 2 },
  disclaimer: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: "#fff8e1",
    borderWidth: 1,
    borderColor: "#e0c66b",
    borderStyle: "solid",
  },
  disclaimerText: { fontSize: 8, color: "#6b5900" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#dddddd",
    borderTopStyle: "solid",
    paddingTop: 4,
  },
})

interface ReportDocumentProps {
  type: ReportType
  period: ReportPeriodView
  generatedAt: string
  /** The Tax Summary Report's always-rendered disclaimer text — omitted
   * (`undefined`) for every other report type, per reports.md's own
   * per-type scoping ("the only narrative content across all six report
   * types" restriction applies to the Monthly Report's narrative, not this
   * fixed disclaimer string, which is developer-authored, never AI-generated
   * or user data). */
  disclaimer?: string
  children: ReactNode
}

/** `Intl.DateTimeFormat`, UTC, matching this codebase's established
 * UTC-calendar-date display convention (`lib/utils.ts`'s `formatDate`) —
 * `generatedAt` is a full timestamp (not a calendar-date-only field), so
 * `hour`/`minute` are included, distinguishing this from `formatDate`'s
 * date-only output (reports.md Cross-Cutting Requirement #5: "generation
 * date/time," not just date). */
const GENERATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
  // Pins the formatter to UTC, matching every sibling formatter in this
  // feature (`server/period.ts`'s `MONTH_NAME_FORMATTER`/
  // `DATE_LABEL_FORMATTER`) and `lib/utils.ts`'s `formatDate` — without this,
  // `Intl.DateTimeFormat` falls back to the server process's local
  // timezone, which can render a different *calendar date* (not just a
  // different clock hour) near a UTC day boundary depending purely on
  // server deployment configuration (see docs/testing/bug-reports/
  // report-generated-timestamp-not-utc.md).
  timeZone: "UTC",
})

export function ReportDocument({
  type,
  period,
  generatedAt,
  disclaimer,
  children,
}: ReportDocumentProps) {
  const periodLabel = `${period.label}${period.isPartial ? partialSuffix(type) : ""}`

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{REPORT_TYPE_TITLES[type]}</Text>
          <Text style={styles.subtitle}>{periodLabel}</Text>
          <Text style={styles.generatedAt}>
            Generated {GENERATED_AT_FORMATTER.format(new Date(generatedAt))}
          </Text>
        </View>

        {disclaimer ? (
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>{disclaimer}</Text>
          </View>
        ) : null}

        {children}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `FinanceOS ${REPORT_TYPE_TITLES[type]} — Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
