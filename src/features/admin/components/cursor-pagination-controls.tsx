import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export interface CursorPaginationControlsProps {
  /** `null` disables the Previous control (already on page 1). */
  prevHref: string | null
  /** `null` disables the Next control (the current page's own `nextCursor`
   * was `null`). */
  nextHref: string | null
}

/**
 * Prev/Next links for Admin's two cursor-paginated views (Users, Audit
 * Log) — see `features/admin/lib/cursor-pagination.ts`'s header comment for
 * why this is plain `<Link>` navigation rather than `DataTable`'s own
 * (client-side/manual-callback-only) pagination controls. A Server
 * Component itself (no `"use client"`) — native anchor navigation needs no
 * client-side state.
 */
export function CursorPaginationControls({
  prevHref,
  nextHref,
}: CursorPaginationControlsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      {prevHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={prevHref}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Previous
        </Button>
      )}
      {nextHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={nextHref}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
