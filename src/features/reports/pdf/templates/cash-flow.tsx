import { StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatCurrency } from "@/lib/utils"

import type { CashFlowReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

/** Cash Flow Report template (reports.md §6). */

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", marginBottom: 8 },
  stat: { width: "50%" },
  statLabel: { fontSize: 8, color: "#666666" },
  statValue: { fontSize: 13, fontWeight: 700, color: "#111111" },
})

function formatSavingsRate(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`
}

export function CashFlowReportTemplate({ data }: { data: CashFlowReportData }) {
  const { monthlyTrend, cumulativeCashFlow, averageSavingsRate, currency } = data
  const finalCumulative = cumulativeCashFlow.length > 0 ? cumulativeCashFlow[cumulativeCashFlow.length - 1] : 0

  return (
    <ReportDocument type={data.type} period={data.period} generatedAt={data.generatedAt}>
      <ReportSection title="Summary">
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Cumulative Net Cash Flow</Text>
            <Text style={styles.statValue}>{formatCurrency(finalCumulative, currency)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Average Savings Rate</Text>
            <Text style={styles.statValue}>{formatSavingsRate(averageSavingsRate)}</Text>
          </View>
        </View>
      </ReportSection>

      <ReportSection title="Monthly Cash Flow">
        {monthlyTrend.length > 0 ? (
          <ReportTable
            columns={[
              { key: "month", header: "Month", width: 20, render: (r) => r.month },
              {
                key: "income",
                header: "Income",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.income, currency),
              },
              {
                key: "expenses",
                header: "Expenses",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.expenses, currency),
              },
              {
                key: "cashFlow",
                header: "Net Cash Flow",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.cashFlow, currency),
              },
              {
                key: "cumulative",
                header: "Cumulative",
                width: 20,
                align: "right",
                render: (r, index) => formatCurrency(cumulativeCashFlow[index], currency),
              },
            ]}
            rows={monthlyTrend}
          />
        ) : (
          <NoDataState message="No activity was recorded for this period." />
        )}
      </ReportSection>
    </ReportDocument>
  )
}
