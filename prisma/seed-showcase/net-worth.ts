// Net Worth Snapshot history — one row per month (captured on the 1st) plus
// a final row for TODAY, spanning the same six-month window as everything
// else in this script, so the Net Worth History chart shows a believable
// upward trend instead of a flat/empty line. Every figure below is a static,
// hand-authored point in that trend, EXCEPT the final (TODAY) row, which
// MUST equal the live Account/Debt balances seeded elsewhere in this script
// — see config.ts's own comment for why those live figures are centralized
// there rather than re-typed here.
//
// totalAccountBalance/totalUnlinkedDebtLiability/totalNetWorth mirror
// features/dashboard/server/service.ts's `getNetWorth` formula exactly
// (CREDIT_CARD balance subtracted as a liability, every other Account type
// added; the Student Loan is the only *unlinked* Debt, since the Credit
// Card Debt is linked to its Account and therefore already reflected there)
// — these are persisted copies of that formula's own output at each point in
// time, never recomputed at read time, per NetWorthSnapshot's own schema
// comment.
import { prisma } from "./client"
import {
  BROKERAGE_BALANCE,
  CHECKING_BALANCE,
  CREDIT_CARD_BALANCE,
  RETIREMENT_BALANCE,
  SAVINGS_BALANCE,
  STUDENT_LOAN_BALANCE,
  TODAY,
  utcDate,
} from "./config"

interface SnapshotPoint {
  capturedDate: Date
  checking: number
  savings: number
  creditCard: number
  brokerage: number
  retirement: number
  studentLoan: number
}

const HISTORY: SnapshotPoint[] = [
  {
    capturedDate: utcDate(2026, 1, 1),
    checking: 2800,
    savings: 9800,
    creditCard: 380,
    brokerage: 8200,
    retirement: 38000,
    studentLoan: 19800,
  },
  {
    capturedDate: utcDate(2026, 2, 1),
    checking: 2950,
    savings: 10300,
    creditCard: 410,
    brokerage: 8450,
    retirement: 38900,
    studentLoan: 19500,
  },
  {
    capturedDate: utcDate(2026, 3, 1),
    checking: 3000,
    savings: 10800,
    creditCard: 395,
    brokerage: 8700,
    retirement: 39800,
    studentLoan: 19200,
  },
  {
    capturedDate: utcDate(2026, 4, 1),
    checking: 3050,
    savings: 11300,
    creditCard: 430,
    brokerage: 8950,
    retirement: 40700,
    studentLoan: 18900,
  },
  {
    capturedDate: utcDate(2026, 5, 1),
    checking: 3100,
    savings: 11900,
    creditCard: 445,
    brokerage: 9150,
    retirement: 41400,
    studentLoan: 18550,
  },
  {
    capturedDate: utcDate(2026, 6, 1),
    checking: 3150,
    savings: 12200,
    creditCard: 460,
    brokerage: 9300,
    retirement: 42000,
    studentLoan: 18200,
  },
  {
    // Final point — must equal the live Account/Debt balances exactly.
    capturedDate: TODAY,
    checking: CHECKING_BALANCE,
    savings: SAVINGS_BALANCE,
    creditCard: CREDIT_CARD_BALANCE,
    brokerage: BROKERAGE_BALANCE,
    retirement: RETIREMENT_BALANCE,
    studentLoan: STUDENT_LOAN_BALANCE,
  },
]

export async function createNetWorthSnapshots(userId: string): Promise<void> {
  await prisma.netWorthSnapshot.createMany({
    data: HISTORY.map((point) => {
      const totalAccountBalance =
        point.checking + point.savings + point.brokerage + point.retirement - point.creditCard
      const totalUnlinkedDebtLiability = point.studentLoan
      const totalNetWorth = totalAccountBalance - totalUnlinkedDebtLiability

      return {
        userId,
        capturedAt: point.capturedDate,
        capturedDate: point.capturedDate,
        totalAccountBalance,
        totalUnlinkedDebtLiability,
        totalNetWorth,
      }
    }),
  })

  console.log(`  Net Worth Snapshots: ${HISTORY.length} points spanning Feb-Jul 2026.`)
}
