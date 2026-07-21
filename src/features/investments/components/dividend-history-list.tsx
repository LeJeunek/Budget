/**
 * DividendHistoryList — a single holding's logged dividend receipts
 * (docs/product/investments.md AC8), rendered on the holding detail view
 * (app/(dashboard)/investments/[holdingId]/page.tsx).
 *
 * Read-only (no delete action exists for a `DividendEntry` in
 * `server/actions.ts`), so this is a Server Component — same rationale as
 * `value-history-list.tsx`.
 */

import type { DividendEntry } from "@/features/investments/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface DividendHistoryListProps {
  dividends: DividendEntry[]
}

export function DividendHistoryList({ dividends }: DividendHistoryListProps) {
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
              {formatCurrency(dividend.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
