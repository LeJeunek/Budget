"use client"

/**
 * Progress — thin wrapper over Radix's `Progress` primitive.
 *
 * Accessibility fix (docs/testing/e2e/accessibility-run-report.md finding
 * #3, axe `aria-progressbar-name`, serious): Radix's `Progress.Root` renders
 * `role="progressbar"` and computes `aria-valuenow`/`aria-valuetext`
 * (e.g. "62%") automatically, but sets no accessible *name* — `aria-valuetext`
 * describes the current *value*, not what the widget itself represents, and
 * axe correctly flags a nameless `progressbar` regardless of it having a
 * value description. The report's concrete instances are Financial Goals'
 * list/detail views (`features/financial-goals/components/financial-goal-card.tsx`,
 * both call sites render `<Progress value={...} />` with no `aria-label`).
 *
 * Fixed at the primitive rather than patched at those two call sites only:
 * `Progress` has other consumers today
 * (`features/budgeting/components/budget-category-row.tsx`) that have the
 * identical gap and simply weren't part of this run's flagged routes — an
 * `aria-label` *required* on every call site would close this correctly but
 * isn't viable here (it would need a matching edit at every current call
 * site, none of which are this role's files to change, and would break the
 * build for those consumers in the meantime). Instead, `aria-label` stays
 * optional with a safe, always-accurate computed default —
 * `"{value}% complete"` — mirroring `components/shared/progress-ring.tsx`'s
 * own already-shipped identical convention for the exact same problem (see
 * that file's `aria-label ?? `${Math.round(clamped)}% complete``), so this
 * codebase has exactly one sanctioned wording for "unlabeled progress
 * percentage," not two. Every current and future consumer that omits
 * `aria-label` now renders a real, valid, accurate accessible name for
 * free; a consumer with more specific context available (e.g. a goal's own
 * name) can still pass its own `aria-label` to override the default, as
 * `Progress` already forwards arbitrary props to Radix's `Progress.Root`.
 *
 * Usage:
 * ```tsx
 * <Progress value={62} />
 * // -> accessible name: "62% complete"
 *
 * // Caller-supplied, more specific name
 * <Progress value={62} aria-label="Emergency Fund goal, 62% funded" />
 * ```
 *
 * Reduced-Motion Foundation (Phase 5b, `docs/architecture/phase-5b-technical-design.md`
 * §1.2): the fill's `transition-all` Tailwind class is a plain CSS
 * transition, not Framer Motion — the root `<MotionConfig reducedMotion="user">`
 * mount has no reach into it at all, so this is the one pre-existing motion
 * instance in the app that needs an actual (one-line) edit rather than a
 * free retrofit. `useReducedMotion()` (the same shared hook every other 5b
 * primitive branches on) conditionally drops that class so the fill jumps
 * straight to its final position with no interpolation when active.
 */

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/components/shared/motion/use-reduced-motion"

function Progress({
  className,
  value,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const clamped = Math.min(100, Math.max(0, value ?? 0))
  const prefersReducedMotion = useReducedMotion()

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      aria-label={ariaLabel ?? `${Math.round(clamped)}% complete`}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 bg-primary",
          !prefersReducedMotion && "transition-all"
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
