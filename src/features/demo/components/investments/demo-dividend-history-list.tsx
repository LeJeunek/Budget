/**
 * DemoDividendHistoryList — read-only presentational twin of
 * `features/investments/components/dividend-history-list.tsx`, built for
 * the public `/demo` route
 * (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * The real component is already read-only (no delete action exists for a
 * `DividendEntry` — see that file's own JSDoc), so this twin is a
 * byte-for-byte rendering match under a demo-scoped name — same "kept as
 * its own file for naming-convention consistency" rationale as
 * `demo-value-history-list.tsx`.
 *
 * Usage:
 * ```tsx
 * <DemoDividendHistoryList dividends={holding.dividends} />
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

import type { DividendEntry } from "@/features/investments/types"

export interface DemoDividendHistoryListProps {
  dividends: DividendEntry[]
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoDividendHistoryList({
  dividends,
  currency = "USD",
}: DemoDividendHistoryListProps) {
  if (dividends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No dividends logged yet for this holding.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dividends.map((dividend) => (
          <TableRow key={dividend.id}>
            <TableCell>{formatDate(dividend.date)}</TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(dividend.amount, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
