import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import {
  getContainers,
  getGrowthHistory,
  getHoldingById,
} from "@/features/investments/server/service"
import { HoldingDetailActions } from "@/features/investments/components/holding-detail-actions"
import { GrowthChart } from "@/features/investments/components/growth-chart"
import { ValueHistoryList } from "@/features/investments/components/value-history-list"
import { DividendHistoryList } from "@/features/investments/components/dividend-history-list"
import {
  ASSET_TYPE_LABELS,
  SECTOR_LABELS,
} from "@/features/investments/components/investment-labels"
import { cn, formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Holding detail — full holding info, gain/loss, growth history, value-
 * update history, and dividend history (docs/product/investments.md
 * AC4/AC6/AC7/AC8), per api-contracts.md's `getHoldingById` +
 * `getGrowthHistory({ holdingId })` rows.
 *
 * Server Component: fetches directly via `service.getHoldingById`/
 * `getGrowthHistory`/`getContainers`, per api-contracts.md's "Server
 * Component direct call" convention, and re-runs on every `router.refresh()`
 * triggered by a mutation in a Client Component child (HoldingDetailActions)
 * — same pattern as app/(dashboard)/goals/[goalId]/page.tsx.
 *
 * `getContainers` is fetched here only to (a) resolve this holding's
 * container name for the "under X" line below and (b) pass to
 * `HoldingDetailActions`' Edit dialog, whose `HoldingFormDialog` always
 * takes a `containers` prop even though edit mode never renders the picker
 * built from it — kept for prop-shape uniformity with every other
 * `HoldingFormDialog` call site (see holding-row.tsx).
 *
 * Next.js 15's App Router passes dynamic route params as a Promise, hence
 * `params: Promise<{ holdingId: string }>` + `await params` below.
 */
export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ holdingId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { holdingId } = await params
  const holding = await getHoldingById(user.id, holdingId)

  if (!holding) {
    return <HoldingNotFound />
  }

  const [containers, growthHistory] = await Promise.all([
    getContainers(user.id),
    getGrowthHistory(user.id, { holdingId }),
  ])

  const container = containers.find((c) => c.id === holding.accountId)
  const isClosed = holding.closedAt !== null
  const isGainNegative = holding.gainLossAmount < 0
  const totalDividends = holding.dividends.reduce((sum, d) => sum + d.amount, 0)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/investments"
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
            {isClosed && <Badge variant="secondary">Closed</Badge>}
          </div>
          {container && (
            <p className="text-sm text-muted-foreground">
              Under {container.name}
            </p>
          )}
        </div>
        <HoldingDetailActions holding={holding} containers={containers} />
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Current value</span>
            <span className="font-heading text-xl font-semibold text-foreground">
              {formatCurrency(holding.currentValue)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Cost basis</span>
            <span className="font-heading text-xl font-semibold text-foreground">
              {formatCurrency(holding.costBasis)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Gain / loss</span>
            <span
              className={cn(
                "font-heading text-xl font-semibold",
                isGainNegative
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {isGainNegative ? "" : "+"}
              {formatCurrency(holding.gainLossAmount)}
              {holding.gainLossPercent !== null &&
                ` (${holding.gainLossPercent >= 0 ? "+" : ""}${holding.gainLossPercent.toFixed(1)}%)`}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Total dividend income
            </span>
            <span className="font-heading text-xl font-semibold text-foreground">
              {formatCurrency(totalDividends)}
            </span>
          </div>
        </CardContent>
      </Card>

      <GrowthChart title="Growth history" data={growthHistory} />

      <Card>
        <CardHeader>
          <CardTitle>Value update history</CardTitle>
        </CardHeader>
        <CardContent>
          <ValueHistoryList entries={holding.valueHistory} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dividend history</CardTitle>
        </CardHeader>
        <CardContent>
          <DividendHistoryList dividends={holding.dividends} />
        </CardContent>
      </Card>
    </div>
  )
}

/** Rendered when `holdingId` doesn't exist or belongs to another user —
 * `getHoldingById` returns `null` for both cases indistinguishably (see its
 * JSDoc), so this can't leak which one occurred. Mirrors
 * goals/[goalId]/page.tsx's GoalNotFound styling. */
function HoldingNotFound() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-base font-medium text-foreground">
          Holding not found
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This holding doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/investments"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to Investments
        </Link>
      </CardContent>
    </Card>
  )
}
