import { StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatCurrency } from "@/lib/utils"

import type { YearlyReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

/**
 * Yearly Report template (reports.md §2) — the comprehensive, whole-picture
 * annual document (the Monthly Report's yearly sibling, per reports.md's own
 * Boundary framing vs. the Tax Summary Report). Pure `data -> JSX`; every
 * figure was already computed by `server/data/yearly.ts`.
 */

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", marginBottom: 8 },
  stat: { width: "25%" },
  statLabel: { fontSize: 8, color: "#666666" },
  statValue: { fontSize: 13, fontWeight: 700, color: "#111111" },
  netWorthRow: { flexDirection: "row", marginBottom: 4 },
  netWorthLabel: { width: "40%", fontSize: 9, color: "#444444" },
  netWorthValue: { width: "60%", fontSize: 9, color: "#111111" },
})

function formatSavingsRate(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`
}

function formatNetWorthPoint(point: { date: string; netWorth: number } | null): string {
  return point ? `${formatCurrency(point.netWorth)} (as of ${point.date})` : "Not available"
}

export function YearlyReportTemplate({ data }: { data: YearlyReportData }) {
  const {
    annualTotals,
    netWorth,
    monthlyTrend,
    categoryTrends,
    topMerchants,
    largestPurchases,
    budgetVsActual,
    debts,
    investments,
    recurringIncome,
  } = data

  return (
    <ReportDocument type={data.type} period={data.period} generatedAt={data.generatedAt}>
      <ReportSection title="Annual Summary">
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Income</Text>
            <Text style={styles.statValue}>{formatCurrency(annualTotals.income)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={styles.statValue}>{formatCurrency(annualTotals.expenses)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Cash Flow</Text>
            <Text style={styles.statValue}>{formatCurrency(annualTotals.cashFlow)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Savings Rate</Text>
            <Text style={styles.statValue}>{formatSavingsRate(annualTotals.savingsRate)}</Text>
          </View>
        </View>
      </ReportSection>

      <ReportSection title="Net Worth">
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>Start of year</Text>
          <Text style={styles.netWorthValue}>{formatNetWorthPoint(netWorth.start)}</Text>
        </View>
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>End of year</Text>
          <Text style={styles.netWorthValue}>{formatNetWorthPoint(netWorth.end)}</Text>
        </View>
        <View style={styles.netWorthRow}>
          <Text style={styles.netWorthLabel}>Change</Text>
          <Text style={styles.netWorthValue}>
            {netWorth.change === null ? "Not available" : formatCurrency(netWorth.change)}
          </Text>
        </View>
      </ReportSection>

      <ReportSection title="Monthly Income vs. Expenses">
        {monthlyTrend.length > 0 ? (
          <ReportTable
            columns={[
              { key: "month", header: "Month", width: 25, render: (r) => r.month },
              {
                key: "income",
                header: "Income",
                width: 25,
                align: "right",
                render: (r) => formatCurrency(r.income),
              },
              {
                key: "expenses",
                header: "Expenses",
                width: 25,
                align: "right",
                render: (r) => formatCurrency(r.expenses),
              },
              {
                key: "cashFlow",
                header: "Cash Flow",
                width: 25,
                align: "right",
                render: (r) => formatCurrency(r.cashFlow),
              },
            ]}
            rows={monthlyTrend}
          />
        ) : (
          <NoDataState message="No activity was recorded this year." />
        )}
      </ReportSection>

      <ReportSection title="Category Trends">
        {categoryTrends.length > 0 ? (
          <ReportTable
            columns={[
              { key: "category", header: "Category", width: 40, render: (r) => r.categoryName },
              {
                key: "total",
                header: "Total for Year",
                width: 60,
                align: "right",
                render: (r) => formatCurrency(r.points.reduce((sum, p) => sum + p.amount, 0)),
              },
            ]}
            rows={categoryTrends}
          />
        ) : (
          <NoDataState message="No spending was recorded this year." />
        )}
      </ReportSection>

      <ReportSection title="Top Merchants">
        {topMerchants.length > 0 ? (
          <ReportTable
            columns={[
              { key: "merchant", header: "Merchant", width: 50, render: (r) => r.displayName },
              {
                key: "total",
                header: "Total Spend",
                width: 25,
                align: "right",
                render: (r) => formatCurrency(r.totalSpend),
              },
              {
                key: "count",
                header: "Transactions",
                width: 25,
                align: "right",
                render: (r) => String(r.transactionCount),
              },
            ]}
            rows={topMerchants}
          />
        ) : (
          <NoDataState message="No merchant spending was recorded this year." />
        )}
      </ReportSection>

      <ReportSection title="Largest Purchases">
        {largestPurchases.length > 0 ? (
          <ReportTable
            columns={[
              { key: "date", header: "Date", width: 20, render: (r) => r.date },
              { key: "merchant", header: "Merchant", width: 35, render: (r) => r.merchant },
              { key: "category", header: "Category", width: 25, render: (r) => r.categoryName },
              {
                key: "amount",
                header: "Amount",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.amount),
              },
            ]}
            rows={largestPurchases}
          />
        ) : (
          <NoDataState message="No purchases were recorded this year." />
        )}
      </ReportSection>

      <ReportSection title="Budget vs. Actual">
        {budgetVsActual.length > 0 ? (
          budgetVsActual.map((month) => (
            <View key={month.month} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 3 }}>{month.month}</Text>
              <ReportTable
                columns={[
                  { key: "category", header: "Category", width: 40, render: (r) => r.categoryName },
                  {
                    key: "allocated",
                    header: "Allocated",
                    width: 30,
                    align: "right",
                    render: (r) => (r.allocated === null ? "Unset" : formatCurrency(r.allocated)),
                  },
                  {
                    key: "actual",
                    header: "Actual",
                    width: 30,
                    align: "right",
                    render: (r) => formatCurrency(r.actual),
                  },
                ]}
                rows={month.categories}
              />
            </View>
          ))
        ) : (
          <NoDataState message="No budget was set for any month this year." />
        )}
      </ReportSection>

      <ReportSection title="Debts">
        {debts.length > 0 ? (
          <ReportTable
            columns={[
              { key: "name", header: "Debt", width: 30, render: (r) => r.name },
              {
                key: "balance",
                header: "Balance",
                width: 20,
                align: "right",
                render: (r) => formatCurrency(r.effectiveBalance),
              },
              {
                key: "rate",
                header: "Interest Rate",
                width: 20,
                align: "right",
                render: (r) => `${r.interestRate.toFixed(2)}%`,
              },
              {
                key: "minPayment",
                header: "Min. Payment",
                width: 15,
                align: "right",
                render: (r) => formatCurrency(r.minimumPayment),
              },
              {
                key: "payoffDate",
                header: "Payoff Date",
                width: 15,
                align: "right",
                render: (r) => r.payoffDate ?? "N/A",
              },
            ]}
            rows={debts}
          />
        ) : (
          <NoDataState message="No debts tracked." />
        )}
      </ReportSection>

      <ReportSection title="Investments">
        {investments.hasInvestments ? (
          <>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Portfolio Value</Text>
                <Text style={styles.statValue}>{formatCurrency(investments.totalCurrentValue)}</Text>
              </View>
              <View style={styles.stat}>
                {/* Interpolates the requested year (`data.period.label`,
                 * e.g. "2023") rather than a hardcoded "This Year" — the
                 * Yearly Report can be generated for any past calendar year
                 * (reports.md §2), and this label is the only place in this
                 * template that previously baked in a "current year"
                 * assumption independent of the actual period requested
                 * (see docs/testing/bug-reports/
                 * yearly-report-hardcoded-gain-loss-this-year-label.md). */}
                <Text style={styles.statLabel}>Gain/Loss ({data.period.label})</Text>
                <Text style={styles.statValue}>{formatCurrency(investments.gainLossForYear)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Dividend Income</Text>
                <Text style={styles.statValue}>{formatCurrency(investments.dividendIncome.total)}</Text>
              </View>
            </View>
            {investments.allocation.length > 0 ? (
              <ReportTable
                columns={[
                  { key: "label", header: "Asset Type", width: 50, render: (r) => r.label },
                  {
                    key: "value",
                    header: "Value",
                    width: 25,
                    align: "right",
                    render: (r) => formatCurrency(r.value),
                  },
                  {
                    key: "percent",
                    header: "Allocation",
                    width: 25,
                    align: "right",
                    render: (r) => `${r.percent.toFixed(1)}%`,
                  },
                ]}
                rows={investments.allocation}
              />
            ) : null}
          </>
        ) : (
          <NoDataState message="No investments tracked." />
        )}
      </ReportSection>

      <ReportSection title="Recurring Income">
        {recurringIncome.hasStreams ? (
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
            rows={recurringIncome.streams}
          />
        ) : (
          <NoDataState message="No recurring income streams set up." />
        )}
      </ReportSection>
    </ReportDocument>
  )
}
