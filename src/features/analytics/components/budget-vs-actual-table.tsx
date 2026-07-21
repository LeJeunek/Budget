/**
 * BudgetVsActualTable — Budget vs. Actual (analytics.md AC9): each category's
 * allocated amount against its actual spend, across every month in the
 * selected period at once — Budgeting's own one-month-at-a-time planner view
 * reshaped into a multi-month table so a user can spot categories that are
 * chronically over- or under-budget, not just this month's.
 *
 * Laid out as one row per category, one column per month (rather than one
 * section per month) so "chronically over budget" is something a user can
 * see at a glance scanning a single row left to right — the layout analytics.md
 * AC9 is actually asking for ("across multiple months at once"), not a
 * month-by-month repeat of Budgeting's own table. Wrapped in `Table`'s own
 * `overflow-x-auto` container (`components/ui/table.tsx`) for periods with
 * many months (e.g. Last 12 Months/All Time) rather than a custom scroll
 * shim.
 *
 * Presentational only: `app/(dashboard)/analytics/page.tsx` fetches
 * `BudgetVsActualMonth[]` and passes it down verbatim. A plain Server
 * Component — no hooks/interactivity of its own — even though
 * `components/ui/table.tsx` happens to be marked `"use client"` internally;
 * a Server Component can render a Client Component as a child without
 * itself needing the directive.
 */

import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { BudgetVsActualMonth } from "../types"
import { formatMonthLabel } from "./chart-format"

export interface BudgetVsActualTableProps {
  data: BudgetVsActualMonth[]
}

interface CategoryRow {
  categoryId: string
  categoryName: string
  /** `byMonth.get(month)` = that month's `{ allocated, actual }` for this
   * category — absent (not just `{ allocated: null, actual: 0 }`) when the
   * category had no allocation and no spend that month at all, rendered as a
   * plain "—" cell rather than a misleading $0 row. */
  byMonth: Map<string, { allocated: number | null; actual: number }>
}

/** Reshapes the service's per-month array into the per-category rows this
 * table renders — a category can appear in some months and not others (a
 * budget started partway through the period, or a category only ever had
 * uncategorized-adjacent activity in one month), so the row set is the union
 * across every month, not just the first month's categories. */
function buildCategoryRows(data: BudgetVsActualMonth[]): CategoryRow[] {
  const rowsById = new Map<string, CategoryRow>()

  for (const monthEntry of data) {
    for (const line of monthEntry.categories) {
      const row = rowsById.get(line.categoryId) ?? {
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        byMonth: new Map(),
      }
      row.byMonth.set(monthEntry.month, { allocated: line.allocated, actual: line.actual })
      rowsById.set(line.categoryId, row)
    }
  }

  return [...rowsById.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName))
}

export function BudgetVsActualTable({ data }: BudgetVsActualTableProps) {
  const categoryRows = buildCategoryRows(data)

  if (data.length === 0 || categoryRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget vs. Actual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium text-foreground">
              No budget or spending history in this period yet
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Set up a monthly budget in Budgeting to start comparing planned
              vs. actual spend across months here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs. Actual</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              {data.map((monthEntry) => (
                <TableHead key={monthEntry.month} className="text-right">
                  {formatMonthLabel(monthEntry.month)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryRows.map((row) => (
              <TableRow key={row.categoryId}>
                <TableCell className="font-medium text-foreground">
                  {row.categoryName}
                </TableCell>
                {data.map((monthEntry) => {
                  const cell = row.byMonth.get(monthEntry.month)
                  if (!cell) {
                    return (
                      <TableCell key={monthEntry.month} className="text-right text-muted-foreground">
                        —
                      </TableCell>
                    )
                  }

                  const isOverBudget = cell.allocated !== null && cell.actual > cell.allocated

                  return (
                    <TableCell
                      key={monthEntry.month}
                      className={cn("text-right", isOverBudget && "text-destructive")}
                    >
                      {formatCurrency(cell.actual)}
                      <span className="text-muted-foreground">
                        {" / "}
                        {cell.allocated === null ? "unset" : formatCurrency(cell.allocated)}
                      </span>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
