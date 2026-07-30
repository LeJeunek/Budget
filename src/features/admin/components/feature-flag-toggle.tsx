"use client"

/**
 * FeatureFlagToggle — one flag's row: name/description, current state, and
 * its toggle (admin.md Capability 4 AC1). The toggle button itself reuses
 * `NotificationPreferencesList`'s own `role="switch"`/`aria-checked`
 * Button-based composition (see that file's JSDoc — no shadcn `Switch`
 * primitive exists under `components/ui/` yet), not a new toggle control.
 *
 * Owns its own mutation state (no shared hook) — the same "each toggle
 * button is fully self-contained" isolation `NotificationPreferencesList`'s
 * `PreferenceToggleButton` documents (see that file's "Bug fix" JSDoc note):
 * with only two flags today this isolation mostly matters as the pattern to
 * keep following, not a live bug, but it costs nothing to get right now.
 *
 * `router.refresh()` after a successful toggle re-runs `app/admin/
 * feature-flags/page.tsx`'s Server Component read
 * (`admin.server/feature-flags.getFeatureFlags`), which is how the new
 * `enabled`/`updatedAt` state reaches this row — no dedicated TanStack Query
 * hook, per this module's own "no client-refetch hook anywhere" design
 * (phase-4c-technical-design.md §7.2).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toggleFeatureFlag } from "@/features/admin/server/actions"
import type { FeatureFlagView } from "@/features/admin/types"

// Friendly copy for the two flags admin.md Capability 4 AC2 requires.
// Deliberately keyed by `flag.key` (a plain string, per `FeatureFlagView`'s
// own doc comment) with a graceful fallback to the raw key below — a future
// flag key this map hasn't been updated for yet must still render, never
// crash (risk-register.md #36's "stale/renamed key degrades gracefully").
const FEATURE_FLAG_COPY: Record<string, { label: string; description: string }> = {
  AI_FEATURES: {
    label: "AI Features",
    description:
      "Auto-categorization suggestions, Budget Advisor, Monthly Summaries, Spending Insights, and the Health Score's narrative layer. Off degrades exactly like an unavailable AI provider — the Health Score's own deterministic numeric formula is unaffected.",
  },
  EMAIL_DELIVERY: {
    label: "Email Delivery",
    description:
      "All outbound notification email. Off degrades exactly like a failed email send — in-app notifications keep working.",
  },
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export interface FeatureFlagToggleProps {
  flag: FeatureFlagView
}

export function FeatureFlagToggle({ flag }: FeatureFlagToggleProps) {
  const router = useRouter()
  const [isPending, setIsPending] = React.useState(false)
  const copy = FEATURE_FLAG_COPY[flag.key]
  const label = copy?.label ?? flag.key

  async function handleToggle() {
    setIsPending(true)
    try {
      const result = await toggleFeatureFlag({ key: flag.key })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${label} ${result.data.enabled ? "enabled" : "disabled"}.`)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {copy?.description && (
            <p className="max-w-xl text-xs text-muted-foreground">{copy.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Last changed {formatDateTime(flag.updatedAt)}
          </p>
        </div>
        <Button
          type="button"
          role="switch"
          aria-checked={flag.enabled}
          aria-label={`${label} — ${flag.enabled ? "on" : "off"}`}
          variant={flag.enabled ? "default" : "outline"}
          size="sm"
          disabled={isPending}
          onClick={handleToggle}
          className="w-16 justify-center"
        >
          {flag.enabled ? "On" : "Off"}
        </Button>
      </CardContent>
    </Card>
  )
}
