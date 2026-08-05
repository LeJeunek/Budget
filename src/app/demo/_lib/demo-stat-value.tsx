"use client"

/**
 * DemoAnimatedCurrencyStatValue / DemoAnimatedPercentStatValue — a thin,
 * route-private Client Component boundary for `/demo`'s Dashboard, mirroring
 * `app/(dashboard)/_lib/dashboard-animated-stat-value.tsx`'s exact shape and
 * reasoning (see that file's own JSDoc in full).
 *
 * Why this file has to exist at all: `/demo`'s Dashboard page is a Server
 * Component, and a Server Component's JSX cannot pass a function prop (a
 * `format` closure) directly to `AnimatedNumber` (`@/components/shared/
 * motion`, a Client Component) — React Server Components can only serialize
 * plain data across that boundary, never a closure. This file is that
 * boundary: it receives only a plain, serializable `value: number` and
 * builds the `format` closure itself, entirely inside its own
 * client-executed render.
 *
 * No `currency` prop, unlike the real Dashboard's identical helper — `/demo`
 * has no per-visitor currency preference to resolve (no session, no Settings
 * row), so this always formats in the fixture household's fixed `"USD"`,
 * matching every other demo presentational twin's own `currency = "USD"`
 * default.
 */

import { AnimatedNumber } from "@/components/shared/motion"
import { formatCurrency } from "@/lib/utils"

export function DemoAnimatedCurrencyStatValue({ value }: { value: number }) {
  return <AnimatedNumber value={value} format={(n) => formatCurrency(n)} />
}

export function DemoAnimatedPercentStatValue({ value }: { value: number }) {
  return <AnimatedNumber value={value} format={(n) => `${n.toFixed(1)}%`} />
}
