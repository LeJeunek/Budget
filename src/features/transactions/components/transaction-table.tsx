"use client"

import * as React from "react"
import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Scissors,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/shared/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { useAccounts } from "@/features/accounts/hooks/use-accounts"
import type { Category } from "@/features/categories/types"
import { UNCATEGORIZED_CATEGORY_ID, type Transaction } from "@/features/transactions/types"
import type { TransactionSortField } from "@/features/transactions/server/validation"
import {
  useDeleteTransaction,
  useTransactions,
} from "@/features/transactions/hooks/use-transactions"

/**
 * Transaction table: the assembled `DataTable` (columns, server-driven
 * sorting/pagination/filtering, row actions) for the Transactions page. Per
 * docs/product/transactions.md's acceptance criteria: sortable by date/
 * amount/merchant/category, filterable by account/category/date range,
 * free-text searchable, and paginated — all server-side, since
 * `useTransactions` hits a real paginated API rather than a client-side
 * array (see `hooks/use-transactions.ts`).
 *
 * `DataTable` (components/shared/data-table/data-table.tsx) has no
 * `manualSorting`/`onSortingChange` prop — only `manualPagination` is
 * exposed for server-driven paging. Rather than fighting its internal
 * (client-only) `getSortedRowModel`, sortable columns render their own
 * header buttons driven entirely by this component's own `sortBy`/`sortDir`
 * state (see `SortButton` below) and never touch TanStack Table's built-in
 * sorting state, so `DataTable` never re-sorts the already-server-sorted
 * page out from under us.
 */

const DEFAULT_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300
// Radix `Select` cannot use an empty string as an item value (it's reserved
// to mean "no selection"), so the "All accounts"/"All categories" options
// need their own non-empty sentinel, mapped back to `undefined` (meaning
// "no filter") before building the query.
const ALL_ACCOUNTS_VALUE = "__all-accounts__"
const ALL_CATEGORIES_VALUE = "__all-categories__"

export interface TransactionTableProps {
  /** Full category list (system + custom), owned by the Transactions page's
   * Server Component fetch — see app/(dashboard)/transactions/page.tsx's
   * JSDoc for why Categories has no client hook of its own. Used here only
   * for the category filter dropdown; each row's own category badge comes
   * from the joined `transaction.category` summary already returned by
   * `useTransactions`. */
  categories: Category[]
  onEdit: (transaction: Transaction) => void
  onSplit: (transaction: Transaction) => void
}

