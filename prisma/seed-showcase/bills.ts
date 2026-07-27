// Bills: four recurring monthly bills (Rent, Electric, Internet, Phone) with
// six months of occurrence history, each paid occurrence LINKED to a real
// Transaction (bills.md AC7's linked path) rather than the manual
// paidAmount/paidDate path, so the same payment shows up once in both the
// Bills history and the Transactions/Budget/Analytics feed, never as two
// disconnected numbers. One extra, unpaid August occurrence (Rent) is added
// on top of the six historical months so the Bills list has a genuinely
// "Upcoming/Due" row, per the task's "one upcoming/due" requirement.
import { BillSchedule } from "@prisma/client"
import { prisma } from "./client"
import { ACCOUNT_CREATED_AT, MONTHS, utcDate } from "./config"

interface BillDef {
  name: string
  categoryName: "Housing" | "Utilities"
  merchant: string
  expectedAmount: number
  dueDay: number
  /** Actual amount paid each month, in MONTHS order — lets Electric (a
   * variable bill per bills.md's own Edge Cases) differ month to month
   * while Rent/Internet/Phone stay flat like real fixed bills. */
  actualAmounts: number[]
}

const BILLS: BillDef[] = [
  {
    name: "Rent",
    categoryName: "Housing",
    merchant: "Parkside Apartments Management",
    expectedAmount: 1450.0,
    dueDay: 1,
    actualAmounts: [1450.0, 1450.0, 1450.0, 1450.0, 1450.0, 1450.0],
  },
  {
    name: "Electric",
    categoryName: "Utilities",
    merchant: "Metro City Electric & Gas",
    expectedAmount: 110.0,
    dueDay: 10,
    // A variable bill (bills.md Edge Cases) — higher in summer months as AC
    // use ramps up, never identical to `expectedAmount`.
    actualAmounts: [104.5, 98.2, 112.75, 118.3, 125.6, 121.1],
  },
  {
    name: "Internet",
    categoryName: "Utilities",
    merchant: "Xfinity Internet",
    expectedAmount: 65.0,
    dueDay: 15,
    actualAmounts: [65.0, 65.0, 65.0, 65.0, 65.0, 65.0],
  },
  {
    name: "Phone",
    categoryName: "Utilities",
    merchant: "Verizon Wireless",
    expectedAmount: 85.0,
    dueDay: 20,
    actualAmounts: [85.0, 85.0, 85.0, 85.0, 85.0, 85.0],
  },
]

export async function createBills(
  userId: string,
  checkingAccountId: string,
  categoryMap: Record<string, string>,
): Promise<void> {
  for (const billDef of BILLS) {
    const categoryId = categoryMap[billDef.categoryName]
    const firstDueDate = utcDate(MONTHS[0].year, MONTHS[0].monthIndex, billDef.dueDay)

    const bill = await prisma.bill.create({
      data: {
        userId,
        name: billDef.name,
        expectedAmount: billDef.expectedAmount,
        dueDate: firstDueDate,
        schedule: BillSchedule.MONTHLY,
        categoryId,
        createdAt: ACCOUNT_CREATED_AT,
      },
    })

    for (let i = 0; i < MONTHS.length; i++) {
      const month = MONTHS[i]
      const dueDate = utcDate(month.year, month.monthIndex, billDef.dueDay)
      const paidAmount = billDef.actualAmounts[i]

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          accountId: checkingAccountId,
          categoryId,
          merchant: billDef.merchant,
          amount: -paidAmount,
          date: dueDate,
          createdAt: dueDate,
        },
      })

      await prisma.billOccurrence.create({
        data: {
          billId: bill.id,
          userId,
          dueDate,
          transactionId: transaction.id,
          createdAt: dueDate,
        },
      })
    }

    // One bill (Rent) gets an extra, unpaid next-month occurrence so the
    // Bills list has a real Upcoming/Due row alongside its paid history —
    // the other three stay at exactly six paid occurrences each.
    if (billDef.name === "Rent") {
      const lastMonth = MONTHS[MONTHS.length - 1]
      const upcomingDueDate = utcDate(lastMonth.year, lastMonth.monthIndex + 1, billDef.dueDay)

      await prisma.billOccurrence.create({
        data: {
          billId: bill.id,
          userId,
          dueDate: upcomingDueDate,
        },
      })
    }
  }

  console.log(`  Bills: ${BILLS.length} recurring bills, ~6 months of occurrence history each.`)
}
