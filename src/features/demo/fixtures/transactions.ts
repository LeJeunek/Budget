import type { Transaction, TransactionCategorySummary } from "@/features/transactions/types"
import { DEFAULT_CATEGORIES } from "@/features/categories/default-categories"

import { DEMO_ACCOUNT_IDS, DEMO_CATEGORY_IDS, DEMO_USER_ID } from "./ids"
import { relativeMonthStart } from "./relative-date"
import { DEMO_ACCOUNT_SUMMARIES } from "./accounts"

/**
 * The demo household's transaction history — six calendar months (the
 * current, in-progress month plus five full prior months) of realistic,
 * varied activity: multiple merchants per category, a mix of income and
 * expense entries, and a recognizable recurring subscription pair (Netflix +
 * Spotify, charged the same day every month) — satisfying public-demo.md
 * Capability 2 AC4's transaction-history minimum bar.
 *
 * Every date is authored as a `{ monthsAgo, day }` pair, resolved via
 * `dateInMonth` (below) — never a literal `Date`/ISO string — per
 * `relative-date.ts`'s module doc. The current month's own entries
 * (`monthsAgo: 0`) are clamped so a transaction is never dated after
 * whatever "today" the page happens to render on, matching the real app's
 * own month-to-date framing (`features/dashboard/server/service.ts`'s
 * `resolveMonthToDateRange`) rather than fabricating a future-dated row.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Resolves a `{ monthsAgo, day }` fixture date against `now` — `day` is the
 * 1-indexed day-of-month within that calendar month, clamped to "today" for
 * the current month (`monthsAgo: 0`) so no transaction is ever dated in the
 * future. */
function dateInMonth(now: Date, monthsAgo: number, day: number): Date {
  const monthStart = relativeMonthStart(monthsAgo, now)
  const effectiveDay = monthsAgo === 0 ? Math.min(day, now.getUTCDate()) : day
  return new Date(monthStart.getTime() + (effectiveDay - 1) * MS_PER_DAY)
}

/**
 * The demo household's categories — one per `DEFAULT_CATEGORIES` entry (the
 * same 11-category Charter starter set every real new user gets), paired
 * with `DEMO_CATEGORY_IDS` (declared in the identical order — see that
 * file's own doc comment). Exported so `budget.ts` and the derive layer can
 * reference the same category id/name/color triples this file embeds on
 * every transaction, rather than a second, independently-typed category
 * list.
 */
export const DEMO_CATEGORIES: TransactionCategorySummary[] = Object.values(
  DEMO_CATEGORY_IDS,
).map((id, index) => ({
  id,
  name: DEFAULT_CATEGORIES[index].name,
  color: DEFAULT_CATEGORIES[index].color,
}))

const CATEGORY_BY_KEY = (() => {
  const keys = Object.keys(DEMO_CATEGORY_IDS) as (keyof typeof DEMO_CATEGORY_IDS)[]
  const map = new Map<keyof typeof DEMO_CATEGORY_IDS, TransactionCategorySummary>()
  keys.forEach((key, index) => map.set(key, DEMO_CATEGORIES[index]))
  return map
})()

const ACCOUNT_BY_ID = new Map(DEMO_ACCOUNT_SUMMARIES.map((a) => [a.id, a]))

type CategoryKey = keyof typeof DEMO_CATEGORY_IDS

interface TxnTemplate {
  merchant: string
  amount: number
  day: number
  categoryKey: CategoryKey | null
  accountId?: string
}

let transactionCounter = 0

function buildTransaction(
  now: Date,
  monthsAgo: number,
  template: TxnTemplate,
): Transaction {
  transactionCounter += 1
  const category = template.categoryKey ? (CATEGORY_BY_KEY.get(template.categoryKey) ?? null) : null
  const accountId = template.accountId ?? DEMO_ACCOUNT_IDS.checking
  const account = ACCOUNT_BY_ID.get(accountId)
  if (!account) {
    throw new Error(`demo transactions: unknown accountId "${accountId}"`)
  }

  const date = dateInMonth(now, monthsAgo, template.day)

  return {
    id: `demo-txn-${String(transactionCounter).padStart(4, "0")}`,
    userId: DEMO_USER_ID,
    accountId,
    account: { id: account.id, name: account.name, color: account.color },
    categoryId: category?.id ?? null,
    category,
    merchant: template.merchant,
    amount: template.amount,
    date,
    notes: null,
    parentTransactionId: null,
    createdAt: date,
    updatedAt: date,
    tags: [],
  }
}

