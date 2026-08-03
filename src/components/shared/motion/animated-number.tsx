"use client"

/**
 * AnimatedNumber — the one shared "count up/down from the previous value"
 * primitive for every headline currency/percentage figure in the app
 * (Number Counters, Phase 5b), per
 * `docs/architecture/phase-5b-technical-design.md` §2 (Risk #55's
 * resolution).
 *
 * Deliberately independent of `components/shared/stat-card.tsx` — it is a
 * bare, animated `<span>` any Server or Client Component can render as a
 * child (a Server Component parent renders this Client Component leaf
 * directly, exactly as it already does for any other Client Component
 * child). This is what lets all ten Number Counters AC6 surfaces adopt it —
 * the four that already use `StatCard`/`ProgressRing` and the six that
 * render a plain `formatCurrency`-driven `<span>` today — without forcing a
 * `StatCard` migration on any of them.
 *
 * Contract, by design:
 * - `value` is always the real, current number — never a pre-formatted
 *   string. `format` is the ONLY place a string/node is ever produced,
 *   always the caller's own `formatCurrency`/`useFormatCurrency`-backed
 *   function — this satisfies AC3's "no second, parallel formatting path"
 *   by construction: the in-flight tween value and the final settled value
 *   are formatted through the identical callback.
 * - Never re-triggered by an unrelated re-render: an `Object.is` check
 *   against the previous `value` skips the effect entirely when the number
 *   itself hasn't changed (AC1's "never re-triggered by an unrelated
 *   re-render" edge case).
 * - Reduced motion: an instant snap to the new value, still rendered
 *   through `format` (AC5) — never a shorter tween, never a second
 *   formatting path.
 * - No `durationMs` prop exists on this component at all, deliberately
 *   (§2.5) — Number Counters AC2's "one shared value... not tuned per
 *   consumer" is enforced as a hard API constraint, not a convention a
 *   future caller could quietly ignore. See `constants.ts`'s
 *   `NUMBER_COUNTER_DURATION_MS`.
 * - Null/undefined figures are each caller's own existing concern, resolved
 *   *before* rendering this component (`value === null ? <span>—</span> :
 *   <AnimatedNumber value={value} ... />`) — this primitive itself only
 *   ever accepts a definite `number`, a single-responsibility choice (see
 *   §2.6).
 *
 * Usage:
 * ```tsx
 * // Currency, via useFormatCurrency() (Accounts/Debt/Analytics shape)
 * <AnimatedNumber value={account.balance} format={formatCurrency} />
 *
 * // Currency with an explicit preference-driven currency code (Investments/
 * // StatCard-consumer shape, a Server Component threading `currency` as a prop)
 * <AnimatedNumber
 *   value={overview.totalCurrentValue}
 *   format={(n) => formatCurrency(n, currency)}
 * />
 *
 * // Percentage/score figure — same primitive, a different `format` callback
 * // (Financial Health Score badge/breakdown)
 * <AnimatedNumber value={breakdown.score} format={(n) => Math.round(n).toString()} />
 *
 * // Sign-dependent color treatment lives *inside* `format`, so it flips at
 * // the true zero-crossing point mid-tween, not only at the final value
 * // (Investments' gain/loss figure)
 * <AnimatedNumber
 *   value={gainLoss}
 *   format={(n) => (
 *     <span className={n < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}>
 *       {n < 0 ? "" : "+"}
 *       {formatCurrency(n, currency)}
 *     </span>
 *   )}
 * />
 *
 * // Drop-in for StatCard's now-widened `value: React.ReactNode` prop
 * <StatCard
 *   label="Net Worth"
 *   value={<AnimatedNumber value={netWorth} format={(n) => formatCurrency(n, currency)} />}
 * />
 * ```
 */

import * as React from "react"
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion"

import { useReducedMotion } from "./use-reduced-motion"
import { NUMBER_COUNTER_DURATION_MS } from "./constants"

export interface AnimatedNumberProps {
  /** The real, current numeric value — never a pre-formatted string. */
  value: number
  /**
   * Turns the in-flight (and final) numeric value into what's actually
   * rendered. This is the ONLY place a formatted string/node is ever
   * produced — always the caller's own `formatCurrency`/`useFormatCurrency`
   * pipeline, never a second, parallel formatting path of this component's
   * own. Returns `React.ReactNode`, not just `string`, so a caller's
   * existing sign-dependent color treatment can be expressed directly
   * inside the callback (see this file's own usage examples above).
   */
  format: (current: number) => React.ReactNode
  className?: string
}

export function AnimatedNumber({
  value,
  format,
  className,
}: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion()
  // AC1a: initial mount animates from a starting point of zero to the
  // mounted value, exactly like any other counter update (the product
  // spec's own "StatCard loading skeleton resolving to a value" edge case
  // states this explicitly — mount is not a special, static-render case).
  // `previousValueRef` starts at `undefined`, not `value`, specifically so
  // the effect below can distinguish "this is the first mount" from "this
  // value happens to be unchanged" — the two have different starting points
  // (zero vs. the current motion value) but otherwise share one code path.
  const motionValue = useMotionValue(0)
  const [display, setDisplay] = React.useState<React.ReactNode>(() =>
    prefersReducedMotion ? format(value) : format(0)
  )
  const previousValueRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    const isMount = previousValueRef.current === undefined
    // AC1: a value updating to the identical value it already held (e.g. an
    // unrelated parent re-render) never replays the animation — this only
    // applies past the initial mount, which always animates once (AC1a).
    if (!isMount && Object.is(previousValueRef.current, value)) return
    previousValueRef.current = value

    if (prefersReducedMotion) {
      // AC5: instant snap, still rendered through the real `format` pipeline
      // — no tween on mount or on update.
      motionValue.set(value)
      setDisplay(format(value))
      return
    }

    const controls = animate(motionValue, value, {
      duration: NUMBER_COUNTER_DURATION_MS / 1000,
      ease: "easeOut",
    })

    // Rapid successive updates: stopping the in-flight tween on cleanup
    // means the newest `value` always wins cleanly, with no stacked or
    // competing animation left running from a superseded update.
    return () => controls.stop()
    // `format` is intentionally excluded from this effect's dependencies:
    // its identity is expected to be fresh on every render (it typically
    // closes over the caller's own `currency`/theme state), not a memoized,
    // stable reference this effect should re-run for — only a genuine
    // change to the underlying `value` (or the reduced-motion preference)
    // should ever start a new tween. `motionValue` is a Framer Motion
    // `MotionValue` instance, guaranteed stable for this component's
    // lifetime by `useMotionValue`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefersReducedMotion])

  useMotionValueEvent(motionValue, "change", (latest) => {
    setDisplay(format(latest))
  })

  return <span className={className}>{display}</span>
}
