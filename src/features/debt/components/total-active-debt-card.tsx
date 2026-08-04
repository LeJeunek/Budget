"use client"

/**
 * TotalActiveDebtCard — the Debt page's (`app/(dashboard)/debt/page.tsx`)
 * page-level "Total active debt" summary card, extracted into its own
 * Client Component so this headline figure can use `AnimatedNumber`
 * (Number Counters, Phase 5b) — the same treatment `debt-card.tsx`'s own
 * per-debt balance figures already have (docs/release/phase-5b-second-pass.md
 * §3: this page-level aggregate was the one Debt surface left unwired,
 * pre-existing since Phase 4c, never caught until this pass's own spot-check
 * — Number Counters AC6 names "Debt (`/debt`, balance/payoff figures)"
 * without a per-card/page-level carve-out).
 *
 * Receives only a plain, already-computed number plus a `currencyDisplay`
 * string — no function crosses the Server/Client boundary, mirroring
 * `goal-detail-progress-card.tsx`/`holding-detail-stats-card.tsx`'s
 * established fix pattern for the identical prior gaps.
 */

import { formatCurrency as formatCurrencyWithDisplay } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent } from "@/components/ui/card"

export interface TotalActiveDebtCardProps {
  totalActiveBalance: number
  currencyDisplay: string
}

export function TotalActiveDebtCard({
  totalActiveBalance,
  currencyDisplay,
}: TotalActiveDebtCardProps) {
  const formatCurrency = (amount: number) =>
    formatCurrencyWithDisplay(amount, currencyDisplay)

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
        <span className="text-sm text-muted-foreground">Total active debt</span>
        <span className="font-heading text-xl font-semibold text-foreground">
          <AnimatedNumber value={totalActiveBalance} format={formatCurrency} />
        </span>
      </CardContent>
    </Card>
  )
}
