/**
 * IrregularEventHistoryList — recurring-income.md AC11/AC12's read history
 * view for an `IRREGULAR`/One-off stream's logged events. A plain `Table`
 * (not the generic `DataTable`) since a one-off stream's event volume is
 * inherently low (each row is a manually logged, individually-meaningful
 * payment, not a dense generated schedule) — same "don't over-build" call
 * `bill-list.tsx` makes for its own plain-table case.
 *
 * Read-only: there is no unlog/delete/edit action for a logged
 * `IrregularIncomeEvent` (see `irregular-event-form.tsx`'s JSDoc for why —
 * `server/actions.ts` exposes no such action, and no acceptance criterion
 * asks for one), so unlike `occurrence-history-table.tsx` this component has
 * no per-row action column.
 *
 * Per recurring-income.md's Edge Cases ("Irregular stream with zero logged
 * events yet: shown as an explicit 'nothing logged yet' state, not an error
 * or a misleading $0 total"), an empty list renders that explicit message
 * rather than an empty table shell.
 */

import type { IrregularIncomeEvent } from "@/features/recurring-income/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface IrregularEventHistoryListProps {
  events: IrregularIncomeEvent[]
}

export function IrregularEventHistoryList({ events }: IrregularEventHistoryListProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing logged yet — use &quot;Log income&quot; above to record the first payment for this
        stream.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{formatDate(event.date)}</TableCell>
              <TableCell>{formatCurrency(event.amount)}</TableCell>
              <TableCell>{event.transactionId ? "Linked transaction" : "Manual entry"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
