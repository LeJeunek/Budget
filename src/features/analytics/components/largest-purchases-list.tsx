/**
 * LargestPurchasesList — Largest Purchases (analytics.md AC11): the
 * individual highest-amount expense transactions, listed with date,
 * merchant, category, and amount. Ignores the shared reporting-period
 * control by default (same "defaults to all-time unless filtered" rule as
 * `TopMerchantsList` — see that file's header comment for the full
 * reasoning), per `expense-breakdown.ts`'s `getLargestPurchases(userId, {
 * period? })` contract.
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

import type { LargestPurchase } from "../types"
import { formatDateLabel } from "./chart-format"

export interface LargestPurchasesListProps {
  data: LargestPurchase[]
}

export function LargestPurchasesList({ data }: LargestPurchasesListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Largest Purchases</CardTitle>
        <CardDescription>All time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No purchases yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Your single highest-amount expenses will be listed here once
              you&apos;ve logged some transactions.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((purchase) => (
                <TableRow key={purchase.transactionId}>
                  <TableCell className="text-muted-foreground">
                    {formatDateLabel(purchase.date)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {purchase.merchant}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {purchase.categoryName}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(purchase.amount)}
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
