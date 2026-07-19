import type {
  Goal as PrismaGoalRow,
  GoalContribution as PrismaGoalContributionRow,
} from "@prisma/client"

import { db } from "@/lib/db"

import type {
  EstimatedCompletion,
  GetGoalsOptions,
  Goal,
  GoalContribution,
  GoalDetail,
  GoalWithProgress,
} from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Savings Goals section: "List goals |
// Server Component direct call to service.getGoals(userId, ...)") and by
// server/actions.ts. It must never be imported from a Client Component —
// every exported function requires a pre-resolved `userId` from
// `getCurrentUser()` (see lib/auth.ts), never a client-supplied value, and
// this module never calls `getCurrentUser()` itself, matching
// `features/accounts/server/service.ts` and
// `features/dashboard/server/service.ts`'s convention (folder-tree.md's note
// on risk-register.md item #4, cross-user data leak prevention).
//
// No import from `features/accounts/server` or `features/transactions/server`
// anywhere in this file — per api-contracts.md's Savings Goals section
// ("Goals cannot introduce a circular dependency with any other Phase 2
// module") and docs/product/savings-goals.md's resolved Goal<->Account
// decision (manual contributions only, no Account linkage).

// ---------------------------------------------------------------------------
// Prisma row -> client-safe shape converters
// ---------------------------------------------------------------------------

/**
 * Converts a Prisma `Goal` row (`targetAmount`/`plannedMonthlyContribution`
 * are decimal.js `Decimal` instances) into the plain-number `Goal` shape
 * defined in `../types.ts` — mirrors `features/accounts/server/service.ts`'s
 * `toAccount()`.
 */
export function toGoal(row: PrismaGoalRow): Goal {
  return {
    ...row,
    targetAmount: row.targetAmount.toNumber(),
    plannedMonthlyContribution:
      row.plannedMonthlyContribution === null
        ? null
        : row.plannedMonthlyContribution.toNumber(),
  }
}

/** Converts a Prisma `GoalContribution` row (`amount` is a `Decimal`) into
 * the plain-number `GoalContribution` shape. */
export function toGoalContribution(
  row: PrismaGoalContributionRow,
): GoalContribution {
  return { ...row, amount: row.amount.toNumber() }
}

// ---------------------------------------------------------------------------
// Read-time derived calculations (AC3, AC4, AC7, AC8 — see types.ts's
// `GoalWithProgress` JSDoc for why none of this is ever persisted)
// ---------------------------------------------------------------------------

/** The subset of a contribution's fields the calculations below need —
 * deliberately narrower than the full `GoalContribution` shape so
 * `getGoals` (which lists many goals at once) can select only `amount`/
 * `date` per contribution rather than every column. */
interface ContributionAmountAndDate {
  amount: number
  date: Date
}

/** `"yyyy-MM"` key for a UTC month-start `Date`. Built manually from UTC
 * getters (not e.g. `date-fns`'s `format`, which formats in the process's
 * local timezone) so the key never shifts to an adjacent month depending on
 * where the server happens to run — identical technique to
 * `features/dashboard/server/service.ts`'s `formatMonthKey`, duplicated here
 * per this codebase's module-boundary convention (features/<domain>/server
 * modules don't import each other's internals across domains). */
function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/** UTC midnight for "today," truncating any time-of-day component — used to
 * compare against `targetDate`/contribution dates, which are all
 * `@db.Date` (date-only) columns. */
function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Whole calendar months between two UTC dates (`end` minus `start`),
 * ignoring day-of-month — e.g. Jan 31 -> Feb 1 counts as 1 month, matching
 * the granularity `estimatedCompletion.month` is expressed in. Can be
 * negative if `end` precedes `start`; callers here never pass dates in that
 * order. */
function monthsBetweenUtc(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  )
}

/** Adds `months` calendar months to a UTC date, returning the first of the
 * resulting month — completion estimates are expressed as a month/year
 * (AC7: "expressed as a month/year"), not a specific day, so normalizing to
 * the 1st avoids implying false day-level precision. */
