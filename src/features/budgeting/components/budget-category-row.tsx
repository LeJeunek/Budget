"use client"

/**
 * BudgetCategoryRow — one category's line in the monthly budget planner
 * (docs/product/budgeting.md AC6-AC9). Renders the category's color swatch
 * and name, an inline Allocated input (editable only when the month is
 * editable — AC3), Spent (always shown, even when unbudgeted — AC9),
 * Remaining, and a `Progress` bar with a distinct over-budget visual state
 * (AC8).
 *
 * Composed entirely from existing primitives (`components/ui/input.tsx`,
 * `components/ui/progress.tsx`, `components/ui/badge.tsx`) per this role's
 * "never build reusable components" boundary — the over-budget bar color is
 * achieved via a Tailwind child-selector on `Progress`'s own `className`
 * prop (targeting its `data-slot="progress-indicator"` child), not by
 * editing `components/ui/progress.tsx` itself, which is owned by the UI
 * Component Engineer.
 *
 * Saves on input blur via `setCategoryAllocation` (server/actions.ts) — no
 * separate "Save" button, matching this app's inline-edit convention
 * elsewhere (e.g. account balance edits). AC2's "unset" vs. "set to $0" is
 * kept distinct throughout: an unset allocation renders an empty input with
 * a "Not set" placeholder and no progress bar at all (AC9), never a "0" that
 * could be mistaken for a deliberate zero-dollar plan.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { BudgetCategoryLine } from "@/features/budgeting/types"
import { setCategoryAllocation } from "@/features/budgeting/server/actions"
import { cn, formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

export interface BudgetCategoryRowProps {
  /** `"YYYY-MM"` — the month this line belongs to, passed straight through
   * to `setCategoryAllocation`. */
  month: string
  line: BudgetCategoryLine
  /** Resolved `Category.color`, or a neutral fallback for the "Deleted
   * category" historical line (see `page.tsx`'s color lookup — a
   * `BudgetCategoryLine` never carries `color` itself, per
   * `features/budgeting/types.ts`). */
  color: string
  /** `false` for a past month (AC3) — renders the allocation as read-only
   * text instead of an input. */
  isEditable: boolean
}

/** Renders the input's numeric string form for a given allocation — the one
 * place "unset" (`null`) maps to an empty string, so every call site stays
 * consistent with AC2's "unset is not the same as $0" rule. */
function allocationToInputValue(allocated: number | null): string {
  return allocated === null ? "" : String(allocated)
}

export function BudgetCategoryRow({
  month,
  line,
  color,
  isEditable,
}: BudgetCategoryRowProps) {
  const router = useRouter()
  const [inputValue, setInputValue] = useState(() =>
    allocationToInputValue(line.allocated),
  )
  const [isPending, startTransition] = useTransition()

  // Re-syncs the input whenever this line's own allocation changes on the
  // server — the only way that happens is this same row's own successful
  // save below triggering `router.refresh()`, so this never clobbers an
  // in-progress edit in another row or an unrelated re-render.
  useEffect(() => {
    setInputValue(allocationToInputValue(line.allocated))
  }, [line.allocated])

  function commitAllocation() {
    const trimmed = inputValue.trim()

    // Blanking the input is not a "clear allocation" action — the
    // SetAllocationSchema/AC2 contract has no such mutation, only "set to a
    // value" — so an empty blur just reverts to the last known value rather
    // than silently no-op-ing in a way that leaves stale text on screen.
    if (trimmed === "") {
      setInputValue(allocationToInputValue(line.allocated))
      return
    }

    const amount = Number(trimmed)
    if (!Number.isFinite(amount) || amount < 0 || amount === line.allocated) {
      if (amount !== line.allocated) {
        setInputValue(allocationToInputValue(line.allocated))
      }
      return
    }

    startTransition(async () => {
      const result = await setCategoryAllocation({
        month,
        categoryId: line.categoryId,
        amount,
      })

      if (!result.success) {
        toast.error(result.error)
        setInputValue(allocationToInputValue(line.allocated))
        return
      }

      // Re-runs the Server Component page's getBudgetMonth() call — see
      // app/(dashboard)/budgeting/page.tsx, same router.refresh() pattern
      // features/accounts/components/account-form.tsx uses after a mutation.
      router.refresh()
    })
  }

  const hasPlan = line.allocated !== null
  const clampedPercent =
    line.percentUsed === null ? 0 : Math.min(100, line.percentUsed)

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
        {isEditable ? (
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Not set"
            value={inputValue}
            disabled={isPending}
            onChange={(event) => setInputValue(event.target.value)}
            onBlur={commitAllocation}
            className="h-8 w-full max-w-28"
            aria-label={`Allocated amount for ${line.categoryName}`}
          />
        ) : hasPlan ? (
          <span className="text-sm text-foreground">
            {formatCurrency(line.allocated as number)}
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
          {formatCurrency(line.spent)}
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
            {formatCurrency(line.remaining)}
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
                {Math.round(line.percentUsed as number)}%
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
