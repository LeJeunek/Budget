/**
 * DemoValueHistoryList — read-only presentational twin of
 * `features/investments/components/value-history-list.tsx`, built for the
 * public `/demo` route (docs/architecture/public-demo-technical-design.md
 * §3.3).
 *
 * The real component is already read-only (no delete action exists for a
 * `HoldingValueHistoryEntry` — see that file's own JSDoc), so this twin is a
 * byte-for-byte rendering match under a demo-scoped name — kept as its own
 * file (not a re-export) so every demo twin follows the same
 * `demo-<name>.tsx` naming convention (§3.3) and so a future change to the
 * real component's display fields has an explicit, discoverable twin to
 * keep in sync.
 *
 * Usage:
 * ```tsx
 * <DemoValueHistoryList entries={holding.valueHistory} />
 * ```
 */

import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { HoldingValueHistoryEntry } from "@/features/investments/types"

export interface DemoValueHistoryListProps {
  entries: HoldingValueHistoryEntry[]
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoValueHistoryList({
  entries,
  currency = "USD",
}: DemoValueHistoryListProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No value updates recorded yet — every edit to this holding&apos;s
        current value will appear here.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Previous value</TableHead>
          <TableHead className="text-right">New value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{formatDate(entry.recordedAt)}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(entry.previousValue, currency)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(entry.newValue, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
