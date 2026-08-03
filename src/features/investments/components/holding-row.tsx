"use client"

/**
 * HoldingRow — one holding's line within its container's card on the main
 * Investments page (docs/product/investments.md AC2/AC6), with an actions
 * menu for Edit, Log dividend, and Close (AC4/AC5/AC8) — the same
 * dropdown-menu-of-actions pattern as
 * `features/accounts/components/account-card.tsx`'s AccountCard, just laid
 * out as a table-ish row instead of a card since holdings are grouped
 * several-per-container rather than one-per-card.
 *
 * There is deliberately no "Unclose" here — `server/actions.ts`'s own JSDoc
 * flags that no reopen action exists in the backend surface at all (a
 * genuine backend gap, not a Frontend Lead omission); Close is offered only
 * for an active holding, matching what the backend actually supports.
 *
 * Edit remains available even for a Closed holding — investments.md's Edge
 * Cases never restrict editing a Closed holding's recorded fields, only
 * that Closing itself excludes it from the active list/allocation/overview
 * (AC5) — so this row doesn't invent a stricter restriction than the spec
 * states.
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import type { ContainerSummary, Holding } from "@/features/investments/types"
import { closeHolding } from "@/features/investments/server/actions"
import { HoldingFormDialog } from "./holding-form"
import { DividendFormDialog } from "./dividend-form"
import { ASSET_TYPE_LABELS, SECTOR_LABELS } from "./investment-labels"
import { cn } from "@/lib/utils"
import { useFormatCurrency } from "@/app/(dashboard)/currency-preference-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface HoldingRowProps {
  holding: Holding
  /** Passed through to the Edit dialog's container picker — unused since
   * edit mode hides that picker, but keeps HoldingFormDialog's props
   * uniform across every call site. */
  containers: ContainerSummary[]
}

export function HoldingRow({ holding, containers }: HoldingRowProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [dividendOpen, setDividendOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const isClosed = holding.closedAt !== null
  const isGainNegative = holding.gainLossAmount < 0

  async function handleClose() {
    setIsClosing(true)
    const result = await closeHolding({ id: holding.id })
    setIsClosing(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Holding closed")
    // Re-runs the Server Component page's holdings/overview/allocation
    // fetches — see app/(dashboard)/investments/page.tsx.
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            href={`/investments/${holding.id}`}
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

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-medium text-foreground">
              {formatCurrency(holding.currentValue)}
            </span>
            <span
              className={cn(
                "text-xs",
                // Accessibility fix (docs/testing/e2e/
                // accessibility-run-report.md's 2026-08-02 re-run, finding
                // #1, axe `color-contrast`): the -600 shade of both colors
                // measured below the 4.5:1 floor on white in this exact
                // usage (emerald-600 confirmed failing at 3.65:1 by axe;
                // red-600 shares the identical -600-shade-on-white contrast
                // problem the destructive-token fix already closed for
                // Button/Badge/DropdownMenuItem elsewhere, so darkened here
                // too rather than leaving a near-identical latent failure
                // for whenever a losing holding is the one axe's crawl
                // happens to hit). Dark mode's -400 shades were already
                // passing, left unchanged.
                isGainNegative
                  ? "text-red-700 dark:text-red-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {isGainNegative ? "" : "+"}
              {formatCurrency(holding.gainLossAmount)}
              {holding.gainLossPercent !== null &&
                ` (${holding.gainLossPercent >= 0 ? "+" : ""}${holding.gainLossPercent.toFixed(1)}%)`}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${holding.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDividendOpen(true)}>
                Log dividend
              </DropdownMenuItem>
              {!isClosed && (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isClosing}
                  onSelect={handleClose}
                >
                  Close
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <HoldingFormDialog
        holding={holding}
        containers={containers}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DividendFormDialog
        holdingId={holding.id}
        holdingName={holding.name}
        open={dividendOpen}
        onOpenChange={setDividendOpen}
      />
    </>
  )
}
