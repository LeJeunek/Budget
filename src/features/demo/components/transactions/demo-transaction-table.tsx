"use client"

/**
 * DemoTransactionTable — read-only presentational twin of
 * `features/transactions/components/transaction-table.tsx`, built for the
 * public `/demo` route (docs/architecture/public-demo-technical-design.md
 * §3.3).
 *
 * Renders the same row shape (date, merchant, category, amount, account,
 * tags, notes) over a plain, already-resolved `transactions` array, but
 * omits the entire row actions menu (Edit / Split / Receipts / "Suggest a
 * category" / Delete) and the AI category-suggestion badge — the real file
 * imports `requestCategorySuggestion` from
 * `@/features/transactions/server/actions` and reads live data via
 * `useTransactions`/`useAccounts` (TanStack Query hooks hitting real,
 * session-authenticated API routes), none of which anything under `/demo`
 * may ever reach (public-demo.md Capability 3 AC2/AC3). AI-generated
 * content (the suggestion badge) is also out of scope for every demo page,
 * per the design doc §3.5.
 *
 * `ResponsiveDataTable` (`components/shared/data-table/`) is reused
 * directly — it is domain-agnostic and fetch-free, confirmed by the design
 * doc §3.2's Transactions row. Unlike the real table (server-paginated via
 * `manualPagination`), this twin hands it the full, already-resolved
 * `transactions` array and lets its own built-in client-side sorting/
 * filtering/pagination do the rest — so the sortable column headers and the
 * search box below are genuinely, locally functional (a real, working
 * example, not an inert control) while still issuing zero network calls,
 * per Capability 5 AC3's "may be present... never an attempted network
 * call."
 *
 * Usage:
 * ```tsx
 * <DemoTransactionTable transactions={DEMO_HOUSEHOLD.transactions} />
 * ```
 */

import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader, ResponsiveDataTable } from "@/components/shared/data-table"
import { Badge } from "@/components/ui/badge"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

import type { Transaction } from "@/features/transactions/types"

export interface DemoTransactionTableProps {
  transactions: Transaction[]
  /** ISO 4217 currency code — defaults to "USD" since `/demo` has no
   * per-visitor currency preference to resolve. */
  currency?: string
}

export function DemoTransactionTable({
  transactions,
  currency = "USD",
}: DemoTransactionTableProps) {
  const columns = React.useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "date",
        accessorKey: "date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>
        ),
      },
      {
        id: "merchant",
        accessorKey: "merchant",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Merchant" />
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.merchant}</span>,
        meta: { cardDisplay: "primary" },
      },
      {
        id: "category",
        header: "Category",
        accessorFn: (row) => row.category?.name ?? "Uncategorized",
        cell: ({ row }) => {
          const category = row.original.category
          return (
            <Badge variant="outline" className="gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                aria-hidden="true"
              />
              {category?.name ?? "Uncategorized"}
            </Badge>
          )
        },
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Amount" className="justify-end" />
        ),
        cell: ({ row }) => {
          const amount = row.original.amount
          return (
            <div
              className={cn(
                "text-right font-medium tabular-nums",
                amount < 0
                  ? "text-red-700 dark:text-red-400"
                  : "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {amount < 0 ? "-" : "+"}
              {formatCurrency(Math.abs(amount), currency)}
            </div>
          )
        },
        meta: { cardDisplay: "primary" },
      },
      {
        id: "account",
        header: "Account",
        accessorFn: (row) => row.account.name,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.original.account.color }}
              aria-hidden="true"
            />
            {row.original.account.name}
          </span>
        ),
      },
      {
        id: "tags",
        header: "Tags",
        cell: ({ row }) => {
          const tags = row.original.tags
          if (tags.length === 0) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )
        },
        meta: { cardDisplay: "expandable" },
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-48 text-muted-foreground">
            {row.original.notes || "—"}
          </span>
        ),
        meta: { cardDisplay: "expandable" },
      },
    ],
    [currency],
  )

  return (
    <ResponsiveDataTable
      columns={columns}
      data={transactions}
      emptyMessage="No transactions in this demo."
      enableGlobalFilter
      globalFilterPlaceholder="Search merchant or notes..."
      pageSizeOptions={[10, 25, 50]}
      pageSize={10}
    />
  )
}
