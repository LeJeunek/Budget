import { describe, expect, it, vi } from "vitest"
import type { AccountType, Prisma } from "@prisma/client"

import {
  isBalanceAdjustableAccountType,
  computeBalanceDeltaForAmount,
  computeAggregateBalanceDelta,
  applyBalanceDelta,
  adjustBalanceForTransactionAmount,
  reverseBalanceForTransactionAmount,
  applyAggregateBalanceDelta,
} from "./balance-adjustment"

/**
 * Unit tests for Account Balance Auto-Adjustment's shared sign-convention
 * and DB-write module (docs/product/accounts-balance-auto-adjustment.md).
 * No live database is used, per this codebase's standing "no integration-
 * test database" convention (see `categorization.test.ts`'s own note) — the
 * DB-writing functions below are exercised against a minimal fake
 * `Prisma.TransactionClient` whose `account.update` is a `vi.fn()` spy, which
 * is sufficient to prove (a) the guard never issues a write for an
 * out-of-scope account type, and (b) every write uses Prisma's atomic
 * `{ increment }` operator rather than a client-computed absolute value.
 */

/** A minimal fake `tx` — just enough surface for this module's functions —
 * with an in-memory `balance` so multi-call tests (edit's reverse+apply,
 * the concurrency test) can assert the FINAL stored value, not just the
 * individual call arguments. */
function createFakeTx(initialBalance: number) {
  // Tracked in integer cents, not a raw JS float, to faithfully emulate
  // Postgres's fixed-point `Decimal(14, 2)` column (prisma/schema.prisma) —
  // a real `UPDATE ... SET balance = balance + $1` against a `Decimal`
  // column never accumulates binary floating-point drift the way naive
  // repeated `balance += float` JS arithmetic would. Modeling this
  // correctly here matters for this file's per-row-vs-aggregate equality
  // tests, which must hold exactly (to the cent), not merely approximately.
  let balanceCents = Math.round(initialBalance * 100)
  const update = vi.fn(
    async (args: { where: { id: string; userId: string }; data: { balance: { increment: number } } }) => {
      // Mirrors exactly what Postgres does for `UPDATE ... SET balance =
      // balance + $1`: read-and-add as a single atomic step with no
      // opportunity for another caller's own read-and-add to interleave
      // mid-operation. This is the behavior this module's use of Prisma's
      // `{ increment }` (never a plain `{ balance: newValue }`) is what
      // makes real under an actual Postgres row-level lock — this fake
      // only needs to model that same atomicity to prove the CALL SHAPE is
      // the safe one.
      balanceCents += Math.round(args.data.balance.increment * 100)
      return { id: args.where.id, balance: balanceCents / 100 }
    },
  )

  const tx = {
    account: { update },
  } as unknown as Prisma.TransactionClient

  return { tx, update, getBalance: () => balanceCents / 100 }
}

describe("isBalanceAdjustableAccountType", () => {
  it("is true for every in-scope asset/liability account type", () => {
    expect(isBalanceAdjustableAccountType("CHECKING")).toBe(true)
    expect(isBalanceAdjustableAccountType("SAVINGS")).toBe(true)
    expect(isBalanceAdjustableAccountType("CASH")).toBe(true)
    expect(isBalanceAdjustableAccountType("CREDIT_CARD")).toBe(true)
  })

  it("is false for every out-of-scope Investments-owned account type (Criterion 6)", () => {
    expect(isBalanceAdjustableAccountType("INVESTMENT")).toBe(false)
    expect(isBalanceAdjustableAccountType("RETIREMENT")).toBe(false)
    expect(isBalanceAdjustableAccountType("CRYPTO")).toBe(false)
  })
})

