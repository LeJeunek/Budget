# Bug Report: `AnimatedNumber` and `ProgressRing` both play a full, real animation on a fresh full-page load even when `prefers-reduced-motion: reduce` is already active before navigation — Reduced-Motion Foundation AC3 and its own Edge Case #1 are violated for both

## Severity
**High** — `phase-5b-motion-craft.md`'s Reduced-Motion Foundation is explicitly "not one more surface alongside the other four... a binding precondition every other capability... is built against," and its own Edge Case #1 states this exact scenario bindingly: "A user's `prefers-reduced-motion` setting is `reduce` for their very first page load of a session (never toggled mid-session): every one of this phase's animations must render instantly from the first paint — this is the default-off state for that user, not a state the app 'transitions into.'" Both reproductions below are precisely that scenario (`page.emulateMedia({ reducedMotion: "reduce" })` set **before** `page.goto`, matching the product spec's own required Playwright technique verbatim) and both fail it.

## Component
- `src/components/shared/motion/animated-number.tsx` (`AnimatedNumber`) — reproduced via `src/app/(dashboard)/_lib/dashboard-animated-stat-value.tsx`'s `AnimatedCurrencyStatValue`, the Dashboard's Net Worth stat card.
- `src/components/shared/progress-ring.tsx` (`ProgressRing`'s `motion.circle` stroke sweep) — reproduced via `src/features/goals/components/goal-card.tsx`, the Goals list's per-goal progress ring.
- Shared underlying mechanism both depend on: `src/app/providers.tsx`'s `<MotionConfig reducedMotion="user">` and `src/components/shared/motion/use-reduced-motion.ts` (a re-export of Framer Motion's own `useReducedMotion`, `node_modules/framer-motion/dist/es/utils/reduced-motion/use-reduced-motion.mjs`).

