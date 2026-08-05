/**
 * Stable, readable fixture entity IDs for Public Demo Mode.
 *
 * Per docs/architecture/public-demo-technical-design.md §2.4: nothing under
 * `/demo` is a real database row, so mimicking Prisma's `cuid()` shape buys
 * nothing — every ID here is a plain, prefixed, human-readable string (e.g.
 * `"demo-account-checking"`) so a reader of a demo URL, this file, or a
 * future E2E test can tell at a glance which fixture it names.
 *
 * Every cross-reference between fixture files (a `Transaction.accountId`, a
 * `FinancialGoal.linkedDebtId`, ...) MUST go through one of the constant
 * objects below — never a re-typed literal string — so a broken reference is
 * a TypeScript compile error (an undefined property access), not a silent
 * runtime string mismatch. This is also the mechanism the demo's dynamic
 * detail routes (`/demo/accounts/[accountId]`, `/demo/goals/[goalId]`, ...)
 * resolve against (design doc §7).
 */

/** The one demo household's user id — every fixture row's `userId` field
 * (Account, Transaction, Debt, Holding, ...) is this same constant, never a
 * per-entity-file literal, so every fixture row is unambiguously "owned by"
 * the same single fictional household (public-demo.md Capability 2 AC3). */
export const DEMO_USER_ID = "demo-user-household"

/** The five demo accounts, spanning every account type the household's
 * fixture story needs — checking/savings (everyday cash), a credit card
 * (liability), and a taxable brokerage + 401(k) (the two Investments
 * containers), satisfying public-demo.md Capability 2 AC4's "accounts across
 * at least three types" minimum with room to spare. */
export const DEMO_ACCOUNT_IDS = {
  checking: "demo-account-checking",
  savings: "demo-account-savings",
  creditCard: "demo-account-credit-card",
  brokerage: "demo-account-brokerage",
  retirement401k: "demo-account-retirement-401k",
} as const

/** The three demo debts — one hybrid-linked Credit Card debt (`accountId`
 * set to `DEMO_ACCOUNT_IDS.creditCard`, per debt-tracker.md's Option C
 * linking design) plus two standalone installment debts, giving the Debt
 * page real variety and the Strategy Comparison a genuine multi-debt
 * snowball/avalanche difference to show. */
export const DEMO_DEBT_IDS = {
  creditCardDebt: "demo-debt-credit-card",
  studentLoan: "demo-debt-student-loan",
  autoLoan: "demo-debt-auto-loan",
} as const

/** The five demo investment holdings, split across the two container
 * accounts, deliberately mixing gains and losses (public-demo.md Capability
 * 2 AC4: "a mix of gain and loss ... not uniformly"). */
export const DEMO_HOLDING_IDS = {
  totalMarketEtf: "demo-holding-total-market-etf",
  nexaTechStock: "demo-holding-nexatech-stock",
  meridianReit: "demo-holding-meridian-reit",
  targetRetirement2050: "demo-holding-target-retirement-2050",
  globalBondIndex: "demo-holding-global-bond-index",
} as const

/** The two demo Savings Goals (`/demo/goals`), both in-progress at a real,
 * partial completion percentage — never 0% or 100%, per AC4. */
export const DEMO_GOAL_IDS = {
  japanVacation: "demo-goal-japan-vacation",
  laptopUpgrade: "demo-goal-laptop-upgrade",
} as const

/** The three demo Financial Goals (`/demo/financial-goals`), one of each
 * type — Debt Payoff (linked to `DEMO_DEBT_IDS.studentLoan`), Net Worth
 * Savings Target, and Savings Rate Target — so AC4's "at least one in-progress
 * Financial Goal of a type other than debt-payoff" is satisfied with margin
 * (two non-debt-payoff types, both in progress). */
export const DEMO_FINANCIAL_GOAL_IDS = {
  studentLoanPayoff: "demo-financial-goal-student-loan-payoff",
  netWorthMilestone: "demo-financial-goal-net-worth-milestone",
  savingsRateTarget: "demo-financial-goal-savings-rate-target",
} as const

/**
 * The household's category IDs, one per entry in
 * `features/categories/default-categories.ts`'s `DEFAULT_CATEGORIES` (the
 * same Charter-fixed 11-category starter set every real new user gets) —
 * reusing that real, Prisma-free, feature-root data file rather than
 * inventing a parallel category list, per this codebase's "single source of
 * truth" convention. Keys below are ordered identically to
 * `DEFAULT_CATEGORIES` so `transactions.ts`'s `DEMO_CATEGORIES` builder can
 * zip the two arrays together without a name-matching lookup.
 */
export const DEMO_CATEGORY_IDS = {
  housing: "demo-category-housing",
  utilities: "demo-category-utilities",
  transportation: "demo-category-transportation",
  food: "demo-category-food",
  entertainment: "demo-category-entertainment",
  shopping: "demo-category-shopping",
  healthcare: "demo-category-healthcare",
  insurance: "demo-category-insurance",
  investments: "demo-category-investments",
  savings: "demo-category-savings",
  misc: "demo-category-misc",
} as const
