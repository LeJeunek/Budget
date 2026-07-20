"use client"

/**
 * TransactionDetailClient — client-side composition root for the transaction
 * detail page: a read-only summary of the transaction (for context) plus its
 * Receipts section (attach/view/download/remove). Mirrors
 * `bills/[billId]/bill-detail-client.tsx`'s split from its Server Component
 * `page.tsx` — see that file and this route's `page.tsx` for the pattern
 * this follows and why a dedicated route exists at all.
 */

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import type { TransactionDetail } from "@/features/transactions/types"
import { ReceiptList } from "@/features/transactions/components/receipt-list"
import { ReceiptUploader } from "@/features/transactions/components/receipt-uploader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

export interface TransactionDetailClientProps {
  transaction: TransactionDetail
}

export function TransactionDetailClient({ transaction }: TransactionDetailClientProps) {
  const isExpense = transaction.amount < 0

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/transactions">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to transactions
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl">{transaction.merchant}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: transaction.category?.color ?? "#94a3b8" }}
                  aria-hidden="true"
                />
                {transaction.category?.name ?? "Uncategorized"}
              </Badge>
              {transaction.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
          <div
            className={cn(
              "text-right text-lg font-semibold tabular-nums",
              isExpense ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {isExpense ? "-" : "+"}
            {formatCurrency(Math.abs(transaction.amount))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <span className="text-sm text-foreground">{formatDate(transaction.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Account</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: transaction.account.color }}
                aria-hidden="true"
              />
              {transaction.account.name}
            </span>
          </div>
          {transaction.notes && (
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Notes</span>
              <span className="text-sm text-foreground">{transaction.notes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-medium text-foreground">Receipts</h2>
          <ReceiptUploader transactionId={transaction.id} />
        </div>
        <ReceiptList receipts={transaction.receipts} />
      </section>
    </div>
  )
}
