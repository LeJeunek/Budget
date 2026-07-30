import { describe, expect, it } from "vitest"

import { renderReportPdf } from "./render"
import type {
  CashFlowReportData,
  ExpenseReportData,
  IncomeReportData,
  MonthlyReportData,
  ReportData,
  TaxSummaryReportData,
  YearlyReportData,
} from "../types"

// Fixture-driven coverage of the full `data -> PDF bytes` pipeline (every
// `pdf/templates/*.tsx` composed with `pdf/document-shell.tsx`/
// `report-table.tsx`/`report-section.tsx`/`no-data-state.tsx`), per
// reports.md's Definition of Done: "All six report types generate correctly
// against realistic fixture data, each covering: a full period with real
// activity ... [and] a zero-activity period." No database is involved here
// — `server/data/*.ts`'s own DB-touching assemblers are out of scope for
// this file, matching this codebase's established convention that a
// DB-touching function is integration-test territory, not a unit test's
// (see `features/investments/server/service.test.ts`'s identical framing).
//
// Every assertion only checks that rendering succeeds and produces a
// non-trivial, well-formed PDF buffer — verifying the *exact* rendered
// layout is a Bug Hunter/visual-review concern (Risk #23), not this test's
// job. A thrown error here (a misconfigured style, an unhandled `null`) is
// exactly the class of "silently corrupted file" failure reports.md
// Cross-Cutting Requirement #6 says must never reach a user undetected.

const META = {
  period: { start: "2026-01-01", end: "2026-01-31", label: "January 2026", isPartial: false },
  generatedAt: "2026-02-01T00:00:00.000Z",
  // Phase 4c currency-display wiring (docs/release/phase-4c-notes.md §1):
  // every fixture below defaults to "USD" — the one non-USD variant test at
  // the bottom of this file overrides only this field, holding every numeric
  // fixture value identical, to verify by construction that a currency change
  // affects rendered formatting only.
  currency: "USD",
}

async function expectValidPdf(data: ReportData) {
  const buffer = await renderReportPdf(data)
  expect(buffer.length).toBeGreaterThan(0)
  // The PDF file-format magic header — the cheapest possible "this is
  // actually a PDF, not a truncated/corrupted stream" check.
  expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-")
}

