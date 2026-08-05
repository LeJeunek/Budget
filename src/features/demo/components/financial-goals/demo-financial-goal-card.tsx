"use client"

/**
 * DemoFinancialGoalCard — read-only presentational twin of
 * `features/financial-goals/components/financial-goal-card.tsx`, built for
 * the public `/demo` route
 * (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * Mirrors FinancialGoalCard's display fields (type badge, Completed /
 * Linked-debt-archived / "not enough data yet" badges, and the three
 * per-type progress bodies) but omits the entire actions menu and all three
 * type-specific Edit dialogs — the real file imports
 * `archiveFinancialGoal`/`unarchiveFinancialGoal` from
 * `@/features/financial-goals/server/actions`, which nothing under `/demo`
 * may ever reach, even transitively (public-demo.md Capability 3 AC2). The
 * detail link points at `/demo/financial-goals/[id]`, never the real
 * authenticated route (Capability 5 AC4).
 *
 * Label/formatting constants are imported from `financial-goal-shared.ts`
 * (not the card file) — that module only imports this feature's own
 * `types.ts`, so reusing it here duplicates nothing and pulls in nothing
 * unsafe. The Net Worth trend sparkline is reimplemented locally rather than
 * importing `net-worth-trend-sparkline.tsx`, since that component reads
 * currency via `useFormatCurrency()` (a Context provider `/demo` never
 * mounts, per Capability 1 AC3's "no session-shaped state of any kind") —
 * this twin takes a plain `currency` prop instead.
 *
 * Usage:
 * ```tsx
 * <DemoFinancialGoalCard goal={DEMO_HOUSEHOLD.financialGoals[0]} />
 * ```
 */

import Link from "next/link"
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts"

import { formatCurrency } from "@/lib/utils"
import {
  FINANCIAL_GOAL_TYPE_LABELS,
  MEASUREMENT_BASIS_LABELS,
  clampPercent,
  formatDateLabel,
} from "@/features/financial-goals/components/financial-goal-shared"
import { AnimatedNumber } from "@/components/shared/motion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

import type {
  FinancialGoalTrendPoint,
  FinancialGoalWithProgress,
} from "@/features/financial-goals/types"