## Summary
Framer Motion's own `useReducedMotion()` (the exact hook `use-reduced-motion.ts` re-exports, and the one `MotionConfig reducedMotion="user"` itself depends on internally) resolves the OS-level preference via a **one-time** `useState(prefersReducedMotion.current)` read, backed by a **module-level singleton** (`motion-dom`'s `hasReducedMotionListener`/`prefersReducedMotion` state, `node_modules/motion-dom/dist/es/render/utils/reduced-motion/index.mjs`) that is only ever populated by whichever component's `useReducedMotion()` call happens to run first, and — per that hook's own source — is **never updated again after mount** (the destructured state setter is discarded entirely: `const [shouldReduceMotion] = useState(...)`; the hook's own inline comment reads `// TODO See if people miss automatically updating shouldReduceMotion setting`).

For a component whose animation-start decision is made once, at mount, from that same snapshot (`AnimatedNumber`'s `animate()` call inside its mount effect; `ProgressRing`'s `motion.circle`'s own `animate`/`transition` props, gated internally by the same `MotionConfig` context), a fresh full-page load can capture that snapshot as effectively "motion allowed" for long enough that a full, real animation starts and — because the hook never re-evaluates — runs to completion, regardless of the true OS/emulated setting having been active the entire time. This is empirically reproducible and highly consistent (confirmed 3/3 and 3/3 across repeated fresh-context runs for both components), not a one-off flake.

Critically, **not every reduced-motion consumer in this codebase is affected** — `components/ui/progress.tsx`'s plain CSS-transition-class branch (`!prefersReducedMotion && "transition-all"`), which reads the identical shared `useReducedMotion()` hook directly in a plain conditional with no separate mount-time animation trigger of its own, was verified correct and stable across 4/4 repeated fresh-context runs on `/budgeting`. The defect is specific to the two Framer-Motion-*driven* value animations (`AnimatedNumber`'s `useMotionValue`/`animate()`, `ProgressRing`'s `motion.circle`), not to the shared hook or the reduced-motion mechanism as a general concept.

## Reproduction Steps

### A — `AnimatedNumber` (Dashboard Net Worth stat card)
1. In a **fresh** Playwright browser context (matching a real user's first page load of a session — reusing an already-hydrated page does not reproduce this), call `page.emulateMedia({ reducedMotion: "reduce" })`.
2. `page.goto("/")` as the seeded ordinary e2e-test fixture user.
3. Read the Net Worth stat card's displayed value immediately once visible, then again after ~700ms (comfortably past `NUMBER_COUNTER_DURATION_MS`'s 600ms bound).

Confirmed live via a scripted Playwright session (3 consecutive fresh-context runs, identical result each time):
```
immediate read:  "$0.00"
read at +700ms:  "$700.00"
```
A finer-grained 20ms-interval poll on a separately-reproduced run showed the value staying at "$0.00" for the first ~80-100ms before flipping directly to the final "$700.00" in one step (not a smooth per-frame ramp) — consistent with `AnimatedNumber`'s own mount-time `useState(() => prefersReducedMotion ? format(value) : format(0))` lazy initializer capturing `prefersReducedMotion` as falsy on the component's first render, with the correction only arriving later via its own `useEffect`.

### B — `ProgressRing` (Goals list, per-goal progress ring)
1. Fresh context, `page.emulateMedia({ reducedMotion: "reduce" })`, then `page.goto("/goals")`.
2. Sample the first `[role="progressbar"]`'s indicator `<circle>`'s computed `stroke-dashoffset` every 50-65ms for ~800ms.

Confirmed live via a scripted Playwright session:
```
aria-valuenow: 16.666666666666664  (r=33, circumference=207.345)
t=66ms   stroke-dashoffset: 207.345px   <- fully "empty" ring, the animation's own starting point
t=258ms  stroke-dashoffset: 204.597px
t=322ms  stroke-dashoffset: 199.035px
t=400ms  stroke-dashoffset: 192.351px
t=464ms  stroke-dashoffset: 187.556px
t=530ms  stroke-dashoffset: 183.191px
t=597ms  stroke-dashoffset: 179.42px
t=668ms  stroke-dashoffset: 176.331px
t=731ms  stroke-dashoffset: 174.126px
t=796ms  stroke-dashoffset: 172.895px   <- approaching, not yet at, the theoretical resting value (172.788)
```
This is a genuine, smooth, multi-frame interpolation across the component's full ~600ms `NUMBER_COUNTER_DURATION_MS`-driven sweep — not a snap, and not a one-time hydration correction the way case A's binary flip is. `ProgressRing`'s stroke animation ignored the active reduced-motion preference for its entire mount-time animation.

### Contrast case — `Progress` (Budgeting category rows) correctly unaffected
Repeating the identical fresh-context, emulate-before-navigate pattern against `/budgeting` and asserting `[data-slot="progress-indicator"]` never carries a `transition-all` class passed 4/4 times. `Progress`'s own conditional (`!prefersReducedMotion && "transition-all"`) reads the same hook but has no independent mount-time animation trigger of its own — its `transform` is set directly to the final position on first render regardless, so even if this same underlying race affected its own single render, there is no subsequent value change on mount for a stray CSS-transition class to ever visibly animate.

## Expected Behavior
Per Reduced-Motion Foundation AC3 ("renders its end state immediately — no interpolation, no 'shorter' version of the same animation") and Edge Case #1 (quoted above, binding for "very first page load of a session"): both the Net Worth stat card's value and the Goals progress ring's stroke should already be at their final, correct resting state on the very first paint a Playwright assertion (or a real user) can observe — never a `$0.00`-then-corrects flash, never a multi-frame sweep.

## Actual Behavior
- Case A: the stat card visibly starts at `$0.00` and jumps to the real value roughly 80-100ms later.
- Case B: the progress ring visibly sweeps in over a genuine ~600-800ms animation, identical in character to what a `no-preference` user would see.

## Suggested Owner
UI Component Engineer / Frontend Lead (owners of `components/shared/motion/`). Both components currently make their reduced-motion decision **once, synchronously, at mount**, trusting Framer Motion's own `useReducedMotion()` snapshot to already be correct by then — which this report's evidence shows is not reliably true for a fresh full-page load specifically (the SSR-then-hydrate boundary and/or render-order-dependent timing of whichever component's `useReducedMotion()` call happens to run first and populate the shared module-level singleton). Two independent angles worth investigating together, since a single fix may address both:
1. Whether `MotionConfig`'s own `reducedMotion="user"` context value is actually current by the moment each affected `motion.*` element's own mount-time animation is scheduled to start, for the very first render pass of a fresh load specifically — as opposed to an already-mounted page where the value has had time to settle (the `_tmp-bughunt-reduced-motion-*.spec.ts` scratch probes already present in `tests/e2e/` at the time of this report appear to be a separate, still-in-progress investigation into a related but distinct question — whether an *already-mounted* instance honors a *mid-session* toggle — worth cross-referencing, not duplicating).
2. Whether `AnimatedNumber`'s specific pattern (a `useState` lazy initializer computed once from `prefersReducedMotion`, corrected later only via its own effect) is the right shape at all, given `prefersReducedMotion` is not guaranteed correct at the exact moment that initializer runs on a fresh load — an initializer that starts from `format(value)` unconditionally, only falling back to a real tween once `prefersReducedMotion` is confirmed `false` in the same effect that already runs post-mount, may close case A without needing to fix the hook's own timing at all.

## Test Coverage
`tests/e2e/accessibility/reduced-motion.spec.ts`'s "Number Counters" and "Pre-existing motion: ProgressRing" tests both encode this exact repro (fresh context, `emulateMedia` before `goto`, assert the immediate/settled reads match) and were left failing, on purpose, as the correct signal that this regression is real and unfixed — not weakened to pass around it. `components/ui/progress.tsx`'s equivalent test in that same file passes and is the direct contrast case cited above.
