/**
 * FinancialHealthScoreNarrativeCard — the optional AI-generated explanation
 * accompanying the score (docs/product/ai-features.md Feature 5 AC5/AC6).
 * Composed entirely from existing `components/ui` primitives (`Card`) — no
 * new reusable primitive.
 *
 * Mirrors `budget-advisor-card.tsx`'s/`monthly-summary-card.tsx`'s/
 * `suggestion-badge.tsx`'s dashed-border + Sparkles-icon treatment, per
 * Cross-Cutting Product Requirement #3's "one consistent visual language."
 *
 * **No refresh action here, deliberately** — per api-contracts.md's Feature
 * 5 section: "Deliberately, `refreshSpendingInsights`-style on-demand
 * regeneration does not exist for the Health Score narrative... generated
 * only as a side effect of the same cron invocation that captures the
 * historical snapshot." This card is a plain, read-only render of whatever
 * `getLatestNarrative` currently returns.
 *
 * A Server Component (no interactivity) — reused by
 * `app/(dashboard)/financial-health-score/page.tsx`. `narrative` always
 * renders as a plain text node (never `dangerouslySetInnerHTML`/a markdown
 * pipeline), per Finding 1c.
 */

import { Sparkles } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AiFeatureResult } from "@/lib/ai/types"

export interface FinancialHealthScoreNarrativeCardProps {
  narrative: AiFeatureResult<{ narrative: string; asOf: string }>
}

export function FinancialHealthScoreNarrativeCard({
  narrative,
}: FinancialHealthScoreNarrativeCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
          What&apos;s driving your score
        </CardTitle>
      </CardHeader>
      <CardContent>
        {narrative.status === "unavailable" ? (
          // Edge Case: "the score, its banded label, and its four-component
          // breakdown display fully and correctly regardless — only the
          // narrative section shows 'Explanation isn't available right
          // now'" — this card's own failure never affects the rest of the
          // page (it's a self-contained Card).
          <p className="text-sm text-muted-foreground">
            Explanation isn&apos;t available right now.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
            <Sparkles
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>{narrative.data.narrative}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
