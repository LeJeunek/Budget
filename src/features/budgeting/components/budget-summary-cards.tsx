"use client"

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
 *
 * **Phase 5b addition (Number Counters):** this file gains its own "use
 * client" directive here — it was a Server Component before this phase (its
 * own JSDoc previously read that way; `app/(dashboard)/budgeting/page.tsx`'s
 * own comment on this component predates this change too). Wiring
 * `AnimatedNumber` (`@/components/shared/motion`, a Client Component) in
 * requires it: a Server Component's JSX cannot pass a function prop (the
 * `format` callback closing over `currency`) directly to a Client Component
 * — React Server Components can only serialize plain data across that
 * boundary, never a closure — confirmed empirically (a 500 "Functions
 * cannot be passed directly to Client Components" error) before this
 * directive was added. This component has no data-fetching of its own
 * (`totals`/`uncategorizedSpent`/`currency` all arrive as already-resolved
 * props from its Server Component parent), so converting it costs nothing
 * architecturally — only the `format` closures below now execute inside
 * this file's own client boundary instead of crossing into one.
 */

import { formatCurrency } from "@/lib/utils"
import { StatCard } from "@/components/shared/stat-card"
import { AnimatedNumber } from "@/components/shared/motion"
import type { BudgetMonthTotals } from "@/features/budgeting/types"

export interface BudgetSummaryCardsProps {
  totals: BudgetMonthTotals
  uncategorizedSpent: number
  /** The caller's resolved `UserPreference.currencyDisplay`
   * (docs/release/phase-4c-notes.md Section 1) — this is a Server Component
   * (no hooks/interactivity of its own — see this file's header comment), so
   * `app/(dashboard)/budgeting/page.tsx` resolves this once and passes it
   * straight through rather than this component reading a Context. */
  currency: string
}

export function BudgetSummaryCards({
  totals,
  uncategorizedSpent,
  currency,
}: BudgetSummaryCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Allocated"
          value={
            <AnimatedNumber
              value={totals.totalAllocated}
              format={(n) => formatCurrency(n, currency)}
            />
          }
        />
        <StatCard
          label="Total Spent"
          value={
            <AnimatedNumber
              value={totals.totalSpent}
              format={(n) => formatCurrency(n, currency)}
            />
          }
        />
        <StatCard
          label="Total Remaining"
          value={
            <AnimatedNumber
              value={totals.totalRemaining}
              format={(n) => formatCurrency(n, currency)}
            />
          }
        />
      </div>

      <p className="rounded-md border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Uncategorized spending this month:{" "}
        <span className="font-medium text-foreground">
          {formatCurrency(uncategorizedSpent, currency)}
        </span>
      </p>
    </div>
  )
}
