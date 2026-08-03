/**
 * useReducedMotion — the one canonical import path for "does this user's OS
 * say no motion." Re-exports Framer Motion's own hook rather than a second,
 * hand-rolled `matchMedia` listener of this codebase's own — see
 * `docs/architecture/phase-5b-technical-design.md` §1.1 for the full
 * reasoning.
 *
 * There is exactly one subscription to `(prefers-reduced-motion: reduce)` in
 * this app (Framer Motion's internal one). This hook, and the root
 * `<MotionConfig reducedMotion="user">` mount (`src/app/providers.tsx`,
 * Frontend-Lead-owned, not this file), both read from that same one
 * subscription, so the two composition points can never disagree with each
 * other.
 *
 * Framer Motion's `useReducedMotion` subscribes to the `matchMedia` query's
 * `change` event internally and re-renders every consumer automatically —
 * this file adds no polling and no separate subscription of its own, which
 * is what satisfies Reduced-Motion Foundation AC4 ("honored reactively, not
 * just at initial page load") for free, with zero code here.
 *
 * Returns `boolean | null` (Framer Motion's own return type): `null` only in
 * environments where the media query can't be evaluated yet (e.g. the very
 * first server-rendered pass before hydration); every consumer in this
 * module treats `null` the same as `false` (falsy — motion plays) via a
 * plain truthiness check, never a strict `=== true`/`=== false` comparison,
 * so a transient `null` never triggers a reduced-motion branch by mistake.
 *
 * Usage:
 * ```tsx
 * "use client"
 * import { useReducedMotion } from "@/components/shared/motion"
 *
 * function MyAnimatedThing() {
 *   const prefersReducedMotion = useReducedMotion()
 *   return prefersReducedMotion ? <StaticEndState /> : <AnimatedThing />
 * }
 * ```
 */
export { useReducedMotion } from "framer-motion"
