import { formatCurrency } from "@/lib/utils"

import type { IncomeReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

/** Income Report template (reports.md §4). */
export function IncomeReportTemplate({ data }: { data: IncomeReportData }) {
  const { monthlyTrend, bySource, streams, hasStreams } = data
  const totalIncome = monthlyTrend.reduce((sum, point) => sum + point.total, 0)

  return (
    <ReportDocument type={data.type} period={data.period} generatedAt={data.generatedAt}>
      <ReportSection title="Total Income by Month">
        {monthlyTrend.length > 0 ? (
          <ReportTable
            columns={[
              { key: "month", header: "Month", width: 50, render: (r) => r.month },
              {
                key: "total",
                header: "Total Income",
                width: 50,
                align: "right",
                render: (r) => formatCurrency(r.total),
              },
            ]}
            rows={monthlyTrend}
          />
        ) : (
          <NoDataState message="No income was recorded for this period." />
        )}
      </ReportSection>

      <ReportSection title="Income by Source">
        {bySource.length > 0 ? (
          <ReportTable
            columns={[
              { key: "type", header: "Source", width: 40, render: (r) => r.type },
              {
                key: "amount",
                header: "Amount",
                width: 30,
                align: "right",
                render: (r) => formatCurrency(r.amount),
              },
              {
                key: "percent",
                header: "Share",
                width: 30,
                align: "right",
                render: (r) => `${r.percent.toFixed(1)}%`,
              },
            ]}
            rows={bySource}
          />
        ) : (
          <NoDataState message={`No income was recorded (total: ${formatCurrency(totalIncome)}).`} />
        )}
      </ReportSection>

      <ReportSection title="Income Occurrences">
        {hasStreams ? (
          streams.length > 0 ? (
            <ReportTable
              columns={[
                { key: "name", header: "Income Stream", width: 30, render: (r) => r.streamName },
                { key: "type", header: "Type", width: 20, render: (r) => r.type },
                {
                  key: "occurrences",
                  header: "Occurrences",
                  width: 20,
                  align: "right",
                  render: (r) => String(r.occurrenceCount),
                },
                {
                  key: "received",
                  header: "Received",
                  width: 15,
                  align: "right",
                  render: (r) => String(r.receivedCount),
                },
                {
                  key: "total",
                  header: "Total Received",
                  width: 15,
                  align: "right",
                  render: (r) => formatCurrency(r.receivedTotal),
                },
              ]}
              rows={streams}
            />
          ) : (
            <NoDataState message="No income occurrences fell within this period." />
          )
        ) : (
          <NoDataState message="No income sources are individually tracked yet — the totals above reflect all money-in activity for this period." />
        )}
      </ReportSection>
    </ReportDocument>
  )
}
