/**
 * PortfolioOverviewSection — the portfolio-wide summary (docs/product/
 * investments.md AC10): total current value, total gain/loss, and total
 * dividend income, plus the per-container breakdown table.
 *
 * A Server Component — purely presentational over the `PortfolioOverview`
 * shape `service.getPortfolioOverview` returns; no client state needed.
 * Mirrors `features/budgeting/components/budget-summary-cards.tsx`'s
 * "stat cards row" pattern (checked as this feature's closest existing
 * aggregation-summary reference, per the dispatch's own pointer to
 * budgeting/page.tsx).
 */

import type { PortfolioOverview } from "@/features/investments/types"
import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface PortfolioOverviewSectionProps {
  overview: PortfolioOverview
  /** The caller's resolved `UserPreference.currencyDisplay`
   * (docs/release/phase-4c-notes.md Section 1) — this is a Server Component
   * (see this file's own header comment), so
   * `app/(dashboard)/investments/page.tsx` resolves this once and passes it
   * straight through rather than this component reading a Context. */
  currency: string
}

function GainLossText({ amount, currency }: { amount: number; currency: string }) {
  const isNegative = amount < 0
  return (
    <span
      className={cn(
        // Accessibility fix (docs/testing/e2e/accessibility-run-report.md's
        // 2026-08-02 re-run, finding #1, axe `color-contrast`) — see
        // holding-row.tsx's identical fix/comment for the full reasoning;
        // this is the same GainLossText-shaped pairing on Investments
        // portfolio's own summary row.
        isNegative
          ? "text-red-700 dark:text-red-400"
          : "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {isNegative ? "" : "+"}
      {formatCurrency(amount, currency)}
    </span>
  )
}

export function PortfolioOverviewSection({
  overview,
  currency,
}: PortfolioOverviewSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total portfolio value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-heading text-2xl font-semibold text-foreground">
              {formatCurrency(overview.totalCurrentValue, currency)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total gain / loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-heading text-2xl font-semibold">
              <GainLossText amount={overview.totalGainLoss} currency={currency} />
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total dividend income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-heading text-2xl font-semibold text-foreground">
              {formatCurrency(overview.totalDividendIncome, currency)}
            </span>
          </CardContent>
        </Card>
      </div>

      {overview.byContainer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By container</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Current value</TableHead>
                  <TableHead className="text-right">Gain / loss</TableHead>
                  <TableHead className="text-right">Dividends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byContainer.map((row) => (
                  <TableRow key={row.accountId}>
                    <TableCell className="font-medium">
                      {row.accountName}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.currentValue, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <GainLossText amount={row.gainLoss} currency={currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.dividendIncome, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
