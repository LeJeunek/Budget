// Financial Goals (Phase 3b) — one goal per type, in three different
// progress states per the task's ask, rather than seed.ts's own three
// "exercise the shape once" examples:
//   1. DEBT_PAYOFF, linked to the Student Loan — early progress (~11% paid
//      off of its starting balance), a realistic pace six months in.
//   2. NET_WORTH_SAVINGS_TARGET, ACCOUNT_SUBSET scoped to just the Savings
//      account — "Emergency Fund," partway there (~83%). Also exercises the
//      FinancialGoalAccount join table, which prisma/seed.ts's own comment
//      explicitly flagged as not worth seeding on its own; a showcase
//      account is exactly the context where it does earn its place.
//   3. SAVINGS_RATE_TARGET — the user's actual rolling savings rate (~34%,
//      per this account's income/expense data) already exceeds the 20%
//      target, so this goal reads as Completed/exceeded at read time — a
//      third, distinct state alongside "early" and "partway."
import { FinancialGoalType, MeasurementBasis } from "@prisma/client"
import { prisma } from "./client"
import { ACCOUNT_CREATED_AT, utcDate } from "./config"

export async function createFinancialGoals(
  userId: string,
  studentLoanId: string,
  studentLoanStartingBalance: number,
  savingsAccountId: string,
): Promise<void> {
  await prisma.financialGoal.create({
    data: {
      userId,
      name: "Pay Off Student Loan",
      type: FinancialGoalType.DEBT_PAYOFF,
      linkedDebtId: studentLoanId,
      startingBalance: studentLoanStartingBalance,
      createdAt: ACCOUNT_CREATED_AT,
    },
  })

  const emergencyFund = await prisma.financialGoal.create({
    data: {
      userId,
      name: "Emergency Fund (3 Months' Expenses)",
      type: FinancialGoalType.NET_WORTH_SAVINGS_TARGET,
      targetAmount: 15000.0,
      measurementBasis: MeasurementBasis.ACCOUNT_SUBSET,
      createdAt: utcDate(2026, 1, 15),
    },
  })

  await prisma.financialGoalAccount.create({
    data: { financialGoalId: emergencyFund.id, accountId: savingsAccountId },
  })

  await prisma.financialGoal.create({
    data: {
      userId,
      name: "Save 20% of Income",
      type: FinancialGoalType.SAVINGS_RATE_TARGET,
      targetPercent: 20.0,
      targetDate: utcDate(2026, 11, 31),
      createdAt: ACCOUNT_CREATED_AT,
    },
  })

  console.log(`  Financial Goals: 3 goals (DEBT_PAYOFF, NET_WORTH_SAVINGS_TARGET/ACCOUNT_SUBSET, SAVINGS_RATE_TARGET).`)
}
