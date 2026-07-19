"use client"

/**
 * DataTable — generic TanStack Table wrapper with sorting, pagination, and
 * filtering wired up. This is the building block every list/table screen
 * (Transactions, Budgeting, Bills, Debts, Investments) composes instead of
 * hand-building a new table — see Architecture.md.
 *
 * Fully generic over the row type; it has no knowledge of any domain model.
 * Sorting/filtering/pagination state is managed internally by default
 * (client-side), or can be driven by a server via `manualPagination`.
 *
 * Usage (client-side pagination/sorting/filtering — the default):
 * ```tsx
 * const columns: ColumnDef<Transaction>[] = [
 *   {
 *     accessorKey: "description",
 *     header: ({ column }) => (
 *       <DataTableColumnHeader column={column} title="Description" />
 *     ),
 *   },
 *   { accessorKey: "amount", header: "Amount" },
 * ]
 *
 * <DataTable columns={columns} data={transactions} enableGlobalFilter />
 * ```
 *
 * Usage (server-side/manual pagination — caller owns fetching the current page):
 * ```tsx
 * <DataTable
 *   columns={columns}
 *   data={page.items}
 *   manualPagination
 *   pageCount={page.totalPages}
 *   pageIndex={page.index}
 *   pageSize={page.size}
 *   onPaginationChange={(index, size) => fetchPage(index, size)}
 * />
 * ```
 *
 * Usage (column-specific filter UI, e.g. a category select) — the `toolbar`
 * render prop hands back the live table instance so a feature module can
 * drive column filters without DataTable knowing about the domain:
 * ```tsx
 * <DataTable
 *   columns={columns}
 *   data={transactions}
 *   toolbar={(table) => (
 *     <CategoryFilter
 *       value={table.getColumn("category")?.getFilterValue() as string}
 *       onChange={(value) => table.getColumn("category")?.setFilterValue(value)}
 *     />
 *   )}
 * />
 * ```
 */

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableSkeleton } from "@/components/shared/loading-skeleton"
import { DataTablePagination } from "@/components/shared/data-table/data-table-pagination"

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  className?: string
  /** Renders a skeleton in place of rows — the caller owns the actual fetch. */
  isLoading?: boolean
  emptyMessage?: React.ReactNode

  /** Shows a built-in text input that filters across all columns. */
  enableGlobalFilter?: boolean
  globalFilterPlaceholder?: string

  /** Set to `false` to disable pagination controls entirely (renders all rows). */
  enablePagination?: boolean
  pageSizeOptions?: number[]
  pageSize?: number

  /** When true, the caller supplies exactly one page of `data` and owns fetching. */
  manualPagination?: boolean
  /** Total number of pages — required when `manualPagination` is true. */
  pageCount?: number
  /** Current page index (0-based) — required when `manualPagination` is true. */
  pageIndex?: number
  /** Called with the new page index/size whenever pagination changes (manual mode). */
  onPaginationChange?: (pageIndex: number, pageSize: number) => void

  /**
   * Render-prop slot for column-specific filter UI. Receives the live table
   * instance so feature modules can drive `column.setFilterValue()` without
   * DataTable needing any domain knowledge.
   */
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  data,
  className,
  isLoading = false,
  emptyMessage = "No results.",
  enableGlobalFilter = false,
  globalFilterPlaceholder = "Filter...",
  enablePagination = true,
  pageSizeOptions = [10, 25, 50],
  pageSize = 10,
  manualPagination = false,
  pageCount,
  pageIndex,
  onPaginationChange,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: pageIndex ?? 0,
    pageSize,
  })

  // Keep internal pagination state in sync with a controlling parent in
  // manual (server-driven) pagination mode.
  React.useEffect(() => {
    if (manualPagination && pageIndex !== undefined) {
      setPagination((prev) =>
        prev.pageIndex === pageIndex ? prev : { ...prev, pageIndex }
      )
    }
  }, [manualPagination, pageIndex])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        onPaginationChange?.(next.pageIndex, next.pageSize)
        return next
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    manualPagination,
    pageCount: manualPagination ? pageCount ?? -1 : undefined,
  })

  const rows = table.getRowModel().rows

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(enableGlobalFilter || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {enableGlobalFilter && (
            <div className="relative w-full max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder={globalFilterPlaceholder}
                aria-label="Filter table"
                className="pl-8"
              />
            </div>
          )}
          {toolbar?.(table)}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton columns={columns.length} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {enablePagination && !isLoading && (
        <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      )}
    </div>
  )
}
