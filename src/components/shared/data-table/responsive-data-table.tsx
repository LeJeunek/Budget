"use client"

/**
 * ResponsiveDataTable — thin, CSS-only responsive composition of `DataTable`
 * (tablet/desktop, `>= 640px`) and `DataTableCardList` (mobile, `< 640px`),
 * per `docs/architecture/phase-5a-technical-design.md` §3.1.
 *
 * Constructs exactly ONE `useReactTable` instance and hands it to both
 * `DataTable` (via its `table` prop, added for exactly this purpose) and
 * `DataTableCardList` — so sort/filter/pagination state can never drift
 * between the two renderers; they are two views onto one live table
 * instance, not two independently managed copies. Both are mounted in the
 * DOM simultaneously; the breakpoint switch is pure CSS (`hidden sm:flex` /
 * `sm:hidden`), never a JS media-query check, to avoid hydration mismatches
 * — the same discipline `BottomNav`'s `sm:hidden` breakpoint already uses.
 *
 * Accepts the identical prop shape `DataTable` does (`DataTableProps`) —
 * a drop-in replacement for existing `<DataTable columns={columns}
 * data={...} />` call sites — plus whatever `meta.cardDisplay` annotations
 * a consumer adds to its `columns` array for the mobile card view (see
 * `data-table-card-list.tsx`'s own JSDoc for that three-value convention).
 *
 * Usage:
 * ```tsx
 * const columns: ColumnDef<Transaction>[] = [
 *   { accessorKey: "merchant", header: "Merchant", meta: { cardDisplay: "primary" } },
 *   { accessorKey: "amount", header: "Amount", meta: { cardDisplay: "primary" } },
 *   { accessorKey: "date", header: "Date" }, // omitted meta -> "secondary" by default
 *   { id: "actions", cell: () => <RowActionsMenu /> },
 * ]
 *
 * <ResponsiveDataTable
 *   columns={columns}
 *   data={transactions}
 *   enableGlobalFilter
 * />
 * ```
 */

import * as React from "react"
import {
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import {
  DataTable,
  type DataTableProps,
} from "@/components/shared/data-table/data-table"
import { DataTableCardList } from "@/components/shared/data-table/data-table-card-list"

/**
 * Identical to `DataTableProps` minus `table` — `ResponsiveDataTable`
 * always constructs its own shared table instance (see below), so unlike
 * `DataTable` itself it never accepts a caller-supplied one; exposing that
 * prop here would be misleading (it would be silently ignored).
 */
export type ResponsiveDataTableProps<TData, TValue> = Omit<
  DataTableProps<TData, TValue>,
  "table"
>

export function ResponsiveDataTable<TData, TValue>({
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
}: ResponsiveDataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: pageIndex ?? 0,
    pageSize,
  })

  // Mirrors DataTable's own manual-pagination sync effect — see that file
  // for why this is needed for server-driven pagination consumers.
  React.useEffect(() => {
    if (manualPagination && pageIndex !== undefined) {
      setPagination((prev) =>
        prev.pageIndex === pageIndex ? prev : { ...prev, pageIndex }
      )
    }
  }, [manualPagination, pageIndex])

  // The one shared table instance both DataTable and DataTableCardList
  // render from — see this file's own top JSDoc for why that matters.
  const table = useReactTable({
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

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        enableGlobalFilter={enableGlobalFilter}
        globalFilterPlaceholder={globalFilterPlaceholder}
        enablePagination={enablePagination}
        pageSizeOptions={pageSizeOptions}
        toolbar={toolbar}
        className={cn("hidden sm:flex", className)}
      />
      <DataTableCardList
        table={table}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        enableGlobalFilter={enableGlobalFilter}
        globalFilterPlaceholder={globalFilterPlaceholder}
        toolbar={toolbar}
        enablePagination={enablePagination}
        pageSizeOptions={pageSizeOptions}
        className={cn("sm:hidden", className)}
      />
    </>
  )
}
