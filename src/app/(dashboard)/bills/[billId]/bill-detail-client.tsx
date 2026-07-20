"use client"

/**
 * BillDetailClient — client-side composition root for the bill detail page
 * (bills.md AC4/AC5/AC10): bill info, Edit/Archive actions, and the full
 * occurrence/payment history table. Mirrors `transactions-client.tsx`'s
 * split from its Server Component `page.tsx`.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { Bill, BillOccurrence } from "@/features/bills/types"
import { archiveBill, unarchiveBill } from "@/features/bills/server/actions"
import { BillFormDialog, BILL_SCHEDULE_LABELS } from "@/features/bills/components/bill-form"
import { OccurrenceHistoryTable } from "@/features/bills/components/occurrence-history-table"
import type { Category } from "@/features/categories/types"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface BillDetailClientProps {
  bill: Bill & { occurrences: BillOccurrence[] }
  categories: Category[]
}

export function BillDetailClient({ bill, categories }: BillDetailClientProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = bill.archivedAt !== null
  const category = categories.find((c) => c.id === bill.categoryId) ?? null

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
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className={cn(isArchived && "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl">{bill.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{BILL_SCHEDULE_LABELS[bill.schedule]}</Badge>
              {isArchived && <Badge variant="secondary">Archived</Badge>}
              {category && (
                <span
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  {category.name}
                </span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${bill.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        </CardHeader>

        <CardContent className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Expected amount</span>
            <span className="font-heading text-lg font-semibold text-foreground">
              {formatCurrency(bill.expectedAmount)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">First due date</span>
            <span className="text-sm text-foreground">{formatDate(bill.dueDate)}</span>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium text-foreground">Payment history</h2>
        <OccurrenceHistoryTable
          billId={bill.id}
          billName={bill.name}
          expectedAmount={bill.expectedAmount}
          occurrences={bill.occurrences}
        />
      </section>

      <BillFormDialog bill={bill} categories={categories} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}
