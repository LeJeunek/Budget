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

  // Precondition check (bug report:
  // seed-demo-data-false-success-on-swallowed-category-seed-failure.md).
  // `src/lib/auth.ts`'s signup hook wraps category seeding in its own
  // try/catch and only `console.error`s on failure -- deliberately, so an
  // ordinary signup is never blocked by a seeding hiccup -- which means
  // `createOrReplaceShowcaseUser` above can resolve successfully even when
  // category seeding produced zero rows (an empty `SystemCategoryTemplate`,
  // e.g. via the admin-triggerable race documented in
  // category-template-delete-toctou-zero-entries.md, or any transient DB
  // error during that one `createMany` call). Every domain seeded below
  // (createBills/createExpenseTransactions/createBudgets/
  // createCategorySuggestion) looks up category ids by name from
  // `categoryMap`, and every one of those FKs (Bill.categoryId,
  // Transaction.categoryId, BudgetCategory.categoryId) is nullable -- so an
  // empty map would NOT throw anywhere downstream, it would silently
  // produce a fully-uncategorized demo account while this script still
  // exits 0. `triggerDemoDataSeed`/`seedDemoData` would then report
  // unqualified success to the admin, exactly the "silent partial refresh"
  // admin.md Capability 6 AC4 requires never happen. Failing loudly HERE,
  // immediately after the one read that would otherwise let this slip
  // through unnoticed, is what makes this script's existing
  // `main().catch(...) -> process.exit(1)` path fire, giving
  // `triggerDemoDataSeed` an honest non-zero exit code to report as a
  // failure instead.
  if (Object.keys(categoryMap).length === 0) {
    throw new Error(
      "Showcase user has zero categories after signup -- category seeding " +
        "in src/lib/auth.ts's signup hook must have failed, or " +
        "SystemCategoryTemplate is empty. Refusing to seed the rest of the " +
        "demo account's data uncategorized.",
    )
  }

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
