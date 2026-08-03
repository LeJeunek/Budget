"use client"

/**
 * DataTableCardList — the mobile (`< 640px`) row-renderer companion to
 * `DataTable`, per `docs/architecture/phase-5a-technical-design.md` §3.1.
 *
 * Renders one card per row from a TanStack `Table` instance — normally the
 * *same* instance `DataTable` renders its `<table>` markup from (see
 * `ResponsiveDataTable`, which constructs one shared instance and hands it
 * to both this component and `DataTable`). Because both views read from one
 * live table instance, sort/filter/pagination state can never drift between
 * them — there is no second, independent state to fall out of sync.
 *
 * Column prominence within a card is read from each `ColumnDef`'s own
 * `meta.cardDisplay` — an existing TanStack Table extension point
 * (`ColumnDef.meta`), not a new mechanism this file invents:
 *   - `"primary"`   — rendered large, at the top of the card.
 *   - `"secondary"` (the default when `meta.cardDisplay` is omitted) —
 *     rendered as a smaller label:value pair in the card body. An
 *     unannotated column degrades to this default rather than silently
 *     vanishing from the mobile view.
 *   - `"hidden"`    — omitted from the card entirely.
 *   - `"expandable"` (Phase 5b, Expandable Cards —
 *     `docs/architecture/phase-5b-technical-design.md` §3.2) — omitted from
 *     the always-visible card body and instead rendered inside a per-row
 *     `ExpandableCard` disclosure region appended to the bottom of the
 *     card, behind its own dedicated trigger. Purely additive to the three
 *     values above, never a reinterpretation of `"secondary"` — an
 *     unannotated column's behavior is completely unaffected, and
 *     `"secondary"`'s own "visible by default" guarantee (Risk #51) is
 *     untouched. This region is visually and spatially distinct from the
 *     card's `"primary"`/`"secondary"` content above it and from the row's
 *     own per-row action control (a `"secondary"`/`"primary"` cell in the
 *     same row), per the product spec's own touch-target-adjacency edge
 *     case — see Risk #59 for the one implementation-time review this new
 *     value still needs per consumer (confirm it discloses genuinely new
 *     detail, not a relabeled `"secondary"` column).
 *
 * Every cell is rendered via the identical
 * `flexRender(cell.column.columnDef.cell, cell.getContext())` call
 * `DataTable` itself uses for its own `<TableCell>`s, so a per-row action
 * column (a "Mark Paid" button, a row dropdown menu) needs zero
 * special-casing here — it renders exactly as it does in the table.
 *
 * Also renders its own search input / `toolbar` slot / pagination footer,
 * mirroring `DataTable`'s own (mirrored, not reused via import, since a
 * card list has no `<table>` to anchor a shared toolbar row above — see the
 * architecture doc's own "CSS-only, dual-render-then-hide" framing) — all
 * bound to the *same* `table` instance passed in, so search/pagination
 * behavior is identical to the table view by construction: typing in
 * either search input, or paging via either pagination footer, mutates the
 * one shared table state both views read from.
 *
 * Not usually used directly by feature code — composed automatically by
 * `ResponsiveDataTable`. Exported standalone for a caller that wants to
 * build its own responsive composition around the same underlying
 * primitive.
 *
 * Usage:
 * ```tsx
 * const columns: ColumnDef<Bill>[] = [
 *   { accessorKey: "name", header: "Name", meta: { cardDisplay: "primary" } },
 *   { accessorKey: "amount", header: "Amount", meta: { cardDisplay: "primary" } },
 *   { accessorKey: "dueDate", header: "Due date" }, // omitted meta -> "secondary"
 *   { id: "actions", cell: () => <RowActionsMenu />, meta: { cardDisplay: "secondary" } },
 * ]
 *
 * <DataTableCardList table={table} columns={columns} enableGlobalFilter />
 * ```
 */

