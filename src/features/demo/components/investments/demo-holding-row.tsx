/**
 * DemoHoldingRow — read-only presentational twin of
 * `features/investments/components/holding-row.tsx`, built for the public
 * `/demo` route (docs/architecture/public-demo-technical-design.md §3.3).
 *
 * Mirrors HoldingRow's display fields (asset type / sector / Closed badges,
 * current value, gain/loss amount + percent) but omits the entire actions
 * menu and both dialogs it opens (Edit, Log dividend) — the real file
 * imports `closeHolding` from `@/features/investments/server/actions`,
 * which nothing under `/demo` may ever reach, even transitively
 * (public-demo.md Capability 3 AC2). `ASSET_TYPE_LABELS`/`SECTOR_LABELS` are
 * imported from `investment-labels.ts` (not the row file) — that module
 * only imports this feature's own `types.ts`, so reusing it here duplicates
 * nothing and pulls in nothing unsafe. The detail link points at
 * `/demo/investments/[id]`, never the real authenticated route
 * (Capability 5 AC4).
 *
 * Unlike the real row, this twin needs no client state at all (no dialogs,
 * no `useRouter`), so it stays a plain Server Component.
 *
 * Usage:
 * ```tsx
 * <DemoHoldingRow holding={DEMO_HOUSEHOLD.holdings[0]} />
 * ```
 */

import Link from "next/link"

import { cn, formatCurrency } from "@/lib/utils"
import {
  ASSET_TYPE_LABELS,
  SECTOR_LABELS,
} from "@/features/investments/components/investment-labels"
import { Badge } from "@/components/ui/badge"

import type { Holding } from "@/features/investments/types"

export interface DemoHoldingRowProps {
  holding: Holding
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoHoldingRow({ holding, currency = "USD" }: DemoHoldingRowProps) {
  const isClosed = holding.closedAt !== null
  const isGainNegative = holding.gainLossAmount < 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/demo/investments/${holding.id}`}
          className="truncate font-medium text-foreground hover:underline"
        >
          {holding.name}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{ASSET_TYPE_LABELS[holding.assetType]}</Badge>
          {holding.sector && (
            <Badge variant="outline">{SECTOR_LABELS[holding.sector]}</Badge>
          )}
          {isClosed && <Badge variant="secondary">Closed</Badge>}
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="font-medium text-foreground">
          {formatCurrency(holding.currentValue, currency)}
        </span>
        <span
          className={cn(
            "text-xs",
            isGainNegative
              ? "text-red-700 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {isGainNegative ? "" : "+"}
          {formatCurrency(holding.gainLossAmount, currency)}
          {holding.gainLossPercent !== null &&
            ` (${holding.gainLossPercent >= 0 ? "+" : ""}${holding.gainLossPercent.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  )
}
