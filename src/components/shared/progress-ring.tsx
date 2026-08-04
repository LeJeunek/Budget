"use client"

/**
 * ProgressRing — animated SVG circular progress indicator for goal/budget
 * completion percentages. No chart library dependency — plain SVG animated
 * with Framer Motion.
 *
 * Number Counters (Phase 5b, `docs/architecture/phase-5b-technical-design.md`
 * §2.4): the default percentage label (rendered when no custom `label` is
 * passed) now counts up/down via `AnimatedNumber` instead of a static text
 * node, and the ring's own stroke-animation duration reads from the shared
 * `NUMBER_COUNTER_DURATION_MS` constant instead of a hardcoded `0.6`/`600`
 * literal — the two are now tied to one source, so the label's count and
 * the ring's own sweep always finish at the same instant by construction,
 * with no per-call tuning needed. A caller-supplied `label` is unaffected
 * and never passes through `AnimatedNumber` (unchanged from before this
 * phase) — this file has no opinion on a custom label's own content.
 *
 * Reduced motion: the stroke sweep is driven imperatively — a raw
 * `useMotionValue`/`animate()` pair set from a `useLayoutEffect`, exactly
 * mirroring `AnimatedNumber`'s own architecture — rather than Framer
 * Motion's declarative `initial`/`animate`/`transition` props this file used
 * to use. This was a deliberate, twice-corrected fix, not a style
 * preference. A Bug Hunter report (`docs/testing/bug-reports/
 * reduced-motion-not-honored-on-first-page-load-animated-number-progress-ring.md`,
 * Case B) reproduced a genuine, smooth ~600-800ms stroke sweep on a fresh
 * page load despite `reduce` already being active before navigation. The
 * first fix attempt (branching `initial={prefersReducedMotion ? false :
 * {...}}` directly in JSX, still relying on Framer Motion's declarative
 * props) did not hold up under live re-verification: `initial` is a
 * mount-only decision Framer Motion evaluates once, on this component's
 * very first render — and that first render can only ever see
 * `useReducedMotion()`'s SSR-safe, hydration-matching `false` value (the
 * server can never know the client's true OS preference), with no way for a
 * later, corrected render to retroactively change what `initial` already
 * locked in. The fix that actually holds, verified live via
 * `tests/e2e/accessibility/reduced-motion.spec.ts`, is the same one
 * `AnimatedNumber` needed for the identical reason (see that file's own doc
 * comment for the full reasoning): never let the render that has to match
 * SSR depend on `prefersReducedMotion` at all — the ring's `strokeDashoffset`
 * always starts, unconditionally, at its correct resting position, and only
 * a `useLayoutEffect` (guaranteed to run client-only, after
 * `useReducedMotion()` is confirmed correct, and guaranteed to flush before
 * the browser's first paint) ever resets it to the empty starting position
 * for a genuine, non-reduced-motion mount animation.
 *
 * Usage:
 * ```tsx
 * <ProgressRing value={72} />
 *
 * // Custom size/label, e.g. for a goal card
 * <ProgressRing
 *   value={goal.percentComplete}
 *   size={72}
 *   strokeWidth={6}
 *   label={<span className="text-xs font-medium">{goal.percentComplete}%</span>}
 *   aria-label={`${goal.name} progress`}
 * />
 * ```
 */

import * as React from "react"
import { animate, motion, useMotionValue } from "framer-motion"

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion/animated-number"
import { NUMBER_COUNTER_DURATION_MS } from "@/components/shared/motion/constants"
import { useReducedMotion } from "@/components/shared/motion/use-reduced-motion"

export interface ProgressRingProps {
  /** Completion percentage, clamped to 0-100. */
  value: number
  /** Diameter in pixels. */
  size?: number
  strokeWidth?: number
  /** Custom center content. Defaults to a "{value}%" label when omitted. */
  label?: React.ReactNode
  /** Set to `false` to omit the default centered percentage label entirely. */
  showDefaultLabel?: boolean
  trackClassName?: string
  indicatorClassName?: string
  className?: string
  /** Accessible name; defaults to "{value}% complete". */
  "aria-label"?: string
}

export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  label,
  showDefaultLabel = true,
  trackClassName,
  indicatorClassName,
  className,
  "aria-label": ariaLabel,
}: ProgressRingProps) {
  const prefersReducedMotion = useReducedMotion()
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const restingOffset = circumference - (clamped / 100) * circumference

  // Imperatively driven, not the `initial`/`animate`/`transition` props —
  // see this file's own top doc comment for why. Initializes directly to
  // `restingOffset` (never the empty-ring starting position), so the very
  // first render — server and the client's own first pass alike — already
  // shows the correct, final stroke position, matching AnimatedNumber's
  // identical "always render correct, only a layout effect ever resets to a
  // starting point" pattern.
  const strokeDashoffset = useMotionValue(restingOffset)
  const previousClampedRef = React.useRef<number | undefined>(undefined)

  React.useLayoutEffect(() => {
    const isMount = previousClampedRef.current === undefined
    if (!isMount && Object.is(previousClampedRef.current, clamped)) return
    previousClampedRef.current = clamped

    if (prefersReducedMotion) {
      // AC5: instant snap. On mount specifically this is a genuine no-op —
      // `strokeDashoffset` already equals `restingOffset` from its own
      // initializer above — so there is no window in which anything but the
      // correct stroke position was ever painted.
      strokeDashoffset.set(restingOffset)
      return
    }

    if (isMount) {
      // AC1a-equivalent for the ring: reset the already-correct initial
      // paint back to the empty starting position, synchronously, before
      // the browser's first paint, then animate back to `restingOffset`.
      strokeDashoffset.set(circumference)
    }

    const controls = animate(strokeDashoffset, restingOffset, {
      duration: NUMBER_COUNTER_DURATION_MS / 1000,
      ease: "easeOut",
    })

    // Rapid successive value changes: stopping the in-flight tween on
    // cleanup means the newest target always wins cleanly.
    return () => controls.stop()
  }, [clamped, prefersReducedMotion, circumference, restingOffset, strokeDashoffset])

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? `${Math.round(clamped)}% complete`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={cn("stroke-muted", trackClassName)}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className={cn("stroke-primary", indicatorClassName)}
          style={{ strokeDasharray: circumference, strokeDashoffset }}
        />
      </svg>
      {(label ?? showDefaultLabel) && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-foreground">
          {label ?? (
            <AnimatedNumber
              value={clamped}
              format={(current) => `${Math.round(current)}%`}
            />
          )}
        </span>
      )}
    </div>
  )
}
