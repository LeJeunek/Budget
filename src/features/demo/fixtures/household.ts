import type { Account } from "@/features/accounts/types"
import type { DebtWithProjection } from "@/features/debt/types"
import type { HoldingDetail } from "@/features/investments/types"
import type { GoalDetail } from "@/features/goals/types"
import type { FinancialGoalWithProgress } from "@/features/financial-goals/types"
import type { Transaction, TransactionCategorySummary } from "@/features/transactions/types"

import { buildDemoHoldings } from "./investments"
import { buildDemoAccounts } from "./accounts"
import { buildDemoDebts } from "./debts"
import { buildDemoTransactions, DEMO_CATEGORIES } from "./transactions"
import { buildDemoBudgetAllocations, type DemoBudgetAllocation } from "./budget"
import { buildDemoSavingsGoals } from "./savings-goals"
import { buildDemoFinancialGoals } from "./financial-goals"

/**
 * The demo household's fully composed, internally consistent dataset — the
 * one root value every `/demo` page and every `derive/*.ts` function reads
 * from, per public-demo-technical-design.md §2.1 item 2. Every entity array
 * below cross-references every other one exclusively through `ids.ts`'s
 * constants (never a re-typed literal id), so a broken reference is a
 * TypeScript compile error, not a silent runtime mismatch.
 */
export interface DemoHousehold {
  /** The `now` every entity in this household was resolved against — pass
   * this same value to every `derive/*.ts` call the page makes, per
   * `relative-date.ts`'s "one shared `now` per render" rule. */
  now: Date
  accounts: Account[]
  debts: DebtWithProjection[]
  holdings: HoldingDetail[]
  transactions: Transaction[]
  categories: TransactionCategorySummary[]
  budgetAllocations: DemoBudgetAllocation[]
  savingsGoals: GoalDetail[]
  financialGoals: FinancialGoalWithProgress[]
}

/**
 * Builds the full demo household, resolved against a single shared `now`.
 *
 * **Deliberately a function, not a static, module-level `DEMO_HOUSEHOLD`
 * object** — every entity in this fixture carries dates expressed as
 * relative offsets (`relative-date.ts`), resolved against `now` at build
 * time. A static object built from `new Date()` evaluated once at module
 * load would only ever be as fresh as whenever this module was first
 * imported into the running process, which is not guaranteed to align with
 * `src/app/demo/layout.tsx`'s `revalidate = 86400` regeneration cadence
 * (public-demo-technical-design.md §5.2) — silently reintroducing the exact
 * "eventually reads as stale" failure mode §5.1/AC6 exist to prevent. Every
 * `/demo` page (owned by the UI Component Engineer) is expected to call this
 * function exactly **once** per render, capturing its own local `now =
 * new Date()`, and thread the returned `DemoHousehold` (plus that same
 * `now`) down to every `derive/*.ts` call it makes — the "one shared now
 * captured once per render" rule `relative-date.ts` documents.
 *
 * Build order matters only for the two real derived-value dependencies this
 * fixture reproduces from the live app's own rules: the two Investments
 * containers' `Account.balance` is the sum of their active holdings'
 * `currentValue` (`accounts.ts` needs `holdings` first), and the linked
 * Credit Card debt's balance must agree with that same account's balance
 * (`debts.ts` needs `accounts.ts`'s `DEMO_CREDIT_CARD_BALANCE` export
 * first). Every other entity file is independent.
 */
export function getDemoHousehold(now: Date = new Date()): DemoHousehold {
  const holdings = buildDemoHoldings(now)
  const accounts = buildDemoAccounts(now, holdings)
  const debts = buildDemoDebts(now)
  const transactions = buildDemoTransactions(now)
  const budgetAllocations = buildDemoBudgetAllocations()
  const savingsGoals = buildDemoSavingsGoals(now)
  const financialGoals = buildDemoFinancialGoals({ now, accounts, debts, transactions })

  return {
    now,
    accounts,
    debts,
    holdings,
    transactions,
    categories: DEMO_CATEGORIES,
    budgetAllocations,
    savingsGoals,
    financialGoals,
  }
}