describe("computeBalanceDeltaForAmount — sign convention", () => {
  it("Checking: a $1,000 paycheck (amount=+1000) increases balance by $1,000", () => {
    expect(computeBalanceDeltaForAmount("CHECKING", 1000)).toBe(1000)
  })

  it("Checking: a $60 grocery purchase (amount=-60) decreases balance by $60", () => {
    expect(computeBalanceDeltaForAmount("CHECKING", -60)).toBe(-60)
  })

  it("Savings and Cash follow the identical unchanged-sign rule as Checking", () => {
    expect(computeBalanceDeltaForAmount("SAVINGS", 500)).toBe(500)
    expect(computeBalanceDeltaForAmount("CASH", -25)).toBe(-25)
  })

  // The single highest-risk case per the spec: Credit Card must be its own
  // explicit branch, inverted, tested in BOTH directions.
  it("Credit Card: a $50 purchase (amount=-50) INCREASES the balance (debt owed) by $50", () => {
    expect(computeBalanceDeltaForAmount("CREDIT_CARD", -50)).toBe(50)
  })

  it("Credit Card: a $200 payment (amount=+200) DECREASES the balance (debt owed) by $200", () => {
    expect(computeBalanceDeltaForAmount("CREDIT_CARD", 200)).toBe(-200)
  })

  it("Investment/Retirement/Crypto defensively compute a zero delta (real guard is isBalanceAdjustableAccountType)", () => {
    expect(computeBalanceDeltaForAmount("INVESTMENT", 1000)).toBe(0)
    expect(computeBalanceDeltaForAmount("RETIREMENT", 1000)).toBe(0)
    expect(computeBalanceDeltaForAmount("CRYPTO", 1000)).toBe(0)
  })

  it("handles cent-precision amounts without floating-point drift", () => {
    expect(computeBalanceDeltaForAmount("CHECKING", 19.99)).toBeCloseTo(19.99, 10)
    expect(computeBalanceDeltaForAmount("CREDIT_CARD", -19.99)).toBeCloseTo(19.99, 10)
  })
})

describe("computeAggregateBalanceDelta", () => {
  it("equals the sum of each individual amount's own effect (Criterion 5's required equality) — asset account", () => {
    const amounts = [1000, -60, -12.5, 200]
    const aggregate = computeAggregateBalanceDelta("CHECKING", amounts)
    const summed = amounts.reduce((sum, a) => sum + computeBalanceDeltaForAmount("CHECKING", a), 0)
    expect(aggregate).toBeCloseTo(summed, 10)
    expect(aggregate).toBe(1127.5)
  })

  it("equals the sum of each individual amount's own effect — Credit Card (inverted) account", () => {
    const amounts = [-50, 200, -19.99]
    const aggregate = computeAggregateBalanceDelta("CREDIT_CARD", amounts)
    const summed = amounts.reduce((sum, a) => sum + computeBalanceDeltaForAmount("CREDIT_CARD", a), 0)
    expect(aggregate).toBeCloseTo(summed, 10)
    // -(-50) + -(200) + -(-19.99) = 50 - 200 + 19.99 = -130.01
    expect(aggregate).toBeCloseTo(-130.01, 10)
  })

  it("is exactly zero for out-of-scope account types regardless of amounts (defensive; real gate is applyBalanceDelta)", () => {
    expect(computeAggregateBalanceDelta("INVESTMENT", [1000, -500, 250])).toBe(0)
  })

  it("returns 0 for an empty batch", () => {
    expect(computeAggregateBalanceDelta("CHECKING", [])).toBe(0)
  })

  // Split-parent-reversal exact-equality property (Criterion 4 / Definition
  // of Done): splits are validated elsewhere to sum EXACTLY to the parent's
  // original amount — this proves that "reverse the parent + apply the
  // aggregate of all children" is mathematically guaranteed to net to zero
  // change on the account, for both an asset account and a Credit Card.
  it("split parent reversal + all children applied nets to EXACTLY the parent's original effect never having changed (asset account)", () => {
    const parentAmount = 100
    const splitAmounts = [30, 45.5, 24.5] // sums exactly to 100
    expect(splitAmounts.reduce((s, a) => s + a, 0)).toBe(parentAmount)

    const reversalOfParent = -computeBalanceDeltaForAmount("CHECKING", parentAmount)
    const childrenApplied = computeAggregateBalanceDelta("CHECKING", splitAmounts)

    expect(reversalOfParent + childrenApplied).toBe(0)
  })

  it("split parent reversal + all children applied nets to EXACTLY the parent's original effect never having changed (Credit Card account)", () => {
    const parentAmount = -75.25 // a $75.25 charge
    const splitAmounts = [-20, -30.25, -25] // sums exactly to -75.25
    expect(
      Math.round(splitAmounts.reduce((s, a) => s + a, 0) * 100),
    ).toBe(Math.round(parentAmount * 100))

    const reversalOfParent = -computeBalanceDeltaForAmount("CREDIT_CARD", parentAmount)
    const childrenApplied = computeAggregateBalanceDelta("CREDIT_CARD", splitAmounts)

    expect(reversalOfParent + childrenApplied).toBe(0)
  })

  it("holds the same net-zero property across many randomly-partitioned splits (property-style check)", () => {
    const accountTypes: AccountType[] = ["CHECKING", "CREDIT_CARD"]
    for (const accountType of accountTypes) {
      for (let trial = 0; trial < 25; trial++) {
        const parentCents = Math.floor(Math.random() * 2_000_00) - 1_000_00 // -$1000..$1000
        const partsCount = 2 + Math.floor(Math.random() * 4) // 2-5 splits
        const cuts = Array.from({ length: partsCount - 1 }, () =>
          Math.floor(Math.random() * parentCents),
        ).sort((a, b) => a - b)
        const boundaries = [0, ...cuts, parentCents]
        const splitCentsList = boundaries
          .slice(1)
          .map((boundary, i) => boundary - boundaries[i])
        expect(splitCentsList.reduce((s, c) => s + c, 0)).toBe(parentCents)

        const parentAmount = parentCents / 100
        const splitAmounts = splitCentsList.map((c) => c / 100)

        const reversalOfParent = -computeBalanceDeltaForAmount(accountType, parentAmount)
        const childrenApplied = computeAggregateBalanceDelta(accountType, splitAmounts)

        expect(reversalOfParent + childrenApplied).toBe(0)
      }
    }
  })
})

