/**
 * TopMerchantsList — Top Merchants (analytics.md AC10): merchants ranked by
 * total spend, with each merchant's total and transaction count. Ignores the
 * shared reporting-period control by default (analytics.md's own "Top
 * Merchants defaults to all-time unless filtered"), per
 * `expense-breakdown.ts`'s `getTopMerchants(userId, { period? })` contract —
 * `app/(dashboard)/analytics/page.tsx` calls it with no `period` at all, so
 * this card states its own "All time" default plainly (AC2) rather than
 * silently reacting to the page's period selector like the other cards.
 *
 * A plain Server Component — no hooks/interactivity of its own.
 */

import { formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { TopMerchant } from "../types"

export interface TopMerchantsListProps {
  data: TopMerchant[]
}

export function TopMerchantsList({ data }: TopMerchantsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Merchants</CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No merchant spending yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Once you&apos;ve logged some expenses, your highest-spend
              merchants will be ranked here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((merchant, index) => (
                <TableRow key={merchant.normalizedMerchantName}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    {merchant.displayName}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {merchant.transactionCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(merchant.totalSpend)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
