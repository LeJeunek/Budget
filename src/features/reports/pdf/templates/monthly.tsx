import { StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatCurrency } from "@/lib/utils"

import type { MonthlyReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

/**
 * Monthly Report template (reports.md §1) — pure `data -> JSX`, per
 * phase-4b-technical-design.md §3: zero Prisma access, zero cross-domain
 * calls. Every number rendered here was already computed by
 * `server/data/monthly.ts`'s `assembleMonthlyReportData`.
 *
 * The narrative section is the **only** conditional narrative `<Text>`
 * block across all six templates (per that module's own doc), rendering
 * `data.narrative` verbatim, omitted entirely (no placeholder) when `null`
 * — reports.md §1's own "never distinguishes 'failed' from 'not yet run'"
 * rule.
 */

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", marginBottom: 8 },
  stat: { width: "25%" },
  statLabel: { fontSize: 8, color: "#666666" },
  statValue: { fontSize: 13, fontWeight: 700, color: "#111111" },
  netWorthRow: { flexDirection: "row", marginBottom: 4 },
  netWorthLabel: { width: "40%", fontSize: 9, color: "#444444" },
  netWorthValue: { width: "60%", fontSize: 9, color: "#111111" },
  narrativeBox: { padding: 8, backgroundColor: "#f5f6f8" },
  narrativeText: { fontSize: 9, color: "#222222", lineHeight: 1.4 },
})

function formatSavingsRate(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`
}

function formatNetWorthPoint(point: { date: string; netWorth: number } | null): string {
  return point ? `${formatCurrency(point.netWorth)} (as of ${point.date})` : "Not available"
}

export function MonthlyReportTemplate({ data }: { data: MonthlyReportData }) {
  const { summary, netWorth, spendingByCategory, budgetVsActual, narrative } = data

  return (
    <ReportDocument type={data.type} period={data.period} generatedAt={data.generatedAt}>
      <ReportSection title="Monthly Summary">
        {summary.hasActivity ? (
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.income)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Expenses</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.expenses)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Cash Flow</Text>
              <Text style={styles.statValue}>{formatCurrency(summary.cashFlow)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Savings Rate</Text>
              <Text style={styles.statValue}>{formatSavingsRate(summary.savingsRate)}</Text>
            </View>
          </View>
        ) : (
          <NoDataState message="No financial activity was recorded this month." />
        )}
      </ReportSection>

      <ReportSection title="Net Worth">
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>Start of month</Text>
          <Text style={styles.netWorthValue}>{formatNetWorthPoint(netWorth.start)}</Text>
        </View>
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>End of month</Text>
          <Text style={styles.netWorthValue}>{formatNetWorthPoint(netWorth.end)}</Text>
        </View>
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>Change</Text>
          <Text style={styles.netWorthValue}>
            {netWorth.change === null ? "Not available" : formatCurrency(netWorth.change)}
          </Text>
        </View>
      </ReportSection>

      <ReportSection title="Spending by Category">
        {spendingByCategory.length > 0 ? (
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
            rows={spendingByCategory}
          />
        ) : (
          <NoDataState message="No spending was recorded this month." />
        )}
      </ReportSection>

      {budgetVsActual ? (
        <ReportSection title="Budget vs. Actual">
          <ReportTable
            columns={[
              { key: "category", header: "Category", width: 40, render: (r) => r.categoryName },
              {
                key: "allocated",
                header: "Allocated",
                width: 20,
                align: "right",
                render: (r) => (r.allocated === null ? "Unset" : formatCurrency(r.allocated)),
              },
              {
                key: "spent",
                header: "Spent",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.spent),
              },
              {
                key: "remaining",
                header: "Remaining",
                width: 20,
                align: "right",
                render: (r) => (r.remaining === null ? "N/A" : formatCurrency(r.remaining)),
              },
            ]}
            rows={budgetVsActual.categories}
          />
        </ReportSection>
      ) : null}

      {narrative ? (
        <ReportSection title="Monthly Recap">
          <View style={styles.narrativeBox}>
            <Text style={styles.narrativeText}>{narrative}</Text>
          </View>
        </ReportSection>
      ) : null}
    </ReportDocument>
  )
}
