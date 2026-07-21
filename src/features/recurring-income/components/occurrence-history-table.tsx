"use client"

/**
 * OccurrenceHistoryTable — a scheduled income stream's full occurrence
 * history (recurring-income.md AC12), composing the generic `DataTable`
 * (`components/shared/data-table`). Mirrors
 * `features/bills/components/occurrence-history-table.tsx`'s structure/role
 * exactly, including its "own file for the DataTable-worthy history view,
 * separate from the plain-Table stream list" split.
 *
 * Renders the received-on-time-vs-received-late distinction (AC12) via a
 * dedicated column driven by `IncomeOccurrence.wasReceivedLate`, kept
 * visually separate from the Upcoming/Expected Today/Not Yet Received/
 * Received status column — same "two different, orthogonal facts" rationale
 * as Bills' equivalent column split (see `types.ts`'s JSDoc on
 * `IncomeOccurrenceStatus`/`IncomeOccurrence.wasReceivedLate`).
 *
 * This component only renders for non-`IRREGULAR` streams (`getStreamById`
 * returns `occurrences` only for those) — see
 * `income-stream-detail-client.tsx` for the branch that decides between this
 * and `irregular-event-history-list.tsx`.
 */

import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import type { IncomeOccurrence } from "@/features/recurring-income/types"
import { unmarkOccurrenceReceived } from "@/features/recurring-income/server/actions"
import { IncomeOccurrenceStatusBadge } from "@/features/recurring-income/components/occurrence-status-badge"
import {
  MarkReceivedDialog,
  type MarkReceivedOccurrenceSummary,
} from "@/features/recurring-income/components/mark-received-dialog"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, DataTableColumnHeader } from "@/components/shared/data-table"

export interface OccurrenceHistoryTableProps {
  streamName: string
  expectedAmount: number | null
  occurrences: IncomeOccurrence[]
}

export function OccurrenceHistoryTable({
  streamName,
  expectedAmount,
  occurrences,
}: OccurrenceHistoryTableProps) {
  const router = useRouter()
  const [markReceivedTarget, setMarkReceivedTarget] = useState<MarkReceivedOccurrenceSummary | null>(null)
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null)

  async function handleUnmark(occurrenceId: string) {
    setUnmarkingId(occurrenceId)
    const result = await unmarkOccurrenceReceived({ occurrenceId })
    setUnmarkingId(null)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Occurrence un-marked as received.")
    router.refresh()
  }

  const columns: ColumnDef<IncomeOccurrence>[] = [
    {
      accessorKey: "expectedDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expected date" />,
      cell: ({ row }) => formatDate(row.original.expectedDate),
      sortingFn: "datetime",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <IncomeOccurrenceStatusBadge status={row.original.status} />,
    },
    {
      id: "receivedAmount",
      header: "Received amount",
      cell: ({ row }) =>
        row.original.receivedAmount !== null ? formatCurrency(row.original.receivedAmount) : "—",
    },
    {
      id: "receivedDate",
      header: "Received date",
      cell: ({ row }) => (row.original.receivedDate ? formatDate(row.original.receivedDate) : "—"),
    },
    {
      id: "receivedVia",
      header: "Received via",
      cell: ({ row }) =>
        row.original.transactionId
          ? "Linked transaction"
          : row.original.receivedAmount !== null
            ? "Manual entry"
            : "—",
    },
    {
      id: "onTime",
      header: "On time?",
      cell: ({ row }) => {
        const { wasReceivedLate } = row.original
        if (wasReceivedLate === null) return "—"
        return wasReceivedLate ? (
          <Badge
            variant="outline"
            className="border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            Received late
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          >
            On time
          </Badge>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const occurrence = row.original
        if (occurrence.status === "RECEIVED") {
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unmarkingId === occurrence.id}
              onClick={() => handleUnmark(occurrence.id)}
            >
              {unmarkingId === occurrence.id ? "Un-marking..." : "Unmark received"}
            </Button>
          )
        }
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setMarkReceivedTarget({
                id: occurrence.id,
                streamName,
                expectedDate: occurrence.expectedDate,
                expectedAmount,
              })
            }
          >
            Mark received
          </Button>
        )
      },
    },
  ]

  return (
    <>
      <DataTable columns={columns} data={occurrences} emptyMessage="No occurrences yet." />

      <MarkReceivedDialog
        open={markReceivedTarget !== null}
        onOpenChange={(open) => !open && setMarkReceivedTarget(null)}
        occurrence={markReceivedTarget}
      />
    </>
  )
}
