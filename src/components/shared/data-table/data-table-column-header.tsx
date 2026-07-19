"use client"

/**
 * DataTableColumnHeader — sortable column header button for use inside a
 * `ColumnDef["header"]` renderer. Domain-agnostic: it only needs the
 * TanStack `Column` instance and a title string.
 *
 * Usage (inside a feature's column definitions, e.g. `features/transactions`):
 * ```tsx
 * const columns: ColumnDef<Transaction>[] = [
 *   {
 *     accessorKey: "date",
 *     header: ({ column }) => (
 *       <DataTableColumnHeader column={column} title="Date" />
 *     ),
 *   },
 * ]
 * ```
 */

import * as React from "react"
import type { Column } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface DataTableColumnHeaderProps<TData, TValue>
  extends React.ComponentProps<"div"> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  ...props
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn("text-sm font-medium", className)} {...props}>
        {title}
      </div>
    )
  }

  const sorted = column.getIsSorted()

  return (
    <div className={cn("flex items-center", className)} {...props}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 h-7 gap-1.5 px-2.5 data-[state=open]:bg-accent"
        aria-label={`Sort by ${title}${
          sorted === "asc" ? ", currently ascending" : sorted === "desc" ? ", currently descending" : ""
        }`}
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        <span>{title}</span>
        {sorted === "asc" ? (
          <ArrowUp className="size-3.5" aria-hidden="true" />
        ) : sorted === "desc" ? (
          <ArrowDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
