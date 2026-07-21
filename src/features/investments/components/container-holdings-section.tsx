/**
 * ContainerHoldingsSection — renders every container's holdings grouped
 * under a card per container (docs/product/investments.md AC1: holdings
 * "organized under their existing Investment, Retirement, or Crypto
 * Accounts"), for either the active or Closed holdings view (AC5/Edge
 * Cases' "separate 'Closed holdings' view").
 *
 * A Server Component (no "use client" — it only composes HoldingRow/
 * AddHoldingButton, both Client Components, the same "presentational
 * grouping stays server-rendered" pattern as
 * app/(dashboard)/accounts/page.tsx's own AccountGrid).
 */

import type { ContainerSummary, Holding } from "@/features/investments/types"
import { HoldingRow } from "./holding-row"
import { AddHoldingButton } from "./holding-form"
import { CONTAINER_ACCOUNT_TYPE_LABELS } from "./investment-labels"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface ContainerHoldingsSectionProps {
  containers: ContainerSummary[]
  holdingsByContainerId: Map<string, Holding[]>
  /** `true` for the "Closed holdings" tab — hides the "Add holding" trigger
   * (mirroring Accounts' Archived tab, which offers no "Add account"),
   * since a Closed holding view is read-only history, not an entry point
   * for new active holdings. */
  isClosedView?: boolean
  emptyMessage: string
}

export function ContainerHoldingsSection({
  containers,
  holdingsByContainerId,
  isClosedView = false,
  emptyMessage,
}: ContainerHoldingsSectionProps) {
  const containersWithHoldings = containers.filter(
    (container) => (holdingsByContainerId.get(container.id)?.length ?? 0) > 0,
  )

  if (containersWithHoldings.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {containersWithHoldings.map((container) => {
        const holdings = holdingsByContainerId.get(container.id) ?? []
        return (
          <Card key={container.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle className="truncate">{container.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">
                    {CONTAINER_ACCOUNT_TYPE_LABELS[
                      container.type as keyof typeof CONTAINER_ACCOUNT_TYPE_LABELS
                    ] ?? container.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {holdings.length} holding{holdings.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              {!isClosedView && (
                <AddHoldingButton
                  containers={containers}
                  lockedAccountId={container.id}
                  label="Add holding"
                />
              )}
            </CardHeader>
            <CardContent>
              {container.hasHoldings && !isClosedView && (
                <p className="mb-2 text-xs text-muted-foreground">
                  This account&apos;s balance is now calculated from its
                  holdings below.
                </p>
              )}
              <div className="flex flex-col">
                {holdings.map((holding) => (
                  <HoldingRow
                    key={holding.id}
                    holding={holding}
                    containers={containers}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
