// Phase 4a's persisted, non-AI-owned cache/history tables. Every
// generated-content field below is static seed literal text, never a real
// lib/ai/ call — this script has no network/API-key dependency, the exact
// precedent prisma/seed.ts's own Phase 4a section establishes and this
// script follows verbatim. Unlike seed.ts (one row per model, "exercise the
// shape once"), MonthlySummary and FinancialHealthScoreSnapshot each get
// several months of history here, per the task's explicit ask that those
// two features' own history views have real data to show, not just one row.
import { FinancialHealthScoreLabel } from "@prisma/client"
import { prisma } from "./client"
import { utcDate } from "./config"

export async function createAiCaches(userId: string): Promise<void> {
  // ---- AI Budget Advisor: current-month-only cache row ---------------------
  await prisma.budgetAdvisorCache.create({
    data: {
      userId,
      month: utcDate(2026, 6, 1), // July, the current month
      recommendations: [
        {
          text: "Entertainment is running about 56% over its $70 allocation this month, mostly from a single concert ticket purchase — everything else is comfortably on track.",
          citedFigures: [{ label: "entertainmentSpent", value: 108.98 }, { label: "entertainmentAllocated", value: 70 }],
        },
        {
          text: "You're on pace to save roughly a third of your income again this month, consistent with the last several months.",
          citedFigures: [{ label: "projectedSavingsRate", value: 33 }],
        },
      ],
      generatedAt: new Date(),
    },
  })

  // ---- Spending Insights: current-period cache row --------------------------
  await prisma.spendingInsightsCache.create({
    data: {
      userId,
      period: "this-month",
      insights: [
        {
          text: "Shopping spend jumped to about $227 last month (June), roughly double your typical month, driven by a one-time electronics purchase at Best Buy.",
          citedFigures: [{ label: "shoppingLastMonth", value: 226.5 }, { label: "shoppingTypical", value: 116.5 }],
          sourceMetric: "categoryTrends",
        },
        {
          text: "Your grocery and dining spend has stayed steady month over month — no unusual activity there.",
          citedFigures: [{ label: "foodMonthlyAverage", value: 235 }],
          sourceMetric: "categoryTrends",
        },
      ],
      generatedAt: new Date(),
    },
  })

  // ---- Automatic Monthly Summaries: 5 fully-closed months (Feb-Jun) --------
  const monthlySummaries: Array<{
    month: Date
    generatedAt: Date
    narrative: string
    citedFigures: Array<{ label: string; value: number }>
  }> = [
    {
      month: utcDate(2026, 1, 1),
      generatedAt: utcDate(2026, 2, 1),
      narrative:
        "In February you brought in $4,800 in income against $3,153 in expenses, a 34% savings rate. Housing was your largest expense category.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3153 },
        { label: "savingsRate", value: 34 },
      ],
    },
    {
      month: utcDate(2026, 2, 1),
      generatedAt: utcDate(2026, 3, 1),
      narrative:
        "In March you brought in $4,800 in income against $3,146 in expenses, a 34.5% savings rate — your best month yet. Housing was your top spending category, with Food close behind.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3146 },
        { label: "savingsRate", value: 34.5 },
      ],
    },
    {
      month: utcDate(2026, 3, 1),
      generatedAt: utcDate(2026, 4, 1),
      narrative:
        "In April you brought in $4,800 in income against $3,161 in expenses, a 34% savings rate. Spending stayed consistent with the prior two months across every category.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3161 },
        { label: "savingsRate", value: 34 },
      ],
    },
    {
      month: utcDate(2026, 4, 1),
      generatedAt: utcDate(2026, 5, 1),
      narrative:
        "In May you brought in $4,800 in income against $3,166 in expenses, a 34% savings rate. Every budgeted category stayed within its allocation this month.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3166 },
        { label: "savingsRate", value: 34 },
      ],
    },
    {
      month: utcDate(2026, 5, 1),
      generatedAt: utcDate(2026, 6, 1),
      narrative:
        "In June you brought in $4,800 in income against $3,284 in expenses, a 32% savings rate — still healthy, though Shopping ran over its allocation due to a larger-than-usual electronics purchase.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3284 },
        { label: "savingsRate", value: 32 },
      ],
    },
  ]

  await prisma.monthlySummary.createMany({
    data: monthlySummaries.map((summary) => ({
      userId,
      month: summary.month,
      narrative: summary.narrative,
      citedFigures: summary.citedFigures,
      isPartialMonth: false,
      generatedAt: summary.generatedAt,
    })),
  })

  // ---- Financial Health Score: 6 months of snapshots (Feb-Jul) -------------
  // Component scores are static literal figures (never recomputed from a
  // formula at seed time), chosen to tell a consistent, gradually-improving
  // story: debtToIncomeScore rises as the Student Loan balance falls
  // (debt.ts), savingsRateScore is flat at 100 since the account's real
  // ~32-34% rolling savings rate always clears the 20%-floor band,
  // budgetAdherenceScore is undefined (null) before a Budget existed (Feb-
  // Apr, matching budget.ts only seeding May onward) and then tracks that
  // month's real Budget Health Score outcome (100 in May, ~94 in June after
  // the Shopping overage, ~95 in July after the Entertainment overage), and
  // netWorthTrendScore is undefined for the very first month (no prior
  // snapshot to compare against) and rises afterward alongside
  // net-worth.ts's own upward trend.
  const scoreSnapshots: Array<{
    capturedDate: Date
    debtToIncomeScore: number
    savingsRateScore: number
    budgetAdherenceScore: number | null
    netWorthTrendScore: number | null
    totalScore: number
    narrative: string
  }> = [
    {
      capturedDate: utcDate(2026, 1, 28),
      debtToIncomeScore: 60,
      savingsRateScore: 100,
      budgetAdherenceScore: null,
      netWorthTrendScore: null,
      totalScore: 80,
      narrative:
        "Your score is Good, driven by a strong savings rate. Set up a monthly budget to unlock the Budget Adherence component.",
    },
    {
      capturedDate: utcDate(2026, 2, 31),
      debtToIncomeScore: 63,
      savingsRateScore: 100,
      budgetAdherenceScore: null,
      netWorthTrendScore: 68,
      totalScore: 77,
      narrative: "Your score is Good. Your net worth is trending upward and your savings rate remains strong.",
    },
    {
      capturedDate: utcDate(2026, 3, 30),
      debtToIncomeScore: 66,
      savingsRateScore: 100,
      budgetAdherenceScore: null,
      netWorthTrendScore: 72,
      totalScore: 79,
      narrative: "Your score is Good and improving, led by steady debt paydown and continued net worth growth.",
    },
    {
      capturedDate: utcDate(2026, 4, 31),
      debtToIncomeScore: 69,
      savingsRateScore: 100,
      budgetAdherenceScore: 100,
      netWorthTrendScore: 75,
      totalScore: 86,
      narrative:
        "Your score is Good, now with a perfect Budget Adherence score for your first fully budgeted month — every category stayed within its allocation.",
    },
    {
      capturedDate: utcDate(2026, 5, 30),
      debtToIncomeScore: 71,
      savingsRateScore: 100,
      budgetAdherenceScore: 94,
      netWorthTrendScore: 78,
      totalScore: 86,
      narrative:
        "Your score is Good overall. Budget Adherence dipped slightly this month after Shopping ran over its allocation, but every other component held steady or improved.",
    },
    {
      capturedDate: utcDate(2026, 6, 27),
      debtToIncomeScore: 73,
      savingsRateScore: 100,
      budgetAdherenceScore: 95,
      netWorthTrendScore: 81,
      totalScore: 87,
      narrative: "Your score is Good and at its highest point yet, driven by consistent debt paydown, a strong savings rate, and rising net worth.",
    },
  ]

  await prisma.financialHealthScoreSnapshot.createMany({
    data: scoreSnapshots.map((snapshot) => ({
      userId,
      capturedAt: snapshot.capturedDate,
      capturedDate: snapshot.capturedDate,
      debtToIncomeScore: snapshot.debtToIncomeScore,
      savingsRateScore: snapshot.savingsRateScore,
      budgetAdherenceScore: snapshot.budgetAdherenceScore,
      netWorthTrendScore: snapshot.netWorthTrendScore,
      totalScore: snapshot.totalScore,
      label: FinancialHealthScoreLabel.GOOD,
      narrative: snapshot.narrative,
    })),
  })

  // ---- Phase 4a follow-up: reasoningModel call log -------------------------
  // One row, as if the Budget Advisor cache row above had just been
  // generated by a real reasoningModel call — same "exercise the shape once"
  // precedent prisma/seed.ts's own follow-up section established (this
  // table has no long-term retention/history value of its own, per its
  // schema comment, so it doesn't get the multi-month treatment
  // MonthlySummary/FinancialHealthScoreSnapshot get above).
  await prisma.reasoningModelCallLog.create({
    data: { userId, feature: "budgeting.advisor" },
  })

  console.log("  AI caches: BudgetAdvisorCache, SpendingInsightsCache, 5 MonthlySummary rows, 6 FinancialHealthScoreSnapshot rows, 1 ReasoningModelCallLog.")
}
