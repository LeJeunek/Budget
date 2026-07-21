"use client"

/**
 * StrategyComparison — the snowball-vs-avalanche side-by-side view
 * (debt-tracker.md AC6/AC7/AC8). Per docs/architecture/api-contracts.md's
 * Debt Tracker section ("No server call at all after initial load"), this
 * calls `../payoff-math.ts`'s `compareSnowballAndAvalanche` directly, purely
 * client-side, recomputing on every extra-payment keystroke via
 * `useMemo` — no Server Action, no network round-trip.
 *
 * Presents both strategies' numbers plainly without declaring one "better"
 * (AC8) — this component never renders language like "recommended" or
 * "wins"; `isIdentical` instead drives an explanatory note when there is
 * nothing to compare (Edge Cases: $0 extra payment, or a single debt).
 */

import { useMemo, useState } from "react"

import type { DebtWithProjection, PayoffDebtInput } from "@/features/debt/types"
import { compareSnowballAndAvalanche } from "@/features/debt/payoff-math"
import {
  ExtraPaymentInput,
  parseExtraPaymentInput,
} from "@/features/debt/components/extra-payment-input"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Mirrors payoff-math.ts's own MAX_SIMULATION_MONTHS backstop (not exported
// from that file, since it's an internal implementation detail there — see
// its JSDoc). This local, more conservative threshold is a UI-only "this is
// an unrealistically long payoff" caution, not an attempt to detect the
// exact same boundary; any comparison landing at or beyond it is,
// realistically, already "won't pay off at a reasonable pace" territory.
const VERY_LONG_PAYOFF_MONTHS = 600

function formatMonthsToDebtFree(months: number): string {
  if (months <= 0) return "Already debt-free"

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`)
  if (remainingMonths > 0 || years === 0) {
    parts.push(`${remainingMonths} ${remainingMonths === 1 ? "mo" : "mos"}`)
  }
  return parts.join(" ")
}

export interface StrategyComparisonProps {
  /** Active (non-archived), non-paid-off debts — the page passes only these
   * in, matching `compareSnowballAndAvalanche`'s own defensive
   * `balance > 0` filter. */
  debts: DebtWithProjection[]
}

export function StrategyComparison({ debts }: StrategyComparisonProps) {
  const [extraPaymentRaw, setExtraPaymentRaw] = useState("")

  const payoffInputs: PayoffDebtInput[] = useMemo(
    () =>
      debts.map((debt) => ({
        id: debt.id,
        balance: debt.effectiveBalance,
        interestRate: debt.interestRate,
        minimumPayment: debt.minimumPayment,
      })),
    [debts],
  )

  const debtNameById = useMemo(
    () => new Map(debts.map((debt) => [debt.id, debt.name])),
    [debts],
  )

  const { value: extraPayment, error: extraPaymentError } =
    parseExtraPaymentInput(extraPaymentRaw)

  const comparison = useMemo(
    () => compareSnowballAndAvalanche(payoffInputs, extraPayment),
    [payoffInputs, extraPayment],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Snowball vs. avalanche</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ExtraPaymentInput
          value={extraPaymentRaw}
          onChange={setExtraPaymentRaw}
          error={extraPaymentError}
        />

        {comparison.isIdentical && (
          <p className="text-sm text-muted-foreground">
            {extraPayment <= 0
              ? "Add an extra payment amount above to see how each strategy differs."
              : "With only one active debt, there's no order to compare — both strategies are identical."}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StrategyPanel
            title="Snowball"
            description="Smallest balance first"
            summary={comparison.snowball}
            debtNameById={debtNameById}
          />
          <StrategyPanel
            title="Avalanche"
            description="Highest interest rate first"
            summary={comparison.avalanche}
            debtNameById={debtNameById}
          />
        </div>
      </CardContent>
    </Card>
  )
}

interface StrategyPanelProps {
  title: string
  description: string
  summary: ReturnType<typeof compareSnowballAndAvalanche>["snowball"]
  debtNameById: Map<string, string>
}

function StrategyPanel({ title, description, summary, debtNameById }: StrategyPanelProps) {
  const isVeryLong = summary.monthsToDebtFree >= VERY_LONG_PAYOFF_MONTHS

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <div>
        <p className="font-heading text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-heading text-xl font-semibold text-foreground">
          {formatMonthsToDebtFree(summary.monthsToDebtFree)}
        </span>
        <span className="text-xs text-muted-foreground">to debt-free</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(summary.totalInterestPaid)}
        </span>
        <span className="text-xs text-muted-foreground">total interest paid</span>
      </div>

      {isVeryLong && (
        <Badge variant="destructive" className="w-fit">
          Unrealistically long at this pace
        </Badge>
      )}

      {summary.payoffOrder.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-1">
          <span className="text-xs font-medium text-foreground">Payoff order</span>
          <ol className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {summary.payoffOrder.map((debtId, index) => (
              <li key={debtId}>
                {index + 1}. {debtNameById.get(debtId) ?? "Unknown debt"}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
