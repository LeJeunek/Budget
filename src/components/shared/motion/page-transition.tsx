"use client"

/**
 * PageTransition — thin, named wrapper around `FadeIn` for the
 * authenticated `(dashboard)` route group's per-navigation entrance (Page
 * Transitions, Phase 5b), per
 * `docs/architecture/phase-5b-technical-design.md` §4.1/§4.2.
 *
 * This component adds no mechanism of its own beyond `FadeIn`'s existing
 * reduced-motion-aware fade — it exists purely for call-site clarity at its
 * intended composition point, `src/app/(dashboard)/template.tsx` (a
 * Frontend-Lead-owned, root-plumbing file — NOT built by this dispatch,
 * per this pass's own "primitives only" scope): a reader of `template.tsx`
 * sees "page transition" by name, not a generic "fade."
 *
 * The 8px upward offset and the shared `PAGE_TRANSITION_DURATION_MS`
 * constant are both fixed here, not exposed as props — Page Transitions
 * AC1 calls for "one shared wrapper, not a per-route implementation," so
 * this component intentionally offers no per-call tuning knob a future
 * route could use to drift from every other route's identical treatment.
 *
 * Usage (illustrative only — the actual `template.tsx` mount is the
 * Frontend Lead's later composition, not built by this file):
 * ```tsx
 * // src/app/(dashboard)/template.tsx
 * import type { ReactNode } from "react"
 * import { PageTransition } from "@/components/shared/motion"
 *
 * export default function DashboardTemplate({ children }: { children: ReactNode }) {
 *   return <PageTransition>{children}</PageTransition>
 * }
 * ```
 */

import * as React from "react"

import { FadeIn } from "./fade-in"
import { PAGE_TRANSITION_DURATION_MS } from "./constants"

export interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  return (
    <FadeIn durationMs={PAGE_TRANSITION_DURATION_MS} offsetY={8}>
      {children}
    </FadeIn>
  )
}
