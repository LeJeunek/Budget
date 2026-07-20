/**
 * BudgetSummaryCards — month-level Total Allocated/Spent/Remaining
 * (docs/product/budgeting.md AC10), plus a visually separate informational
 * line for spend on transactions with no category at all this month.
 *
 * Composed entirely from the existing `StatCard` (`components/shared/
 * stat-card.tsx`) per this role's "never build reusable components"
 * boundary — no new primitive is introduced here, only wiring.
 *
 * AC10 / Edge Cases ("Uncategorized spending") are explicit that
 * `uncategorizedSpent` must never be folded into the Total figures, and the
 * UI must not mislead the user into thinking category totals already
 * account for it. Rendering it as a fourth `StatCard` alongside the other
 * three would give it the same visual weight as a real "Total" and risk
 * exactly that misread, so it's deliberately rendered as a separate, more
 * muted note below the stat grid instead — distinct in both layout and
 * styling, not just in the number itself.
 */

import { formatCurrency } from "@/lib/utils"
import { StatCard } from "@/components/shared/stat-card"
import type { BudgetMonthTotals } from "@/features/budgeting/types"

export interface BudgetSummaryCardsProps {
  totals: BudgetMonthTotals
  uncategorizedSpent: number
}

export function BudgetSummaryCards({
  totals,
  uncategorizedSpent,
}: BudgetSummaryCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Allocated"
          value={formatCurrency(totals.totalAllocated)}
        />
        <StatCard label="Total Spent" value={formatCurrency(totals.totalSpent)} />
        <StatCard
          label="Total Remaining"
          value={formatCurrency(totals.totalRemaining)}
        />
      </div>

      <p className="rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Uncategorized spending this month:{" "}
        <span className="font-medium text-foreground">
          {formatCurrency(uncategorizedSpent)}
        </span>
      </p>
    </div>
  )
}
