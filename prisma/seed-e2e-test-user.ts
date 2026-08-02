// FinanceOS — E2E test-fixture seed. Run via `npm run seed:e2e`.
//
// Per docs/architecture/phase-5a-technical-design.md §1.5: an operational
// script, not a product feature — mirrors prisma/seed-showcase.ts's own
// "operational script, not a product feature" precedent (real login via
// Better Auth's `auth.api.signUpEmail`, idempotent-friendly delete+recreate,
// its own standalone PrismaClient) but is a DELIBERATELY SEPARATE, smaller
// fixture from `showcase@lkbudget.demo`: the showcase account is re-seedable
// at any time by a human admin through Admin's own Seed Demo Data capability
// (admin.md Capability 6), so a running Playwright suite depending on that
// same account's data staying stable mid-run would be silently broken the
// moment anyone (or any other automated process) triggers a demo reseed.
// This script's two accounts exist for exactly one purpose — a stable,
// predictable login + fixture-data target for `tests/e2e/`'s Playwright
// suite — and are never touched by any product-facing seeding action.
//
// Creates TWO accounts:
//   - `e2e-test@lkbudget.dev`  — the ordinary account every non-admin
//     Playwright spec authenticates as (see support/auth.setup.ts). Seeded
//     with one real row across every domain the 24-route inventory
//     (support/route-inventory.ts) needs to render a populated, non-empty
//     state, and to resolve every dynamic ([id]/[goalId]/[billId]/
//     [streamId]/[holdingId]) route to a real record.
//   - `e2e-test-admin@lkbudget.dev` — created here with NO fixture data and
//     NO admin privilege of its own; this script only creates the login.
//     Granting the ADMIN tier is a deliberately separate step, performed by
//     the EXISTING, already-reviewed `scripts/grant-admin.ts` operational
//     script (`npm run grant:admin -- e2e-test-admin@lkbudget.dev`) — never
//     reinvented here, per phase-5a-technical-design.md §1.5's "reusing that
//     already-sanctioned mechanism rather than inventing a second grant
//     path." Run both in sequence:
//       npm run seed:e2e
//       npm run grant:admin -- e2e-test-admin@lkbudget.dev
//
// Guard: refuses to run in production (throws, does not silently no-op) —
// a defensive addition beyond seed-showcase.ts's own precedent (which has no
// such guard, since it's understood to be manually invoked by a trusted
// operator only), justified here because an E2E seed script is more
// plausible to end up wired into an automated pipeline than a
// manually-triggered demo script, and being defensive against that is cheap
// (phase-5a-technical-design.md §1.5).
//
// Writes the fixture ids every dynamic ROUTE_INVENTORY entry needs to
// `tests/e2e/support/fixture-ids.json` — the single hand-off point between
// this script and route-inventory.ts (see that file's own header comment).
import fs from "node:fs"
import path from "node:path"

import {
  AccountType,
  AssetType,
  BillSchedule,
  DebtType,
  FinancialGoalType,
  IncomeSchedule,
  IncomeType,
  PrismaClient,
} from "@prisma/client"

import { auth } from "@/lib/auth"
import { E2E_TEST_ADMIN_EMAIL, E2E_TEST_EMAIL } from "./e2e-test-accounts"

const prisma = new PrismaClient()

const FIXTURE_IDS_PATH = path.join(
  __dirname,
  "..",
  "tests",
  "e2e",
  "support",
  "fixture-ids.json",
)

/** UTC-midnight Date helper — matches every other seed script's convention
 * for this schema's `@db.Date` columns (risk-register.md #8). */
function utcDate(year: number, monthIndexZeroBased: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndexZeroBased, day))
}

/**
 * Creates (or, if already present from a prior run, deletes and recreates)
 * one real, loggable-in account via Better Auth's own `signUpEmail` — never
 * hand-rolled password hashing — so the resulting session is indistinguishable
 * from a real user's, exactly the same reasoning
 * prisma/seed-showcase/user.ts's own header comment documents.
 */
