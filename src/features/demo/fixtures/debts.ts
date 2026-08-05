import { computeAmortization } from "@/features/debt/payoff-math"
import type { DebtWithProjection } from "@/features/debt/types"

import { DEMO_ACCOUNT_IDS, DEMO_DEBT_IDS, DEMO_USER_ID } from "./ids"
import { relativeDate } from "./relative-date"
import { DEMO_CREDIT_CARD_BALANCE } from "./accounts"

/**
 * The demo household's three debts — one hybrid-linked Credit Card debt
 * (`accountId` set, per debt-tracker.md's Option C design) plus two
 * standalone installment debts (Student Loan, Auto Loan), satisfying
 * public-demo.md Capability 2 AC4's "at least one active debt with a real
 * payoff projection" with real variety for the Strategy Comparison's
 * snowball-vs-avalanche difference to be visible.
 *
 * Every payoff-projection field (`payoffDate`/`totalInterestRemaining`/
 * `isNegativeAmortization`/`isPaidOff`) is computed by calling
 * `features/debt/payoff-math.ts`'s `computeAmortization` directly — the
 * exact same pure, isomorphic function `features/debt/server/service.ts`'s
 * `toDebtWithProjection` calls — rather than a reimplementation, per
 * public-demo-technical-design.md §4.1's allowlist (`payoff-math.ts` is a
 * feature-root, Prisma-free file, safe to import). This is a "shared
 * computation, not independently authored" guarantee: the demo's payoff
 * dates/interest totals are computed by the exact same math the real app
 * uses, never a hand-typed approximation of it.
 */

function buildDebt(params: {
  id: string
  name: string
  type: DebtWithProjection["type"]
  balance: number
  interestRate: number
  minimumPayment: number
  accountId: string | null
  openedDaysAgo: number
  now: Date
}): DebtWithProjection {
  const { id, name, type, balance, interestRate, minimumPayment, accountId, openedDaysAgo, now } =
    params

  // `effectiveBalance` mirrors `toDebtWithProjection`'s own rule exactly:
  // `Debt.balance` unless linked to an Account, in which case it's the
  // linked Account's live balance (never copied) — here, `balance` IS
  // already that account's balance for the one linked debt below, so this
  // is a same-value read, not a special case.
  const effectiveBalance = balance

  const amortization = computeAmortization(
    { id, balance: effectiveBalance, interestRate, minimumPayment },
    now,
  )

  return {
    id,
    userId: DEMO_USER_ID,
    name,
    type,
    balance,
    interestRate,
    minimumPayment,
    accountId,
    archivedAt: null,
    createdAt: relativeDate(openedDaysAgo, now),
    updatedAt: relativeDate(3, now),
    effectiveBalance,
    payoffDate: amortization.payoffDate,
    totalInterestRemaining: amortization.totalInterestRemaining,
    isNegativeAmortization: amortization.isNegativeAmortization,
    isPaidOff: effectiveBalance <= 0,
    isEstimate: type === "CREDIT_CARD",
  }
}

/** Builds all three demo debts, resolved against a single shared `now`. */
export function buildDemoDebts(now: Date): DebtWithProjection[] {
  return [
    buildDebt({
      id: DEMO_DEBT_IDS.creditCardDebt,
      name: "Rewards Credit Card",
      type: "CREDIT_CARD",
      // Stale/unused while linked (per `Debt.balance`'s schema comment) —
      // seeded from the linked Account's own balance so it's a sane fallback
      // if this demo debt were ever (hypothetically) unlinked.
      balance: DEMO_CREDIT_CARD_BALANCE,
      interestRate: 24.99,
      minimumPayment: 45,
      accountId: DEMO_ACCOUNT_IDS.creditCard,
      openedDaysAgo: 1100,
      now,
    }),
    buildDebt({
      id: DEMO_DEBT_IDS.studentLoan,
      name: "Federal Student Loan",
      type: "STUDENT_LOAN",
      balance: 22450,
      interestRate: 5.4,
      minimumPayment: 310,
      accountId: null,
      openedDaysAgo: 2500,
      now,
    }),
    buildDebt({
      id: DEMO_DEBT_IDS.autoLoan,
      name: "Auto Loan — Honda CR-V",
      type: "AUTO_LOAN",
      balance: 9800,
      interestRate: 6.9,
      minimumPayment: 265,
      accountId: null,
      openedDaysAgo: 620,
      now,
    }),
  ]
}
