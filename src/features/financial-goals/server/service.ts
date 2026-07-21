import type {
  AccountType,
  FinancialGoal as PrismaFinancialGoalRow,
  Prisma,
} from "@prisma/client"

import { db } from "@/lib/db"
import { getAccounts } from "@/features/accounts/server/service"
import { getDebtById } from "@/features/debt/server/service"
import { getMonthlySummary, getNetWorth } from "@/features/dashboard/server/service"
import { getNetWorthHistory, resolveDefaultRange } from "@/features/dashboard/server/net-worth-history"

import {
  computeDebtPayoffPercent,
  computeNetWorthTargetProgress,
  computeRollingSavingsRateAverage,
  isDebtPayoffComplete,
  isSavingsRateTargetComplete,
  sumAccountSubsetBalances,
} from "./progress-math"
import type {
  FinancialGoal,
  FinancialGoalTrendPoint,
  FinancialGoalWithProgress,
  GetFinancialGoalsOptions,
} from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Financial Goals section: "List goals
// | Server Component direct call to service.getFinancialGoals(userId, ...)")
// and by server/actions.ts. It must never be imported from a Client
// Component — every exported function requires a pre-resolved `userId` from
// `getCurrentUser()` (see lib/auth.ts), never a client-supplied value, and
// this module never calls `getCurrentUser()` itself, matching every other
// `features/<domain>/server/service.ts` in this codebase.
//
// Per Architecture.md's "FinancialGoal schema-adjacent module design"
// handoff, this file is a pure downstream *consumer* of three other
// domains' existing service functions and introduces zero new cross-domain
// functions of its own:
//   -> features/debt/server/service.ts's getDebtById (DEBT_PAYOFF)
//   -> features/dashboard/server/service.ts's getNetWorth/getMonthlySummary
//      (NET_WORTH_SAVINGS_TARGET's TOTAL_NET_WORTH basis; SAVINGS_RATE_TARGET)
//   -> features/dashboard/server/net-worth-history.ts's getNetWorthHistory/
//      resolveDefaultRange (NET_WORTH_SAVINGS_TARGET's optional trend line)
//   -> features/accounts/server/service.ts's getAccounts
//      (NET_WORTH_SAVINGS_TARGET's ACCOUNT_SUBSET basis)
// This is a "leaf" module in the dependency graph — no other domain ever
// imports from `features/financial-goals`, so no cycle risk exists.

/** The rolling window Type 3 (Savings Rate Target) evaluates, per
 * financial-goals.md's "rolling 3-month average" design. */
const ROLLING_SAVINGS_RATE_WINDOW_MONTHS = 3

// ---------------------------------------------------------------------------
// Prisma row -> client-safe shape converter
// ---------------------------------------------------------------------------

/**
 * Converts a Prisma `FinancialGoal` row (`startingBalance`/`targetAmount`/
 * `targetPercent` are decimal.js `Decimal` instances, nullable per the
 * schema's flat-table-with-nullable-columns design) into the plain-number
 * `FinancialGoal` shape defined in `../types.ts` — mirrors
 * `features/debt/server/service.ts`'s `toDebt()` pattern exactly.
 */
export function toFinancialGoal(row: PrismaFinancialGoalRow): FinancialGoal {
  return {
    ...row,
    startingBalance:
      row.startingBalance === null ? null : row.startingBalance.toNumber(),
    targetAmount: row.targetAmount === null ? null : row.targetAmount.toNumber(),
    targetPercent:
      row.targetPercent === null ? null : row.targetPercent.toNumber(),
  }
}

// ---------------------------------------------------------------------------
// Debt Payoff exclusivity guard (financial-goals.md: "at most one active
// Debt Payoff Financial Goal per Debt at a time")
// ---------------------------------------------------------------------------

/**
 * Thrown by `assertDebtNotAlreadyLinkedToActiveGoal` when `linkedDebtId`
 * already backs a different, non-archived `DEBT_PAYOFF` goal. `server/
 * actions.ts`'s `createFinancialGoal` catches this specifically and surfaces
 * `error.message` as an `ApiResult` failure — never a raw Prisma/thrown
 * error — matching `lib/transaction-link-guard.ts`'s
 * `TransactionAlreadyLinkedError` precedent for the same "friendly error,
 * not a raw internal one" requirement.
 */
export class DebtAlreadyLinkedError extends Error {
  constructor(existingGoalName: string) {
    super(
      `This debt is already being tracked by an active goal: "${existingGoalName}". Archive that goal first if you want to start a new one for this debt.`,
    )
    this.name = "DebtAlreadyLinkedError"
  }
}