function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

/**
 * AC7's three-tier estimated-completion logic, in priority order:
 *
 *   1. **Planned amount.** If `plannedMonthlyContribution` is set, the
 *      estimate is `remainingAmount / plannedMonthlyContribution` months
 *      from now, rounded up (a partial final month still counts as a whole
 *      month of saving) — `basis: "planned"`. This takes priority over
 *      actual contribution history per AC7's own ordering ("if the goal has
 *      a planned monthly contribution amount set ..."), even if the user has
 *      also logged contributions — a stated plan is a more deliberate signal
 *      of intent than inferring one from possibly-irregular past activity.
 *   2. **Average actual rate.** Else, if at least 2 contributions have been
 *      logged, the estimate uses the average contribution rate over the
 *      goal's life so far: total contributed so far, divided by the number
 *      of whole calendar months between the *earliest* logged contribution
 *      and today (floored at 1 month, so two contributions logged in the
 *      same calendar month don't divide by zero) — `basis: "average-rate"`.
 *   3. **Not enough data.** Else (no plan, fewer than 2 contributions —
 *      including the "zero contributions logged" edge case), returns the
 *      explicit `{ status: "not_enough_data" }` sentinel rather than a
 *      misleading date or a divide-by-zero/NaN result.
 *
 * `remainingAmount` is expected pre-floored at 0 (see `computeGoalProgress`)
 * so a completed/overshot goal always resolves to "0 months from now" (the
 * current month) under tiers 1/2, rather than a negative month count.
 */
function computeEstimatedCompletion(
  remainingAmount: number,
  plannedMonthlyContribution: number | null,
  contributions: ContributionAmountAndDate[],
  now: Date,
): EstimatedCompletion {
  if (plannedMonthlyContribution !== null && plannedMonthlyContribution > 0) {
    const monthsNeeded = Math.max(
      0,
      Math.ceil(remainingAmount / plannedMonthlyContribution),
    )
    return {
      month: formatMonthKey(addMonthsUtc(now, monthsNeeded)),
      basis: "planned",
    }
  }

  if (contributions.length >= 2) {
    const earliestContributionTime = Math.min(
      ...contributions.map((contribution) => contribution.date.getTime()),
    )
    const earliestContributionDate = new Date(earliestContributionTime)
    const totalContributed = contributions.reduce(
      (sum, contribution) => sum + contribution.amount,
      0,
    )
    const elapsedMonths = Math.max(
      1,
      monthsBetweenUtc(earliestContributionDate, now),
    )
    const averageMonthlyRate = totalContributed / elapsedMonths

    // Defensive only: `contributionAmountSchema` (validation.ts) rejects
    // amounts <= 0 at write time, so `totalContributed` (and therefore this
    // rate) is always positive whenever 2+ contributions exist. Guarded
    // anyway so a future data-entry path can never resurrect a
    // divide-by-zero/negative-months result here.
    if (averageMonthlyRate > 0) {
      const monthsNeeded = Math.max(
        0,
        Math.ceil(remainingAmount / averageMonthlyRate),
      )
      return {
        month: formatMonthKey(addMonthsUtc(now, monthsNeeded)),
        basis: "average-rate",
      }
    }
  }

  return { status: "not_enough_data" }
}

/**
 * Computes every derived field on `GoalWithProgress` from a goal's target
 * fields and its full contribution list — the single place AC3/AC4/AC7/AC8's
 * math lives, called by both `getGoals` (many goals) and `getGoalById` (one
 * goal + full history) so the two can never compute progress differently.
 */