async function createOrReplaceUser(email: string, name: string, password: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    // Cascades to every model below via this schema's own onDelete: Cascade
    // relations, leaving nothing stale behind from a previous run.
    await prisma.user.delete({ where: { id: existing.id } })
  }

  const { user } = await auth.api.signUpEmail({ body: { email, password, name } })
  // Marks the email verified so nothing in the UI nags a test account to
  // verify an email nobody will ever check — mirrors seed-showcase's
  // identical treatment of showcase@lkbudget.demo.
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })

  return user.id
}

interface FixtureIds {
  transactionId: string
  goalId: string
  billId: string
  incomeStreamId: string
  holdingId: string
  financialGoalId: string
}

/**
 * Seeds one real row across every domain the 24-route inventory needs
 * (phase-5a-technical-design.md §1.5's minimum list) against the ordinary
 * `e2e-test@lkbudget.dev` account — enough that every list route renders a
 * populated state and every dynamic route resolves to a real record.
 */
async function createFixtureData(userId: string): Promise<FixtureIds> {
  // src/lib/auth.ts's signup hook seeds the 11 default categories
  // synchronously in signUpEmail's `after` hook, so they already exist.
  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  const categoryMap = Object.fromEntries(categories.map((c) => [c.name, c.id]))
  if (Object.keys(categoryMap).length === 0) {
    throw new Error(
      "E2E test user has zero categories after signup — category seeding in " +
        "src/lib/auth.ts's signup hook must have failed. Refusing to seed " +
        "fixture data uncategorized.",
    )
  }

  const today = new Date()
  const firstOfMonth = utcDate(today.getUTCFullYear(), today.getUTCMonth(), 1)

  // ---- Accounts ------------------------------------------------------
  const checking = await prisma.account.create({
    data: {
      userId,
      name: "E2E Checking",
      type: AccountType.CHECKING,
      institution: "Test Bank",
      balance: 2500.0,
      color: "#6366f1",
    },
  })

  const investmentAccount = await prisma.account.create({
    data: {
      userId,
      name: "E2E Brokerage",
      type: AccountType.INVESTMENT,
      institution: "Test Brokerage",
      balance: 3200.0,
      color: "#22c55e",
    },
  })

  // ---- Transaction (Transactions list + /transactions/[id]) ----------
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      accountId: checking.id,
      categoryId: categoryMap.Food,
      merchant: "E2E Test Grocery Co.",
      amount: -54.32,
      date: today,
    },
  })

  // ---- Budget + BudgetCategory allocation (Budgeting) -----------------
  const budget = await prisma.budget.create({
    data: { userId, month: firstOfMonth },
  })
  await prisma.budgetCategory.create({
    data: {
      budgetId: budget.id,
      userId,
      categoryId: categoryMap.Food,
      amount: 400.0,
    },
  })

  // ---- Bill + one paid occurrence (Bills list + /bills/[billId]) -----
  const bill = await prisma.bill.create({
    data: {
      userId,
      name: "E2E Test Internet Bill",
      expectedAmount: 65.0,
      dueDate: firstOfMonth,
      schedule: BillSchedule.MONTHLY,
      categoryId: categoryMap.Utilities,
    },
  })
  const billTransaction = await prisma.transaction.create({
    data: {
      userId,
      accountId: checking.id,
      categoryId: categoryMap.Utilities,
      merchant: "E2E Test ISP",
      amount: -65.0,
      date: firstOfMonth,
    },
  })
  await prisma.billOccurrence.create({
    data: {
      billId: bill.id,
      userId,
      dueDate: firstOfMonth,
      transactionId: billTransaction.id,
    },
  })

  // ---- Recurring Income + one received occurrence ----------------------
  const incomeStream = await prisma.incomeStream.create({
    data: {
      userId,
      name: "E2E Test Salary",
      type: IncomeType.SALARY,
      schedule: IncomeSchedule.MONTHLY,
      expectedAmount: 4000.0,
      anchorDate: firstOfMonth,
    },
  })
  const incomeTransaction = await prisma.transaction.create({
    data: {
      userId,
      accountId: checking.id,
      merchant: "E2E Test Employer Payroll",
      amount: 4000.0,
      date: firstOfMonth,
    },
  })
  await prisma.incomeOccurrence.create({
    data: {
      userId,
      streamId: incomeStream.id,
      expectedDate: firstOfMonth,
      transactionId: incomeTransaction.id,
    },
  })

  // ---- Savings Goal + one contribution (Goals) -------------------------
  const goal = await prisma.goal.create({
    data: {
      userId,
      name: "E2E Test Vacation Fund",
      targetAmount: 3000.0,
      plannedMonthlyContribution: 200.0,
    },
  })
  await prisma.goalContribution.create({
    data: { userId, goalId: goal.id, amount: 500.0, date: firstOfMonth },
  })

  // ---- Debt (Debt Tracker) ----------------------------------------------
  const debt = await prisma.debt.create({
    data: {
      userId,
      name: "E2E Test Personal Loan",
      type: DebtType.PERSONAL_LOAN,
      balance: 5000.0,
      interestRate: 8.5,
      minimumPayment: 150.0,
    },
  })

  // ---- Investment Holding (Investments + /investments/[holdingId]) -----
  const holding = await prisma.holding.create({
    data: {
      userId,
      accountId: investmentAccount.id,
      name: "E2E Test ETF Holding",
      assetType: AssetType.ETF,
      costBasis: 3000.0,
      currentValue: 3200.0,
    },
  })

  // ---- Financial Goal (DEBT_PAYOFF, targets the Debt above) ------------
  const financialGoal = await prisma.financialGoal.create({
    data: {
      userId,
      name: "E2E Test Pay Off Personal Loan",
      type: FinancialGoalType.DEBT_PAYOFF,
      linkedDebtId: debt.id,
      startingBalance: 5000.0,
    },
  })

  return {
    transactionId: transaction.id,
    goalId: goal.id,
    billId: bill.id,
    incomeStreamId: incomeStream.id,
    holdingId: holding.id,
    financialGoalId: financialGoal.id,
  }
}