/**
 * Enforces "at most one active Debt Payoff Financial Goal per Debt at a
 * time" (financial-goals.md's Type 1 exclusivity rule, Edge Cases:
 * "rejected with a clear message pointing at the existing goal").
 *
 * Per Architecture.md's Phase 3b "FinancialGoal schema-adjacent module
 * design" section and docs/database/er-diagram.md's Phase 3b design notes:
 * this is an **application-level guard, not a database constraint** (unlike
 * `Debt.accountId`'s plain `@unique`, this must tolerate re-creating a goal
 * for a Debt whose *previous* goal was archived, so a plain unique index
 * would incorrectly block that allowed case). The check-then-create race
 * window is closed by requiring callers to run this inside the same Prisma
 * `$transaction` as the actual `create` — mirroring
 * `lib/transaction-link-guard.ts`'s `assertTransactionNotAlreadyLinked` call
 * shape exactly, though this guard needs no shared `lib/`-level file of its
 * own: the check is entirely self-contained to `FinancialGoal`'s own table,
 * so a private-to-this-feature helper (exported only for `server/
 * actions.ts` to call inside its transaction) is sufficient — no other
 * domain ever needs to perform or share this check.
 *
 * Scoped by `userId` in addition to `linkedDebtId` — defense in depth
 * matching this codebase's "every query scoped by the caller's id" rule,
 * even though a Debt id alone already implies ownership transitively (the
 * caller must have already resolved it via `debt.service.getDebtById(userId,
 * ...)` before reaching this guard).
 */
export async function assertDebtNotAlreadyLinkedToActiveGoal(
  tx: Prisma.TransactionClient,
  userId: string,
  linkedDebtId: string,
): Promise<void> {
  const existingActiveGoal = await tx.financialGoal.findFirst({
    where: { userId, linkedDebtId, archivedAt: null },
    select: { name: true },
  })

  if (existingActiveGoal) {
    throw new DebtAlreadyLinkedError(existingActiveGoal.name)
  }
}

// ---------------------------------------------------------------------------
// Read-time progress computation — shared context, then per-goal math
// ---------------------------------------------------------------------------

/** The subset of an Account row `sumAccountSubsetBalances` needs. */
interface AccountBalanceInfo {
  type: AccountType
  balance: number
}

/**
 * Every piece of live source data `computeProgressForGoal` might need for
 * *some* goal in the list being computed — gathered once per
 * `getFinancialGoals`/`getFinancialGoalById` call (not once per goal), so a
 * user with multiple goals of the same type never triggers redundant
 * identical reads of Net Worth, the Account list, or the rolling Savings
 * Rate average. Each field is only populated when at least one goal in the
 * current read actually needs it (`buildProgressContext`'s own gating), per
 * docs/database/performance-considerations.md's Phase 3b note that this
 * feature's read cost is "bounded by however many of these downstream calls
 * a user's mix of goal types triggers."
 */
interface ProgressContext {
  /** `Debt.id` -> its live `DebtWithProjection`, or `null` if the Debt could
   * not be found (see `computeProgressForGoal`'s DEBT_PAYOFF branch for why
   * this is handled defensively rather than assumed impossible). */
  debtById: Map<string, Awaited<ReturnType<typeof getDebtById>>>
  /** `dashboard.service.getNetWorth(userId).total`, fetched once, only when
   * at least one `NET_WORTH_SAVINGS_TARGET` goal uses the `TOTAL_NET_WORTH`
   * basis. */
  totalNetWorth: number | null
  /** The `TOTAL_NET_WORTH` mini trend line (financial-goals.md's Type 2:
   * "may optionally show a mini trend line"), fetched once and shared by
   * every `TOTAL_NET_WORTH` goal in this read — never fetched at all for a
   * user with no such goal. */
  netWorthTrend: FinancialGoalTrendPoint[] | null
  /** `Account.id` -> its type/balance, fetched once (via
   * `accounts.service.getAccounts`, non-archived only), only when at least
   * one goal uses the `ACCOUNT_SUBSET` basis. */
  accountsById: Map<string, AccountBalanceInfo>
  /** The trailing-3-month rolling Savings Rate average, already converted to
   * the 0-100 percentage scale (see `computeCurrentRollingSavingsRatePercent`
   * below), fetched once and shared by every `SAVINGS_RATE_TARGET` goal in
   * this read — the underlying figure is identical across all of a user's
   * goals of this type regardless of each goal's own `targetPercent`. */
  rollingSavingsRatePercent: number | null
}

