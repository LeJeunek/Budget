// Pure selection logic for
// `prisma/backfill-savings-rate-goal-notifications.ts`, split into its own
// module — with zero database access and zero top-level side effects — so it
// can be safely `import`ed by a test file without ever triggering the
// script's own DB-touching orchestration (which runs unconditionally at
// import time in the entry-point file, matching `prisma/seed-showcase.ts`'s
// own "runs main() unconditionally at import time" shape). Mirrors
// `src/features/financial-goals/server/progress-math.ts`'s own separation
// from `service.ts` — pure math/selection logic lives in its own file,
// DB-touching orchestration lives in a file that composes it.

/** The subset of `FinancialGoalCompletionStatus`
 * (src/features/financial-goals/server/service.ts) this selection needs. */
export interface GoalCompletionStatusLike {
  id: string
  isCompleted: boolean
  completionNotifiedAt: Date | null
}

/**
 * Selects, from one user's full completion-status read
 * (`getFinancialGoalCompletionStatus(userId)` — every active goal of every
 * type for that user), only the ids that are both (a) among the
 * SAVINGS_RATE_TARGET goals this backfill is targeting for that user and (b)
 * genuinely complete but not yet notified.
 *
 * `targetGoalIds` is always the narrower set the backfill's initial query
 * selected for this user (non-archived, `type: "SAVINGS_RATE_TARGET"`,
 * `completionNotifiedAt: null`) — `getFinancialGoalCompletionStatus` itself
 * returns every active goal of every type, since that is the shape its
 * actual production caller (`goal-achieved-trigger.ts`) needs; this backfill
 * only ever acts on the subset it was asked to close the gap for, never on
 * a DEBT_PAYOFF/NET_WORTH_SAVINGS_TARGET goal that happens to appear in the
 * same per-user read (those were already correctly backfilled by the
 * original migration).
 */
export function selectGoalIdsToBackfill(
  targetGoalIds: ReadonlySet<string>,
  completionStatuses: readonly GoalCompletionStatusLike[],
): string[] {
  return completionStatuses
    .filter(
      (status) =>
        targetGoalIds.has(status.id) &&
        status.isCompleted === true &&
        status.completionNotifiedAt === null,
    )
    .map((status) => status.id)
}