describe("applyBalanceDelta — the guard (Criterion 6 regression test)", () => {
  it("never calls tx.account.update for an Investment account", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "INVESTMENT", 500)
    expect(update).not.toHaveBeenCalled()
  })

  it("never calls tx.account.update for a Retirement account", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "RETIREMENT", 500)
    expect(update).not.toHaveBeenCalled()
  })

  it("never calls tx.account.update for a Crypto account", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "CRYPTO", 500)
    expect(update).not.toHaveBeenCalled()
  })

  it("does call tx.account.update for an in-scope Checking account with a nonzero delta", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "CHECKING", 500)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("skips the write entirely for a zero delta (harmless no-op, not a defect)", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "CHECKING", 0)
    expect(update).not.toHaveBeenCalled()
  })

  it("always writes via Prisma's atomic `{ increment }`, never a plain absolute value (the atomicity contract)", async () => {
    const { tx, update } = createFakeTx(0)
    await applyBalanceDelta(tx, "user-1", "acct-1", "CHECKING", 42.5)
    const callArgs = update.mock.calls[0][0]
    expect(callArgs.data.balance).toEqual({ increment: 42.5 })
    expect(callArgs.where).toEqual({ id: "acct-1", userId: "user-1" })
  })
})

describe("adjustBalanceForTransactionAmount / reverseBalanceForTransactionAmount", () => {
  it("create: applying a $1,000 paycheck to Checking increases balance by exactly $1,000", async () => {
    const { tx, getBalance } = createFakeTx(500)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 1000)
    expect(getBalance()).toBe(1500)
  })

  it("create: applying a $50 purchase to a Credit Card increases its (debt) balance by exactly $50", async () => {
    const { tx, getBalance } = createFakeTx(200)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CREDIT_CARD", -50)
    expect(getBalance()).toBe(250)
  })

  it("create: applying a $200 payment to a Credit Card decreases its (debt) balance by exactly $200", async () => {
    const { tx, getBalance } = createFakeTx(250)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CREDIT_CARD", 200)
    expect(getBalance()).toBe(50)
  })

  it("reversal exactly undoes the original effect it reverses, for an asset account", async () => {
    const { tx, getBalance } = createFakeTx(1000)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 250)
    expect(getBalance()).toBe(1250)
    await reverseBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 250)
    expect(getBalance()).toBe(1000)
  })

  it("reversal exactly undoes the original effect it reverses, for a Credit Card account", async () => {
    const { tx, getBalance } = createFakeTx(300)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CREDIT_CARD", -75)
    expect(getBalance()).toBe(375)
    await reverseBalanceForTransactionAmount(tx, "user-1", "acct-1", "CREDIT_CARD", -75)
    expect(getBalance()).toBe(300)
  })

  // Edit Criterion 2's three sub-cases, exercised end to end against the
  // fake tx (reverse-old then apply-new, exactly as server/actions.ts's
  // updateTransaction does inside its own $transaction).
  it("edit: amount-only change nets to the difference, same account/type", async () => {
    const { tx, getBalance } = createFakeTx(1000)
    // Original create effect: +250 on Checking.
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 250)
    expect(getBalance()).toBe(1250)
    // Edit: amount changes from 250 -> 400, account unchanged.
    await reverseBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 250)
    await adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 400)
    expect(getBalance()).toBe(1400) // 1000 + 400
  })

  it("edit: account-only change reverses on the OLD account's sign rule and applies on the NEW account's own sign rule", async () => {
    const checking = createFakeTx(1000)
    const creditCard = createFakeTx(300)
    const amount = -50 // a $50 charge, same amount, moved from Checking to a Credit Card

    // Original create effect on Checking: -50 (a purchase).
    await adjustBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", amount)
    expect(checking.getBalance()).toBe(950)

    // Edit: reassign to the Credit Card, amount unchanged. Reverse on
    // Checking (undo the -50), apply on the Credit Card using ITS OWN sign
    // rule (a -50 charge increases Credit Card balance by +50) — never
    // carrying over Checking's arithmetic.
    await reverseBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", amount)
    await adjustBalanceForTransactionAmount(creditCard.tx, "user-1", "cc-1", "CREDIT_CARD", amount)

    expect(checking.getBalance()).toBe(1000) // fully reverted
    expect(creditCard.getBalance()).toBe(350) // 300 + 50
  })

  it("edit: both amount AND account change in the same edit — old account/old amount reversed, new account/new amount applied", async () => {
    const checking = createFakeTx(1000)
    const creditCard = createFakeTx(300)

    // Original: a $50 Checking purchase (amount=-50).
    await adjustBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", -50)
    expect(checking.getBalance()).toBe(950)

    // Edit: reassign to Credit Card AND change amount to -80 (an $80 charge).
    await reverseBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", -50)
    await adjustBalanceForTransactionAmount(creditCard.tx, "user-1", "cc-1", "CREDIT_CARD", -80)

    expect(checking.getBalance()).toBe(1000) // fully reverted
    expect(creditCard.getBalance()).toBe(380) // 300 + 80 (Credit Card inversion)
  })

  it("edge case: reassigning FROM an in-scope account TO an out-of-scope (Investment) account only adjusts the in-scope side", async () => {
    const checking = createFakeTx(1000)
    const investment = createFakeTx(5000)

    await adjustBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", 100)
    expect(checking.getBalance()).toBe(1100)

    // Edit: reassign to an Investment account. The in-scope (Checking) side
    // still gets reversed; the out-of-scope (Investment) side must not be
    // touched at all (Criterion 6 / this edge case explicitly called out in
    // the spec).
    await reverseBalanceForTransactionAmount(checking.tx, "user-1", "checking-1", "CHECKING", 100)
    await adjustBalanceForTransactionAmount(investment.tx, "user-1", "inv-1", "INVESTMENT", 100)

    expect(checking.getBalance()).toBe(1000)
    expect(investment.getBalance()).toBe(5000) // untouched
    expect(investment.update).not.toHaveBeenCalled()
  })
})

