// The five Account rows the task calls for: Checking, Savings, Credit Card,
// a Brokerage (Investment), and a 401k (Retirement) — realistic institution
// names, current balances centralized in config.ts (see that file's own
// comment on why the Brokerage/Credit-Card figures must stay in sync with
// investments.ts/debt.ts/net-worth.ts).
import { AccountType } from "@prisma/client"
import { prisma } from "./client"
import {
  ACCOUNT_CREATED_AT,
  BROKERAGE_BALANCE,
  CHECKING_BALANCE,
  CREDIT_CARD_BALANCE,
  RETIREMENT_BALANCE,
  SAVINGS_BALANCE,
} from "./config"

export interface ShowcaseAccounts {
  checking: { id: string }
  savings: { id: string }
  creditCard: { id: string }
  brokerage: { id: string }
  retirement401k: { id: string }
}

export async function createAccounts(userId: string): Promise<ShowcaseAccounts> {
  const [checking, savings, creditCard, brokerage, retirement401k] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Chase Total Checking",
        type: AccountType.CHECKING,
        institution: "Chase",
        balance: CHECKING_BALANCE,
        color: "#6366f1",
        createdAt: ACCOUNT_CREATED_AT,
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Marcus High-Yield Savings",
        type: AccountType.SAVINGS,
        institution: "Marcus by Goldman Sachs",
        balance: SAVINGS_BALANCE,
        interestRate: 4.5,
        color: "#0ea5e9",
        createdAt: ACCOUNT_CREATED_AT,
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Capital One Quicksilver",
        type: AccountType.CREDIT_CARD,
        institution: "Capital One",
        balance: CREDIT_CARD_BALANCE,
        interestRate: 24.99,
        color: "#f97316",
        createdAt: ACCOUNT_CREATED_AT,
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Fidelity Brokerage Account",
        type: AccountType.INVESTMENT,
        institution: "Fidelity Investments",
        // Derived-from-holdings once investments.ts's Holdings exist (see
        // Account.balance's own schema comment on this narrow exception) —
        // seeded to match their sum directly since this static script has no
        // live write-back path keeping the two in sync the way
        // features/investments/server/actions.ts does at runtime.
        balance: BROKERAGE_BALANCE,
        color: "#22c55e",
        createdAt: ACCOUNT_CREATED_AT,
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Vanguard 401(k)",
        type: AccountType.RETIREMENT,
        institution: "Vanguard",
        // Manually-entered balance, no Holdings — per investments.md AC1,
        // breaking a Retirement account down into individual holdings is
        // optional (an adoption metric, not a requirement); prisma/seed.ts's
        // own precedent only ever added Holdings to its Investment-type
        // container, never its Retirement one, so this script follows that
        // same precedent for the 401k rather than inventing per-fund
        // holdings data with no seed precedent to model it against.
        balance: RETIREMENT_BALANCE,
        color: "#a855f7",
        createdAt: ACCOUNT_CREATED_AT,
      },
    }),
  ])

  return { checking, savings, creditCard, brokerage, retirement401k }
}
