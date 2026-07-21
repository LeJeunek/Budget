import type { Debt as PrismaDebtRow } from "@prisma/client"

import { db } from "@/lib/db"

import { computeAmortization } from "../payoff-math"
import type { Debt, DebtWithProjection, GetDebtsOptions } from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Debt Tracker section: "List debts |
// Server Component direct call to service.getDebts(userId)", and every other
// read row in that table) and by `server/actions.ts`. It must never be
// imported from a Client Component — every exported function requires a
// pre-resolved `userId` from `getCurrentUser()` (see lib/auth.ts), never a
// client-supplied value, and this module never calls `getCurrentUser()`
// itself, matching `features/accounts/server/service.ts` and
// `features/investments/server/service.ts`'s convention.
//
// Imports `computeAmortization` from `../payoff-math.ts` (the pure,
// isomorphic calculation file at the feature root) rather than re-deriving
// any amortization math here — this keeps the server-rendered debt list and
// the client-recomputed strategy comparison backed by one implementation,
// never two independently-maintained copies that could quietly disagree.

/** A `Debt` row joined with just enough of its optionally-linked `Account`
 * to read that Account's live balance — the one field the "read live, never
 * copied" effective-balance rule (see `types.ts`'s `DebtWithProjection` doc)
 * needs. */
type DebtRowWithLinkedAccountBalance = PrismaDebtRow & {
  account: { balance: PrismaDebtRow["balance"] } | null
}

/**
 * Converts a Prisma `Debt` row (whose `balance`/`interestRate`/
 * `minimumPayment` are decimal.js `Decimal` instances) into the plain-number
 * `Debt` shape defined in `../types.ts`, mirroring
 * `features/accounts/server/service.ts`'s `toAccount()` and
 * `features/investments/server/service.ts`'s `toHolding()` pattern exactly.
 */
function toDebt(row: PrismaDebtRow): Debt {
  return {
    ...row,
    balance: row.balance.toNumber(),
    interestRate: row.interestRate.toNumber(),
    minimumPayment: row.minimumPayment.toNumber(),
  }
}

/**
 * Builds the full `DebtWithProjection` shape for one Debt row: the
 * effective (live, never-copied) balance, and every payoff-math-derived
 * field, computed fresh on every call — never stored, same rule as
 * `GoalWithProgress`/`Holding`'s gain-loss/Bill and Income occurrence status.
 *
 * `effectiveBalance` is `Debt.balance` unless `accountId` is set, in which
 * case it is the linked Account's own live balance (per
 * prisma/schema.prisma's `Debt.accountId` comment and
 * docs/database/er-diagram.md's Phase 3a design note #1: "the effective
 * balance is read live via the join in features/debt/server/service.ts,
 * never copied"). Every other derived field below is computed from this one
 * number, not from `Debt.balance` directly, so a linked Credit Card's
 * projections always reflect its true current balance even though the
 * `Debt` row's own `balance` column is stale/unused in that state.
 */
function toDebtWithProjection(row: DebtRowWithLinkedAccountBalance): DebtWithProjection {
  const debt = toDebt(row)
  const effectiveBalance = row.account ? row.account.balance.toNumber() : debt.balance

  const amortization = computeAmortization({
    id: debt.id,
    balance: effectiveBalance,
    interestRate: debt.interestRate,
    minimumPayment: debt.minimumPayment,
  })

  return {
    ...debt,
    effectiveBalance,
    payoffDate: amortization.payoffDate,
    totalInterestRemaining: amortization.totalInterestRemaining,
    isNegativeAmortization: amortization.isNegativeAmortization,
    isPaidOff: effectiveBalance <= 0,
    isEstimate: debt.type === "CREDIT_CARD",
  }
}

/** Shared `include` shape for every read function below that needs the
 * linked Account's balance — kept as one constant so every read path joins
 * identically rather than each query hand-rolling its own `select`. */
const LINKED_ACCOUNT_BALANCE_INCLUDE = {
  account: { select: { balance: true } },
} as const

/**
 * Lists the caller's debts. Defaults to the active (non-archived) list —
 * debt-tracker.md AC2. Pass `{ includeArchived: true }` to instead fetch
 * only archived debts for the dedicated archived view (AC10), the same
 * non-union toggle semantics as `features/accounts`/`features/investments`'s
 * equivalent options.
 *
 * Ordered by `createdAt` ascending, matching `getAccounts`'s default
 * ordering convention.
 */
export async function getDebts(
  userId: string,
  options: GetDebtsOptions = {},
): Promise<DebtWithProjection[]> {
  const { includeArchived = false } = options

  const rows = await db.debt.findMany({
    where: {
      userId,
      archivedAt: includeArchived ? { not: null } : null,
    },
    include: LINKED_ACCOUNT_BALANCE_INCLUDE,
    orderBy: { createdAt: "asc" },
  })

  return rows.map(toDebtWithProjection)
}

/**
 * Fetches a single debt by id, scoped to the calling user. Returns `null`
 * for a missing id *or* an id owned by a different user — callers must not
 * be able to distinguish "doesn't exist" from "belongs to someone else",
 * matching `getAccountById`/`getHoldingById`'s convention.
 */
export async function getDebtById(
  userId: string,
  id: string,
): Promise<DebtWithProjection | null> {
  const row = await db.debt.findFirst({
    where: { id, userId },
    include: LINKED_ACCOUNT_BALANCE_INCLUDE,
  })

  return row ? toDebtWithProjection(row) : null
}

/**
 * The Net Worth liability term Dashboard subtracts (see
 * docs/architecture/api-contracts.md's "Net Worth Aggregation Update"
 * section and docs/database/er-diagram.md's Phase 3a design note #3, whose
 * exact query shape this function implements verbatim):
 *
 * ```
 * SELECT COALESCE(SUM(balance), 0) FROM debt
 * WHERE "userId" = $1 AND "archivedAt" IS NULL AND "accountId" IS NULL
 *   AND balance > 0
 * ```
 *
 * The `accountId IS NULL` predicate is the entire double-counting fix: every
 * Personal Loan/Auto Loan/Student Loan/Mortgage Debt has `accountId: null`
 * by construction (no Account counterpart exists to link to), and any
 * Credit Card Debt a user chose to link is correctly excluded here because
 * its balance is already reflected once via the ordinary Account-balance sum
 * Dashboard's `getNetWorth` already computes — subtracting it a second time
 * here would double-count that one real-world liability. `balance > 0`
 * excludes Paid Off debts (a linked debt's Paid Off state depends on the
 * *effective* balance, but since this function only ever sums *unlinked*
 * debts by definition, `Debt.balance` and "effective balance" are the same
 * number here, so this raw-column filter is exactly equivalent to filtering
 * on the computed `isPaidOff`, without needing a join to do it).
 *
 * Dashboard never needs to know about linkage internals — it just calls this
 * one function and subtracts the result, per api-contracts.md's explicit
 * framing ("keeps the exclusion logic owned entirely by the one module that
 * actually knows which debts are linked").
 */
export async function getTotalActiveDebtBalanceForNetWorth(userId: string): Promise<number> {
  const result = await db.debt.aggregate({
    where: {
      userId,
      archivedAt: null,
      accountId: null,
      balance: { gt: 0 },
    },
    _sum: { balance: true },
  })

  return result._sum.balance?.toNumber() ?? 0
}

export { toDebt, toDebtWithProjection }
