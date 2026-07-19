"use client"

/**
 * ProgressRing — animated SVG circular progress indicator for goal/budget
 * completion percentages. No chart library dependency — plain SVG animated
 * with Framer Motion.
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
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      {(label ?? showDefaultLabel) && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-foreground">
          {label ?? `${Math.round(clamped)}%`}
        </span>
      )}
    </div>
  )
}
