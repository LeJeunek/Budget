"use client"

/**
 * useChartAnimationProps — the one shared source every Recharts chart
 * consumer spreads onto its Recharts primitive(s) for entrance/update
 * animation (Chart Transitions, Phase 5b), per
 * `docs/architecture/phase-5b-technical-design.md` §5.1.
 *
 * Recharts' own native `isAnimationActive`/`animationDuration`/
 * `animationEasing` props ARE this capability's mechanism (Chart
 * Transitions AC3 — "not a Framer Motion reimplementation of what the
 * charting library already does"). This hook contributes nothing beyond
 * being the one shared place the duration constant and the reduced-motion
 * gate are read from, so all 14 Recharts chart consumers in this app read
 * an identical value rather than each reinventing its own.
 *
 * This hook is intentionally NOT wired into any of the 14 actual chart
 * components by this dispatch — that per-consumer spread-in is the
 * Frontend Lead's later pass, per this pass's own "primitives only" scope.
 *
 * Usage (illustrative — the per-consumer wiring itself is a later pass):
 * ```tsx
 * "use client"
 * function SpendingByCategoryChart() {
 *   const chartAnimationProps = useChartAnimationProps()
 *   return (
 *     <PieChart>
 *       <Pie data={data} dataKey="amount" nameKey="categoryName" {...chartAnimationProps} />
 *     </PieChart>
 *   )
 * }
 * ```
 */

import { useReducedMotion } from "./use-reduced-motion"
import { CHART_TRANSITION_DURATION_MS } from "./constants"

export interface ChartAnimationProps {
  isAnimationActive: boolean
  animationDuration: number
  animationEasing: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear"
}

export function useChartAnimationProps(): ChartAnimationProps {
  const prefersReducedMotion = useReducedMotion()

  return {
    // Chart Transitions AC7: reduced motion renders fully-drawn on first
    // paint, with no entrance/update animation at all.
    isAnimationActive: !prefersReducedMotion,
    animationDuration: CHART_TRANSITION_DURATION_MS,
    animationEasing: "ease-out",
  }
}
