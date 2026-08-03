"use client"

/**
 * AnimatedCurrencyStatValue / AnimatedPercentStatValue — a thin,
 * route-private Client Component boundary (Phase 5b, Number Counters),
 * scoped to this one route's own `_lib/` module exactly like
 * `dashboard-card-groups.tsx` itself ("not a reusable/shared component —
 * nothing here is meant to be imported outside this one route").
 *
 * Why this file has to exist at all: `dashboard-card-groups.tsx`'s own
 * `buildCardRenderers` is a plain function called directly by
 * `app/(dashboard)/page.tsx` (a Server Component) — it is not itself a
 * Component invoked via JSX, so it cannot carry a "use client" directive of
 * its own without breaking that direct-function-call pattern (see that
 * file's own JSDoc). That means its `render()` closures still execute as
 * genuine Server Component render code, and a Server Component's JSX cannot
 * pass a function prop (a `format` callback closing over `currency`)
 * directly to `AnimatedNumber` (`@/components/shared/motion`, a Client
 * Component) — React Server Components can only serialize plain data across
 * that boundary, never a closure. Confirmed empirically: a 500 "Functions
 * cannot be passed directly to Client Components" error, before this file
 * existed, the first time the Dashboard was loaded against these edits.
 *
 * The fix is the standard one for this exact situation: a small, dedicated
 * Client Component that receives only plain, serializable props (a number
 * and, where needed, a currency code string) and builds the `format`
 * closure itself, entirely inside its own client-executed render — the
 * closure is created on the client side of the boundary, never serialized
 * across it. This file contains zero new visual, animation, or formatting
 * logic of its own (both call each figure straight into the already-built
 * `AnimatedNumber` and `formatCurrency`) — it exists purely to be that
 * boundary, not to add a new design primitive.
 */

import { AnimatedNumber } from "@/components/shared/motion"
import { formatCurrency } from "@/lib/utils"

export function AnimatedCurrencyStatValue({
  value,
  currency,
}: {
  value: number
  currency: string
}) {
  return (
    <AnimatedNumber
      value={value}
      format={(n) => formatCurrency(n, currency)}
    />
  )
}

export function AnimatedPercentStatValue({ value }: { value: number }) {
  return <AnimatedNumber value={value} format={(n) => `${n.toFixed(1)}%`} />
}
