"use client"

/**
 * SuggestionBadge — the accept/reject affordance for one PENDING
 * `CategorySuggestion` row, per docs/product/ai-features.md Feature 1 AC3
 * ("shown inline ... with clear Accept and Reject actions, distinct from the
 * transaction's actual category field") and Cross-Cutting Product
 * Requirement #3 ("AI-generated content is visually distinguished from
 * computed facts" — the dashed border + Sparkles icon here is that "small
 * label/icon").
 *
 * Composed entirely from existing primitives (`components/ui/badge.tsx`,
 * `components/ui/button.tsx`) and `lucide-react` icons, per this role's
 * "never build reusable components" boundary — nothing here is a new
 * design-system primitive.
 *
 * Used both inline in `transaction-table.tsx`'s category cell and (identical
 * markup/behavior) anywhere else a pending suggestion needs to be reviewed,
 * so accept/reject's actual mutation logic lives in exactly one place rather
 * than being re-implemented per call site.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  acceptCategorySuggestion,
  rejectCategorySuggestion,
} from "@/features/transactions/server/actions"
import type { PendingCategorySuggestion } from "@/features/transactions/server/categorization"

export interface SuggestionBadgeProps {
  suggestion: PendingCategorySuggestion
}

export function SuggestionBadge({ suggestion }: SuggestionBadgeProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isResolving, setIsResolving] = useState(false)

  // ai-features.md's own edge case: "the suggested category is deleted
  // between suggestion generation and the user viewing/accepting it — the
  // suggestion is invalidated and the transaction shows as plain
  // Uncategorized with no suggestion." `acceptCategorySuggestion` already
  // enforces this server-side (it rejects and marks the row REJECTED), but a
  // PENDING row with a null `suggestedCategoryName` can still reach this
  // component in the brief window before that resolution — nothing safe to
  // show or accept, so render nothing rather than a blank/broken badge.
  if (!suggestion.suggestedCategoryName) {
    return null
  }

  async function resolve(action: "accept" | "reject") {
    setIsResolving(true)
    try {
      const result =
        action === "accept"
          ? await acceptCategorySuggestion({ suggestionId: suggestion.id })
          : await rejectCategorySuggestion({ suggestionId: suggestion.id })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        action === "accept"
          ? `Categorized as "${suggestion.suggestedCategoryName}".`
          : "Suggestion dismissed.",
      )

      // Accepting rewrites the transaction's own `categoryId` — the table's
      // row data comes from TanStack Query (`useTransactions`, fetched via
      // `GET /api/transactions`), which `router.refresh()` below does NOT
      // touch (it only re-runs Server Component reads), so the category
      // badge would otherwise keep showing the stale value until an
      // unrelated refetch happened. Invalidating is a harmless no-op for the
      // reject path (which never touches Transaction data).
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      // Re-runs page.tsx's `getPendingSuggestions` call, which is how this
      // exact suggestion disappears from view once resolved — matches the
      // established Server-Action-then-`router.refresh()` convention used
      // throughout this feature (e.g. category-manager-dialog.tsx).
      router.refresh()
    } finally {
      setIsResolving(false)
    }
  }

  const confidencePercent =
    suggestion.confidence !== null ? Math.round(suggestion.confidence * 100) : null

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge
        variant="outline"
        className="gap-1 border-dashed text-muted-foreground"
      >
        <Sparkles className="size-3" aria-hidden="true" />
        Suggested: {suggestion.suggestedCategoryName}
        {confidencePercent !== null ? ` (${confidencePercent}%)` : null}
      </Badge>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Accept suggested category ${suggestion.suggestedCategoryName}`}
        onClick={() => resolve("accept")}
        disabled={isResolving}
      >
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Reject suggested category"
        onClick={() => resolve("reject")}
        disabled={isResolving}
      >
        <X className="size-3.5 text-destructive" aria-hidden="true" />
      </Button>
    </div>
  )
}
