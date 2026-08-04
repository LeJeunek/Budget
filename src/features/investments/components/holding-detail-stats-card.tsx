"use client"

/**
 * HoldingDetailStatsCard — the holding detail page's (`app/(dashboard)/
 * investments/[holdingId]/page.tsx`) four-figure summary card, extracted
 * into its own Client Component so its headline currency figures can use
 * `AnimatedNumber` (Number Counters, Phase 5b) — the same treatment
 * `portfolio-overview-section.tsx`'s own headline figures already have
 * (docs/release/phase-5b-notes.md's Release Manager first-pass REJECT: this
 * route was named explicitly in Number Counters AC6 but never wired, since
 * it's rendered directly by a Server Component page that fetches
 * `getHoldingById`/`getUserPreference` itself and can't become a Client
 * Component wholesale).
 *
 * Receives only plain, already-fetched, serializable data (the four
 * already-computed figures plus a `currencyDisplay` string) — no function
 * props cross the Server/Client boundary, mirroring
 * `goal-detail-progress-card.tsx`'s identical fix for the equivalent Goals
 * detail gap and `dashboard-animated-stat-value.tsx`'s original boundary
 * pattern.
 *
 * The gain/loss figure's sign-dependent color treatment lives inside its own
 * `format` callback (mirroring `portfolio-overview-section.tsx`'s
 * `gainLossText` helper) so the color flips at the true zero-crossing point
 * mid-animation, not only at the final settled value — Number Counters'
 * own documented edge case for exactly this figure shape.
 */

import { cn, formatCurrency as formatCurrencyWithDisplay } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent } from "@/components/ui/card"

export interface HoldingDetailStatsCardProps {
  currentValue: number
  costBasis: number
  gainLossAmount: number
  gainLossPercent: number | null
  totalDividends: number
  currencyDisplay: string
}

export function HoldingDetailStatsCard({
  currentValue,
  costBasis,
  gainLossAmount,
  gainLossPercent,
  totalDividends,
  currencyDisplay,
}: HoldingDetailStatsCardProps) {
  const formatCurrency = (amount: number) =>
    formatCurrencyWithDisplay(amount, currencyDisplay)

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Current value</span>
          <span className="font-heading text-xl font-semibold text-foreground">
            <AnimatedNumber value={currentValue} format={formatCurrency} />
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Cost basis</span>
          <span className="font-heading text-xl font-semibold text-foreground">
            <AnimatedNumber value={costBasis} format={formatCurrency} />
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Gain / loss</span>
          <span className="font-heading text-xl font-semibold">
            <AnimatedNumber
              value={gainLossAmount}
              format={(n) => (
                // Accessibility fix precedent (docs/testing/e2e/
                // accessibility-run-report.md's 2026-08-02 re-run, finding
                // #1, axe `color-contrast`) — see holding-row.tsx's/this
                // page's own prior identical fix/comment for the full
                // reasoning.
                <span
                  className={cn(
                    n < 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {n < 0 ? "" : "+"}
                  {formatCurrency(n)}
                </span>
              )}
            />
            {gainLossPercent !== null &&
              ` (${gainLossPercent >= 0 ? "+" : ""}${gainLossPercent.toFixed(1)}%)`}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Total dividend income
          </span>
          <span className="font-heading text-xl font-semibold text-foreground">
            <AnimatedNumber value={totalDividends} format={formatCurrency} />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