/** UTC midnight for the first of the given year/month — matches
 * `dashboard/server/service.ts`'s `utcMonthStart` exactly, duplicated here
 * per folder-tree.md's module-boundary rule (features/<domain>/server
 * modules don't reach into another domain's private helpers, only its
 * exported service functions). */
function utcMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1))
}

/**
 * Resolves the trailing `ROLLING_SAVINGS_RATE_WINDOW_MONTHS` calendar months
 * (including the current, in-progress month) to evaluate the Savings Rate
 * Target's rolling average over — dropping any month before the user's own
 * signup month, the identical technique
 * `dashboard/server/service.ts`'s `getMonthlyTrends` already uses for the
 * same "don't fabricate months before the user existed" reasoning
 * (duplicated here for the same module-boundary reason as `utcMonthStart`
 * above).
 *
 * A result shorter than `ROLLING_SAVINGS_RATE_WINDOW_MONTHS` means the
 * user's account itself isn't old enough yet to have 3 qualifying months —
 * financial-goals.md's "a goal created by a user with fewer than 3
 * qualifying months shows an explicit 'not enough data yet' state" edge
 * case. `computeCurrentRollingSavingsRatePercent` below checks this length
 * *before* calling `getMonthlySummary` at all, so a brand-new user never
 * pays for three aggregation queries only to discard the result.
 */
function resolveRollingSavingsRateWindowMonths(
  userCreatedAt: Date,
  now: Date,
): Date[] {
  const currentMonthStart = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth())
  const userSignupMonthStart = utcMonthStart(
    userCreatedAt.getUTCFullYear(),
    userCreatedAt.getUTCMonth(),
  )

  const months: Date[] = []
  for (let offset = ROLLING_SAVINGS_RATE_WINDOW_MONTHS - 1; offset >= 0; offset--) {
    const monthStart = new Date(
      Date.UTC(
        currentMonthStart.getUTCFullYear(),
        currentMonthStart.getUTCMonth() - offset,
        1,
      ),
    )
    if (monthStart < userSignupMonthStart) {
      continue
    }
    months.push(monthStart)
  }

  return months
}

/**
 * Computes the current trailing-3-month rolling Savings Rate average for
 * `userId`, on the same 0-100 percentage scale as `FinancialGoal.targetPercent`
 * (see `progress-math.ts`'s `computeRollingSavingsRateAverage`, which this
 * wraps, for the underlying fraction-scale math). Shared by every
 * `SAVINGS_RATE_TARGET` goal in a single `getFinancialGoals`/
 * `getFinancialGoalById` read via `ProgressContext`, so it is only ever
 * computed once per read regardless of how many such goals the user has.
 *
 * Returns `null` ("not enough data yet") in two cases, per
 * financial-goals.md's Type 3 section:
 *   1. The user's account isn't `ROLLING_SAVINGS_RATE_WINDOW_MONTHS`
 *      calendar months old yet (`resolveRollingSavingsRateWindowMonths`
 *      returns fewer than 3 months) — never even calls `getMonthlySummary`
 *      in this case.
 *   2. Every month in the resolved window had $0 income (excluded by
 *      `getMonthlySummary`'s own `computeSavingsRate` returning `null` for
 *      that month), so `computeRollingSavingsRateAverage` has nothing left
 *      to average.
 */
async function computeCurrentRollingSavingsRatePercent(
  userId: string,
  now: Date,
): Promise<number | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })
  // Defensive only: callers resolve `userId` from an authenticated session,
  // so a missing user here would mean the session outlived the user record
  // — matches `dashboard/server/service.ts`'s `getMonthlyTrends` handling of
  // the same impossible-in-practice case.
  if (!user) {
    return null
  }

  const windowMonths = resolveRollingSavingsRateWindowMonths(user.createdAt, now)
  if (windowMonths.length < ROLLING_SAVINGS_RATE_WINDOW_MONTHS) {
    return null
  }

  const summaries = await Promise.all(
    windowMonths.map((month) => getMonthlySummary(userId, month)),
  )
  const monthlyRates = summaries.map((summary) => summary.savingsRate)
  const averageFraction = computeRollingSavingsRateAverage(monthlyRates)

  return averageFraction === null ? null : averageFraction * 100
}

/** Builds the `TOTAL_NET_WORTH` mini trend line (financial-goals.md's Type
 * 2), reusing the exact same default-range resolution the Dashboard's own
 * Net Worth History chart uses (`resolveDefaultRange`) rather than
 * hardcoding a range — a goal's mini trend line should show the same
 * "sensible amount of history" the chart itself would default to for this
 * user. */
