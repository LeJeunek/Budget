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
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/shared/motion/animated-number"
import { NUMBER_COUNTER_DURATION_MS } from "@/components/shared/motion/constants"

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
  const clamped = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

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
          style={{ strokeDasharray: circumference }}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: circumference - (clamped / 100) * circumference,
          }}
          transition={{
            duration: NUMBER_COUNTER_DURATION_MS / 1000,
            ease: "easeOut",
          }}
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
