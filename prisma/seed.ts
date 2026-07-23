// FinanceOS — dev/demo seed data.
// Run via `npx prisma db seed` (configured in package.json by whoever wires up
// tooling in Phase 0). Creates one demo user with the Charter's fixed
// 11-category starter set plus a couple of accounts so the dashboard has
// something to render during Phase 1 development.
//
// DEFAULT_CATEGORIES lives in src/features/categories/default-categories.ts
// (not defined here) so src/lib/auth.ts's real signup hook can import it
// too, without pulling in this file's top-level `main()` side effects (this
// file runs main() unconditionally at import time — importing it from
// application/runtime code, not just other scripts, would re-run the demo
// seed on every server start).
//
// Phase 3a addition: a small amount of Debt/Holding/IncomeStream demo data,
// enough to exercise every new model at least once (including the optional
// Debt<->Account link and a HoldingValueHistoryEntry/DividendEntry pair) —
// deliberately not exhaustive fixture data for payoff-math.ts/allocation
// correctness (that is Integration Test Engineer's job, against dedicated
// test fixtures, not this dev/demo seed).
//
// Phase 3b addition: one FinancialGoal of each of the three types (DEBT_PAYOFF
// linked to the Student Loan seeded below, NET_WORTH_SAVINGS_TARGET against
// the Total Net Worth basis, SAVINGS_RATE_TARGET) and one
// DismissedSubscriptionMerchant row — enough to exercise every new Phase 3b
// model at least once. The ACCOUNT_SUBSET measurement basis and
// FinancialGoalAccount are deliberately not seeded here: exercising that path
// meaningfully would require a second NET_WORTH_SAVINGS_TARGET goal purely to
// demonstrate a join-table row, which doesn't earn its place in a minimal dev
// seed — Integration Test Engineer's dedicated fixtures are the right place
// for that case, not this script.
//
// Phase 4a addition: one row per new AI-features model — a PENDING
// CategorySuggestion (automatic path) against the demo transaction seeded
// below, a BudgetAdvisorCache row, a MonthlySummary row (a fully-closed prior
// month, narrative present — the "generation succeeded" case), a
// SpendingInsightsCache row, and a FinancialHealthScoreSnapshot row (all four
// components defined, narrative present). Deliberately not exhaustive: the
// REJECTED/ACCEPTED CategorySuggestion states, a failed-generation
// (narrative: null) MonthlySummary/cache row, and an undefined-component
// FinancialHealthScoreSnapshot are Integration Test Engineer's dedicated
// fixture concerns, not this minimal dev seed's job — same "exercise every
// new model at least once, not every state" standard already applied to
// Phase 3a/3b above. No lib/ai/ call happens anywhere in this script — every
// generated-content field below is static seed literal text, never a real
// model call, consistent with this script running with no network/API-key
// dependency at all.
//
// Phase 4a follow-up addition: one ReasoningModelCallLog row, exercising the
// new cross-feature rate-limiting call-log table (prisma/schema.prisma's own
// comment on that model has the full reasoning). A single row is enough to
// exercise the model's shape at least once; exercising the actual rolling-
// window count queries against many rows across users/features is
// Integration Test Engineer's dedicated fixture concern, not this minimal
// dev seed's job — same standard already applied to every other Phase 4a
// model above.

import {
  PrismaClient,
  AccountType,
  DebtType,
  AssetType,
  Sector,
  IncomeType,
  IncomeSchedule,
  FinancialGoalType,
  MeasurementBasis,
  CategorySuggestionSource,
  CategorySuggestionStatus,
  FinancialHealthScoreLabel,
} from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../src/features/categories/default-categories";

const prisma = new PrismaClient();