/** Two paycheck deposits (the 1st and the 15th) every month — the
 * household's steady income floor every derive function's income figure is
 * built from. */
function buildPaychecks(): TxnTemplate[] {
  return [
    { merchant: "Meridian Logistics Payroll", amount: 2950, day: 1, categoryKey: null },
    { merchant: "Meridian Logistics Payroll", amount: 2950, day: 15, categoryKey: null },
  ]
}

/** Netflix + Spotify, charged the same day every month — the "recognizably
 * recurring pattern" public-demo.md Capability 2 AC4 requires. */
function buildSubscriptions(): TxnTemplate[] {
  return [
    { merchant: "Netflix", amount: -15.99, day: 5, categoryKey: "entertainment" },
    { merchant: "Spotify", amount: -11.99, day: 12, categoryKey: "entertainment" },
  ]
}

/** Fixed monthly costs that don't meaningfully vary month to month — rent,
 * insurance, and the household's own standing transfer into savings. */
function buildFixedCosts(): TxnTemplate[] {
  return [
    { merchant: "Parkview Apartments", amount: -1800, day: 1, categoryKey: "housing" },
    { merchant: "Meridian Insurance Co.", amount: -150, day: 3, categoryKey: "insurance" },
    {
      merchant: "Transfer to Emergency Fund Savings",
      amount: -300,
      day: 1,
      categoryKey: "savings",
    },
  ]
}

/** Per-month variable spend — groceries, dining, transportation, utilities,
 * shopping, occasional healthcare, and a small misc/uncategorized entry.
 * Hand-varied per month (not randomized) for real month-to-month trend
 * variety across `CategoryTrendsChart`/`YearlySpendingChart`. Index 0 is the
 * current (in-progress) month; index 5 is five months ago. */
