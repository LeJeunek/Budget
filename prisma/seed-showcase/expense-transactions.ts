// Non-bill expense transactions across the remaining 9 default categories
// (Food, Transportation, Entertainment, Shopping, Healthcare, Insurance,
// Investments, Savings, Misc — Housing/Utilities are covered by bills.ts's
// linked Transactions instead), applied identically every month with two
// deliberate one-off overrides (June Shopping, July Entertainment) that push
// those two category+month combinations over their Budget allocation — see
// budget.ts's own comment for why these two specific months/categories were
// chosen to produce a realistic "mostly under, a couple of months over" mix
// rather than a uniformly perfect or uniformly failing budget.
import { prisma } from "./client"
import { MONTHS, utcDate } from "./config"

interface LineItem {
  merchant: string
  amount: number
  day: number
}

/** Baseline monthly spend per category, applied to every month in MONTHS
 * unless overridden below. Day-of-month values are all <= 24 so they're
 * valid in every month, including February. */
const BASELINE: Record<string, LineItem[]> = {
  Food: [
    { merchant: "Trader Joe's", amount: 72.4, day: 3 },
    { merchant: "Whole Foods Market", amount: 58.15, day: 9 },
    { merchant: "Chipotle Mexican Grill", amount: 13.75, day: 12 },
    { merchant: "Blue Bottle Coffee", amount: 6.25, day: 16 },
    { merchant: "Thai Basil Bistro", amount: 38.9, day: 19 },
    { merchant: "Safeway", amount: 45.6, day: 23 },
  ],
  Transportation: [
    { merchant: "Shell Gas Station", amount: 46.0, day: 5 },
    { merchant: "Chevron", amount: 41.5, day: 18 },
    { merchant: "Metro Transit Authority", amount: 60.0, day: 2 },
  ],
  Entertainment: [
    { merchant: "AMC Theatres", amount: 32.0, day: 14 },
    { merchant: "Steam", amount: 19.99, day: 8 },
    { merchant: "Spotify Premium", amount: 11.99, day: 6 },
  ],
  Shopping: [
    { merchant: "Amazon.com", amount: 64.2, day: 11 },
    { merchant: "Target", amount: 52.3, day: 21 },
  ],
  Healthcare: [
    { merchant: "CVS Pharmacy", amount: 24.99, day: 13 },
    { merchant: "Family Health Clinic Copay", amount: 30.0, day: 24 },
  ],
  Insurance: [{ merchant: "State Farm Auto Insurance", amount: 110.0, day: 7 }],
  Investments: [{ merchant: "Fidelity Brokerage Contribution", amount: 200.0, day: 4 }],
  Savings: [{ merchant: "Transfer to Marcus Savings", amount: 300.0, day: 4 }],
  Misc: [{ merchant: "Great Lakes Student Loan Servicing", amount: 220.0, day: 22 }],
}

/** One-off additions layered on top of BASELINE for a specific
 * (monthIndex, category) pair — deliberately pushes that month's category
 * spend past its Budget allocation (see budget.ts). Both are realistic
 * single "bigger than usual" purchases, not a suspicious repeating pattern. */
const MONTH_OVERRIDES: Array<{ monthIndex: number; category: string; item: LineItem }> = [
  {
    monthIndex: 5, // June
    category: "Shopping",
    item: { merchant: "Best Buy", amount: 110.0, day: 17 },
  },
  {
    monthIndex: 6, // July
    category: "Entertainment",
    item: { merchant: "Live Nation - Concert Tickets", amount: 45.0, day: 20 },
  },
]

export async function createExpenseTransactions(
  userId: string,
  checkingAccountId: string,
  categoryMap: Record<string, string>,
): Promise<{ uncategorizedTransactionId: string }> {
  let count = 0

  for (const month of MONTHS) {
    for (const [categoryName, lineItems] of Object.entries(BASELINE)) {
      const categoryId = categoryMap[categoryName]
      if (!categoryId) {
        throw new Error(`Expected default category "${categoryName}" to exist for showcase user`)
      }

      const itemsForMonth = [...lineItems]
      const override = MONTH_OVERRIDES.find(
        (o) => o.monthIndex === month.monthIndex && o.category === categoryName,
      )
      if (override) itemsForMonth.push(override.item)

      for (const item of itemsForMonth) {
        const date = utcDate(month.year, month.monthIndex, item.day)
        await prisma.transaction.create({
          data: {
            userId,
            accountId: checkingAccountId,
            categoryId,
            merchant: item.merchant,
            amount: -item.amount,
            date,
            createdAt: date,
          },
        })
        count++
      }
    }
  }

  // One deliberately Uncategorized transaction in the current month — the
  // target for the PENDING CategorySuggestion seeded by
  // category-suggestion.ts, mirroring prisma/seed.ts's own precedent that a
  // realistic PENDING/AUTOMATIC suggestion needs a real Uncategorized
  // target (reusing an already-categorized transaction would violate
  // ai-features.md's "automatic suggestions only for Uncategorized
  // transactions" rule).
  const currentMonth = MONTHS[MONTHS.length - 1]
  const uncategorized = await prisma.transaction.create({
    data: {
      userId,
      accountId: checkingAccountId,
      merchant: "Corner Deli & Grocery",
      amount: -42.18,
      date: utcDate(currentMonth.year, currentMonth.monthIndex, 26),
    },
  })
  count++

  console.log(`  Expense transactions: ${count} across 9 non-bill categories + 1 Uncategorized.`)

  return { uncategorizedTransactionId: uncategorized.id }
}