function computeGoalProgress(
  goal: Pick<Goal, "targetAmount" | "targetDate" | "plannedMonthlyContribution">,
  contributions: ContributionAmountAndDate[],
  now: Date = new Date(),
): Omit<GoalWithProgress, keyof Goal> {
  const currentProgress = contributions.reduce(
    (sum, contribution) => sum + contribution.amount,
    0,
  )
  const remainingAmount = Math.max(goal.targetAmount - currentProgress, 0)
  const overageAmount = Math.max(currentProgress - goal.targetAmount, 0)
  // `targetAmount` is validated strictly > 0 at write time (validation.ts),
  // but this guard keeps the calculation total (never NaN/Infinity) even
  // against a pre-existing row that somehow has a non-positive target.
  const percentComplete =
    goal.targetAmount > 0 ? (currentProgress / goal.targetAmount) * 100 : 0
  // AC8: "reaches or exceeds" — >=, not strictly >. Recomputed on every
  // read, so editing `targetAmount` up or down automatically flips this
  // (the "editing the target amount ... reverts to Active" edge case) with
  // no write-side sync logic required.
  const isCompleted = currentProgress >= goal.targetAmount

  const today = utcToday(now)
  // Informational-only flag (edge case: "allowed, but visually flagged ...
  // not a hard failure"); never true once the goal is Completed, and never
  // true for a goal with no target date.
  const isTargetDatePassed =
    goal.targetDate !== null && goal.targetDate < today && !isCompleted

  const estimatedCompletion = computeEstimatedCompletion(
    remainingAmount,
    goal.plannedMonthlyContribution,
    contributions,
    now,
  )

  return {
    currentProgress,
    remainingAmount,
    overageAmount,
    percentComplete,
    isCompleted,
    isTargetDatePassed,
    estimatedCompletion,
  }
}

// ---------------------------------------------------------------------------
// Public service functions (docs/architecture/api-contracts.md — Savings
// Goals)
// ---------------------------------------------------------------------------

/**
 * Lists the caller's goals with every progress/completion field computed
 * fresh from their contributions. Defaults to the active (non-archived) list
 * — docs/product/savings-goals.md AC2/AC6. Pass `{ includeArchived: true }`
 * to instead fetch only archived goals, the same non-union toggle semantics
 * as `features/accounts/server/service.ts`'s `getAccounts`.
 *
 * Selects only `amount`/`date` per contribution (not every column) since a
 * list of many goals only needs those two fields to compute progress —
 * `getGoalById` below selects the full contribution row, for its
 * contribution-history use case (AC9).
 *
 * Ordered by `createdAt` ascending, matching `getAccounts`'s "first-created
 * first" default in the absence of a specified sort in api-contracts.md.
 */
export async function getGoals(
  userId: string,
  options: GetGoalsOptions = {},
): Promise<GoalWithProgress[]> {
  const { includeArchived = false } = options
  const now = new Date()

  const rows = await db.goal.findMany({
    where: {
      userId,
      archivedAt: includeArchived ? { not: null } : null,
    },
    include: {
      contributions: { select: { amount: true, date: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return rows.map((row) => {
    const goal = toGoal(row)
    const contributions = row.contributions.map((contribution) => ({
      amount: contribution.amount.toNumber(),
      date: contribution.date,
    }))
    return { ...goal, ...computeGoalProgress(goal, contributions, now) }
  })
}

/**
 * Fetches a single goal by id, scoped to the calling user, with its full
 * progress/completion fields (AC7/AC8) and its complete contribution history
 * ordered most-recent-first (AC9's "goal's individual contribution
 * history"). Returns `null` for a missing id *or* an id owned by a different
 * user — callers must not be able to distinguish "doesn't exist" from
 * "belongs to someone else", matching `getAccountById`'s convention.
 */
export async function getGoalById(
  userId: string,
  id: string,
): Promise<GoalDetail | null> {
  const now = new Date()

  const row = await db.goal.findFirst({
    where: { id, userId },
    include: {
      contributions: { orderBy: { date: "desc" } },
    },
  })
  if (!row) {
    return null
  }

  const goal = toGoal(row)
  const contributions = row.contributions.map(toGoalContribution)
  const progress = computeGoalProgress(goal, contributions, now)

  return { ...goal, ...progress, contributions }
}
