import type {
  Goal as PrismaGoal,
  GoalContribution as PrismaGoalContribution,
} from "@prisma/client"

// Client-safe shapes for the Goals module. Prisma's `Decimal` (targetAmount,
// plannedMonthlyContribution, GoalContribution.amount) is a decimal.js class
// instance, not a plain serializable value — passing it as-is across the
// Server Component / Client Component boundary or through a Server Action's
// response is unsafe. `server/service.ts` and `server/actions.ts` always
// convert Decimal -> number before returning data (see `toGoal`/
// `toGoalContribution`), mirroring `features/accounts/types.ts`'s `Account`/
// `toAccount()` pattern exactly.

/**
 * Client-safe representation of a Goal row. Does not include any derived
 * progress/completion fields — those live on `GoalWithProgress` below, since
 * a bare `Goal` (e.g. the direct return of `createGoal`/`updateGoal`) has no
 * contribution data loaded to compute them from.
 */
export type Goal = Omit<
  PrismaGoal,
  "targetAmount" | "plannedMonthlyContribution"
> & {
  targetAmount: number
  plannedMonthlyContribution: number | null
}

/** Client-safe representation of a single logged contribution. */
export type GoalContribution = Omit<PrismaGoalContribution, "amount"> & {
  amount: number
}

/**
 * The three states `estimatedCompletion` (AC7) can resolve to, computed at
 * read time in `server/service.ts`'s `computeEstimatedCompletion` — never
 * stored, for the same reason `isCompleted`/`currentProgress` aren't stored
 * (see the module-level note in service.ts).
 *
 * Matches docs/architecture/api-contracts.md's Savings Goals section exactly
 * (`{ month: string } | { status: "not_enough_data" }`) so the shape a
 * consumer switches on (`"month" in estimatedCompletion` vs.
 * `"status" in estimatedCompletion`) is stable. `basis` is an additive field
 * (present only on the `month` variant) distinguishing AC7's case 1 (planned
 * monthly contribution) from case 2 (average actual contribution rate) —
 * useful for the UI to caption the estimate differently (e.g. "based on your
 * plan" vs. "based on your average pace") without widening the discriminant
 * the architecture contract already fixed.
 */
export type EstimatedCompletion =
  | { month: string; basis: "planned" | "average-rate" }
  | { status: "not_enough_data" }

/**
 * `Goal` plus every value docs/product/savings-goals.md's AC2/AC7/AC8 require
 * to render a goal card or detail view, computed fresh from this goal's
 * `GoalContribution` rows on every read (see `server/service.ts`) rather than
 * persisted — the same rationale as Budgeting's Budget Health Score and
 * Bills' occurrence status: nothing here can ever drift out of sync with its
 * source data because nothing is cached.
 */
export type GoalWithProgress = Goal & {
  /** Sum of this goal's `GoalContribution.amount`. */
  currentProgress: number
  /** `max(targetAmount - currentProgress, 0)` — never negative (AC7's ratio
   * uses this, not the raw difference, so an overshot goal doesn't produce a
   * negative "months needed"). */
  remainingAmount: number
  /** `max(currentProgress - targetAmount, 0)` — the overshoot edge case
   * ("$50 over your $1,000 target"), 0 for a goal that hasn't reached its
   * target yet. */
  overageAmount: number
  /** `currentProgress / targetAmount * 100`, uncapped — overshoot is shown
   * plainly (e.g. 105%), never clamped to 100. */
  percentComplete: number
  /** `currentProgress >= targetAmount` (AC8). Recomputed on every read, so
   * editing `targetAmount` up/down automatically flips this without any
   * write-side sync code — see service.ts's `computeGoalProgress`. */
  isCompleted: boolean
  /** `targetDate` is in the past and the goal is not yet Completed — an
   * informational flag only (edge case: "allowed, but visually flagged"),
   * never a hard failure. `false` when `targetDate` is null. */
  isTargetDatePassed: boolean
  /** AC7's three-tier estimate — see `EstimatedCompletion`'s JSDoc. */
  estimatedCompletion: EstimatedCompletion
}

/** `getGoalById`'s return shape per api-contracts.md: `GoalWithProgress` plus
 * the full contribution history, needed by the goal detail view's
 * contribution list (AC9). `null` when the goal doesn't exist or belongs to
 * a different user (see `service.getGoalById`'s JSDoc). */
export type GoalDetail = GoalWithProgress & {
  contributions: GoalContribution[]
}

/**
 * Options for `service.getGoals`. Mirrors
 * `features/accounts/types.ts`'s `GetAccountsOptions` toggle semantics
 * exactly (per folder-tree.md's note that Goals follows Accounts' archive/
 * unarchive shape): `includeArchived` false/omitted returns only active
 * goals; `true` returns only archived goals. Not a union of both — the
 * product has two distinct list views (active list vs. dedicated archived
 * view), not one combined view.
 */
export interface GetGoalsOptions {
  includeArchived?: boolean
}