async function main(): Promise<void> {
  // Refuses to run in production — throws, never silently no-ops (see this
  // file's own header comment for why this guard exists here but not on
  // seed-showcase.ts).
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "seed-e2e-test-user.ts refuses to run with NODE_ENV=production — this " +
        "script creates real, loggable-in test accounts and is intended for " +
        "local/CI test environments only.",
    )
  }

  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!password) {
    throw new Error(
      "E2E_TEST_USER_PASSWORD is not set. Add it to .env (see .env.example) " +
        "before running `npm run seed:e2e` — this script never falls back to " +
        "a hardcoded literal password.",
    )
  }

  const userId = await createOrReplaceUser(E2E_TEST_EMAIL, "E2E Test User", password)
  console.log(`[seed:e2e] Ordinary test account ready: ${E2E_TEST_EMAIL}`)

  const fixtureIds = await createFixtureData(userId)
  console.log("[seed:e2e] Fixture data seeded across every domain the route inventory needs.")

  // Admin account: login only, no fixture data, NOT granted ADMIN here — see
  // this file's header comment for the required follow-up `grant:admin` step.
  await createOrReplaceUser(E2E_TEST_ADMIN_EMAIL, "E2E Test Admin", password)
  console.log(`[seed:e2e] Admin test account ready (not yet ADMIN): ${E2E_TEST_ADMIN_EMAIL}`)
  console.log(
    `[seed:e2e] Next step required: npm run grant:admin -- ${E2E_TEST_ADMIN_EMAIL}`,
  )

  fs.mkdirSync(path.dirname(FIXTURE_IDS_PATH), { recursive: true })
  fs.writeFileSync(FIXTURE_IDS_PATH, JSON.stringify(fixtureIds, null, 2) + "\n")
  console.log(`[seed:e2e] Fixture ids written to ${FIXTURE_IDS_PATH}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
