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

  /**
   * Phase 5a addition (`docs/architecture/phase-5a-technical-design.md`
   * §3.1): use a caller-supplied TanStack table instance instead of the one
   * DataTable would otherwise construct internally. Exists solely so
   * `ResponsiveDataTable` (`responsive-data-table.tsx`) can share exactly
   * one `useReactTable` instance between this component's table markup and
   * `DataTableCardList`'s card markup — the two views can never drift out
   * of sync (same sort/filter/pagination state) because they render the
   * same live instance, not two independently managed ones. Omit this prop
   * for ordinary standalone use: DataTable falls back to its existing
   * internal construction exactly as before, so no existing consumer is
   * affected by this addition.
   */
  table?: TanstackTable<TData>
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
  table: suppliedTable,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
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

  // Always constructed, even when `suppliedTable` is given, so this hook
  // call stays unconditional (Rules of Hooks) — the instance is simply
  // discarded in favor of `suppliedTable` below when one is provided.
  // Note: `globalFilter` is deliberately left out of `state` here (and has
  // no `onGlobalFilterChange` handler) so TanStack manages it internally by
  // default — the search input below now reads/writes it via
  // `table.getState().globalFilter` / `table.setGlobalFilter()` directly on
  // the *resolved* table (internal or caller-supplied) instead of a second,
  // parallel piece of local React state that only the internal instance
  // would ever see. This is what makes the built-in search input keep
  // working correctly when `suppliedTable` (ResponsiveDataTable's shared
  // instance) is used.
  const internalTable = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
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

  const table = suppliedTable ?? internalTable
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
                value={(table.getState().globalFilter as string | undefined) ?? ""}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
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
