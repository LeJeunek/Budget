"use client"

/**
 * ScrollAffordanceContainer — a small, domain-agnostic horizontal-scroll
 * wrapper with a pure-CSS "there's more to see this way" edge affordance,
 * per `docs/architecture/phase-5a-technical-design.md` §3.2's
 * horizontal-scroll-with-affordance pattern (named there for Analytics'
 * charts, but usable by any consumer that needs the same treatment — this
 * file has no chart-specific or otherwise domain-specific knowledge).
 *
 * `overflow-x-auto` on the scroll region, plus two absolutely-positioned,
 * `pointer-events-none`, `aria-hidden` gradient-fade overlays pinned to the
 * left/right edges. Deliberately static — no `scroll` event listener, no
 * JS-computed "is there more content in this direction" check — a
 * persistent, always-visible edge fade is what the architecture doc calls
 * for (§3.2: "no JS scroll-position tracking needed for a static,
 * always-visible edge fade"), and is also what stays correct on a touch
 * device that renders no persistent scrollbar chrome at all (the
 * Responsive Capability's own edge case for this exact pattern).
 *
 * Accessibility: the scroll region is a native `tabIndex={0}` +
 * `overflow-x-auto` element, so a keyboard user can Tab into it and scroll
 * with arrow keys even when its content (e.g. a chart's SVG) has no
 * focusable elements of its own — `aria-label` gives that region an
 * accessible name for exactly this purpose, and the container carries the
 * same `focus-visible:ring-2 ... ring-offset-2` treatment every other
 * interactive element in this app uses (see `Sidebar`'s baseline pattern).
 *
 * Usage:
 * ```tsx
 * <ScrollAffordanceContainer aria-label="Monthly trends chart, scrollable horizontally">
 *   <MonthlyTrendsChart />
 * </ScrollAffordanceContainer>
 *
 * // Custom wrapper sizing
 * <ScrollAffordanceContainer className="rounded-lg border" aria-label="Category heatmap">
 *   <CategoryHeatmap />
 * </ScrollAffordanceContainer>
 * ```
 */

import * as React from "react"

import { cn } from "@/lib/utils"

export interface ScrollAffordanceContainerProps {
  children: React.ReactNode
  /** Applied to the outer positioning wrapper (the gradient overlays size themselves off it). */
  className?: string
  /** Applied to the inner scrollable region itself (e.g. a fixed height/width). */
  scrollClassName?: string
  /** Accessible name for the scrollable region — describe what's inside and that it scrolls horizontally. */
  "aria-label": string
}

export function ScrollAffordanceContainer({
  children,
  className,
  scrollClassName,
  "aria-label": ariaLabel,
}: ScrollAffordanceContainerProps) {
  return (
    <div className={cn("relative", className)}>
      <div
        tabIndex={0}
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "overflow-x-auto outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          scrollClassName
        )}
      >
        {children}
      </div>

      {/* Static edge-gradient affordances — signal "more content this way"
       * without tracking scroll position. Built from the `background`
       * design token so they blend correctly with whatever surface this
       * container sits on, in both light and dark mode. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
      />
    </div>
  )
}
