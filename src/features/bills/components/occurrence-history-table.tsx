"use client"

/**
 * OccurrenceHistoryTable — a bill's full occurrence/payment history
 * (bills.md AC10), composing the generic `DataTable`
 * (`components/shared/data-table`) per folder-tree.md's note that this
 * component "composes components/shared/data-table" — the one bills
 * component with enough columns/volume (a long-lived bill can accumulate
 * many occurrences) to justify DataTable's built-in sorting/pagination,
 * unlike `bill-list.tsx`'s plain table.
 *
 * Renders the paid-on-time-vs-paid-late distinction (AC10) via a dedicated
 * column driven by `BillOccurrence.wasPaidLate`, kept visually separate from
 * the Upcoming/Due Today/Late/Paid status column — those are two different,
 * orthogonal facts (see `types.ts`'s JSDoc on `OccurrenceStatus`).
 */

import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import type { BillOccurrence } from "@/features/bills/types"
import { unmarkOccurrencePaid } from "@/features/bills/server/actions"
import { OccurrenceStatusBadge } from "@/features/bills/components/occurrence-status-badge"
import { MarkPaidDialog, type MarkPaidOccurrenceSummary } from "@/features/bills/components/mark-paid-dialog"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ResponsiveDataTable, DataTableColumnHeader } from "@/components/shared/data-table"
import { useFormatCurrency } from "@/app/(dashboard)/currency-preference-provider"

export interface OccurrenceHistoryTableProps {
  billId: string
  billName: string
  expectedAmount: number
  occurrences: BillOccurrence[]
}

export function OccurrenceHistoryTable({
  billName,
  expectedAmount,
  occurrences,
}: OccurrenceHistoryTableProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const [markPaidTarget, setMarkPaidTarget] = useState<MarkPaidOccurrenceSummary | null>(null)
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null)

  async function handleUnmark(occurrenceId: string) {
    setUnmarkingId(occurrenceId)
    const result = await unmarkOccurrencePaid({ occurrenceId })
    setUnmarkingId(null)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Occurrence un-marked as paid.")
    router.refresh()
  }

  const columns: ColumnDef<BillOccurrence>[] = [
    {
      accessorKey: "dueDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due date" />,
      cell: ({ row }) => formatDate(row.original.dueDate),
      sortingFn: "datetime",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <OccurrenceStatusBadge status={row.original.status} />,
      // Phase 5a (phase-5a-technical-design.md §3.1): status + paid amount
      // are this table's card-list "primary" columns — the dispatch's own
      // named choice for both occurrence-history tables.
      meta: { cardDisplay: "primary" },
    },
    {
      id: "paidAmount",
      header: "Paid amount",
      cell: ({ row }) =>
        row.original.paidAmount !== null ? formatCurrency(row.original.paidAmount) : "—",
      meta: { cardDisplay: "primary" },
    },
    {
      id: "paidDate",
      header: "Paid date",
      cell: ({ row }) => (row.original.paidDate ? formatDate(row.original.paidDate) : "—"),
    },
    {
      id: "paidVia",
      header: "Paid via",
      cell: ({ row }) =>
        row.original.transactionId ? "Linked transaction" : row.original.paidAmount !== null ? "Manual entry" : "—",
    },
    {
      id: "onTime",
      header: "On time?",
      cell: ({ row }) => {
        const { wasPaidLate } = row.original
        if (wasPaidLate === null) return "—"
        return wasPaidLate ? (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
          >
            Paid late
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
        // Accessibility fix (Bug Hunter, Phase 5a review gate,
        // data-table-row-action-buttons-below-44px-touch-target.md): `sm`
        // alone is 28px tall, below Responsive AC5's binding 44px minimum
        // (width is already comfortably >44px for both labels, so only
        // height needs the override). Renders unchanged in both DataTable's
        // table view and DataTableCardList's mobile card view by design.
        if (occurrence.status === "PAID") {
          return (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11"
              disabled={unmarkingId === occurrence.id}
              onClick={() => handleUnmark(occurrence.id)}
            >
              {unmarkingId === occurrence.id ? "Un-marking..." : "Unmark paid"}
            </Button>
          )
        }
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() =>
              setMarkPaidTarget({
                id: occurrence.id,
                billName,
                dueDate: occurrence.dueDate,
                expectedAmount,
              })
            }
          >
            Mark paid
          </Button>
        )
      },
    },
  ]

  return (
    <>
      <ResponsiveDataTable
        columns={columns}
        data={occurrences}
        emptyMessage="No occurrences yet."
      />

      <MarkPaidDialog
        open={markPaidTarget !== null}
        onOpenChange={(open) => !open && setMarkPaidTarget(null)}
        occurrence={markPaidTarget}
      />
    </>
  )
}
