import { StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatCurrency } from "@/lib/utils"

import type { TaxSummaryReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", marginBottom: 4 },
  statLabel: { width: "60%", fontSize: 9, color: "#444444" },
  statValue: { width: "40%", fontSize: 9, color: "#111111", textAlign: "right" },
})

/**
 * Tax Summary Report template (reports.md §3) — deliberately the narrowest,
 * most reference-oriented of the six report types. The disclaimer below is
 * **always** rendered (never conditionally hidden, per reports.md's own
 * explicit requirement), passed to `<ReportDocument>`'s disclaimer-banner
 * slot rather than as an ordinary section, so it can never accidentally be
 * omitted by a future edit to this template's section list the way a plain
 * conditional section could be.
 */

const DISCLAIMER_TEXT =
  "This report is a reference summary of your own tracked FinanceOS data. It is not tax advice, does not calculate any tax owed or deductibility, and does not map any figure to a specific tax form or line. FinanceOS does not model tax categories, deductibility, or filing status. Consult a qualified tax professional for tax preparation and advice."

export function TaxSummaryReportTemplate({ data }: { data: TaxSummaryReportData }) {
  const { incomeBySource, expenseByCategory, investments } = data

  return (
    <ReportDocument
      type={data.type}
      period={data.period}
      generatedAt={data.generatedAt}
      disclaimer={DISCLAIMER_TEXT}
    >
      <ReportSection title="Income by Source">
        {incomeBySource.length > 0 ? (
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
            rows={incomeBySource}
          />
        ) : (
          <NoDataState message="No income was recorded for this year." />
        )}
      </ReportSection>

      <ReportSection title="Expenses by Category">
        {expenseByCategory.length > 0 ? (
          <ReportTable
            columns={[
              { key: "category", header: "Category", width: 60, render: (r) => r.categoryName },
              {
                key: "amount",
                header: "Amount",
                width: 40,
                align: "right",
                render: (r) => formatCurrency(r.amount),
              },
            ]}
            rows={expenseByCategory}
          />
        ) : (
          <NoDataState message="No expenses were recorded for this year." />
        )}
      </ReportSection>

      <ReportSection title="Investment Income">
        {investments ? (
          <>
            {investments.dividendIncome.byHolding.length > 0 ? (
              <ReportTable
                columns={[
                  { key: "holding", header: "Holding", width: 60, render: (r) => r.holdingName },
                  {
                    key: "amount",
                    header: "Dividend Income",
                    width: 40,
                    align: "right",
                    render: (r) => formatCurrency(r.amount),
                  },
                ]}
                rows={investments.dividendIncome.byHolding}
              />
            ) : null}
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total Dividend Income (portfolio-wide)</Text>
              <Text style={styles.statValue}>{formatCurrency(investments.dividendIncome.total)}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Cumulative Gain/Loss (since acquisition)</Text>
              <Text style={styles.statValue}>{formatCurrency(investments.cumulativeGainLoss)}</Text>
            </View>
          </>
        ) : (
          <NoDataState message="No investments tracked." />
        )}
      </ReportSection>
    </ReportDocument>
  )
}