async function main() {
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@financeos.local" },
    update: {},
    create: {
      email: "demo@financeos.local",
      name: "Demo User",
      emailVerified: true,
    },
  });

  await Promise.all(
    DEFAULT_CATEGORIES.map((category) =>
      prisma.category.upsert({
        where: { userId_name: { userId: demoUser.id, name: category.name } },
        update: {},
        create: { ...category, userId: demoUser.id, isSystem: true },
      })
    )
  );

  const checking = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "Everyday Checking",
      type: AccountType.CHECKING,
      institution: "Demo Bank",
      balance: 4250.32,
      color: "#6366f1",
    },
  });

  await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "High-Yield Savings",
      type: AccountType.SAVINGS,
      institution: "Demo Bank",
      balance: 12800.0,
      interestRate: 4.25,
      color: "#0ea5e9",
    },
  });

  const diningCategory = await prisma.category.findFirstOrThrow({
    where: { userId: demoUser.id, name: "Food" },
  });

  await prisma.transaction.create({
    data: {
      userId: demoUser.id,
      accountId: checking.id,
      categoryId: diningCategory.id,
      merchant: "Demo Coffee Shop",
      amount: -6.5,
      date: new Date(),
    },
  });

  // ---- Phase 3a: Debt Tracker -----------------------------------------------
  // One linked Debt (Credit Card, hybrid Option C) and one standalone Debt
  // (Student Loan, no Account counterpart exists for this type at all) —
  // exercises both branches of the accountId-nullable design.
  const creditCard = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "Demo Rewards Card",
      type: AccountType.CREDIT_CARD,
      institution: "Demo Bank",
      balance: 1850.0,
      interestRate: 22.99,
      color: "#f97316",
    },
  });

  await prisma.debt.create({
    data: {
      userId: demoUser.id,
      name: "Demo Rewards Card",
      type: DebtType.CREDIT_CARD,
      balance: 1850.0, // unused/ignored at read time while accountId is set;
      // kept in sync manually here only because this is static seed data, not
      // a live app write path — see Debt.balance's schema comment.
      interestRate: 22.99,
      minimumPayment: 55.0,
      accountId: creditCard.id,
    },
  });

  const studentLoan = await prisma.debt.create({
    data: {
      userId: demoUser.id,
      name: "Federal Direct Loan",
      type: DebtType.STUDENT_LOAN,
      balance: 18500.0,
      interestRate: 5.5,
      minimumPayment: 210.0,
    },
  });

  // ---- Phase 3a: Investments -------------------------------------------------
  // One container Account with one active Holding, a value-history entry
  // (simulating a prior current-value edit), and a logged dividend.
  const brokerage = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: "Demo Brokerage",
      type: AccountType.INVESTMENT,
      institution: "Demo Invest Co.",
      balance: 5200.0, // derived-from-holdings once the Holding below exists;
      // seeded to match it directly since there is no live write-back path
      // running in this static seed script.
      color: "#22c55e",
    },
  });

  const etfHolding = await prisma.holding.create({
    data: {
      userId: demoUser.id,
      accountId: brokerage.id,
      name: "Demo Total Market ETF",
      assetType: AssetType.ETF,
      sector: Sector.OTHER,
      costBasis: 4500.0,
      currentValue: 5200.0,
    },
  });

  await prisma.holdingValueHistoryEntry.create({
    data: {
      userId: demoUser.id,
      holdingId: etfHolding.id,
      previousValue: 4800.0,
      newValue: 5200.0,
    },
  });

  await prisma.dividendEntry.create({
    data: {
      userId: demoUser.id,
      holdingId: etfHolding.id,
      amount: 42.5,
      date: new Date(),
    },
  });

  // ---- Phase 3a: Recurring Income --------------------------------------------
  // One scheduled (Monthly) stream with a generated occurrence, mirroring
  // what ensureOccurrencesGenerated would produce lazily on first read.
  const salaryStream = await prisma.incomeStream.create({
    data: {
      userId: demoUser.id,
      name: "Acme Corp Salary",
      type: IncomeType.SALARY,
      schedule: IncomeSchedule.MONTHLY,
      expectedAmount: 4800.0,
      anchorDate: new Date(),
    },
  });

  await prisma.incomeOccurrence.create({
    data: {
      userId: demoUser.id,
      streamId: salaryStream.id,
      expectedDate: new Date(),
    },
  });

  // ---- Phase 3b: Financial Goals ---------------------------------------------
  // One goal per type, exercising each type's own nullable-column shape.
  await prisma.financialGoal.create({
    data: {
      userId: demoUser.id,
      name: "Pay Off Federal Direct Loan",
      type: FinancialGoalType.DEBT_PAYOFF,
      linkedDebtId: studentLoan.id,
      // Anchored to the Debt's balance at seed time (financial-goals.md's
      // "fixed anchor, not recomputed later" — see FinancialGoal.
      // startingBalance's schema comment); a live app write path always
      // reads this from Debt's effectiveBalance at creation, not a literal
      // like this static seed script uses.
      startingBalance: 18500.0,
    },
  });

  await prisma.financialGoal.create({
    data: {
      userId: demoUser.id,
      name: "Reach $50k Net Worth",
      type: FinancialGoalType.NET_WORTH_SAVINGS_TARGET,
      targetAmount: 50000.0,
      measurementBasis: MeasurementBasis.TOTAL_NET_WORTH,
    },
  });

  await prisma.financialGoal.create({
    data: {
      userId: demoUser.id,
      name: "Save 20% of Income",
      type: FinancialGoalType.SAVINGS_RATE_TARGET,
      targetPercent: 20.0,
    },
  });

  // ---- Phase 3b: Subscription Cost Detection's dismissal-tracking -----------
  // One dismissed merchant, exercising the exclusion-rule table's one write
  // path (a user dismissing a detected false positive, e.g. a recurring
  // coffee-shop habit that pattern-matched like a subscription). The value
  // below is a reasonable trim/case-fold guess consistent with
  // lib/merchant-normalization.ts's documented behavior (Backend Engineer's
  // file, not yet written at schema-authoring time) — it is illustrative
  // seed data only, not a substitute for that utility's own unit tests.
  await prisma.dismissedSubscriptionMerchant.create({
    data: {
      userId: demoUser.id,
      normalizedMerchantName: "demo coffee shop",
    },
  });

  // ---- Phase 4a: Transaction Auto-Categorization suggestion/audit-trail ----
  // A second, Uncategorized demo transaction is seeded here specifically —
  // reusing the already-categorized coffee-shop transaction above would
  // violate the product's own rule (ai-features.md's Product Rule: automatic
  // suggestions are only ever generated for a currently-Uncategorized
  // transaction), so a realistic PENDING/AUTOMATIC row needs its own
  // Uncategorized target.
  const uncategorizedTransaction = await prisma.transaction.create({
    data: {
      userId: demoUser.id,
      accountId: checking.id,
      merchant: "Demo Grocery Market",
      amount: -84.12,
      date: new Date(),
    },
  });

  await prisma.categorySuggestion.create({
    data: {
      userId: demoUser.id,
      transactionId: uncategorizedTransaction.id,
      suggestedCategoryId: diningCategory.id,
      status: CategorySuggestionStatus.PENDING,
      source: CategorySuggestionSource.AUTOMATIC,
      confidence: 0.87,
      generatorModel: "fastModel:claude-haiku:2026-08",
    },
  });

  // ---- Phase 4a: AI Budget Advisor refresh-cache -----------------------------
  // Static seed literal text, never a real lib/ai/ call — this script has no
  // network/API-key dependency, matching every other Phase 4a row below.
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  currentMonth.setUTCHours(0, 0, 0, 0);

  await prisma.budgetAdvisorCache.create({
    data: {
      userId: demoUser.id,
      month: currentMonth,
      recommendations: [
        {
          text: "You're on track across all your budgeted categories this month.",
          citedFigures: [],
        },
      ],
    },
  });

  // ---- Phase 4a: Automatic Monthly Summaries ---------------------------------
  // A fully-closed prior month (never the current, in-progress month, per
  // Feature 3 AC3), narrative present — the "generation succeeded" case.
  const priorMonth = new Date(currentMonth);
  priorMonth.setUTCMonth(priorMonth.getUTCMonth() - 1);

  await prisma.monthlySummary.create({
    data: {
      userId: demoUser.id,
      month: priorMonth,
      narrative:
        "Last month you brought in $4,800 in income against $3,200 in expenses, a 33% savings rate. Food was your top spending category.",
      citedFigures: [
        { label: "income", value: 4800 },
        { label: "expenses", value: 3200 },
        { label: "savingsRate", value: 33 },
      ],
      isPartialMonth: false,
      generatedAt: new Date(),
    },
  });

  // ---- Phase 4a: Spending Insights refresh-cache -----------------------------
  await prisma.spendingInsightsCache.create({
    data: {
      userId: demoUser.id,
      period: "this-month",
      insights: [
        {
          text: "No unusual spending patterns this period.",
          citedFigures: [],
          sourceMetric: "categoryTrends",
        },
      ],
    },
  });

  // ---- Phase 4a: Financial Health Score historical snapshot ------------------
  // All four components defined, narrative present — the "fully computable"
  // case; the undefined-component and zero-components cases are Integration
  // Test Engineer's dedicated fixture concern, not this minimal dev seed.
  await prisma.financialHealthScoreSnapshot.create({
    data: {
      userId: demoUser.id,
      capturedDate: new Date(),
      debtToIncomeScore: 78,
      savingsRateScore: 85,
      budgetAdherenceScore: 90,
      netWorthTrendScore: 70,
      totalScore: 81,
      label: FinancialHealthScoreLabel.GOOD,
      narrative:
        "Your score is Good overall, driven by a strong savings rate and solid budget adherence.",
    },
  });

  // ---- Phase 4a follow-up: reasoningModel cross-feature call log ------------
  // One row, as if the Budget Advisor row seeded above had just been
  // generated by a real reasoningModel call — exercises the model's shape
  // (userId/feature/createdAt) at least once, per this script's standing
  // "exercise every new model at least once" convention.
  await prisma.reasoningModelCallLog.create({
    data: {
      userId: demoUser.id,
      feature: "budgeting.advisor",
    },
  });

  console.log(`Seeded demo user: ${demoUser.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
