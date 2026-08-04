"use client"

/**
 * FinancialHealthScoreHeadlineCard — the Financial Health Score detail
 * page's (`app/(dashboard)/financial-health-score/page.tsx`) big score
 * summary card, extracted into its own Client Component so this headline
 * figure can use `AnimatedNumber` (Number Counters, Phase 5b) — the fifth
 * instance of this phase's recurring "named AC6 surface skipped" defect
 * (docs/release/phase-5b-fourth-pass.md): Number Counters AC6 names this
 * exact page ("Financial Health Score detail... the score itself plus
 * subscores"), and the subscore grid (`FinancialHealthScoreBreakdownGrid`)
 * was already correctly wired, but this page's own big score never was —
 * missed by every prior sweep in this phase since it uses `text-5xl`, a
 * size class none of those greps checked.
 *
 * Receives only plain, already-computed, serializable props — no function
 * crosses the Server/Client boundary, mirroring every other fix in this
 * same chain (`goal-detail-progress-card.tsx`, `holding-detail-stats-card.tsx`,
 * `total-active-debt-card.tsx`).
 */

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent } from "@/components/ui/card"

export interface FinancialHealthScoreHeadlineCardProps {
  score: number
  label: string
  labelClassName: string
  missingHintsText: string | null
}

export function FinancialHealthScoreHeadlineCard({
  score,
  label,
  labelClassName,
  missingHintsText,
}: FinancialHealthScoreHeadlineCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
        <AnimatedNumber
          value={score}
          format={(n) => Math.round(n).toString()}
          className="font-heading text-5xl font-semibold text-foreground"
        />
        <span className={cn("text-base font-medium", labelClassName)}>
          {label}
        </span>
        {missingHintsText && (
          <p className="max-w-sm text-xs text-muted-foreground">
            {missingHintsText}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
