"use client"

/**
 * SubscriptionsList — Subscription Cost Detection (analytics.md's own
 * section, AC16): every currently-detected candidate (merchant, amount,
 * interval, first/most-recent charge date, estimated annualized cost,
 * Active/Possibly Cancelled status), the running total annualized cost
 * across Active candidates, and the "not a subscription" dismiss action
 * (analytics.md's "User override" — this feature's primary false-positive
 * defense).
 *
 * "use client": the dismiss button calls the `dismissSubscriptionCandidate`
 * Server Action directly and needs local per-row pending state plus
 * `router.refresh()` afterward — the same "Server Action + toast +
 * router.refresh()" shape `features/debt/components/debt-card.tsx`'s
 * archive toggle and `features/goals/components/goal-detail-actions.tsx`
 * both already establish for this codebase's mutation-from-a-list pattern.
 *
 * Always all-time (per api-contracts.md: "ignores the shared period control
 * entirely") — `app/(dashboard)/analytics/page.tsx` fetches both
 * `candidates`/`activeAnnualizedTotal` independent of the page's period
 * selector, so this component takes no period prop at all.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { formatCurrency } from "@/lib/utils"
import { dismissSubscriptionCandidate } from "@/features/analytics/server/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { SubscriptionCandidate, SubscriptionInterval } from "../types"
import { formatDateLabel } from "./chart-format"

export interface SubscriptionsListProps {
  candidates: SubscriptionCandidate[]
  activeAnnualizedTotal: number
}

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
}

export function SubscriptionsList({ candidates, activeAnnualizedTotal }: SubscriptionsListProps) {
  const router = useRouter()
  const [dismissingMerchant, setDismissingMerchant] = useState<string | null>(null)

  async function handleDismiss(normalizedMerchantName: string) {
    setDismissingMerchant(normalizedMerchantName)
    const result = await dismissSubscriptionCandidate({ normalizedMerchantName })
    setDismissingMerchant(null)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success("Dismissed — this merchant won't be flagged again")
    // Re-runs the Server Component page's getSubscriptionCandidates()/
    // getActiveSubscriptionAnnualizedTotal() calls so the list and total both
    // reflect the new exclusion — see app/(dashboard)/analytics/page.tsx.
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription Cost Detection</CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {candidates.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No subscriptions detected yet
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              We look for at least three charges from the same merchant at a
              consistent interval and amount — check back once you have more
              transaction history.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Estimated annual cost of active subscriptions
              </span>
              <span className="font-heading text-lg font-semibold text-foreground">
                {formatCurrency(activeAnnualizedTotal)}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Est. Annual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Charge</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.normalizedMerchantName}>
                    <TableCell className="font-medium text-foreground">
                      {candidate.displayName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {INTERVAL_LABELS[candidate.detectedInterval]}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(candidate.averageAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(candidate.estimatedAnnualizedCost)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={candidate.status === "ACTIVE" ? "default" : "secondary"}>
                        {candidate.status === "ACTIVE" ? "Active" : "Possibly Cancelled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateLabel(candidate.mostRecentChargeDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dismissingMerchant === candidate.normalizedMerchantName}
                        onClick={() => handleDismiss(candidate.normalizedMerchantName)}
                      >
                        Not a subscription
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}