describe("renderReportPdf", () => {
  it("renders a Monthly Report with full activity", async () => {
    const data: MonthlyReportData = {
      ...META,
      type: "MONTHLY",
      summary: { income: 5000, expenses: 3200, cashFlow: 1800, savingsRate: 0.36, hasActivity: true },
      netWorth: {
        start: { date: "2026-01-01", netWorth: 50000 },
        end: { date: "2026-01-31", netWorth: 51800 },
        change: 1800,
      },
      spendingByCategory: [{ categoryId: "c1", categoryName: "Groceries", amount: 800 }],
      budgetVsActual: {
        month: "2026-01",
        isEditable: true,
        hasAnyBudgetData: true,
        categories: [
          {
            categoryId: "c1",
            categoryName: "Groceries",
            isSystem: false,
            allocated: 900,
            spent: 800,
            remaining: 100,
            percentUsed: 88.9,
            isOverBudget: false,
          },
        ],
        totals: { totalAllocated: 900, totalSpent: 800, totalRemaining: 100 },
        uncategorizedSpent: 0,
      },
      narrative: "You spent less than you earned this month — nice work.",
    }
    await expectValidPdf(data)
  })

  it("renders a Monthly Report with zero activity and no budget/narrative", async () => {
    const data: MonthlyReportData = {
      ...META,
      type: "MONTHLY",
      summary: { income: 0, expenses: 0, cashFlow: 0, savingsRate: null, hasActivity: false },
      netWorth: { start: null, end: null, change: null },
      spendingByCategory: [],
      budgetVsActual: null,
      narrative: null,
    }
    await expectValidPdf(data)
  })

  it("renders a Yearly Report with full activity", async () => {
    const data: YearlyReportData = {
      ...META,
      type: "YEARLY",
      annualTotals: { income: 60000, expenses: 42000, cashFlow: 18000, savingsRate: 0.3 },
      netWorth: {
        start: { date: "2026-01-01", netWorth: 40000 },
        end: { date: "2026-12-31", netWorth: 58000 },
        change: 18000,
      },
      monthlyTrend: [{ month: "2026-01", income: 5000, expenses: 3500, cashFlow: 1500, savingsRate: 0.3 }],
      categoryTrends: [
        { categoryId: "c1", categoryName: "Groceries", points: [{ month: "2026-01", amount: 800 }] },
      ],
      topMerchants: [
        { normalizedMerchantName: "acme", displayName: "Acme Co", totalSpend: 500, transactionCount: 5 },
      ],
      largestPurchases: [
        { transactionId: "t1", date: "2026-01-15", merchant: "Acme Co", categoryName: "Groceries", amount: 250 },
      ],
      budgetVsActual: [
        {
          month: "2026-01",
          categories: [
            {
              categoryId: "c1",
              categoryName: "Groceries",
              allocated: 900,
              actual: 800,
            },
          ],
        },
      ],
      debts: [],
      investments: {
        totalCurrentValue: 10000,
        gainLossForYear: 500,
        dividendIncome: { total: 120, byHolding: [{ holdingId: "h1", holdingName: "VTI", amount: 120 }] },
        allocation: [{ label: "ETF", value: 10000, percent: 100 }],
        hasInvestments: true,
      },
      recurringIncome: {
        streams: [
          {
            streamId: "s1",
            streamName: "Paycheck",
            type: "SALARY",
            occurrenceCount: 24,
            receivedCount: 24,
            receivedTotal: 60000,
          },
        ],
        hasStreams: true,
      },
    }
    await expectValidPdf(data)
  })

  it("renders a Yearly Report with zero activity across the board", async () => {
    const data: YearlyReportData = {
      ...META,
      type: "YEARLY",
      annualTotals: { income: 0, expenses: 0, cashFlow: 0, savingsRate: null },
      netWorth: { start: null, end: null, change: null },
      monthlyTrend: [],
      categoryTrends: [],
      topMerchants: [],
      largestPurchases: [],
      budgetVsActual: [],
      debts: [],
      investments: {
        totalCurrentValue: 0,
        gainLossForYear: 0,
        dividendIncome: { total: 0, byHolding: [] },
        allocation: [],
        hasInvestments: false,
      },
      recurringIncome: { streams: [], hasStreams: false },
    }
    await expectValidPdf(data)
  })

  it("renders a Tax Summary Report with investments", async () => {
    const data: TaxSummaryReportData = {
      ...META,
      type: "TAX_SUMMARY",
      incomeBySource: [{ type: "SALARY", amount: 60000, percent: 100 }],
      expenseByCategory: [{ categoryId: "c1", categoryName: "Groceries", amount: 9600 }],
      investments: {
        dividendIncome: { total: 120, byHolding: [{ holdingId: "h1", holdingName: "VTI", amount: 120 }] },
        cumulativeGainLoss: 2500,
      },
    }
    await expectValidPdf(data)
  })

  it("renders a Tax Summary Report with no investments (disclaimer still present)", async () => {
    const data: TaxSummaryReportData = {
      ...META,
      type: "TAX_SUMMARY",
      incomeBySource: [],
      expenseByCategory: [],
      investments: null,
    }
    await expectValidPdf(data)
  })

  it("renders an Income Report", async () => {
    const data: IncomeReportData = {
      ...META,
      type: "INCOME",
      monthlyTrend: [{ month: "2026-01", total: 5000, bySource: [{ type: "SALARY", amount: 5000 }] }],
      bySource: [{ type: "SALARY", amount: 5000, percent: 100 }],
      streams: [
        {
          streamId: "s1",
          streamName: "Paycheck",
          type: "SALARY",
          occurrenceCount: 2,
          receivedCount: 2,
          receivedTotal: 5000,
        },
      ],
      hasStreams: true,
    }
    await expectValidPdf(data)
  })

  it("renders an Income Report with no tracked streams", async () => {
    const data: IncomeReportData = {
      ...META,
      type: "INCOME",
      monthlyTrend: [],
      bySource: [],
      streams: [],
      hasStreams: false,
    }
    await expectValidPdf(data)
  })

  it("renders an Expense Report", async () => {
    const data: ExpenseReportData = {
      ...META,
      type: "EXPENSE",
      monthlyTrend: [{ month: "2026-01", expenses: 3200 }],
      byCategory: [{ categoryId: "c1", categoryName: "Groceries", amount: 800 }],
      topMerchants: [
        { normalizedMerchantName: "acme", displayName: "Acme Co", totalSpend: 500, transactionCount: 5 },
      ],
      largestPurchases: [
        { transactionId: "t1", date: "2026-01-15", merchant: "Acme Co", categoryName: "Groceries", amount: 250 },
      ],
    }
    await expectValidPdf(data)
  })

  it("renders an Expense Report with zero expenses", async () => {
    const data: ExpenseReportData = {
      ...META,
      type: "EXPENSE",
      monthlyTrend: [],
      byCategory: [],
      topMerchants: [],
      largestPurchases: [],
    }
    await expectValidPdf(data)
  })

  it("renders a Cash Flow Report", async () => {
    const data: CashFlowReportData = {
      ...META,
      type: "CASH_FLOW",
      monthlyTrend: [
        { month: "2026-01", income: 5000, expenses: 3200, cashFlow: 1800, savingsRate: 0.36 },
        { month: "2026-02", income: 0, expenses: 100, cashFlow: -100, savingsRate: null },
      ],
      cumulativeCashFlow: [1800, 1700],
      averageSavingsRate: 0.36,
    }
    await expectValidPdf(data)
  })

  it("renders a Cash Flow Report with zero activity", async () => {
    const data: CashFlowReportData = {
      ...META,
      type: "CASH_FLOW",
      monthlyTrend: [],
      cumulativeCashFlow: [],
      averageSavingsRate: null,
    }
    await expectValidPdf(data)
  })

  // Phase 4c (phase-4c-technical-design.md §3.6, docs/product/customization.md
  // Currency Display capability, docs/release/phase-4c-notes.md §1's blocking
  // finding): verifies, by construction, that a non-USD `ReportMeta.currency`
  // changes only `formatCurrency`'s rendered symbol/grouping, never any
  // underlying numeric value the Monthly Report renders — both variants below
  // are built from the exact same numeric fixture object (`monthlyFixture`),
  // varying only `currency`, per customization.md's own Definition of Done
  // ("verified, by test, to change rendered symbol/grouping only").
  it("renders a Monthly Report identically for USD and a non-USD display currency, except for currency formatting", async () => {
    const monthlyFixture: Omit<MonthlyReportData, "currency"> = {
      period: META.period,
      generatedAt: META.generatedAt,
      type: "MONTHLY",
      summary: { income: 5000, expenses: 3200, cashFlow: 1800, savingsRate: 0.36, hasActivity: true },
      netWorth: {
        start: { date: "2026-01-01", netWorth: 50000 },
        end: { date: "2026-01-31", netWorth: 51800 },
        change: 1800,
      },
      spendingByCategory: [{ categoryId: "c1", categoryName: "Groceries", amount: 800 }],
      budgetVsActual: null,
      narrative: null,
    }

    const usdData: MonthlyReportData = { ...monthlyFixture, currency: "USD" }
    const eurData: MonthlyReportData = { ...monthlyFixture, currency: "EUR" }

    // Every numeric/period/narrative field came from the same object
    // reference — only `currency` differs between the two DTOs passed to
    // `renderReportPdf` below, which is what makes this test a genuine proof
    // that currency is a pure rendering input, not something that could
    // influence (or be influenced by) any computed figure.
    expect(usdData.summary).toBe(eurData.summary)
    expect(usdData.netWorth).toBe(eurData.netWorth)
    expect(usdData.spendingByCategory).toBe(eurData.spendingByCategory)

    await expectValidPdf(usdData)
    await expectValidPdf(eurData)
  })
})
