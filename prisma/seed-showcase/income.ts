// Recurring Income: one biweekly SALARY IncomeStream, with an
// IncomeOccurrence + real linked Transaction for every pay date across the
// six-month showcase window — mirroring
// features/recurring-income/server/actions.ts's `linkOccurrenceToTransaction`
// relationship exactly (`transactionId` set on the occurrence,
// `receivedAmount`/`receivedDate` left null, since the linked Transaction is
// the source of truth for the effective received amount/date).
import { IncomeSchedule, IncomeType } from "@prisma/client"
import { prisma } from "./client"
import { TODAY, utcDate } from "./config"

const PAYCHECK_AMOUNT = 2400.0
const FIRST_PAY_DATE = utcDate(2026, 1, 6) // February 6, 2026
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

function generateBiweeklyPayDates(firstDate: Date, throughInclusive: Date): Date[] {
  const dates: Date[] = []
  let cursor = firstDate
  while (cursor.getTime() <= throughInclusive.getTime()) {
    dates.push(cursor)
    cursor = new Date(cursor.getTime() + FOURTEEN_DAYS_MS)
  }
  return dates
}

export async function createRecurringIncome(userId: string, checkingAccountId: string): Promise<void> {
  const stream = await prisma.incomeStream.create({
    data: {
      userId,
      name: "Acme Corp Salary",
      type: IncomeType.SALARY,
      schedule: IncomeSchedule.BIWEEKLY,
      expectedAmount: PAYCHECK_AMOUNT,
      anchorDate: FIRST_PAY_DATE,
      createdAt: FIRST_PAY_DATE,
    },
  })

  const payDates = generateBiweeklyPayDates(FIRST_PAY_DATE, TODAY)

  for (const payDate of payDates) {
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        accountId: checkingAccountId,
        merchant: "Acme Corp Payroll",
        amount: PAYCHECK_AMOUNT,
        date: payDate,
        createdAt: payDate,
      },
    })

    await prisma.incomeOccurrence.create({
      data: {
        userId,
        streamId: stream.id,
        expectedDate: payDate,
        transactionId: transaction.id,
        createdAt: payDate,
      },
    })
  }

  console.log(`  Recurring income: ${payDates.length} biweekly paychecks linked to Transactions.`)
}