import * as React from "react"
import {
  type Cell,
  type ColumnDef,
  type RowData,
  type Table as TanstackTable,
  flexRender,
} from "@tanstack/react-table"
import { ChevronDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { CardSkeleton } from "@/components/shared/loading-skeleton"
import { DataTablePagination } from "@/components/shared/data-table/data-table-pagination"
import { ExpandableCard } from "@/components/shared/motion"

/**
 * The one sanctioned convention for per-column row-prominence in the
 * card-list mobile treatment (`naming-standards.md`'s Phase 5a entry
 * records this as the canonical reference) — declared once here, imported
 * wherever a consumer's `ColumnDef.meta` needs to annotate it.
 */
export type CardDisplayPriority =
  | "primary"
  | "secondary"
  | "hidden"
  | "expandable"

// TanStack Table's own documented extension mechanism for adding
// codebase-specific fields to `ColumnDef.meta` — see
// https://tanstack.com/table/latest/docs/api/core/column-def#meta. The
// generic parameter list must match the upstream declaration exactly
// (`TData extends RowData, TValue`) for TypeScript's declaration-merging to
// apply, even though neither is referenced in this interface's own body
// below — ESLint's `no-unused-vars` can't see that the names are load-bearing
// for the merge itself, not for anything inside `{ ... }`.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by declaration-merging, see comment above
  interface ColumnMeta<TData extends RowData, TValue> {
    /** See `CardDisplayPriority` above. Defaults to `"secondary"` when omitted. */
    cardDisplay?: CardDisplayPriority
  }
}

function resolveCardDisplay<TData, TValue>(
  cell: Cell<TData, TValue>
): CardDisplayPriority {
  return cell.column.columnDef.meta?.cardDisplay ?? "secondary"
}

/** Derives a human-readable label for a secondary row's label:value pair. */
function resolveColumnLabel<TData, TValue>(
  header: ColumnDef<TData, TValue>["header"],
  columnId: string
): string {
  if (typeof header === "string") return header
  // `header` is a render function (e.g. `DataTableColumnHeader`) whose
  // rendered text isn't recoverable generically outside a table-header
  // context — fall back to a human-readable version of the column id
  // (e.g. "dueDate" -> "Due Date") rather than rendering nothing.
  return columnId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
}

export interface DataTableCardListProps<TData> {
  table: TanstackTable<TData>
  className?: string
  isLoading?: boolean
  emptyMessage?: React.ReactNode

  /** Mirrors `DataTableProps.enableGlobalFilter` — see this file's own JSDoc. */
  enableGlobalFilter?: boolean
  globalFilterPlaceholder?: string
  /** Mirrors `DataTableProps.toolbar` — identical render-prop contract, given the same live `table` instance. */
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode

  /** Mirrors `DataTableProps.enablePagination` / `pageSizeOptions`. */
  enablePagination?: boolean
  pageSizeOptions?: number[]
}

export function DataTableCardList<TData>({
  table,
  className,
  isLoading = false,
  emptyMessage = "No results.",
  enableGlobalFilter = false,
  globalFilterPlaceholder = "Filter...",
  toolbar,
  enablePagination = true,
  pageSizeOptions = [10, 25, 50],
}: DataTableCardListProps<TData>) {
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
                aria-label="Filter list"
                className="pl-8"
              />
            </div>
          )}
          {toolbar?.(table)}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <CardSkeleton key={index} lines={2} />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const cells = row.getVisibleCells()
            const primaryCells = cells.filter(
              (cell) => resolveCardDisplay(cell) === "primary"
            )
            const secondaryCells = cells.filter(
              (cell) => resolveCardDisplay(cell) === "secondary"
            )
            const expandableCells = cells.filter(
              (cell) => resolveCardDisplay(cell) === "expandable"
            )

            return (
              <li key={row.id}>
                <Card>
                  {primaryCells.length > 0 && (
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      {primaryCells.map((cell) => (
                        <div key={cell.id} className="text-base font-semibold">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </div>
                      ))}
                    </CardHeader>
                  )}
                  {secondaryCells.length > 0 && (
                    <CardContent className="flex flex-col gap-1.5 text-sm">
                      {secondaryCells.map((cell) => (
                        <div
                          key={cell.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="shrink-0 text-muted-foreground">
                            {resolveColumnLabel(
                              cell.column.columnDef.header,
                              cell.column.id
                            )}
                          </span>
                          <span className="truncate text-right">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  )}
                  {expandableCells.length > 0 && (
                    <CardContent className="border-t pt-3">
                      <ExpandableCard
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="group w-full justify-between px-2 text-muted-foreground"
                          >
                            <span>Show more</span>
                            <ChevronDown
                              className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                              aria-hidden="true"
                            />
                          </Button>
                        }
                      >
                        <div className="flex flex-col gap-1.5 pt-2 text-sm">
                          {expandableCells.map((cell) => (
                            <div
                              key={cell.id}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="shrink-0 text-muted-foreground">
                                {resolveColumnLabel(
                                  cell.column.columnDef.header,
                                  cell.column.id
                                )}
                              </span>
                              <span className="truncate text-right">
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ExpandableCard>
                    </CardContent>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}

      {enablePagination && !isLoading && (
        <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      )}
    </div>
  )
}
