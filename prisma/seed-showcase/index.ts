// Orchestrator for the showcase demo seed — each domain's data is built by
// its own module in this directory (single-responsibility, mirroring this
// codebase's own features/<domain>/ split) and wired together here in
// dependency order: Accounts/Debts/Investments before anything that
// references their ids, Transactions before Budget/AI-cache rows that
// summarize them, etc.
import { createAccounts } from "./accounts"
import { createAiCaches } from "./ai-caches"
import { createBills } from "./bills"
import { createBudgets } from "./budget"
import { getCategoryMap, prisma } from "./client"
import { SHOWCASE_EMAIL, SHOWCASE_PASSWORD } from "./config"
import { createCategorySuggestion } from "./category-suggestion"
import { createDebts } from "./debt"
import { createExpenseTransactions } from "./expense-transactions"
import { createFinancialGoals } from "./financial-goals"
import { createRecurringIncome } from "./income"
import { createInvestments } from "./investments"
import { createNetWorthSnapshots } from "./net-worth"
import { createOrReplaceShowcaseUser } from "./user"

export async function main(): Promise<void> {
  const user = await createOrReplaceShowcaseUser()

  // The signup hook (src/lib/auth.ts) seeds the 11 default categories
  // synchronously as part of signUpEmail's `after` hook, so they already
  // exist by this point — fetch once and pass the id map to every module
  // that needs to categorize a row.
  const categoryMap = await getCategoryMap(user.id)

  const accounts = await createAccounts(user.id)
  console.log("Accounts: Checking, Savings, Credit Card, Brokerage, 401(k) created.")

  const debts = await createDebts(user.id, accounts.creditCard.id)
  console.log("Debt Tracker: Credit Card (linked) + Student Loan (standalone) created.")

  await createInvestments(user.id, accounts.brokerage.id)
  console.log("Investments: 3 Holdings, value history, and dividends created.")

  await createRecurringIncome(user.id, accounts.checking.id)
  await createBills(user.id, accounts.checking.id, categoryMap)
  const { uncategorizedTransactionId } = await createExpenseTransactions(
    user.id,
    accounts.checking.id,
    categoryMap,
  )

  await createBudgets(user.id, categoryMap)

  await createFinancialGoals(
    user.id,
    debts.studentLoan.id,
    debts.studentLoanStartingBalance,
    accounts.savings.id,
  )
  console.log("Financial Goals: 3 goals created.")

  await createNetWorthSnapshots(user.id)

  await createAiCaches(user.id)

  await createCategorySuggestion(user.id, uncategorizedTransactionId, categoryMap.Food)

  console.log("")
  console.log("Showcase seed complete.")
  console.log(`  Login email:    ${SHOWCASE_EMAIL}`)
  console.log(`  Login password: ${SHOWCASE_PASSWORD}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
