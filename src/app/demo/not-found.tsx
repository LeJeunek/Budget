import Link from "next/link"
import { Compass } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

/**
 * Shared "this isn't part of the demo" state, per
 * docs/architecture/public-demo-technical-design.md §1. Next.js renders this
 * file for any unresolved path under `src/app/demo/**` — both a genuinely
 * unknown route (`src/app/demo/[...catchAll]/page.tsx` calls `notFound()`
 * unconditionally) and every dynamic detail page's own "id doesn't resolve"
 * case (`accounts/[accountId]`, `goals/[goalId]`, `financial-goals/[goalId]`,
 * `investments/[holdingId]`) — resolve here, within `layout.tsx`'s own
 * nav/banner chrome (Next.js renders a segment's `not-found.tsx` inside that
 * segment's own layout tree, never as a bare page), so a visitor who
 * mistypes a URL still has the demo's own navigation available to recover
 * (public-demo.md Capability 5's Edge Case: "never a hard crash, and never
 * silently falling through to render the real, authenticated page").
 */
export default function DemoNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Compass className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-heading text-base font-medium text-foreground">
              Not part of this demo
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This page isn&apos;t included in the FinanceOS demo. Head back
              to the demo dashboard to keep exploring.
            </p>
          </div>
          <Link
            href="/demo"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to demo dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
