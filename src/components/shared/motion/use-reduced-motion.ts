"use client"

/**
 * useReducedMotion — the one canonical import path for "does this user's OS
 * say no motion." A thin wrapper around React's own `useSyncExternalStore`,
 * subscribed directly to `(prefers-reduced-motion: reduce)` — NOT a
 * re-export of Framer Motion's own `useReducedMotion` anymore (see "Why this
 * is no longer a re-export" below).
 *
 * ## Why this is no longer a re-export
 * This file used to be `export { useReducedMotion } from "framer-motion"`,
 * on the reasoning (`docs/architecture/phase-5b-technical-design.md` §1.1)
 * that Framer Motion's own hook already subscribes to the media query's
 * `change` event and re-renders every consumer automatically. Two
 * independent Bug Hunter reports disproved that for the installed
 * `framer-motion` version, by direct read of
 * `node_modules/framer-motion/dist/es/utils/reduced-motion/use-reduced-motion.mjs`:
 * - `docs/testing/bug-reports/reduced-motion-not-honored-on-first-page-load-animated-number-progress-ring.md`
 * - `docs/testing/bug-reports/reduced-motion-mid-session-re-enable-does-not-resume-animation.md`
 *
 * The upstream hook resolves the OS preference via a **one-time**
 * `useState(prefersReducedMotion.current)` initializer, backed by a
 * module-level singleton (`motion-dom`'s `render/utils/reduced-motion/
 * state.mjs`) that is kept live internally but is only ever read into a
 * given component instance's own state ONCE, at that instance's first
 * render — the corresponding setter is never called again. The hook's own
 * upstream source literally flags this: `// TODO See if people miss
 * automatically updating shouldReduceMotion setting`. Two concrete,
 * reproduced symptoms followed:
 * 1. **Fresh-load race** — a real animation could briefly play despite
 *    `reduce` already being active before navigation even started, because
 *    the singleton wasn't reliably populated yet at the exact instant a
 *    component's own one-time `useState` initializer ran.
 * 2. **Mid-session re-enable never resumes** — an already-mounted
 *    component's captured value is frozen at whatever the preference was
 *    when IT first mounted; turning `reduce` back off later never restores
 *    animation for anything already on screen, only a full reload does.
 *
 * ## The fix
 * `useSyncExternalStore` is React's own primitive for exactly this shape of
 * problem ("subscribe to a piece of mutable state that lives outside React
 * and can change at any time"): `getSnapshot` is read fresh on every render
 * — no stale one-time capture — and the `change` listener triggers a
 * re-render for every mounted consumer whenever the OS preference flips, in
 * either direction, closing both bugs with one fix. It is also SSR-safe
 * (`getServerSnapshot` returns `false`, matching what the server always
 * renders, so hydration never mismatches — which also closes the
 * fresh-load race's hydration-boundary half). This remains the ONE shared
 * hook every Phase 5b primitive calls (`docs/architecture/
 * phase-5b-technical-design.md` §1.1's "every new primitive... branches
 * explicitly on the same one hook") — this file is still the only place in
 * the app that subscribes to this media query, so the "avoid duplication"
 * intent behind the original re-export is preserved; only the
 * implementation underneath it changed.
 *
 * This deliberately does NOT reuse Framer Motion/`motion-dom`'s own
 * module-level `prefersReducedMotion` ref — that ref is exactly what the
 * broken upstream hook already reads from, and is not a fix, only a
 * relocation of the same one-time-read bug. (`MotionConfig`'s own internal
 * `reducedMotion="user"` resolution independently reads that same ref once,
 * at each `motion.*` element's own mount — confirmed by direct read of
 * `motion-dom`'s `render/VisualElement.mjs`, `mount()`:
 * `this.shouldReduceMotion = prefersReducedMotion.current`, set once, never
 * revisited — so it carries an equivalent staleness bug that this file's own
 * independent `matchMedia` subscription cannot reach or fix, since it lives
 * inside Framer Motion's own internals. See
 * `src/components/shared/progress-ring.tsx`'s doc comment for the one
 * primitive that was changed to call this hook explicitly, instead of
 * relying on `MotionConfig` alone, specifically because of this.)
 *
 * Returns a plain `boolean` (narrower than Framer Motion's own
 * `boolean | null` return type) — `false` on the server and on the client's
 * very first commit before the media query can be evaluated is not a
 * distinct third state any consumer needs to special-case; every consumer in
 * this module already treats a falsy read as "motion plays," the correct
 * default for both cases.
 *
 * `<MotionConfig reducedMotion="user">` (`src/app/providers.tsx`) is a
 * SEPARATE, complementary mechanism and is NOT superseded by this hook — it
 * remains the free, zero-code-change default for any bare, declarative
 * `motion.*` component that doesn't call this hook explicitly. See that
 * file's own doc comment.
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

import { useSyncExternalStore } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onStoreChange: () => void): () => void {
  const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQueryList.addEventListener("change", onStoreChange)
  return () => mediaQueryList.removeEventListener("change", onStoreChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

// The server can never know the client's OS-level preference — `false`
// (motion plays) matches the same falsy-default every consumer already
// applies, and is what lets `useSyncExternalStore` render identically on
// the server and the client's first pass, avoiding a hydration mismatch.
function getServerSnapshot(): boolean {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
