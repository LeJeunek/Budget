// Debt Tracker: the Credit Card linked as a Debt (hybrid Option C, mirroring
// prisma/seed.ts's own precedent exactly) plus a standalone Student Loan with
// no Account counterpart. The Student Loan's balance is deliberately lower
// than its `startingBalance` anchor (used later by financial-goals.ts's
// DEBT_PAYOFF goal) to show real payoff progress.
import { DebtType } from "@prisma/client"
import { prisma } from "./client"
import { ACCOUNT_CREATED_AT, CREDIT_CARD_BALANCE, STUDENT_LOAN_BALANCE } from "./config"

export interface ShowcaseDebts {
  creditCardDebt: { id: string }
  studentLoan: { id: string }
  /** The Student Loan's balance six months ago, at the point this script's
   * FinancialGoal (DEBT_PAYOFF) anchors its `startingBalance` to — kept here
   * (not just inlined in financial-goals.ts) so debt.ts remains the single
   * place that decides the loan's payoff trajectory. */
  studentLoanStartingBalance: number
}

export async function createDebts(
  userId: string,
  creditCardAccountId: string,
): Promise<ShowcaseDebts> {
  const creditCardDebt = await prisma.debt.create({
    data: {
      userId,
      name: "Capital One Quicksilver",
      type: DebtType.CREDIT_CARD,
      // Unused/ignored at read time while accountId is set (Debt.balance's
      // own schema comment) — kept in sync manually here only because this
      // is static seed data, not a live app write path.
      balance: CREDIT_CARD_BALANCE,
      interestRate: 24.99,
      minimumPayment: 35.0,
      accountId: creditCardAccountId,
      createdAt: ACCOUNT_CREATED_AT,
    },
  })

  const studentLoanStartingBalance = 20500.0

  const studentLoan = await prisma.debt.create({
    data: {
      userId,
      name: "Federal Student Loan (Great Lakes)",
      type: DebtType.STUDENT_LOAN,
      balance: STUDENT_LOAN_BALANCE,
      interestRate: 5.8,
      minimumPayment: 220.0,
      createdAt: ACCOUNT_CREATED_AT,
    },
  })

  return { creditCardDebt, studentLoan, studentLoanStartingBalance }
}
