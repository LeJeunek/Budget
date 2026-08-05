import type {
  EstimatedCompletion,
  GoalContribution,
  GoalDetail,
} from "@/features/goals/types"

import { DEMO_GOAL_IDS, DEMO_USER_ID } from "./ids"
import { relativeDate } from "./relative-date"

/**
 * The demo household's two Savings Goals, both in progress at a real,
 * partial completion percentage (public-demo.md Capability 2 AC4: "never 0%
 * or 100%"). `targetDate` is left `null` on both — optional per
 * `savings-goals.md` AC1, and sidesteps needing a "months from now" fixture
 * primitive `relative-date.ts` deliberately doesn't provide (every fixture
 * offset in this module is "ago," never a fabricated future date).
 *
 * Every progress field (`currentProgress`/`remainingAmount`/`percentComplete`/
 * `isCompleted`/`estimatedCompletion`) is computed by `computeGoalProgress`
 * below, a line-for-line mirror of
 * `features/goals/server/service.ts`'s own `computeGoalProgress` (that file
 * lives under `server/`, so it cannot be imported directly here — see
 * public-demo-technical-design.md §4.1's `no-restricted-imports` rule) — so
 * this fixture's numbers agree with what the real app would compute for the
 * identical contribution history, not a hand-approximated guess. Flagged per
 * §2.2: a future change to that real function's rule needs this mirror
 * updated too.
 */

interface ContributionSeed {
  amount: number
  daysAgo: number
}

function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function monthsBetweenUtc(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  )
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

/** Mirrors `features/goals/server/service.ts`'s `computeEstimatedCompletion`
 * (AC7's three-tier logic) exactly — see this file's module doc above. */
function computeEstimatedCompletion(
  remainingAmount: number,
  plannedMonthlyContribution: number | null,
  contributions: { amount: number; date: Date }[],
  now: Date,
): EstimatedCompletion {
  if (plannedMonthlyContribution !== null && plannedMonthlyContribution > 0) {
    const monthsNeeded = Math.max(0, Math.ceil(remainingAmount / plannedMonthlyContribution))
    return { month: formatMonthKey(addMonthsUtc(now, monthsNeeded)), basis: "planned" }
  }

  if (contributions.length >= 2) {
    const earliestTime = Math.min(...contributions.map((c) => c.date.getTime()))
    const totalContributed = contributions.reduce((sum, c) => sum + c.amount, 0)
    const elapsedMonths = Math.max(1, monthsBetweenUtc(new Date(earliestTime), now))
    const averageMonthlyRate = totalContributed / elapsedMonths

    if (averageMonthlyRate > 0) {
      const monthsNeeded = Math.max(0, Math.ceil(remainingAmount / averageMonthlyRate))
      return { month: formatMonthKey(addMonthsUtc(now, monthsNeeded)), basis: "average-rate" }
    }
  }

  return { status: "not_enough_data" }
}

/** Mirrors `features/goals/server/service.ts`'s `computeGoalProgress`
 * exactly — see this file's module doc above. */
function computeGoalProgress(
  targetAmount: number,
  targetDate: Date | null,
  plannedMonthlyContribution: number | null,
  contributions: { amount: number; date: Date }[],
  now: Date,
) {
  const currentProgress = contributions.reduce((sum, c) => sum + c.amount, 0)
  const remainingAmount = Math.max(targetAmount - currentProgress, 0)
  const overageAmount = Math.max(currentProgress - targetAmount, 0)
  const percentComplete = targetAmount > 0 ? (currentProgress / targetAmount) * 100 : 0
  const isCompleted = currentProgress >= targetAmount

  const today = utcToday(now)
  const isTargetDatePassed = targetDate !== null && targetDate < today && !isCompleted

  const estimatedCompletion = computeEstimatedCompletion(
    remainingAmount,
    plannedMonthlyContribution,
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

function buildGoal(params: {
  id: string
  name: string
  targetAmount: number
  plannedMonthlyContribution: number | null
  contributionSeeds: ContributionSeed[]
  createdDaysAgo: number
  now: Date
}): GoalDetail {
  const { id, name, targetAmount, plannedMonthlyContribution, contributionSeeds, createdDaysAgo, now } =
    params

  const contributions: GoalContribution[] = contributionSeeds.map((seed, index) => ({
    id: `${id}-contribution-${index}`,
    goalId: id,
    userId: DEMO_USER_ID,
    amount: seed.amount,
    date: relativeDate(seed.daysAgo, now),
    createdAt: relativeDate(seed.daysAgo, now),
  }))

  const progress = computeGoalProgress(
    targetAmount,
    null,
    plannedMonthlyContribution,
    contributions,
    now,
  )

  return {
    id,
    userId: DEMO_USER_ID,
    name,
    targetAmount,
    targetDate: null,
    plannedMonthlyContribution,
    archivedAt: null,
    createdAt: relativeDate(createdDaysAgo, now),
    updatedAt: relativeDate(contributionSeeds[0]?.daysAgo ?? createdDaysAgo, now),
    ...progress,
    contributions: [...contributions].sort((a, b) => b.date.getTime() - a.date.getTime()),
  }
}

/** Builds both demo Savings Goals, resolved against a single shared `now`. */
export function buildDemoSavingsGoals(now: Date): GoalDetail[] {
  return [
    buildGoal({
      id: DEMO_GOAL_IDS.japanVacation,
      name: "Trip to Japan",
      targetAmount: 6000,
      plannedMonthlyContribution: null,
      contributionSeeds: [
        { amount: 600, daysAgo: 10 },
        { amount: 470, daysAgo: 40 },
        { amount: 420, daysAgo: 70 },
        { amount: 380, daysAgo: 100 },
        { amount: 350, daysAgo: 135 },
        { amount: 300, daysAgo: 165 },
      ],
      createdDaysAgo: 175,
      now,
    }),
    buildGoal({
      id: DEMO_GOAL_IDS.laptopUpgrade,
      name: "New Laptop Fund",
      targetAmount: 2200,
      plannedMonthlyContribution: 150,
      contributionSeeds: [
        { amount: 650, daysAgo: 20 },
        { amount: 500, daysAgo: 50 },
        { amount: 550, daysAgo: 80 },
      ],
      createdDaysAgo: 90,
      now,
    }),
  ]
}