function SortButton({
  label,
  field,
  activeField,
  direction,
  onToggle,
  align = "start",
}: {
  label: string
  field: TransactionSortField
  activeField: TransactionSortField
  direction: "asc" | "desc"
  onToggle: (field: TransactionSortField) => void
  align?: "start" | "end"
}) {
  const isActive = activeField === field
  return (
    <div className={cn("flex items-center", align === "end" && "justify-end")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2.5 h-7 gap-1.5 px-2.5"
        aria-label={`Sort by ${label}${isActive ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
        onClick={() => onToggle(field)}
      >
        <span>{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}

export function TransactionTable({ categories, onEdit, onSplit }: TransactionTableProps) {
  const { data: accounts } = useAccounts()

  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
  const [accountId, setAccountId] = React.useState<string | undefined>(undefined)
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined)
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  // Kept as a single state object (rather than separate sortBy/sortDir
  // `useState`s) so `handleSortToggle` can read the *previous* field inside
  // one functional updater without a stale-closure bug — reading two
  // separate `useState` setters' previous values together isn't possible.
  const [sort, setSort] = React.useState<{
    field: TransactionSortField
    dir: "asc" | "desc"
  }>({ field: "date", dir: "desc" })
  const sortBy = sort.field
  const sortDir = sort.dir
  const [deletingTransaction, setDeletingTransaction] = React.useState<Transaction | null>(null)

  // Debounce free-text search so every keystroke doesn't trigger a fetch.
  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Any filter/sort change invalidates the current page of results — jump
  // back to page 1 so the user isn't stranded on a page number that may no
  // longer exist under the new filter.
  React.useEffect(() => {
    setPageIndex(0)
  }, [accountId, categoryId, search, dateFrom, dateTo, sortBy, sortDir])

  const filters = React.useMemo(
    () => ({
      page: pageIndex + 1,
      pageSize,
      accountId,
      categoryId,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortBy,
      sortDir,
    }),
    [pageIndex, pageSize, accountId, categoryId, search, dateFrom, dateTo, sortBy, sortDir],
  )

  const { data, isLoading } = useTransactions(filters)
  const deleteTransaction = useDeleteTransaction()

  const handleSortToggle = React.useCallback((field: TransactionSortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    )
  }, [])

  async function handleConfirmDelete() {
    if (!deletingTransaction) return
    try {
      await deleteTransaction.mutateAsync({ id: deletingTransaction.id })
      toast.success(`Deleted transaction "${deletingTransaction.merchant}".`)
      setDeletingTransaction(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete transaction.")
    }
  }

  const columns = React.useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: "date",
        accessorKey: "date",
        header: () => (
          <SortButton
            label="Date"
            field="date"
            activeField={sortBy}
            direction={sortDir}
            onToggle={handleSortToggle}
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>
        ),
      },
      {
        id: "merchant",
        accessorKey: "merchant",
        header: () => (
          <SortButton
            label="Merchant"
            field="merchant"
            activeField={sortBy}
            direction={sortDir}
            onToggle={handleSortToggle}
          />
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.merchant}</span>,
      },
      {
        id: "category",
        header: () => (
          <SortButton
            label="Category"
            field="category"
            activeField={sortBy}
            direction={sortDir}
            onToggle={handleSortToggle}
          />
        ),
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
        header: () => (
          <SortButton
            label="Amount"
            field="amount"
            activeField={sortBy}
            direction={sortDir}
            onToggle={handleSortToggle}
            align="end"
          />
        ),
        cell: ({ row }) => {
          const amount = row.original.amount
          return (
            <div
              className={cn(
                "text-right font-medium tabular-nums",
                amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {amount < 0 ? "-" : "+"}
              {formatCurrency(Math.abs(amount))}
            </div>
          )
        },
      },
      {
        id: "account",
        header: "Account",
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
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-48 text-muted-foreground">
            {row.original.notes || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const transaction = row.original
          // Split children (parentTransactionId set) can't themselves be
          // split again (AC15) — split parents never reach this table at
          // all (`listTransactions`'s `EXCLUDE_SPLIT_PARENTS`), so this is
          // the only "already split" state a visible row can be in.
          const isSplitChild = transaction.parentTransactionId !== null
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${transaction.merchant}`}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(transaction)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </DropdownMenuItem>
                  {/* Phase 2 addendum: receipts live on a dedicated detail
                     route, not this dialog — see
                     app/(dashboard)/transactions/[id]/page.tsx's JSDoc for
                     why (getTransactionDetail is Server-Component-callable
                     only, so a route is required to reach it). Works
                     identically for split line items (AC4) since
                     `transaction.id` is already that row's own id. */}
                  <DropdownMenuItem asChild>
                    <Link href={`/transactions/${transaction.id}`}>
                      <Paperclip className="size-4" aria-hidden="true" />
                      Receipts
                    </Link>
                  </DropdownMenuItem>
                  {!isSplitChild && (
                    <DropdownMenuItem onSelect={() => onSplit(transaction)}>
                      <Scissors className="size-4" aria-hidden="true" />
                      Split
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeletingTransaction(transaction)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [sortBy, sortDir, handleSortToggle, onEdit, onSplit],
  )

  const total = data?.total ?? 0
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize)

  return (
    <>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No transactions found."
        manualPagination
        pageCount={pageCount}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPaginationChange={(newPageIndex, newPageSize) => {
          setPageIndex(newPageIndex)
          setPageSize(newPageSize)
        }}
        toolbar={() => (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search merchant or notes..."
              aria-label="Search transactions"
              className="w-full max-w-56"
            />
            <Select
              value={accountId ?? ALL_ACCOUNTS_VALUE}
              onValueChange={(value) =>
                setAccountId(value === ALL_ACCOUNTS_VALUE ? undefined : value)
              }
            >
              <SelectTrigger aria-label="Filter by account">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS_VALUE}>All accounts</SelectItem>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={categoryId ?? ALL_CATEGORIES_VALUE}
              onValueChange={(value) =>
                setCategoryId(value === ALL_CATEGORIES_VALUE ? undefined : value)
              }
            >
              <SelectTrigger aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>All categories</SelectItem>
                <SelectItem value={UNCATEGORIZED_CATEGORY_ID}>Uncategorized</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="From date"
              className="w-36"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="To date"
              className="w-36"
            />
          </div>
        )}
      />

      <Dialog
        open={deletingTransaction !== null}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction?</DialogTitle>
            <DialogDescription>
              {deletingTransaction &&
                `This will permanently delete "${deletingTransaction.merchant}" for ${formatCurrency(
                  Math.abs(deletingTransaction.amount),
                )} on ${formatDate(deletingTransaction.date)}. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTransaction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteTransaction.isPending}
            >
              {deleteTransaction.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
