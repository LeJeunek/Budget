"use client"

/**
 * BudgetAdvisorCard — AI Budget Advisor's read-only recommendations card
 * (docs/product/ai-features.md Feature 2). Composed entirely from existing
 * `components/ui` primitives (`Card`, `Button`) and `lucide-react` icons, per
 * this role's "never build reusable components" boundary — nothing here is
 * a new design-system primitive, matching `suggestion-badge.tsx`'s exact
 * precedent for how Feature 1's AI surface was assembled.
 *
 * Visual language for AI-authored text (Cross-Cutting Product Requirement
 * #3) mirrors `suggestion-badge.tsx`'s dashed-border + Sparkles-icon
 * treatment, so a user sees the same visual cue for "this is AI-generated"
 * across every Phase 4a surface rather than four different treatments.
 *
 * Only ever rendered by `app/(dashboard)/budgeting/page.tsx` when the
 * current month has at least one budgeted category (Feature 2 AC1/Edge
 * Cases: "zero categories with an allocation set — the advisor card does not
 * render at all") and is the current, editable month (AC5) — both checks
 * live in the page, not here, since `getBudgetAdvisorRecommendations` itself
 * already enforces them server-side as its own structural safety net.
 *
 * `text` renders as a plain text node only (never `dangerouslySetInnerHTML`/
 * a markdown pipeline), per `ai-features-design.md` Finding 1c's rendering
 * requirement, restated in api-contracts.md's Feature 2 section.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { refreshBudgetAdvisor } from "@/features/budgeting/server/actions"
import type { BudgetAdvisorRecommendations } from "@/features/budgeting/server/advisor-schema"
import type { AiFeatureResult } from "@/lib/ai/types"

export interface BudgetAdvisorCardProps {
  /** `"YYYY-MM"` — always the current, editable month (the page never
   * fetches/renders this card for a past month, per Feature 2 AC5). */
  month: string
  initialResult: AiFeatureResult<BudgetAdvisorRecommendations>
}

export function BudgetAdvisorCard({ month, initialResult }: BudgetAdvisorCardProps) {
  const router = useRouter()
  const [result, setResult] = useState(initialResult)
  // AC4: "collapsing/dismissing the card (a UI display preference, not a
  // data-deleting action)" — plain client-side toggle, never persisted.
  const [collapsed, setCollapsed] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      const response = await refreshBudgetAdvisor({ month })
      if (!response.success) {
        // A rate-limit rejection (or any other request-level failure) —
        // surfaced via the outer ApiResult, per api-contracts.md's
        // ApiResult<AiFeatureResult<T>> composition note.
        toast.error(response.error)
        return
      }
      setResult(response.data)
      if (response.data.status === "ok") {
        toast.success("Recommendations refreshed.")
      } else {
        toast.error("Budget advice isn't available right now.")
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
          Budget Advisor
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh recommendations"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand advisor card" : "Collapse advisor card"}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          {result.status === "unavailable" ? (
            // Edge Case: "AI provider unavailable... the card shows 'Budget
            // advice isn't available right now' with a retry action; the
            // rest of the Budgeting page renders and functions completely
            // normally regardless" — this card's own failure never blocks
            // anything else on the page (it's a self-contained Card).
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">
                Budget advice isn&apos;t available right now.
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
              {result.data.recommendations.map((recommendation, index) => (
                <li
                  key={index}
                  className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm text-foreground"
                >
                  {recommendation.text}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  )
}
