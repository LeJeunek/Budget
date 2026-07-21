/**
 * Small presentation-only helpers shared across every Financial Goals
 * component (the card, the detail page, and all three type-specific forms) —
 * split into its own module for the same reason
 * `features/dashboard/components/chart-format.ts` and
 * `features/debt/components/debt-form-schema.ts`'s `DEBT_TYPE_LABELS` are:
 * one small shared file beats duplicating the same label map/formatter in
 * three or four sibling component files.
 *
 * Nothing here computes progress/completion — that math lives exclusively in
 * `features/financial-goals/server/progress-math.ts` (Backend Engineer-owned)
 * and is never duplicated client-side, per financial-goals.md's own
 * "zero independently-duplicated numbers anywhere" bar. `clampPercent` below
 * is presentation-only (bounding a fill bar's visual width), not a second
 * copy of any backend formula.
 */

import type { FinancialGoalType, MeasurementBasis } from "@/features/financial-goals/types"

/** Human-readable labels for `FinancialGoalType` — the raw Prisma enum value
 * is never shown directly to the user, matching `DEBT_TYPE_LABELS`'s own
 * convention. */
export const FINANCIAL_GOAL_TYPE_LABELS: Record<FinancialGoalType, string> = {
  DEBT_PAYOFF: "Debt Payoff",
  NET_WORTH_SAVINGS_TARGET: "Net Worth / Savings Target",
  SAVINGS_RATE_TARGET: "Savings Rate Target",
}

/** Human-readable labels for `MeasurementBasis` (Type 2 only). */
export const MEASUREMENT_BASIS_LABELS: Record<MeasurementBasis, string> = {
  TOTAL_NET_WORTH: "Total Net Worth",
  ACCOUNT_SUBSET: "Selected accounts",
}

/**
 * Bounds a ratio to a `[0, 100]` percentage for a *visual* fill bar only
 * (`components/ui/progress.tsx`'s `value` prop) — never used to derive
 * `isCompleted` or any other field a consumer might mistake for real
 * progress math. Mirrors `features/goals/components/goal-card.tsx`'s own
 * `ProgressRing` clamp precedent: the bar's fill caps visually at 100%/0%,
 * while the exact (possibly negative, possibly >100%) figure is always shown
 * alongside as plain text per the Dashboard's "never hide a negative number"
 * convention (financial-goals.md's Edge Cases).
 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

/** `"yyyy-MM"` -> `"August 2026"` — duplicated per-feature the same way
 * `debt-card.tsx`'s own `formatMonthLabel` is (folder-tree.md's module
 * boundary rule: `features/<domain>/components` isn't a shared import
 * target across domains). Used for the Net Worth trend sparkline's tooltip
 * and any other month-labeled display this feature needs. */
export function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}
