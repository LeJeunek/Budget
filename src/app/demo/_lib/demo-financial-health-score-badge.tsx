"use client"

/**
 * DemoFinancialHealthScoreBadge — route-private (`src/app/demo/_lib/`, a
 * Next.js-ignored path segment, matching `app/(dashboard)/_lib/`'s own
 * convention) mirror of `features/financial-health-score/components/
 * financial-health-score-badge.tsx`'s markup, differing in exactly one
 * respect: this file's `<Link>` points at `/demo/financial-health-score`
 * instead of that component's own hardcoded `/financial-health-score`.
 *
 * Why this duplicate exists rather than importing the real component
 * directly: `FinancialHealthScoreBadge` takes no `href` prop — its
 * destination is a fixed literal pointing at the real, authenticated route.
 * Reusing it unmodified on `/demo`'s Dashboard would render a working link
 * that takes a visitor out of the demo and into the real app's auth-gated
 * `(dashboard)` route group (redirecting to `/login` for an anonymous
 * visitor) — a direct violation of public-demo.md Capability 5 AC4
 * ("nothing under /demo links out to... any authenticated route") and
 * Capability 1 AC6. This is a real gap the technical design's own §3.1
 * "cleanly reusable today" list did not flag (unlike `NetWorthHistoryChart`,
 * which §3.4 named explicitly for an analogous reason) — surfaced here
 * instead of silently worked around, per this codebase's own "name the real
 * risk" standard.
 *
 * This is page-route-scoped composition, not a new shared component: it
 * lives under `src/app/demo/**`, Frontend Lead territory, mirrors
 * `app/(dashboard)/_lib/dashboard-animated-stat-value.tsx`'s identical
 * "route-private, not a components/shared/ primitive" boundary, and is not a
 * modification of the real, already-reviewed `FinancialHealthScoreBadge`
 * (untouched). The real component would ideally grow an optional `href`
 * prop (defaulting to its current literal) — the same additive,
 * zero-behavior-change-for-existing-callers pattern already used for
 * `Sidebar`'s `sections` / `BottomNav`'s `items` (design doc §6.1) — so this
 * duplicate could be retired; that change belongs to the UI Component
 * Engineer, not this role's "assemble, never build/modify reusable
 * components" boundary, and is not made here.
 */

import Link from "next/link"
import { HeartPulse } from "lucide-react"

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { FinancialHealthScoreBreakdown } from "@/features/financial-health-score/types"

export interface DemoFinancialHealthScoreBadgeProps {
  breakdown: FinancialHealthScoreBreakdown
  className?: string
}

// Byte-for-byte copy of the real component's own `LABEL_STYLES` — see that
// file's identical accessibility-fix comment for why emerald-700/red-700,
// not the -600 shades.
const LABEL_STYLES: Record<
  NonNullable<FinancialHealthScoreBreakdown["label"]>,
  string
> = {
  Good: "text-emerald-700 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  "Needs attention": "text-red-700 dark:text-red-400",
}

export function DemoFinancialHealthScoreBadge({
  breakdown,
  className,
}: DemoFinancialHealthScoreBadgeProps) {
  return (
    <Link href="/demo/financial-health-score" className="block">
      <Card className={cn("transition-colors hover:bg-muted/40", className)}>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <span className="text-sm text-muted-foreground">
            Financial Health Score
          </span>
          <HeartPulse
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {breakdown.score === null || breakdown.label === null ? (
            <span className="font-heading text-2xl font-semibold text-muted-foreground">
              Not enough data yet
            </span>
          ) : (
            <>
              <span className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={breakdown.score}
                  format={(n) => Math.round(n).toString()}
                  className="font-heading text-2xl font-semibold text-foreground"
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    LABEL_STYLES[breakdown.label],
                  )}
                >
                  {breakdown.label}
                </span>
              </span>
              {breakdown.undefinedComponents.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Based on {4 - breakdown.undefinedComponents.length} of 4
                  factors
                </span>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
