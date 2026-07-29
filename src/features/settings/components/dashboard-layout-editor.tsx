"use client"

/**
 * <DashboardLayoutEditor> — Dashboard Layout capability AC1/AC2/AC3/AC4/AC5:
 * show/hide any card, reorder visible cards, block hiding the last visible
 * card with a clear explanation, and a "Reset to Default Layout" action.
 * Charts and stat cards are drawn from the exact same
 * `DASHBOARD_CARD_KEYS`-backed list (`server/service.ts`'s
 * `getDashboardCardPreferences`), so this component draws no distinction
 * between the two (AC5) — it simply renders whatever `DashboardCardView[]`
 * it's given.
 *
 * Reordering is exposed via up/down move buttons rather than pointer-based
 * drag-and-drop: no drag-and-drop library (e.g. `@dnd-kit/core`) is installed
 * in this codebase yet, and adding one is a new-dependency/new-reusable-
 * interaction-pattern decision for the Frontend Lead / UI Component Engineer,
 * not this dispatch's call to make unilaterally. Up/down buttons produce the
 * exact same `reorderDashboardCards` write (a complete new `orderedKeys`
 * array) a drag-and-drop implementation would — this is a interaction-model
 * substitute, not a different data contract, so swapping in real
 * drag-and-drop later requires no backend change at all.
 */

import { toast } from "sonner"
import { ArrowDown, ArrowUp, EyeIcon, EyeOffIcon, RotateCcwIcon } from "lucide-react"

import type { DashboardCardView } from "@/features/settings/types"
import {
  useDashboardCardPreferences,
  useReorderDashboardCards,
  useResetDashboardLayout,
  useUpdateDashboardCardVisibility,
} from "@/features/settings/hooks/use-dashboard-card-preferences"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

function reportMutationError(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback)
}

/** Swaps the card at `index` with its neighbor at `index + direction`,
 * returning a brand-new ordered array of every card's `key` — the complete
 * shape `reorderDashboardCards` expects (§3.5: a reorder always supplies the
 * full order, never a sparse delta). */
function swap(cards: DashboardCardView[], index: number, direction: -1 | 1): string[] {
  const next = [...cards]
  const target = index + direction
  ;[next[index], next[target]] = [next[target], next[index]]
  return next.map((card) => card.key)
}

export interface DashboardLayoutEditorProps {
  initialCards: DashboardCardView[]
}

export function DashboardLayoutEditor({ initialCards }: DashboardLayoutEditorProps) {
  const { data: cards } = useDashboardCardPreferences(initialCards)
  const updateVisibility = useUpdateDashboardCardVisibility()
  const reorder = useReorderDashboardCards()
  const reset = useResetDashboardLayout()

  const visibleCount = cards.filter((card) => card.visible).length
  const sorted = [...cards].sort((a, b) => a.order - b.order)

  function handleToggleVisible(card: DashboardCardView) {
    updateVisibility.mutate(
      { key: card.key, visible: !card.visible },
      {
        onError: (error) =>
          reportMutationError(error, "Could not update this card's visibility."),
      },
    )
  }

  function handleMove(index: number, direction: -1 | 1) {
    reorder.mutate(
      { orderedKeys: swap(sorted, index, direction) },
      {
        onError: (error) => reportMutationError(error, "Could not reorder Dashboard cards."),
      },
    )
  }

  function handleReset() {
    reset.mutate(undefined, {
      onError: (error) => reportMutationError(error, "Could not reset the Dashboard layout."),
    })
  }

  const isBusy = updateVisibility.isPending || reorder.isPending

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Dashboard layout</CardTitle>
          <CardDescription>
            Show or hide cards and reorder the ones you keep. Hiding a card
            never stops its data from being computed — it&rsquo;s only hidden
            from this view.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reset.isPending}
          onClick={handleReset}
        >
          <RotateCcwIcon className="size-4" aria-hidden="true" />
          Reset to Default Layout
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {sorted.map((card, index) => {
            const isLastVisible = card.visible && visibleCount <= 1
            return (
              <li
                key={card.key}
                className={cn(
                  "flex items-center justify-between gap-4 py-2",
                  !card.visible && "opacity-60",
                )}
              >
                <span className="text-sm font-medium text-foreground">{card.label}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${card.label} up`}
                    disabled={isBusy || index === 0}
                    onClick={() => handleMove(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${card.label} down`}
                    disabled={isBusy || index === sorted.length - 1}
                    onClick={() => handleMove(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={card.visible}
                    disabled={isBusy || isLastVisible}
                    title={
                      isLastVisible
                        ? "At least one Dashboard card must remain visible"
                        : undefined
                    }
                    onClick={() => handleToggleVisible(card)}
                  >
                    {card.visible ? (
                      <>
                        <EyeIcon className="size-4" aria-hidden="true" />
                        Visible
                      </>
                    ) : (
                      <>
                        <EyeOffIcon className="size-4" aria-hidden="true" />
                        Hidden
                      </>
                    )}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
