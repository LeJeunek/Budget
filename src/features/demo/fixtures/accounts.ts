import type { Account } from "@/features/accounts/types"
import type { HoldingDetail } from "@/features/investments/types"

import { DEMO_ACCOUNT_IDS, DEMO_USER_ID } from "./ids"
import { relativeDate } from "./relative-date"
import { sumActiveHoldingsValue } from "./investments"

/**
 * The demo household's five accounts, spanning checking, savings, a credit
 * card, and the two Investments containers (brokerage + 401k) — satisfying
 * public-demo.md Capability 2 AC4's "accounts across at least three types"
 * minimum with two extra types (Investment, Retirement) beyond it.
 *
 * The Credit Card's balance is exported as `DEMO_CREDIT_CARD_BALANCE` so
 * `debts.ts`'s hybrid-linked Credit Card debt (per debt-tracker.md's Option
 * C design) can reference the exact same number rather than a re-typed
 * literal — the same "shared computation, not independently authored"
 * discipline public-demo-technical-design.md §2.1 requires for cross-page
 * consistency.
 *
 * The two Investments containers' balances are the sum of their active
 * holdings' `currentValue` (`sumActiveHoldingsValue`, from `investments.ts`)
 * — mirroring `prisma/schema.prisma`'s own documented Phase 3a rule that an
 * Investment/Retirement/Crypto Account's `balance` column becomes a derived,
 * read-only value once it has active holdings, kept in sync by Investments'
 * write-back path in the real app. This fixture reproduces that same
 * derived-value relationship by construction (one sum, reused, never two
 * independently-typed numbers).
 */

/** The demo Credit Card account's stored liability balance — shared with
 * `debts.ts`. See this file's module doc above. */
export const DEMO_CREDIT_CARD_BALANCE = 1340.55

/**
 * The subset of each account's display fields (`id`/`name`/`color`) that
 * don't depend on `holdings` — exported separately so `transactions.ts` can
 * embed a `TransactionAccountSummary` on every transaction without needing
 * the full `buildDemoAccounts(now, holdings)` call (and therefore without
 * needing to resolve `investments.ts`'s holdings first just to label a
 * transaction row). Kept as one array here, referenced everywhere else it's
 * needed, rather than a second, independently-typed literal per consumer.
 */
export const DEMO_ACCOUNT_SUMMARIES: { id: string; name: string; color: string }[] = [
  { id: DEMO_ACCOUNT_IDS.checking, name: "Everyday Checking", color: "#6366f1" },
  { id: DEMO_ACCOUNT_IDS.savings, name: "Emergency Fund Savings", color: "#0ea5e9" },
  { id: DEMO_ACCOUNT_IDS.creditCard, name: "Rewards Credit Card", color: "#ec4899" },
  { id: DEMO_ACCOUNT_IDS.brokerage, name: "Brokerage Account", color: "#14b8a6" },
  { id: DEMO_ACCOUNT_IDS.retirement401k, name: "401(k) Retirement", color: "#a855f7" },
]

function buildAccount(params: {
  id: string
  name: string
  type: Account["type"]
  institution: string
  balance: number
  interestRate: number | null
  color: string
  openedDaysAgo: number
  now: Date
}): Account {
  const { id, name, type, institution, balance, interestRate, color, openedDaysAgo, now } = params

  return {
    id,
    userId: DEMO_USER_ID,
    name,
    type,
    institution,
    balance,
    interestRate,
    color,
    archivedAt: null,
    lowBalanceThresholdOverride: null,
    lowBalanceNotifiedAt: null,
    createdAt: relativeDate(openedDaysAgo, now),
    updatedAt: relativeDate(1, now),
  }
}

/** Builds all five demo accounts, resolved against a single shared `now`.
 * `holdings` must be the same `buildDemoHoldings(now)` result the rest of
 * the household is built from, so the two Investments containers'
 * `balance` figures always agree with what `/demo/investments` shows for
 * the same holdings. */
export function buildDemoAccounts(now: Date, holdings: HoldingDetail[]): Account[] {
  return [
    buildAccount({
      id: DEMO_ACCOUNT_IDS.checking,
      name: "Everyday Checking",
      type: "CHECKING",
      institution: "Horizon Bank",
      balance: 4850.32,
      interestRate: null,
      color: "#6366f1",
      openedDaysAgo: 1460,
      now,
    }),
    buildAccount({
      id: DEMO_ACCOUNT_IDS.savings,
      name: "Emergency Fund Savings",
      type: "SAVINGS",
      institution: "Horizon Bank",
      balance: 18200,
      interestRate: 3.75,
      color: "#0ea5e9",
      openedDaysAgo: 1460,
      now,
    }),
    buildAccount({
      id: DEMO_ACCOUNT_IDS.creditCard,
      name: "Rewards Credit Card",
      type: "CREDIT_CARD",
      institution: "Meridian Card Co.",
      balance: DEMO_CREDIT_CARD_BALANCE,
      interestRate: 24.99,
      color: "#ec4899",
      openedDaysAgo: 1100,
      now,
    }),
    buildAccount({
      id: DEMO_ACCOUNT_IDS.brokerage,
      name: "Brokerage Account",
      type: "INVESTMENT",
      institution: "Fidelity",
      balance: sumActiveHoldingsValue(holdings, DEMO_ACCOUNT_IDS.brokerage),
      interestRate: null,
      color: "#14b8a6",
      openedDaysAgo: 900,
      now,
    }),
    buildAccount({
      id: DEMO_ACCOUNT_IDS.retirement401k,
      name: "401(k) Retirement",
      type: "RETIREMENT",
      institution: "Fidelity",
      balance: sumActiveHoldingsValue(holdings, DEMO_ACCOUNT_IDS.retirement401k),
      interestRate: null,
      color: "#a855f7",
      openedDaysAgo: 2200,
      now,
    }),
  ]
}
