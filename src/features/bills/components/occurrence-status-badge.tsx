/**
 * OccurrenceStatusBadge — the single source of the
 * Upcoming/Due Today/Late/Paid visual treatment (bills.md AC6: "distinct
 * visual treatment ... Late should read as urgent").
 *
 * Extracted into its own small file rather than inlined once in each
 * consumer: `bill-list.tsx` (a bill's next occurrence), `upcoming-bills-
 * list.tsx` (AC9), `occurrence-history-table.tsx` (AC10), and
 * `bill-calendar.tsx` (Calendar v1 AC2) all render the exact same four
 * statuses and must never drift out of sync on label/color — per the
 * company's "avoid duplication" rule. Domain-aware (imports `OccurrenceStatus`
 * from this feature's own `types.ts`), so it lives in `features/bills/
 * components/`, not `components/shared/` (folder-tree.md's boundary: shared
 * building blocks only, no domain knowledge).
 */

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { OccurrenceStatus } from "@/features/bills/types"

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  UPCOMING: "Upcoming",
  DUE_TODAY: "Due Today",
  LATE: "Late",
  PAID: "Paid",
}

// `variant="outline"` as the shared base (matches account-card.tsx's own
// precedent of layering custom color classes on top of the `outline`
// variant) plus a status-specific color. LATE deliberately uses the
// `destructive` badge variant outright (solid-ish red background, not just
// outlined text) rather than the same outline treatment as the others — AC6
// calls for Late to read as more urgent than a simple color swap would
// convey.
const STATUS_CLASSNAME: Record<OccurrenceStatus, string> = {
  UPCOMING: "border-border text-muted-foreground",
  DUE_TODAY:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  LATE: "",
  PAID: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
}

export interface OccurrenceStatusBadgeProps {
  status: OccurrenceStatus
  className?: string
}

export function OccurrenceStatusBadge({ status, className }: OccurrenceStatusBadgeProps) {
  return (
    <Badge
      variant={status === "LATE" ? "destructive" : "outline"}
      className={cn(STATUS_CLASSNAME[status], className)}
    >
      {STATUS_LABEL[status]}
    </Badge>
  )
}
