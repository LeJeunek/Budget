"use client"

/**
 * IncomeStreamList — the "all income streams" table (recurring-income.md
 * AC4: name, type, schedule, expected amount, next expected date) plus an
 * Edit/Archive action menu per row (AC5/AC6). Mirrors
 * `features/bills/components/bill-list.tsx`'s plain-`Table` composition and
 * its "one component handles both the active and archived tab" pattern
 * exactly.
 *
 * Unlike `BillWithNextOccurrence`, `IncomeStreamSummary` (this feature's
 * `service.getIncomeStreams` return shape) carries only `nextExpectedDate`,
 * not a full next-occurrence status — recurring-income.md's api-contracts.md
 * entry never asked `getIncomeStreams` to also resolve a next-occurrence
 * status, only `getStreamById`'s per-occurrence history does that (see
 * `occurrence-history-table.tsx`). This list therefore shows the date only,
 * with no status badge column, which is a faithful reflection of the backend
 * surface rather than a hidden gap.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { IncomeStreamSummary } from "@/features/recurring-income/types"
import { archiveIncomeStream, unarchiveIncomeStream } from "@/features/recurring-income/server/actions"
import {
  INCOME_SCHEDULE_LABELS,
  INCOME_TYPE_LABELS,
  IncomeStreamFormDialog,
} from "@/features/recurring-income/components/income-stream-form"
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

export interface IncomeStreamListProps {
  streams: IncomeStreamSummary[]
  emptyMessage?: string
}

export function IncomeStreamList({ streams, emptyMessage = "No income streams." }: IncomeStreamListProps) {
  if (streams.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Expected amount</TableHead>
            <TableHead>Next expected date</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {streams.map((stream) => (
            <StreamRow key={stream.id} stream={stream} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function StreamRow({ stream }: { stream: IncomeStreamSummary }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isTogglingArchive, setIsTogglingArchive] = useState(false)

  const isArchived = stream.archivedAt !== null
  const isIrregular = stream.schedule === "IRREGULAR"

  async function handleArchiveToggle() {
    setIsTogglingArchive(true)
    const action = isArchived ? unarchiveIncomeStream : archiveIncomeStream
    const result = await action({ id: stream.id })
    setIsTogglingArchive(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(isArchived ? "Income stream restored" : "Income stream archived")
    // Re-runs the Server Component page's getIncomeStreams() calls — see
    // app/(dashboard)/income/page.tsx.
    router.refresh()
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium text-foreground">
          <Link href={`/income/${stream.id}`} className="hover:underline">
            {stream.name}
          </Link>
        </TableCell>
        <TableCell>{INCOME_TYPE_LABELS[stream.type]}</TableCell>
        <TableCell>{INCOME_SCHEDULE_LABELS[stream.schedule]}</TableCell>
        <TableCell>
          {isIrregular || stream.expectedAmount === null ? "—" : formatCurrency(stream.expectedAmount)}
        </TableCell>
        <TableCell>
          {stream.nextExpectedDate ? formatDate(stream.nextExpectedDate) : "—"}
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${stream.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/income/${stream.id}`}>View details</Link>
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

      <IncomeStreamFormDialog stream={stream} open={editOpen} onOpenChange={setEditOpen} />
    </>
  )
}
