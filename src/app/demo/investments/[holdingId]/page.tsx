import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { HoldingDetailStatsCard } from "@/features/investments/components/holding-detail-stats-card"
import { GrowthChart } from "@/features/investments/components/growth-chart"
import { ASSET_TYPE_LABELS, SECTOR_LABELS } from "@/features/investments/components/investment-labels"
import { DemoValueHistoryList } from "@/features/demo/components/investments/demo-value-history-list"
import { DemoDividendHistoryList } from "@/features/demo/components/investments/demo-dividend-history-list"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { computeDemoGrowthHistory } from "@/features/demo/fixtures/investments"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * `/demo/investments/[holdingId]` — the demo equivalent of
 * `app/(dashboard)/investments/[holdingId]/page.tsx`, per
 * docs/architecture/public-demo-technical-design.md §3.2's Investments row
 * and §7's lookup-plus-`notFound()` shape.
 *
 * `HoldingDetailStatsCard`/`GrowthChart` are reused directly (props-only,
 * confirmed by direct read — `GrowthChart`'s `useFormatCurrency()`/
 * `useCurrencyDisplay()` calls are satisfied by `layout.tsx`'s mounted
 * `CurrencyPreferenceProvider`). `DemoValueHistoryList`/
 * `DemoDividendHistoryList` replace the real `ValueHistoryList`/
 * `DividendHistoryList` (both omit the per-row delete button, per design doc
 * §3.3's "named exception with a caveat").
 */
export default async function DemoHoldingDetailPage({
  params,
}: {
  params: Promise<{ holdingId: string }>
}) {
  const { holdingId } = await params
  const household = getDemoHousehold()
  const holding = household.holdings.find((candidate) => candidate.id === holdingId)

  if (!holding) {
    notFound()
  }

  const container = household.accounts.find((account) => account.id === holding.accountId)
  const growthHistory = computeDemoGrowthHistory(holding)
  const totalDividends = holding.dividends.reduce((sum, dividend) => sum + dividend.amount, 0)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/demo/investments"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Investments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            {holding.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{ASSET_TYPE_LABELS[holding.assetType]}</Badge>
            {holding.sector && (
              <Badge variant="outline">{SECTOR_LABELS[holding.sector]}</Badge>
            )}
            {holding.closedAt !== null && <Badge variant="secondary">Closed</Badge>}
          </div>
          {container && (
            <p className="text-sm text-muted-foreground">Under {container.name}</p>
          )}
        </div>
      </div>

      <HoldingDetailStatsCard
        currentValue={holding.currentValue}
        costBasis={holding.costBasis}
        gainLossAmount={holding.gainLossAmount}
        gainLossPercent={holding.gainLossPercent}
        totalDividends={totalDividends}
        currencyDisplay="USD"
      />

      <GrowthChart title="Growth history" data={growthHistory} />

      <Card>
        <CardHeader>
          <CardTitle>Value update history</CardTitle>
        </CardHeader>
        <CardContent>
          <DemoValueHistoryList entries={holding.valueHistory} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dividend history</CardTitle>
        </CardHeader>
        <CardContent>
          <DemoDividendHistoryList dividends={holding.dividends} />
        </CardContent>
      </Card>
    </div>
  )
}
