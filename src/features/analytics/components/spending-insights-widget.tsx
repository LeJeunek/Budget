"use client"

/**
 * SpendingInsightsWidget — Spending Insights' Analytics-page widget
 * (docs/product/ai-features.md Feature 4). Composed entirely from existing
 * `components/ui` primitives (`Card`, `Button`, `Badge`) — no new reusable
 * primitive, matching `suggestion-badge.tsx`'s/`budget-advisor-card.tsx`'s
 * precedent for how a Phase 4a AI surface is assembled.
 *
 * Respects Analytics' own shared reporting-period control (AC5) — `period`
 * is passed down from `app/(dashboard)/analytics/page.tsx`'s already-resolved
 * `ReportingPeriod`, never a second, competing period concept.
 *
 * Each insight's dashed-border + Sparkles-icon treatment mirrors
 * `budget-advisor-card.tsx`/`monthly-summary-card.tsx`/`suggestion-badge.tsx`
 * exactly, per Cross-Cutting Product Requirement #3.
 *
 * **Judgment call (Edge Cases' two distinct empty-state messages):**
 * `getSpendingInsights`/`refreshSpendingInsights` only ever return a single
 * `{ status: "unavailable" }` outcome — api-contracts.md's own note says
 * distinguishing "not enough data yet for insights" from "Insights aren't
 * available right now" for copy purposes is "the caller's job, using signals
 * it already has independently," but this page has no independent, cheap
 * signal for "which of the two happened" without re-deriving all six
 * Analytics metrics itself (which would duplicate `insights.ts`'s own
 * candidate-gathering, exactly what this feature's Dependencies section
 * forbids). A single honest, non-technical message covering both cases is
 * used instead, so neither case is ever misrepresented as the other.
 *
 * `text` always renders as a plain text node (never
 * `dangerouslySetInnerHTML`/a markdown pipeline), per Finding 1c.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { refreshSpendingInsights } from "@/features/analytics/server/actions"
import type { SpendingInsight, SpendingInsightsPeriod } from "@/features/analytics/types"
import type { AiFeatureResult } from "@/lib/ai/types"

export interface SpendingInsightsWidgetProps {
  period: SpendingInsightsPeriod
  initialResult: AiFeatureResult<SpendingInsight[]>
}

/** Kebab-case wire values `refreshSpendingInsights`'s Server Action input
 * schema (`server/validation.ts`'s `RefreshSpendingInsightsSchema`) expects —
 * the reverse of that file's own `SPENDING_INSIGHTS_PERIOD_PARAM_TO_ENUM`
 * map. Kept here (not imported) since that map is a private implementation
 * detail of the Server Action's input validation, not an exported contract. */
const PERIOD_TO_KEBAB: Record<SpendingInsightsPeriod, string> = {
  THIS_YEAR: "this-year",
  LAST_12_MONTHS: "last-12-months",
  YEAR_TO_DATE: "year-to-date",
  ALL_TIME: "all-time",
  DASHBOARD_DEFAULT: "dashboard-default",
}

const SOURCE_METRIC_LABEL: Record<SpendingInsight["sourceMetric"], string> = {
  categoryTrends: "Category Trends",
  topMerchants: "Top Merchants",
  largestPurchases: "Largest Purchases",
  subscriptionDetection: "Subscriptions",
  dailySpendingHeatmap: "Spending Heatmap",
  savingsGrowth: "Savings Growth",
}

export function SpendingInsightsWidget({ period, initialResult }: SpendingInsightsWidgetProps) {
  const router = useRouter()
  const [result, setResult] = useState(initialResult)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      const response = await refreshSpendingInsights({ period: PERIOD_TO_KEBAB[period] })
      if (!response.success) {
        toast.error(response.error)
        return
      }
      setResult(response.data)
      if (response.data.status === "ok") {
        toast.success("Insights refreshed.")
      } else {
        toast.error("Insights aren't available right now.")
      }
      router.refresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          Spending Insights
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh insights"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={cn("size-4", isRefreshing && "animate-spin")}
            aria-hidden="true"
          />
        </Button>
      </CardHeader>
      <CardContent>
        {result.status === "unavailable" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Insights aren&apos;t available right now — check back once you
              have more spending history.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              Try again
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.data.map((insight, index) => (
              <li
                key={index}
                className="flex flex-col gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2"
              >
                <p className="flex items-start gap-1.5 text-sm text-foreground">
                  <Sparkles
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{insight.text}</span>
                </p>
                <Badge variant="outline" className="w-fit text-muted-foreground">
                  {SOURCE_METRIC_LABEL[insight.sourceMetric]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
