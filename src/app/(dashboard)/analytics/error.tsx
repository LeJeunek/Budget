"use client"

/**
 * Analytics' route-level error boundary — Next.js requires this file to be a
 * Client Component (App Router's `error.tsx` convention). Catches a render/
 * data-fetch failure anywhere in `page.tsx`'s twelve-way `Promise.all` (one
 * failing metric read would otherwise take down the whole page rather than
 * just that one card, contradicting analytics.md AC3's "one metric's failure
 * must never blank out the ten others" spirit at the page level, not just
 * the empty-state level) and offers a retry via `reset()`, matching
 * Next.js's own standard error-boundary shape.
 *
 * No other route in this app currently defines its own `error.tsx` — added
 * here specifically because Analytics is this app's heaviest single-page
 * aggregation (eleven metrics, several cross-feature service calls per
 * request), the highest-surface-area page for a single query to fail.
 */

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaced for local/server log visibility; this app has no client-side
    // error-reporting service wired up yet, so `console.error` is the same
    // level of visibility every other unhandled error in this codebase
    // currently gets.
    console.error("Analytics page failed to load:", error)
  }, [error])

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-heading text-base font-medium text-foreground">
          Analytics couldn&apos;t load
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Something went wrong pulling your analytics data. Your data is
          safe — this is just a temporary glitch loading this page.
        </p>
        <Button onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  )
}
