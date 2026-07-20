"use client"

/**
 * BillList — the "all active bills" table (bills.md AC3: name, expected
 * amount, next due date, recurring schedule) plus an Edit/Archive action
 * menu per row (AC4/AC5).
 *
 * A plain shadcn `Table` composition rather than the generic `DataTable` —
 * unlike `occurrence-history-table.tsx`, this list has no
 * sort/filter/pagination requirement in the spec (AC3 just says "a list"),
 * so the added complexity of wiring up TanStack Table isn't justified here,
 * matching `folder-tree.md`'s reasoning for why Budgeting's allocation table
 * skips a query hook it doesn't need.
 *
 * Works for both the active and archived tabs (bills-client.tsx renders one
 * instance per tab, mirroring accounts/page.tsx's Active/Archived split) —
 * each row's own `bill.archivedAt` decides whether it offers "Archive" or
 * "Unarchive", same as `account-card.tsx`'s single-component-handles-both-
 * states pattern.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { BillWithNextOccurrence } from "@/features/bills/types"
import { archiveBill, unarchiveBill } from "@/features/bills/server/actions"
import { BillFormDialog, BILL_SCHEDULE_LABELS } from "@/features/bills/components/bill-form"
import { OccurrenceStatusBadge } from "@/features/bills/components/occurrence-status-badge"
import type { Category } from "@/features/categories/types"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface BillListProps {
  bills: BillWithNextOccurrence[]
  categories: Category[]
  emptyMessage?: string
}

export function BillList({ bills, categories, emptyMessage = "No bills." }: BillListProps) {
  if (bills.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Expected amount</TableHead>
            <TableHead>Next due date</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <BillRow key={bill.id} bill={bill} categories={categories} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function BillRow({
  bill,
  categories,
}: {
  bill: BillWithNextOccurrence
  categories: Category[]
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = bill.archivedAt !== null

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveBill : archiveBill
    const result = await action({ id: bill.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Bill restored" : "Bill archived")
    // Re-runs the Server Component page's getBills() calls — see
    // app/(dashboard)/bills/page.tsx.
    router.refresh()
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium text-foreground">
          <Link href={`/bills/${bill.id}`} className="hover:underline">
            {bill.name}
          </Link>
        </TableCell>
        <TableCell>{formatCurrency(bill.expectedAmount)}</TableCell>
        <TableCell>
          {bill.nextOccurrence ? formatDate(bill.nextOccurrence.dueDate) : "—"}
        </TableCell>
        <TableCell>{BILL_SCHEDULE_LABELS[bill.schedule]}</TableCell>
        <TableCell>
          {bill.nextOccurrence ? (
            <OccurrenceStatusBadge status={bill.nextOccurrence.status} />
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${bill.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/bills/${bill.id}`}>View details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant={isArchived ? "default" : "destructive"}
                disabled={isTogglingArchive}
                onSelect={handleArchiveToggle}
              >
                {isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <BillFormDialog bill={bill} categories={categories} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