export interface DemoFinancialGoalCardProps {
  goal: FinancialGoalWithProgress
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

function isSavingsRateDataInsufficient(goal: FinancialGoalWithProgress): boolean {
  return goal.type === "SAVINGS_RATE_TARGET" && goal.currentRollingAverageRate === null
}

export function DemoFinancialGoalCard({
  goal,
  currency = "USD",
}: DemoFinancialGoalCardProps) {
  const isArchived = goal.archivedAt !== null

  return (
    <Card className={isArchived ? "opacity-75" : undefined}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">
            <Link href={`/demo/financial-goals/${goal.id}`} className="hover:underline">
              {goal.name}
            </Link>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{FINANCIAL_GOAL_TYPE_LABELS[goal.type]}</Badge>
            {goal.isCompleted && <Badge>Completed</Badge>}
            {goal.type === "DEBT_PAYOFF" && goal.linkedDebtArchived && (
              <Badge variant="destructive">Linked debt archived</Badge>
            )}
            {isSavingsRateDataInsufficient(goal) && (
              <Badge variant="outline">Not enough data yet</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <DemoFinancialGoalProgressBody goal={goal} currency={currency} />
      </CardContent>
    </Card>
  )
}

function DemoFinancialGoalProgressBody({
  goal,
  currency,
}: {
  goal: FinancialGoalWithProgress
  currency: string
}) {
  if (goal.type === "DEBT_PAYOFF") {
    return <DebtPayoffProgress goal={goal} currency={currency} />
  }
  if (goal.type === "NET_WORTH_SAVINGS_TARGET") {
    return <NetWorthSavingsProgress goal={goal} currency={currency} />
  }
  return <SavingsRateProgress goal={goal} />
}

function DebtPayoffProgress({
  goal,
  currency,
}: {
  goal: FinancialGoalWithProgress
  currency: string
}) {
  const startingBalance = goal.startingBalance ?? 0
  const currentEffectiveBalance = goal.currentEffectiveBalance ?? 0
  const percentPaidOff = goal.percentPaidOff ?? 0
  const balanceIncreasedSinceStart =
    percentPaidOff === 0 && currentEffectiveBalance > startingBalance

  return (
    <div className="flex flex-col gap-2">
      <Progress value={clampPercent(percentPaidOff)} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">
          <AnimatedNumber
            value={currentEffectiveBalance}
            format={(amount) => formatCurrency(amount, currency)}
          />{" "}
          remaining of{" "}
          <AnimatedNumber
            value={startingBalance}
            format={(amount) => formatCurrency(amount, currency)}
          />{" "}
          starting balance
        </span>
        <span className="text-xs text-muted-foreground">
          <AnimatedNumber value={percentPaidOff} format={(n) => `${Math.round(n)}%`} />{" "}
          paid off
        </span>
        {balanceIncreasedSinceStart && (
          <span className="text-xs text-muted-foreground">
            Balance has increased since this goal began.
          </span>
        )}
        {goal.linkedDebtArchived && !goal.isCompleted && (
          <span className="text-xs text-muted-foreground">
            The linked debt was archived — progress is frozen at its last
            known value.
          </span>
        )}
      </div>
    </div>
  )
}

function NetWorthSavingsProgress({
  goal,
  currency,
}: {
  goal: FinancialGoalWithProgress
  currency: string
}) {
  const targetAmount = goal.targetAmount ?? 0
  const currentMeasuredValue = goal.currentMeasuredValue ?? 0
  const distanceToTarget = goal.distanceToTarget ?? targetAmount - currentMeasuredValue
  const displayPercent =
    targetAmount > 0 ? clampPercent((currentMeasuredValue / targetAmount) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <Progress value={displayPercent} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">
          <AnimatedNumber
            value={currentMeasuredValue}
            format={(amount) => formatCurrency(amount, currency)}
          />{" "}
          <span className="text-muted-foreground">
            of{" "}
            <AnimatedNumber
              value={targetAmount}
              format={(amount) => formatCurrency(amount, currency)}
            />{" "}
            target
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {goal.measurementBasis ? MEASUREMENT_BASIS_LABELS[goal.measurementBasis] : ""}
          {" · "}
          <AnimatedNumber
            value={Math.abs(distanceToTarget)}
            format={(amount) => formatCurrency(amount, currency)}
          />{" "}
          {distanceToTarget > 0 ? "to go" : "over target"}
        </span>
      </div>
      {goal.trend && goal.trend.length > 0 && (
        <DemoNetWorthTrendSparkline
          points={goal.trend}
          targetAmount={targetAmount}
          currency={currency}
        />
      )}
    </div>
  )
}

function SavingsRateProgress({ goal }: { goal: FinancialGoalWithProgress }) {
  const targetPercent = goal.targetPercent ?? 0

  if (goal.currentRollingAverageRate === null || goal.currentRollingAverageRate === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough data yet — check back after a few months of income/expense
        activity.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-lg font-semibold text-foreground">
        <AnimatedNumber
          value={goal.currentRollingAverageRate}
          format={(n) => `${n.toFixed(1)}%`}
        />{" "}
        <span className="text-sm font-normal text-muted-foreground">
          &rarr; target <AnimatedNumber value={targetPercent} format={(n) => `${n}%`} />
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        Rolling 3-month average savings rate.
      </span>
    </div>
  )
}

/** Local reimplementation of `net-worth-trend-sparkline.tsx` — that
 * component reads currency via `useFormatCurrency()` (a Context `/demo`
 * never mounts), so this twin takes `currency` as a plain prop instead.
 * Otherwise identical: no axes/legend/range selector, just a glanceable
 * trend shape with a flat reference line at the goal's target. */
function DemoNetWorthTrendSparkline({
  points,
  targetAmount,
  currency,
}: {
  points: FinancialGoalTrendPoint[]
  targetAmount: number
  currency: string
}) {
  return (
    <div className="h-16 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer={false}: mirrors net-worth-trend-sparkline.tsx's
            identical fix — Recharts' default keyboard-nav overlay makes its
            svg focusable, which axe flags inside an aria-hidden wrapper. */}
        <LineChart
          data={points}
          margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          accessibilityLayer={false}
        >
          <Tooltip
            labelFormatter={(value) => formatDateLabel(String(value))}
            formatter={(value) => [formatCurrency(Number(value), currency), "Net worth"]}
            contentStyle={{
              backgroundColor: "var(--popover)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-lg)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <ReferenceLine
            y={targetAmount}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
          <Line type="monotone" dataKey="value" dot={false} stroke="var(--chart-1)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
