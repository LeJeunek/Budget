import { formatCurrency } from "@/lib/utils"

import type { ExpenseReportData } from "../../types"
import { ReportDocument } from "../document-shell"
import { NoDataState } from "../no-data-state"
import { ReportSection } from "../report-section"
import { ReportTable } from "../report-table"

/** Expense Report template (reports.md §5). */
export function ExpenseReportTemplate({ data }: { data: ExpenseReportData }) {
  const { monthlyTrend, byCategory, topMerchants, largestPurchases, currency } = data

  return (
    <ReportDocument type={data.type} period={data.period} generatedAt={data.generatedAt}>
      <ReportSection title="Total Expenses by Month">
        {monthlyTrend.length > 0 ? (
          <ReportTable
            columns={[
              { key: "month", header: "Month", width: 50, render: (r) => r.month },
              {
                key: "expenses",
                header: "Total Expenses",
                width: 50,
                align: "right",
                render: (r) => formatCurrency(r.expenses, currency),
              },
            ]}
            rows={monthlyTrend}
          />
        ) : (
          <NoDataState message="No expenses were recorded for this period." />
        )}
      </ReportSection>

      <ReportSection title="Expenses by Category">
        {byCategory.length > 0 ? (
          <ReportTable
            columns={[
              { key: "category", header: "Category", width: 60, render: (r) => r.categoryName },
              {
                key: "amount",
                header: "Amount",
                width: 40,
                align: "right",
                render: (r) => formatCurrency(r.amount, currency),
              },
            ]}
            rows={byCategory}
          />
        ) : (
          <NoDataState message="No expenses were recorded for this period." />
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
                render: (r) => formatCurrency(r.totalSpend, currency),
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
          <NoDataState message="No merchant spending was recorded for this period." />
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
                render: (r) => formatCurrency(r.amount, currency),
              },
            ]}
            rows={largestPurchases}
          />
        ) : (
          <NoDataState message="No purchases were recorded for this period." />
        )}
      </ReportSection>
    </ReportDocument>
  )
}
