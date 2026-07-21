"use client"

/**
 * IncomeStreamDetailClient — client-side composition root for the income
 * stream detail page (recurring-income.md AC5/AC6/AC11/AC12): stream info,
 * Edit/Archive actions, and the schedule-dependent history view. Mirrors
 * `app/(dashboard)/bills/[billId]/bill-detail-client.tsx`'s split from its
 * Server Component `page.tsx`.
 *
 * The one structural difference from Bills' detail client: this component
 * branches on `stream.schedule === "IRREGULAR"` to decide which history view
 * to render — `OccurrenceHistoryTable` (generated occurrences, every other
 * schedule) or `IrregularEventHistoryList` + a "Log income" trigger
 * (`IrregularIncomeEvent` rows, AC11) — matching `IncomeStreamDetail`'s own
 * discriminated-union shape (`../types.ts`) exactly, since a stream never
 * has both kinds of history at once.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { IncomeStreamDetail } from "@/features/recurring-income/types"
import { archiveIncomeStream, unarchiveIncomeStream } from "@/features/recurring-income/server/actions"
import {
  INCOME_SCHEDULE_LABELS,
  INCOME_TYPE_LABELS,
  IncomeStreamFormDialog,
} from "@/features/recurring-income/components/income-stream-form"
import { OccurrenceHistoryTable } from "@/features/recurring-income/components/occurrence-history-table"
import { IrregularEventHistoryList } from "@/features/recurring-income/components/irregular-event-history-list"
import { LogIncomeEventButton } from "@/features/recurring-income/components/irregular-event-form"
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

export interface IncomeStreamDetailClientProps {
  stream: IncomeStreamDetail
}

export function IncomeStreamDetailClient({ stream }: IncomeStreamDetailClientProps) {
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
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className={cn(isArchived && "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl">{stream.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{INCOME_TYPE_LABELS[stream.type]}</Badge>
              <Badge variant="outline">{INCOME_SCHEDULE_LABELS[stream.schedule]}</Badge>
              {isArchived && <Badge variant="secondary">Archived</Badge>}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${stream.name}`}>
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

        {!isIrregular && (
          <CardContent className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Expected amount</span>
              <span className="font-heading text-lg font-semibold text-foreground">
                {stream.expectedAmount !== null ? formatCurrency(stream.expectedAmount) : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Anchor date</span>
              <span className="text-sm text-foreground">
                {stream.anchorDate ? formatDate(stream.anchorDate) : "—"}
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Narrowed via the `"events" in stream` structural check, not
          `stream.schedule === "IRREGULAR"` — `IncomeStreamDetail`
          (../../../features/recurring-income/types.ts) is a union
          distinguished by which optional array property is present, not by
          a per-branch-literal `schedule` value (both branches type
          `schedule` as the full `IncomeSchedule` enum), so TypeScript can
          only narrow `stream.events`/`stream.occurrences` via a direct
          presence check evaluated at this exact conditional, not through a
          separately-computed boolean. */}
      {"events" in stream ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-medium text-foreground">Logged income</h2>
            <LogIncomeEventButton streamId={stream.id} streamName={stream.name} />
          </div>
          <IrregularEventHistoryList events={stream.events} />
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-medium text-foreground">Receipt history</h2>
          <OccurrenceHistoryTable
            streamName={stream.name}
            expectedAmount={stream.expectedAmount}
            occurrences={stream.occurrences}
          />
        </section>
      )}

      <IncomeStreamFormDialog stream={stream} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}
