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
