/**
 * DemoContributionHistoryList — read-only presentational twin of
 * `features/goals/components/contribution-history-list.tsx`, built for the
 * public `/demo` route (docs/architecture/public-demo-technical-design.md
 * §3.3).
 *
 * Renders the identical date/amount rows the real list does, but omits the
 * per-row delete button and its inline confirm/cancel state entirely — the
 * real file imports `deleteContribution` from
 * `@/features/goals/server/actions`, which nothing under `/demo` may ever
 * reach, even transitively (public-demo.md Capability 3 AC2). Unlike the
 * real component, this twin needs no client state at all, so it stays a
 * plain Server Component.
 *
 * Usage:
 * ```tsx
 * <DemoContributionHistoryList contributions={goal.contributions} />
 * ```
 */

import { formatCurrency, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { GoalContribution } from "@/features/goals/types"

export interface DemoContributionHistoryListProps {
  contributions: GoalContribution[]
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoContributionHistoryList({
  contributions,
  currency = "USD",
}: DemoContributionHistoryListProps) {
  if (contributions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No contributions logged yet.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contributions.map((contribution) => (
          <TableRow key={contribution.id}>
            <TableCell>{formatDate(contribution.date)}</TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(contribution.amount, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
