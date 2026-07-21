/**
 * ValueHistoryList — a single holding's timestamped current-value update
 * history (docs/product/investments.md AC4/AC7), rendered on the holding
 * detail view (app/(dashboard)/investments/[holdingId]/page.tsx).
 *
 * Read-only (no delete action exists for a `HoldingValueHistoryEntry` in
 * `server/actions.ts` — every entry is an immutable audit record of a past
 * edit, not a user-editable log like Goals' contributions), so this is a
 * Server Component, unlike `features/goals/components/
 * contribution-history-list.tsx`, which needs client state for its
 * per-row delete confirmation.
 */

import type { HoldingValueHistoryEntry } from "@/features/investments/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface ValueHistoryListProps {
  entries: HoldingValueHistoryEntry[]
}

export function ValueHistoryList({ entries }: ValueHistoryListProps) {
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
              {formatCurrency(entry.previousValue)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(entry.newValue)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
