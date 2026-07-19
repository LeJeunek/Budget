/**
 * Reusable loading-skeleton patterns built on the shadcn `Skeleton`
 * primitive (`components/ui/skeleton.tsx`). Pages/features render these
 * while `Suspense`/query loading states resolve — this file contains no
 * data fetching, only static placeholder markup.
 *
 * Usage:
 * ```tsx
 * // A single stat/card placeholder
 * <CardSkeleton />
 *
 * // A grid of stat card placeholders
 * <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
 *   {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
 * </div>
 *
 * // A table placeholder while a DataTable's data is loading
 * <TableSkeleton rows={8} columns={5} />
 * ```
 */

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface CardSkeletonProps {
  className?: string
  /** Number of body lines to render below the title/value placeholder. */
  lines?: number
}

/** Placeholder matching the general shape of a `StatCard` or summary `Card`. */
export function CardSkeleton({ className, lines = 1 }: CardSkeletonProps) {
  return (
    <Card className={cn(className)} aria-hidden="true">
      <CardHeader>
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-32" />
      </CardHeader>
      {lines > 0 && (
        <CardContent className="flex flex-col gap-2">
          {Array.from({ length: lines }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full max-w-48" />
          ))}
        </CardContent>
      )}
    </Card>
  )
}

export interface TableSkeletonProps {
  className?: string
  rows?: number
  columns?: number
}

/** Placeholder matching the shape of a `DataTable` while data loads. */
export function TableSkeleton({
  className,
  rows = 5,
  columns = 4,
}: TableSkeletonProps) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border", className)}
      aria-hidden="true"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: columns }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex} className="hover:bg-transparent">
              {Array.from({ length: columns }).map((_, columnIndex) => (
                <TableCell key={columnIndex}>
                  <Skeleton className="h-4 w-full max-w-32" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
