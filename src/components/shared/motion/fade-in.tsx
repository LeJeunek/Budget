"use client"

/**
 * FadeIn — the one shared "mount fade + explicit reduced-motion branch"
 * primitive, reused by both `PageTransition` (route-change entrance,
 * §4.1/§4.2) and Analytics' spending heatmap entrance (Chart Transitions
 * AC5 — a custom, non-Recharts visualization with no native animation prop
 * to lean on), per `docs/architecture/phase-5b-technical-design.md` §4.2.
 * Factoring this out avoids re-implementing the identical "mount fade +
 * reduced-motion branch" shape three times (page transitions, the heatmap's
 * entrance, and any future mount-fade need).
 *
 * Reduced motion renders a plain `<div>` with NO motion wrapper at all —
 * not just a zeroed-duration `motion.div` — so a Playwright assertion (or a
 * developer inspecting the DOM) can assert "no animation-bearing element is
 * present," a strictly stronger, more directly-testable guarantee than "the
 * duration happened to resolve to zero."
 *
 * An explicit `useReducedMotion()` branch is used here even though
 * `<MotionConfig reducedMotion="user">` is already mounted at the app root
 * (`src/app/providers.tsx`) — deliberate, for consistency: every new motion
 * primitive this phase adds branches explicitly on the same one hook,
 * rather than some relying on `MotionConfig`'s implicit reach and others
 * not (§4.2's own reasoning).
 *
 * Only `opacity` and `transform` (`y`) are ever animated — no layout-
 * triggering property — so this fade never introduces CLS by construction.
 *
 * Usage:
 * ```tsx
 * <FadeIn>{children}</FadeIn>
 *
 * // Custom duration + upward offset (what PageTransition itself passes through)
 * <FadeIn durationMs={300} offsetY={8}>{children}</FadeIn>
 *
 * // Analytics' spending heatmap entrance — a Server Component rendering
 * // this Client Component leaf directly as a child, no "use client"
 * // conversion of the Server Component itself required
 * <FadeIn durationMs={CHART_TRANSITION_DURATION_MS}>
 *   {existingGridJsx}
 * </FadeIn>
 * ```
 */

import * as React from "react"
import { motion } from "framer-motion"

import { useReducedMotion } from "./use-reduced-motion"
import { CHART_TRANSITION_DURATION_MS } from "./constants"

export interface FadeInProps {
  children: React.ReactNode
  /** Defaults to `CHART_TRANSITION_DURATION_MS` — this primitive's other named consumer's own duration. */
  durationMs?: number
  /** Optional vertical offset (px) the content animates up from. Defaults to `0` (opacity-only fade). */
  offsetY?: number
  className?: string
}

export function FadeIn({
  children,
  durationMs = CHART_TRANSITION_DURATION_MS,
  offsetY = 0,
  className,
}: FadeInProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: offsetY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durationMs / 1000, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
