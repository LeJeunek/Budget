"use client"

/**
 * FinancialHealthScoreBadge — the Dashboard summary card for the Financial
 * Health Score (docs/product/ai-features.md Feature 5 AC8: "surfaced on the
 * Dashboard [as] a summary card"). Mirrors
 * `features/budgeting/components/budget-health-score-badge.tsx`'s exact
 * `Card`/`CardHeader`/`CardContent` structure and null/banded-label handling
 * — this codebase's established pattern for a 0-100-plus-band score card —
 * so the two "Health Score" surfaces (naming-adjacency, Reasoning point 6)
 * read as siblings, not two unrelated widgets.
 *
 * Zero AI dependency (Feature 5's own strongest degradation guarantee) — this
 * card renders `FinancialHealthScoreBreakdown`, a plain deterministic value,
 * never `AiFeatureResult`-wrapped, so its correctness/availability can never
 * be affected by the AI provider.
 *
 * Reused by the Dashboard page (`app/(dashboard)/_lib/dashboard-card-groups.tsx`,
 * itself rendered from a Server Component page). Links to the dedicated
 * detail view (AC8's "a dedicated detail view showing the full four-component
 * breakdown, the historical trend, and the narrative").
 *
 * **Phase 5b addition (Number Counters):** gained its own "use client"
 * directive here — it was a Server Component before this phase (previously
 * "no 'use client' needed — nothing here is interactive beyond a plain
 * `<Link>`"). Wiring `AnimatedNumber` (`@/components/shared/motion`, a
 * Client Component) in requires it: this component is reached from the
 * Dashboard's own Server Component page via `dashboard-card-groups.tsx`'s
 * render registry, so its JSX previously executed inside a genuine Server
 * Component render pass — a Server Component's JSX cannot pass a function
 * prop directly to a Client Component (confirmed empirically: a 500
 * "Functions cannot be passed directly to Client Components" error before
 * this directive was added). Costs nothing architecturally — `breakdown`
 * still arrives as an already-resolved prop either way.
 */

import Link from "next/link"
import { HeartPulse } from "lucide-react"

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { FinancialHealthScoreBreakdown } from "@/features/financial-health-score/types"

export interface FinancialHealthScoreBadgeProps {
  breakdown: FinancialHealthScoreBreakdown
  className?: string
}

// Same band colors as `BudgetHealthScoreBadge`'s identical `LABEL_STYLES` —
// duplicated locally rather than imported cross-feature, per this codebase's
// "features/<domain> modules don't cross-import each other's types/constants"
// module boundary convention (see `financial-health-score/types.ts`'s own
// note on why `FinancialHealthScoreLabel` isn't imported from Budgeting).
const LABEL_STYLES: Record<
  NonNullable<FinancialHealthScoreBreakdown["label"]>,
  string
> = {
  // Accessibility fix (docs/testing/e2e/accessibility-run-report.md's
  // 2026-08-02 re-run, finding #1, axe `color-contrast`): emerald-600 on
  // white measured 3.65:1, below the 4.5:1 floor — emerald-700 clears it
  // (dark mode's emerald-400 was already passing, left unchanged).
  Good: "text-emerald-700 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  // Accessibility fix: raw `text-destructive` (not routed through
  // Button/Badge/DropdownMenuItem's own already-fixed variants) shares the
  // identical below-4.5:1-on-white problem those fixes closed — same
  // replacement used directly here, not yet exercised by axe's crawl (no
  // current fixture data reaches a "Needs attention" health score) but a
  // near-certain latent instance of the same finding.
  "Needs attention": "text-red-700 dark:text-red-400",
}

export function FinancialHealthScoreBadge({
  breakdown,
  className,
}: FinancialHealthScoreBadgeProps) {
  return (
    <Link href="/financial-health-score" className="block">
      <Card className={cn("transition-colors hover:bg-muted/40", className)}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <span className="text-sm text-muted-foreground">
            Financial Health Score
          </span>
          <HeartPulse
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {breakdown.score === null || breakdown.label === null ? (
            // AC4/Edge Cases: zero computable components — never a
            // misleading 0, an explicit "not enough data yet" state instead.
            <span className="font-heading text-2xl font-semibold text-muted-foreground">
              Not enough data yet
            </span>
          ) : (
            <>
              <span className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={breakdown.score}
                  format={(n) => Math.round(n).toString()}
                  className="font-heading text-2xl font-semibold text-foreground"
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    LABEL_STYLES[breakdown.label],
                  )}
                >
                  {breakdown.label}
                </span>
              </span>
              {breakdown.undefinedComponents.length > 0 && (
                // AC4: "clearly annotated" partial score.
                <span className="text-xs text-muted-foreground">
                  Based on {4 - breakdown.undefinedComponents.length} of 4
                  factors
                </span>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
