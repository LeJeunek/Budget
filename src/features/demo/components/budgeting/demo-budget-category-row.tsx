"use client"

/**
 * DemoBudgetCategoryRow — read-only presentational twin of
 * `features/budgeting/components/budget-category-row.tsx`, built for the
 * public `/demo` route (docs/architecture/public-demo-technical-design.md
 * §3.3).
 *
 * Mirrors BudgetCategoryRow's display fields (color swatch, category name,
 * allocated/spent/remaining, a progress bar with a distinct over-budget
 * visual state) but omits the inline-editable Allocated `Input` entirely —
 * the real file imports `setCategoryAllocation` from
 * `@/features/budgeting/server/actions`, which nothing under `/demo` may
 * ever reach, even transitively (public-demo.md Capability 3 AC2).
 * Allocated always renders as read-only text (or "Not set"), never an
 * editable control, regardless of month — `/demo` has no concept of "the
 * current editable month" (Capability 3 AC1), so this twin also drops the
 * real row's `month`/`isEditable` props entirely.
 *
 * Usage:
 * ```tsx
 * <DemoBudgetCategoryRow line={budgetMonth.categories[0]} color="#6366f1" />
 * ```
 */

import { cn, formatCurrency } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

import type { BudgetCategoryLine } from "@/features/budgeting/types"

export interface DemoBudgetCategoryRowProps {
  line: BudgetCategoryLine
  /** Resolved `Category.color`, or a neutral fallback — see the real
   * component's identical prop doc for why this isn't carried on
   * `BudgetCategoryLine` itself. */
  color: string
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoBudgetCategoryRow({
  line,
  color,
  currency = "USD",
}: DemoBudgetCategoryRowProps) {
  const hasPlan = line.allocated !== null
  const clampedPercent = line.percentUsed === null ? 0 : Math.min(100, line.percentUsed)

  return (
    <div className="grid grid-cols-2 items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-medium text-foreground">
          {line.categoryName}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground sm:hidden">
          Allocated
        </span>
        {hasPlan ? (
          <span className="text-sm text-foreground">
            {formatCurrency(line.allocated as number, currency)}
          </span>
        ) : (
          <span className="text-sm italic text-muted-foreground">
            Not set
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground sm:hidden">Spent</span>
        <span className="text-sm text-foreground">
          {formatCurrency(line.spent, currency)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground sm:hidden">
          Remaining
        </span>
        {line.remaining === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "text-sm font-medium",
              line.isOverBudget ? "text-destructive" : "text-foreground",
            )}
          >
            {formatCurrency(line.remaining, currency)}
          </span>
        )}
      </div>

      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
        {hasPlan ? (
          <>
            <div className="flex items-center gap-2">
              <Progress
                value={clampedPercent}
                className={cn(
                  "h-2",
                  line.isOverBudget &&
                    "[&>[data-slot=progress-indicator]]:bg-destructive",
                )}
                aria-label={`${line.categoryName} percent of allocation used`}
              />
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-xs font-medium tabular-nums",
                  line.isOverBudget ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <AnimatedNumber
                  value={line.percentUsed as number}
                  format={(n) => `${Math.round(n)}%`}
                />
              </span>
            </div>
            {line.isOverBudget && (
              <Badge variant="destructive" className="w-fit">
                Over budget
              </Badge>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            No plan set — spend shown, nothing to measure against
          </span>
        )}
      </div>
    </div>
  )
}
