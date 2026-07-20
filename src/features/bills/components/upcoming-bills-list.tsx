"use client"

/**
 * UpcomingBillsList — bills.md AC9's "upcoming list": every active bill's
 * next unpaid occurrence, sorted by due date ascending (the sort itself
 * already happened server-side in `service.getUpcomingOccurrences`, this
 * component just renders it). Each row gets a "Mark paid" action so a user
 * can act on what's coming due without navigating away first.
 */

import { useState } from "react"
import Link from "next/link"

import type { UpcomingOccurrence } from "@/features/bills/types"
import { OccurrenceStatusBadge } from "@/features/bills/components/occurrence-status-badge"
import { MarkPaidDialog, type MarkPaidOccurrenceSummary } from "@/features/bills/components/mark-paid-dialog"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface UpcomingBillsListProps {
  occurrences: UpcomingOccurrence[]
}

export function UpcomingBillsList({ occurrences }: UpcomingBillsListProps) {
  const [markPaidTarget, setMarkPaidTarget] = useState<MarkPaidOccurrenceSummary | null>(null)

  if (occurrences.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing upcoming — every active bill is either paid or has no bills yet.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Bill</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {occurrences.map((occurrence) => (
              <TableRow key={occurrence.occurrenceId}>
                <TableCell className="font-medium text-foreground">
                  <Link href={`/bills/${occurrence.billId}`} className="hover:underline">
                    {occurrence.billName}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(occurrence.dueDate)}</TableCell>
                <TableCell>{formatCurrency(occurrence.expectedAmount)}</TableCell>
                <TableCell>
                  <OccurrenceStatusBadge status={occurrence.status} />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMarkPaidTarget({
                        id: occurrence.occurrenceId,
                        billName: occurrence.billName,
                        dueDate: occurrence.dueDate,
                        expectedAmount: occurrence.expectedAmount,
                      })
                    }
                  >
                    Mark paid
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <MarkPaidDialog
        open={markPaidTarget !== null}
        onOpenChange={(open) => !open && setMarkPaidTarget(null)}
        occurrence={markPaidTarget}
      />
    </>
  )
}
