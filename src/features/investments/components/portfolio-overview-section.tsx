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
}

function GainLossText({ amount }: { amount: number }) {
  const isNegative = amount < 0
  return (
    <span
      className={cn(
        isNegative
          ? "text-red-600 dark:text-red-400"
          : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {isNegative ? "" : "+"}
      {formatCurrency(amount)}
    </span>
  )
}

export function PortfolioOverviewSection({
  overview,
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
              {formatCurrency(overview.totalCurrentValue)}
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
              <GainLossText amount={overview.totalGainLoss} />
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
              {formatCurrency(overview.totalDividendIncome)}
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
                      {formatCurrency(row.currentValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <GainLossText amount={row.gainLoss} />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.dividendIncome)}
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