async function buildTotalNetWorthTrend(
  userId: string,
): Promise<FinancialGoalTrendPoint[]> {
  const { defaultRange } = await resolveDefaultRange(userId)
  const history = await getNetWorthHistory(userId, defaultRange)

  return history.points.map((point) => ({
    date: point.date,
    value: point.netWorth,
  }))
}

/** Narrowest shape `buildProgressContext`/`computeProgressForGoal` need per
 * goal row — just enough to decide *which* shared reads are required and to
 * compute that row's own progress, without depending on the full Prisma
 * `include` shape being identical across every caller. */
interface GoalTypeAndBasis {
  type: FinancialGoal["type"]
  linkedDebtId: string | null
  measurementBasis: FinancialGoal["measurementBasis"]
}

/**
 * Gathers every live source read `computeProgressForGoal` might need across
 * `rows`, in parallel, exactly once per distinct requirement — see
 * `ProgressContext`'s own JSDoc for the "why once, not once per goal"
 * reasoning.
 */
async function buildProgressContext(
  userId: string,
  rows: GoalTypeAndBasis[],
  now: Date,
): Promise<ProgressContext> {
  const debtIds = Array.from(
    new Set(
      rows
        .filter((row) => row.type === "DEBT_PAYOFF" && row.linkedDebtId !== null)
        .map((row) => row.linkedDebtId as string),
    ),
  )
  const needsTotalNetWorth = rows.some(
    (row) =>
      row.type === "NET_WORTH_SAVINGS_TARGET" &&
      row.measurementBasis === "TOTAL_NET_WORTH",
  )
  const needsAccountSubset = rows.some(
    (row) =>
      row.type === "NET_WORTH_SAVINGS_TARGET" &&
      row.measurementBasis === "ACCOUNT_SUBSET",
  )
  const needsRollingSavingsRate = rows.some(
    (row) => row.type === "SAVINGS_RATE_TARGET",
  )

  const [debtEntries, totalNetWorth, netWorthTrend, accounts, rollingSavingsRatePercent] =
    await Promise.all([
      Promise.all(
        debtIds.map(async (debtId) => [debtId, await getDebtById(userId, debtId)] as const),
      ),
      needsTotalNetWorth ? getNetWorth(userId).then((nw) => nw.total) : Promise.resolve(null),
      needsTotalNetWorth ? buildTotalNetWorthTrend(userId) : Promise.resolve(null),
      needsAccountSubset ? getAccounts(userId) : Promise.resolve([]),
      needsRollingSavingsRate
        ? computeCurrentRollingSavingsRatePercent(userId, now)
        : Promise.resolve(null),
    ])

  return {
    debtById: new Map(debtEntries),
    totalNetWorth,
    netWorthTrend,
    accountsById: new Map(
      accounts.map((account) => [account.id, { type: account.type, balance: account.balance }]),
    ),
    rollingSavingsRatePercent,
  }
}

/** Every progress/completion field `FinancialGoalWithProgress` adds beyond a
 * bare `FinancialGoal` plus its `accountIds` — computed fresh per goal from
 * the shared `ProgressContext`, never persisted. */
type ProgressFields = Omit<FinancialGoalWithProgress, keyof FinancialGoal | "accountIds">

/**
 * Computes one goal's progress/completion fields from its own stored
 * configuration plus the shared `context` — the single place every type's
 * math lives, called by both `getFinancialGoals` (many goals) and
 * `getFinancialGoalById` (one goal) so the two can never compute progress
 * differently, mirroring `features/goals/server/service.ts`'s
 * `computeGoalProgress` pattern exactly.
 */
