/**
 * Analytics' route-level loading state — Next.js renders this automatically
 * while `page.tsx`'s Server Component (twelve parallel `Promise.all` reads
 * across several feature modules) resolves, per Next.js's file-convention
 * Suspense boundary. Analytics is the heaviest data-fetching page in this
 * app (every other Server Component page fetches at most a handful of reads
 * — this one fetches all eleven metrics at once), so unlike most other
 * routes here it earns its own loading skeleton rather than a blank screen
 * during that first request.
 *
 * Composed entirely from the existing shared skeleton primitives
 * (`components/shared/loading-skeleton.tsx`) — no new reusable component
 * introduced, per this role's "assemble, never build reusable components"
 * boundary.
 */

import { CardSkeleton, TableSkeleton } from "@/components/shared/loading-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-72" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>

      <CardSkeleton lines={6} />

      <TableSkeleton rows={6} columns={5} />

      <CardSkeleton lines={5} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableSkeleton rows={5} columns={4} />
        <TableSkeleton rows={5} columns={4} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>

      <CardSkeleton lines={4} />

      <TableSkeleton rows={4} columns={7} />
    </div>
  )
}