describe("applyAggregateBalanceDelta — CSV import's aggregate-vs-per-row equality (Criterion 5)", () => {
  it("produces the identical final balance as applying each row individually, for a mix of valid rows only", async () => {
    const perRow = createFakeTx(1000)
    const aggregate = createFakeTx(1000)

    // Simulates a CSV batch: a paycheck, a purchase, a refund. Rows that
    // failed validation or were duplicates are never included here at all
    // (server/import.ts only pushes genuinely-valid, non-duplicate rows
    // into `toInsert`), consistent with "rows skipped ... have no balance
    // effect."
    const validRowAmounts = [1000, -42.13, 15.5, -300]

    for (const amount of validRowAmounts) {
      await adjustBalanceForTransactionAmount(perRow.tx, "user-1", "acct-1", "CHECKING", amount)
    }

    await applyAggregateBalanceDelta(aggregate.tx, "user-1", "acct-1", "CHECKING", validRowAmounts)

    expect(aggregate.getBalance()).toBe(perRow.getBalance())
    expect(aggregate.update).toHaveBeenCalledTimes(1) // one write for the whole batch
    expect(perRow.update).toHaveBeenCalledTimes(validRowAmounts.length) // one per row
  })

  it("produces the identical final balance as applying each row individually, for a Credit Card account", async () => {
    const perRow = createFakeTx(0)
    const aggregate = createFakeTx(0)
    const validRowAmounts = [-50, 200, -19.99, -5.01]

    for (const amount of validRowAmounts) {
      await adjustBalanceForTransactionAmount(perRow.tx, "user-1", "acct-1", "CREDIT_CARD", amount)
    }
    await applyAggregateBalanceDelta(aggregate.tx, "user-1", "acct-1", "CREDIT_CARD", validRowAmounts)

    expect(aggregate.getBalance()).toBe(perRow.getBalance())
  })

  it("an empty (all rows invalid/duplicate) batch produces zero balance effect and no write", async () => {
    const { tx, update, getBalance } = createFakeTx(500)
    await applyAggregateBalanceDelta(tx, "user-1", "acct-1", "CHECKING", [])
    expect(getBalance()).toBe(500)
    expect(update).not.toHaveBeenCalled()
  })

  it("never writes for an Investment/Retirement/Crypto account regardless of batch contents", async () => {
    const { tx, update, getBalance } = createFakeTx(5000)
    await applyAggregateBalanceDelta(tx, "user-1", "acct-1", "INVESTMENT", [1000, -500, 250])
    expect(getBalance()).toBe(5000)
    expect(update).not.toHaveBeenCalled()
  })
})

