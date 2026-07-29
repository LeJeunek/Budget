import { describe, expect, it } from "vitest"

import { selectGoalIdsToBackfill } from "./backfill-savings-rate-goal-notifications-logic"

/**
 * Unit tests for `selectGoalIdsToBackfill` — the pure selection logic
 * `prisma/backfill-savings-rate-goal-notifications.ts` uses to decide which
 * goals to claim. Only the pure logic is tested here, per this codebase's
 * standing "extract the pure logic, unit-test that, don't unit-test the
 * DB-touching orchestration" convention (see
 * `src/features/financial-goals/server/progress-math.test.ts` for the
 * precedent this mirrors, and
 * `src/features/notifications/server/triggers/goal-achieved-trigger.test.ts`'s
 * own top-of-file comment for why the DB-touching backfill script itself has
 * no dedicated test file, matching `prisma/seed-showcase.ts`'s same
 * precedent).
 */
describe("selectGoalIdsToBackfill", () => {
  it("selects a goal that is in the target set, completed, and not yet notified", () => {
    const result = selectGoalIdsToBackfill(new Set(["goal-1"]), [
      { id: "goal-1", isCompleted: true, completionNotifiedAt: null },
    ])

    expect(result).toEqual(["goal-1"])
  })

  it("excludes a goal that is not yet completed", () => {
    const result = selectGoalIdsToBackfill(new Set(["goal-1"]), [
      { id: "goal-1", isCompleted: false, completionNotifiedAt: null },
    ])

    expect(result).toEqual([])
  })

  it("excludes a goal that has already been notified (already backfilled or genuinely already fired)", () => {
    const result = selectGoalIdsToBackfill(new Set(["goal-1"]), [
      { id: "goal-1", isCompleted: true, completionNotifiedAt: new Date("2026-01-01") },
    ])

    expect(result).toEqual([])
  })

  it("excludes a goal that is completed and unnotified but NOT in this user's target set (e.g. a DEBT_PAYOFF or NET_WORTH_SAVINGS_TARGET goal returned by the same per-user completion-status read)", () => {
    const result = selectGoalIdsToBackfill(new Set(["goal-1"]), [
      { id: "goal-2", isCompleted: true, completionNotifiedAt: null },
    ])

    expect(result).toEqual([])
  })

  it("selects only the matching subset out of a mixed list, preserving no particular guarantee about order beyond the input order", () => {
    const result = selectGoalIdsToBackfill(new Set(["goal-1", "goal-3"]), [
      { id: "goal-1", isCompleted: true, completionNotifiedAt: null },
      { id: "goal-2", isCompleted: true, completionNotifiedAt: null },
      { id: "goal-3", isCompleted: false, completionNotifiedAt: null },
      { id: "goal-4", isCompleted: true, completionNotifiedAt: new Date("2026-01-01") },
    ])

    expect(result).toEqual(["goal-1"])
  })

  it("returns an empty array for an empty target set or an empty completion-status list", () => {
    expect(selectGoalIdsToBackfill(new Set(), [])).toEqual([])
    expect(
      selectGoalIdsToBackfill(new Set(["goal-1"]), []),
    ).toEqual([])
    expect(
      selectGoalIdsToBackfill(new Set(), [
        { id: "goal-1", isCompleted: true, completionNotifiedAt: null },
      ]),
    ).toEqual([])
  })
})
