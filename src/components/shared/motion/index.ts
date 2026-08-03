/**
 * Barrel export for the shared motion primitives module (Phase 5b, Motion &
 * Craft) — one import surface, mirroring
 * `components/shared/data-table/index.ts`'s existing convention. See
 * `docs/architecture/phase-5b-technical-design.md` for the full design of
 * every primitive re-exported here.
 *
 * Usage:
 * ```tsx
 * import {
 *   AnimatedNumber,
 *   ExpandableCard,
 *   FadeIn,
 *   PageTransition,
 *   useChartAnimationProps,
 *   useReducedMotion,
 *   NUMBER_COUNTER_DURATION_MS,
 * } from "@/components/shared/motion"
 * ```
 */

export { useReducedMotion } from "./use-reduced-motion"
export {
  NUMBER_COUNTER_DURATION_MS,
  CHART_TRANSITION_DURATION_MS,
  PAGE_TRANSITION_DURATION_MS,
  EXPANDABLE_CARD_DURATION_MS,
} from "./constants"
export { AnimatedNumber, type AnimatedNumberProps } from "./animated-number"
export { ExpandableCard, type ExpandableCardProps } from "./expandable-card"
export { FadeIn, type FadeInProps } from "./fade-in"
export { PageTransition, type PageTransitionProps } from "./page-transition"
export {
  useChartAnimationProps,
  type ChartAnimationProps,
} from "./chart-animation"
