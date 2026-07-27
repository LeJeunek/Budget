"use client"

/**
 * MonthlySummaryCard — Automatic Monthly Summaries' Dashboard card
 * (docs/product/ai-features.md Feature 3: "the most recently completed
 * month's summary is surfaced on the Dashboard as its own card"). Composed
 * entirely from existing `components/ui` primitives (`Card`, `Button`,
 * `Badge`, `Dialog`, `ScrollArea`) — no new reusable primitive, matching
 * `suggestion-badge.tsx`'s precedent for how a Phase 4a AI surface is
 * assembled from existing pieces.
 *
 * The narrative's dashed-border + Sparkles-icon treatment mirrors
 * `budget-advisor-card.tsx`/`suggestion-badge.tsx` exactly, per Cross-Cutting
 * Product Requirement #3's "one consistent visual language across every AI
 * surface" instruction.
 *
 * **History (AC5, "a history of all past monthly summaries is browsable")**
 * — judgment call: rendered as an in-page `Dialog` listing every past
 * `MonthlyRecap` rather than a dedicated new route. The product spec's own
 * wording ("browsable elsewhere, e.g. alongside Analytics") is explicitly an
 * example, not a mandated location; a Dialog fully satisfies "browsable" with
 * zero added routing/nav surface for a feature whose own spec frames it as a
 * lightweight, read-only history list, not a primary destination.
 *
 * `narrative` always renders as a plain text node (never
 * `dangerouslySetInnerHTML`/a markdown pipeline), per Finding 1c.
 *
 * **Bugfix (docs/testing/bug-reports/
 * monthly-summary-card-stale-state-after-refresh.md):** this card used to
 * seed its main body from a `useState(summary)` local mirror (`current`),
 * which — like `SpendingInsightsWidget`'s identical bug — only applied on
 * first mount; a later `summary` prop change from any `router.refresh()`
 * this card didn't itself trigger (e.g. a concurrent regenerate attempt from
 * another tab/the monthly cron winning `monthly-summary.ts`'s
 * `claimGenerationSlot` race) was silently never reflected, letting the main
 * card body permanently disagree with the "View history" dialog (which
 * always read the fresh `history` prop directly) for the same month. Fixed
 * by removing the local mirror entirely and reading `summary` directly in
 * render — `isRegenerating` remains the only local state, and
 * `router.refresh()` (already called unconditionally after every
 * `handleRegenerate` attempt, success or failure) is the single source of
 * truth for the displayed narrative, matching the "View history" dialog's
 * existing (correct) behavior.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { formatMonthLabel } from "@/components/shared/month-utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { regenerateMonthlySummary } from "@/features/dashboard/server/actions"
import type { MonthlyRecap } from "@/features/dashboard/server/monthly-summary-schema"

export interface MonthlySummaryCardProps {
  /** `null` only for a brand-new user with no completed month yet (Feature
   * 3's own "no fabricated first month" edge case). */
  summary: MonthlyRecap | null
  /** Every past month's summary, most recent first — including months whose
   * generation failed (`narrative: null`), per Feature 3's "never a month
   * silently missing from history with no explanation" edge case. */
  history: MonthlyRecap[]
}

export function MonthlySummaryCard({ summary, history }: MonthlySummaryCardProps) {
  const router = useRouter()
  const [isRegenerating, setIsRegenerating] = useState(false)

  async function handleRegenerate() {
    if (!summary) return
    setIsRegenerating(true)
    try {
      const response = await regenerateMonthlySummary({ month: summary.month })
      if (!response.success) {
        toast.error(response.error)
        return
      }
      if (response.data.status === "ok") {
        toast.success("Recap regenerated.")
      } else {
        toast.error("Summary isn't available right now — try again later.")
      }
      // Single source of truth for the displayed narrative: re-fetches
      // `summary`/`history` from the Server Component regardless of which
      // branch above ran, so a concurrent regenerate attempt that won the
      // generation-slot race (see this file's module doc) is reflected here
      // too, not just in the already-fresh "View history" dialog.
      router.refresh()
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>
          {summary ? `Your ${formatMonthLabel(summary.month)} Recap` : "Monthly Recap"}
        </CardTitle>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={history.length === 0}>
              View history
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Monthly recap history</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-80">
              <ul className="flex flex-col gap-3 pr-3">
                {history.map((entry) => (
                  <li
                    key={entry.month}
                    className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {formatMonthLabel(entry.month)}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {entry.narrative ??
                        `Summary not available for ${formatMonthLabel(entry.month)}.`}
                    </p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {summary === null ? (
          // Feature 3 edge case: a brand-new user has no completed month yet
          // — never a fabricated recap for a month they weren't present for.
          <p className="text-sm text-muted-foreground">
            No monthly recap yet — check back after your first full month of
            activity.
          </p>
        ) : summary.narrative === null ? (
          // Edge Case: "Summary not available for [Month]" — never a blank
          // space or a silently missing month.
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Summary not available for {formatMonthLabel(summary.month)}.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCw
                className={cn("size-3.5", isRegenerating && "animate-spin")}
                aria-hidden="true"
              />
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.isPartialMonth && (
              <div>
                <Badge variant="secondary">Partial month</Badge>
              </div>
            )}
            <p className="flex items-start gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
              <Sparkles
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>{summary.narrative}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
