/**
 * BudgetHealthScoreBadge — renders `BudgetHealthScore` (docs/product/
 * budgeting.md AC12): a 0-100 score plus its banded label, or an explicit
 * "Not enough data yet" state when the service returns `null` (zero
 * categories with an allocation set for the month — never rendered as a
 * misleading 0 or 100, per AC12's own wording).
 *
 * Built as a full `Card` (mirroring `components/shared/stat-card.tsx`'s own
 * `Card`/`CardHeader`/`CardContent` structure) rather than a bare inline
 * value, so both consumers — this feature's own planner page and the
 * Dashboard (AC12) — can drop it straight into a stat grid alongside plain
 * `StatCard`s without each page re-implementing the same wrapper markup
 * (this role's "avoid duplication" rule). Composed entirely from existing
 * `components/ui` primitives (`Card`, `Gauge` icon) — no new reusable
 * primitive is introduced.
 *
 * Band colors (`Good` = emerald, `Fair` = amber, `Needs attention` = the
 * `destructive` theme token) follow the same "raw Tailwind palette class for
 * a semantic up/down/warn signal" convention `StatCard`'s own trend styling
 * and `account-card.tsx`'s negative-balance styling already use elsewhere in
 * this app — `src/app/globals.css`'s theme tokens have no green/amber
 * equivalents to reuse (its palette is grayscale plus a single `destructive`
 * red), so this follows the codebase's existing precedent for this exact
 * situation rather than inventing a new custom color in `globals.css`.
 */

import { Gauge } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { BudgetHealthScore } from "@/features/budgeting/types"

export interface BudgetHealthScoreBadgeProps {
  score: BudgetHealthScore | null
  className?: string
}

const LABEL_STYLES: Record<BudgetHealthScore["label"], string> = {
  Good: "text-emerald-600 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  "Needs attention": "text-destructive",
}

export function BudgetHealthScoreBadge({
  score,
  className,
}: BudgetHealthScoreBadgeProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <span className="text-sm text-muted-foreground">
          Budget Health Score
        </span>
        <Gauge
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {score === null ? (
          <span className="font-heading text-2xl font-semibold text-muted-foreground">
            Not enough data yet
          </span>
        ) : (
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-2xl font-semibold text-foreground">
              {score.score}
            </span>
            <span
              className={cn("text-sm font-medium", LABEL_STYLES[score.label])}
            >
              {score.label}
            </span>
          </span>
        )}
      </CardContent>
    </Card>
  )
}
