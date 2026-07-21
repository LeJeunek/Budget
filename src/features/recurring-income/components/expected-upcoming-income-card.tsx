/**
 * ExpectedUpcomingIncomeCard — recurring-income.md AC10's "expected upcoming
 * income" total: the sum of each active, scheduled stream's next occurrence
 * amount within the current month, clearly labeled as an estimate and
 * visually distinct from the Dashboard's actual-transaction-based Monthly
 * Income figure (this card lives on `/income`, never on the Dashboard —
 * `service.getExpectedUpcomingIncome` explicitly shares no code path with
 * `dashboard.service.getMonthlySummary`, per api-contracts.md).
 *
 * Read-only by design: `service.getExpectedUpcomingIncome`'s return shape
 * (`{ total; byStream: { streamId; streamName; nextOccurrenceAmount }[] }`)
 * carries no occurrence id, so unlike Bills' `UpcomingBillsList` this
 * component cannot offer a "Mark received" action per row — marking an
 * occurrence received happens from that stream's own detail page (see
 * `occurrence-history-table.tsx`), which is the one place `IncomeOccurrence`
 * rows (with their ids) are actually returned. Composes
 * `components/shared/stat-card.tsx` for the headline number, matching
 * `features/investments/components/portfolio-overview-cards.tsx`'s
 * precedent for composing that shared primitive rather than hand-rolling a
 * new stat card.
 */

import { Banknote } from "lucide-react"

import type { ExpectedUpcomingIncome } from "@/features/recurring-income/types"
import { StatCard } from "@/components/shared/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

export interface ExpectedUpcomingIncomeCardProps {
  data: ExpectedUpcomingIncome
}

export function ExpectedUpcomingIncomeCard({ data }: ExpectedUpcomingIncomeCardProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <StatCard
        label="Expected upcoming income (this month)"
        value={formatCurrency(data.total)}
        icon={Banknote}
        className="sm:max-w-xs"
      />

      {data.byStream.length > 0 && (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              By source — an estimate, not what&apos;s actually arrived
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {data.byStream.map((entry) => (
              <div key={entry.streamId} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{entry.streamName}</span>
                <span className="text-muted-foreground">{formatCurrency(entry.nextOccurrenceAmount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
