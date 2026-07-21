/**
 * IncomeOccurrenceStatusBadge — the single source of the
 * Upcoming/Expected Today/Not Yet Received/Received visual treatment
 * (recurring-income.md AC7). Mirrors
 * `features/bills/components/occurrence-status-badge.tsx`'s role/structure
 * exactly, with this domain's own vocabulary and a deliberately calmer color
 * treatment for `NOT_YET_RECEIVED` than Bills' `LATE` — AC7 is explicit that
 * "Not Yet Received" is a neutral, non-urgent status ("a delayed paycheck or
 * dividend is not the user's fault or something urgent to fix, unlike a late
 * bill payment"), so unlike Bills' `LATE` (solid destructive badge), this
 * status intentionally never uses the destructive variant.
 *
 * Extracted into its own small file for the same "avoid duplication" reason
 * as Bills' equivalent: `income-stream-list.tsx`, `occurrence-history-table.tsx`,
 * and `mark-received-dialog.tsx` all need to render the same four statuses
 * without drifting out of sync on label/color.
 */

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { IncomeOccurrenceStatus } from "@/features/recurring-income/types"

const STATUS_LABEL: Record<IncomeOccurrenceStatus, string> = {
  UPCOMING: "Upcoming",
  EXPECTED_TODAY: "Expected Today",
  NOT_YET_RECEIVED: "Not Yet Received",
  RECEIVED: "Received",
}

// All four statuses use the `outline` badge variant (never `destructive`) —
// see this file's JSDoc for why `NOT_YET_RECEIVED` deliberately reads as
// neutral, not urgent, unlike Bills' `LATE`.
const STATUS_CLASSNAME: Record<IncomeOccurrenceStatus, string> = {
  UPCOMING: "border-border text-muted-foreground",
  EXPECTED_TODAY:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  NOT_YET_RECEIVED:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  RECEIVED:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
}

export interface IncomeOccurrenceStatusBadgeProps {
  status: IncomeOccurrenceStatus
  className?: string
}

export function IncomeOccurrenceStatusBadge({
  status,
  className,
}: IncomeOccurrenceStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASSNAME[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