const VARIABLE_SPEND_BY_MONTHS_AGO: TxnTemplate[][] = [
  // Current month (0) — deliberately sized so Transportation and Food land
  // over their `budget.ts` allocation while Utilities/Shopping/Healthcare/
  // Entertainment land comfortably under, per public-demo.md Capability 2
  // AC4's "at least one near/over and at least one comfortably under" bar.
  [
    { merchant: "Whole Foods Market", amount: -88.42, day: 3, categoryKey: "food" },
    { merchant: "Trader Joe's", amount: -76.15, day: 10, categoryKey: "food" },
    { merchant: "Safeway", amount: -92.3, day: 17, categoryKey: "food" },
    { merchant: "Costco Wholesale", amount: -145.6, day: 24, categoryKey: "food" },
    { merchant: "Riverside Farmers Market", amount: -95.3, day: 27, categoryKey: "food" },
    { merchant: "Chipotle", amount: -28.9, day: 5, categoryKey: "food" },
    { merchant: "Local Bistro", amount: -54.75, day: 12, categoryKey: "food" },
    { merchant: "Sushi Place", amount: -61.2, day: 19, categoryKey: "food" },
    { merchant: "Corner Café", amount: -18.36, day: 2, categoryKey: "food" },
    { merchant: "Pizza Night", amount: -42.5, day: 22, categoryKey: "food" },
    { merchant: "Shell Gas Station", amount: -68, day: 6, categoryKey: "transportation" },
    { merchant: "Shell Gas Station", amount: -71, day: 20, categoryKey: "transportation" },
    { merchant: "CityRide Rideshare", amount: -75.2, day: 14, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -204.53, day: 8, categoryKey: "utilities" },
    { merchant: "Amazon", amount: -42.3, day: 9, categoryKey: "shopping" },
    { merchant: "Target", amount: -54.45, day: 21, categoryKey: "shopping" },
    { merchant: "Movie Night Cinemas", amount: -30.42, day: 18, categoryKey: "entertainment" },
    { merchant: "CVS Pharmacy", amount: -42, day: 11, categoryKey: "healthcare" },
    { merchant: "Corner Kiosk", amount: -18, day: 25, categoryKey: null },
    { merchant: "Riverside Convenience Store", amount: -23.4, day: 16, categoryKey: "misc" },
  ],
  // 1 month ago
  [
    { merchant: "Whole Foods Market", amount: -82.1, day: 4, categoryKey: "food" },
    { merchant: "Local Bistro", amount: -47.3, day: 16, categoryKey: "food" },
    { merchant: "Shell Gas Station", amount: -62.4, day: 7, categoryKey: "transportation" },
    { merchant: "Shell Gas Station", amount: -58.9, day: 22, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -198.75, day: 8, categoryKey: "utilities" },
    { merchant: "Target", amount: -38.2, day: 14, categoryKey: "shopping" },
    { merchant: "Riverside Drugstore", amount: -15.6, day: 19, categoryKey: "misc" },
  ],
  // 2 months ago
  [
    { merchant: "Trader Joe's", amount: -91.55, day: 3, categoryKey: "food" },
    { merchant: "Sushi Place", amount: -58.1, day: 18, categoryKey: "food" },
    { merchant: "Chevron", amount: -65.8, day: 6, categoryKey: "transportation" },
    { merchant: "Chevron", amount: -60.15, day: 21, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -210.4, day: 8, categoryKey: "utilities" },
    { merchant: "Amazon", amount: -64.9, day: 13, categoryKey: "shopping" },
    { merchant: "Target", amount: -29.99, day: 24, categoryKey: "shopping" },
    { merchant: "Downtown Concert Hall", amount: -45, day: 20, categoryKey: "entertainment" },
    { merchant: "CVS Pharmacy", amount: -35.2, day: 11, categoryKey: "healthcare" },
    { merchant: "Ace Hardware", amount: -27.85, day: 19, categoryKey: "misc" },
  ],
  // 3 months ago
  [
    { merchant: "Safeway", amount: -78.6, day: 3, categoryKey: "food" },
    { merchant: "Chipotle", amount: -24.75, day: 15, categoryKey: "food" },
    { merchant: "Pizza Night", amount: -38.9, day: 22, categoryKey: "food" },
    { merchant: "Shell Gas Station", amount: -70.25, day: 7, categoryKey: "transportation" },
    { merchant: "CityRide Rideshare", amount: -42.1, day: 18, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -189.9, day: 8, categoryKey: "utilities" },
    { merchant: "Best Buy", amount: -112.4, day: 14, categoryKey: "shopping" },
    { merchant: "Riverside Convenience Store", amount: -19.75, day: 19, categoryKey: "misc" },
  ],
  // 4 months ago
  [
    { merchant: "Costco Wholesale", amount: -138.2, day: 3, categoryKey: "food" },
    { merchant: "Local Bistro", amount: -51.4, day: 17, categoryKey: "food" },
    { merchant: "Shell Gas Station", amount: -59.6, day: 6, categoryKey: "transportation" },
    { merchant: "Shell Gas Station", amount: -63.3, day: 20, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -215.6, day: 8, categoryKey: "utilities" },
    { merchant: "Target", amount: -47.85, day: 13, categoryKey: "shopping" },
    { merchant: "Riverside Cinemas", amount: -28, day: 24, categoryKey: "entertainment" },
    { merchant: "Parkview Urgent Care", amount: -85, day: 9, categoryKey: "healthcare" },
    { merchant: "Riverside Drugstore", amount: -22.1, day: 19, categoryKey: "misc" },
  ],
  // 5 months ago
  [
    { merchant: "Whole Foods Market", amount: -95.4, day: 4, categoryKey: "food" },
    { merchant: "Chipotle", amount: -31.2, day: 16, categoryKey: "food" },
    { merchant: "Shell Gas Station", amount: -66.75, day: 7, categoryKey: "transportation" },
    { merchant: "City Utilities Co.", amount: -202.3, day: 8, categoryKey: "utilities" },
    { merchant: "Amazon", amount: -39.6, day: 12, categoryKey: "shopping" },
    { merchant: "Riverside Convenience Store", amount: -17.4, day: 19, categoryKey: "misc" },
  ],
]

const MONTHS_OF_HISTORY = VARIABLE_SPEND_BY_MONTHS_AGO.length

/** Builds every demo transaction across the current month plus the
 * `MONTHS_OF_HISTORY - 1` prior months, resolved against a single shared
 * `now`. */
export function buildDemoTransactions(now: Date): Transaction[] {
  transactionCounter = 0
  const transactions: Transaction[] = []

  for (let monthsAgo = 0; monthsAgo < MONTHS_OF_HISTORY; monthsAgo++) {
    const templates: TxnTemplate[] = [
      ...buildPaychecks(),
      ...buildSubscriptions(),
      ...buildFixedCosts(),
      ...VARIABLE_SPEND_BY_MONTHS_AGO[monthsAgo],
    ]

    for (const template of templates) {
      transactions.push(buildTransaction(now, monthsAgo, template))
    }
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime())
}