function computeProgressForGoal(
  goal: FinancialGoal,
  accountIds: string[],
  context: ProgressContext,
): ProgressFields {
  if (goal.type === "DEBT_PAYOFF") {
    const startingBalance = goal.startingBalance ?? 0
    const debt = goal.linkedDebtId ? context.debtById.get(goal.linkedDebtId) ?? null : null

    // A linked Debt is never hard-deleted in normal product use (see
    // Architecture.md's Phase 3b Financial Goals section), so `debt` being
    // `null` here should only happen if `linkedDebtId` itself is `null`
    // (the `onDelete: SetNull` FK firing on an actual hard delete) — an
    // edge case with no live balance left to read at all. Freezing at the
    // goal's own `startingBalance` (0% progress, not completed, treated as
    // "archived"/frozen) is a safe, non-crashing fallback rather than
    // fabricating a number or throwing.
    const currentEffectiveBalance = debt ? debt.effectiveBalance : startingBalance
    const linkedDebtArchived = debt ? debt.archivedAt !== null : true

    return {
      currentEffectiveBalance,
      percentPaidOff: computeDebtPayoffPercent(startingBalance, currentEffectiveBalance),
      linkedDebtArchived,
      isCompleted: isDebtPayoffComplete(currentEffectiveBalance),
    }
  }

  if (goal.type === "NET_WORTH_SAVINGS_TARGET") {
    const targetAmount = goal.targetAmount ?? 0

    const currentMeasuredValue =
      goal.measurementBasis === "ACCOUNT_SUBSET"
        ? sumAccountSubsetBalances(
            accountIds
              .map((accountId) => context.accountsById.get(accountId))
              .filter((account): account is AccountBalanceInfo => account !== undefined),
          )
        : context.totalNetWorth ?? 0

    const { distanceToTarget, isCompleted } = computeNetWorthTargetProgress(
      currentMeasuredValue,
      targetAmount,
    )

    return {
      currentMeasuredValue,
      distanceToTarget,
      // Only present for TOTAL_NET_WORTH — omitted (not a fabricated
      // partial series) for ACCOUNT_SUBSET, per the spec's own stated
      // constraint (see types.ts's `trend` JSDoc).
      trend: goal.measurementBasis === "TOTAL_NET_WORTH" ? context.netWorthTrend ?? [] : undefined,
      isCompleted,
    }
  }

  // SAVINGS_RATE_TARGET
  const targetPercent = goal.targetPercent ?? 0

  return {
    currentRollingAverageRate: context.rollingSavingsRatePercent,
    isCompleted: isSavingsRateTargetComplete(
      context.rollingSavingsRatePercent,
      targetPercent,
    ),
  }
}

// ---------------------------------------------------------------------------
// Public service functions (docs/architecture/api-contracts.md — Financial
// Goals)
// ---------------------------------------------------------------------------

/** Shared `include` shape for both read functions below — the
 * `FinancialGoalAccount` join table rows, narrowed to just `accountId` (the
 * one field `accountIds`/`sumAccountSubsetBalances` needs). */
const ACCOUNT_SUBSET_INCLUDE = {
  accountSubset: { select: { accountId: true } },
} as const

/**
 * Lists the caller's Financial Goals with every progress/completion field
 * computed fresh from live source data. Defaults to the active
 * (non-archived) list — financial-goals.md AC2. Pass `{ includeArchived:
 * true }` to instead fetch only archived goals, the same non-union toggle
 * semantics as every other archive/unarchive domain in this codebase.
 *
 * Ordered by `createdAt` ascending, matching `getAccounts`/`getGoals`/
 * `getDebts`'s "first-created first" default.
 */
export async function getFinancialGoals(
  userId: string,
  options: GetFinancialGoalsOptions = {},
): Promise<FinancialGoalWithProgress[]> {
  const { includeArchived = false } = options
  const now = new Date()

  const rows = await db.financialGoal.findMany({
    where: {
      userId,
      archivedAt: includeArchived ? { not: null } : null,
    },
    include: ACCOUNT_SUBSET_INCLUDE,
    orderBy: { createdAt: "asc" },
  })

  const context = await buildProgressContext(userId, rows, now)

  return rows.map((row) => {
    const goal = toFinancialGoal(row)
    const accountIds = row.accountSubset.map((link) => link.accountId)
    return {
      ...goal,
      accountIds,
      ...computeProgressForGoal(goal, accountIds, context),
    }
  })
}

/**
 * Fetches a single Financial Goal by id, scoped to the calling user, with
 * its full progress/completion fields. Returns `null` for a missing id *or*
 * an id owned by a different user — callers must not be able to distinguish
 * "doesn't exist" from "belongs to someone else", matching
 * `getAccountById`/`getDebtById`/`getGoalById`'s convention.
 */
export async function getFinancialGoalById(
  userId: string,
  id: string,
): Promise<FinancialGoalWithProgress | null> {
  const now = new Date()

  const row = await db.financialGoal.findFirst({
    where: { id, userId },
    include: ACCOUNT_SUBSET_INCLUDE,
  })
  if (!row) {
    return null
  }

  const context = await buildProgressContext(userId, [row], now)
  const goal = toFinancialGoal(row)
  const accountIds = row.accountSubset.map((link) => link.accountId)

  return {
    ...goal,
    accountIds,
    ...computeProgressForGoal(goal, accountIds, context),
  }
}