describe("Concurrency — two near-simultaneous adjustments against the same account both land correctly", () => {
  it("two near-simultaneous transactions (e.g. a paycheck and a purchase) both land, neither clobbers the other", async () => {
    const { tx, getBalance } = createFakeTx(1000)

    // Two "near-simultaneous" transactions against the SAME account, issued
    // via Promise.all to model concurrent callers racing to adjust the same
    // row. Because every call here is `{ increment }`-based (never a
    // client-computed absolute value derived from a stale read), both
    // effects land regardless of interleaving — unlike a naive "read
    // current balance, compute new value, write it back" pattern, which
    // would let the second writer's read (taken before the first writer's
    // write commits) silently clobber the first writer's effect.
    await Promise.all([
      adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", 1000), // paycheck
      adjustBalanceForTransactionAmount(tx, "user-1", "acct-1", "CHECKING", -60), // purchase
    ])

    expect(getBalance()).toBe(1940) // 1000 + 1000 - 60, both effects present
  })

  it("same-account concurrent create + delete-reversal both land: final balance reflects both effects, order-independent", async () => {
    // Two DIFFERENT orderings of the exact same pair of operations must
    // produce the exact same final balance — this is what "atomic
    // increment against the current stored value, not a stale client-held
    // read" guarantees, and what a naive read-modify-write would NOT
    // guarantee if the two operations happened to interleave.
    const orderA = createFakeTx(1000)
    await Promise.all([
      adjustBalanceForTransactionAmount(orderA.tx, "user-1", "acct-1", "CHECKING", 500), // +500
      adjustBalanceForTransactionAmount(orderA.tx, "user-1", "acct-1", "CHECKING", -200), // -200
    ])

    const orderB = createFakeTx(1000)
    await Promise.all([
      adjustBalanceForTransactionAmount(orderB.tx, "user-1", "acct-1", "CHECKING", -200), // -200
      adjustBalanceForTransactionAmount(orderB.tx, "user-1", "acct-1", "CHECKING", 500), // +500
    ])

    expect(orderA.getBalance()).toBe(1300)
    expect(orderB.getBalance()).toBe(1300)
    expect(orderA.getBalance()).toBe(orderB.getBalance())
  })
})
