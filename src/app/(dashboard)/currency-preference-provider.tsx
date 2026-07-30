"use client"

/**
 * CurrencyPreferenceProvider — makes the caller's resolved
 * `UserPreference.currencyDisplay` (docs/product/customization.md, Currency
 * Display capability) available to every Client Component rendered under the
 * authenticated shell, without prop-drilling it through each intermediate
 * component.
 *
 * Ownership/placement note: mirrors `src/app/providers.tsx`'s own precedent
 * exactly (that file's doc comment: "This is root-layout plumbing
 * (routing/layout wiring)... not a reusable UI component or domain logic").
 * This provider is the same shape — it carries a single, already-resolved,
 * per-request server value into the client tree, it renders no visual output
 * of its own, and it is mounted exactly once — so it belongs to the Frontend
 * Lead's "manage routing" / "work within page and layout files" remit, not
 * the UI Component Engineer's `components/shared/` (contrast
 * `components/shared/theme-provider.tsx`, which wraps `next-themes` and is
 * explicitly that engineer's own visual-theming artifact per its own
 * ownership note).
 *
 * Seeded exactly once, in `app/(dashboard)/layout.tsx`, from the very same
 * `getUserPreference(user.id)` call that layout already makes for the
 * Theme & Accent Color capability (`data-accent`) — this file never fetches
 * anything itself, and no consumer of the hooks below should either.
 *
 * Server Components (most page-level and card-level components in this app)
 * cannot call `useContext`, so a Server Component that formats a currency
 * figure still needs its own resolved `currency` value threaded in as an
 * explicit prop from whichever page already resolved it (mirroring how
 * `app/(dashboard)/page.tsx` -> `_lib/dashboard-card-groups.tsx` already
 * threads other already-resolved values down) — this provider only ever
 * solves the problem for Client Component subtrees, which is the large
 * majority of this app's currency-formatting call sites (charts, tables,
 * dialogs, cards that already fetch or mutate client-side).
 */

import { createContext, useContext, type ReactNode } from "react"

import { formatCurrency } from "@/lib/utils"

const CurrencyPreferenceContext = createContext<string | null>(null)

export interface CurrencyPreferenceProviderProps {
  /** The caller's resolved `UserPreference.currencyDisplay` (e.g. "USD",
   * "EUR") — already fetched once by the Server Component layout that mounts
   * this provider; never re-fetched here. */
  currency: string
  children: ReactNode
}

export function CurrencyPreferenceProvider({
  currency,
  children,
}: CurrencyPreferenceProviderProps) {
  return (
    <CurrencyPreferenceContext.Provider value={currency}>
      {children}
    </CurrencyPreferenceContext.Provider>
  )
}

/**
 * The caller's resolved display currency (e.g. `"USD"`). Throws outside a
 * `CurrencyPreferenceProvider` rather than silently defaulting to `"USD"` —
 * every authenticated route renders through `app/(dashboard)/layout.tsx`
 * (which mounts this provider unconditionally for any signed-in user), so a
 * missing provider here means a real wiring bug, not a legitimately
 * unauthenticated path that should degrade quietly.
 */
export function useCurrencyDisplay(): string {
  const currency = useContext(CurrencyPreferenceContext)
  if (currency === null) {
    throw new Error(
      "useCurrencyDisplay() was called outside a CurrencyPreferenceProvider. " +
        "This provider is mounted once, in app/(dashboard)/layout.tsx, for " +
        "every authenticated route — if you're seeing this, the component " +
        "calling this hook is rendering outside that layout.",
    )
  }
  return currency
}

/**
 * Convenience wrapper: `lib/utils.ts`'s `formatCurrency` pre-bound to the
 * caller's resolved display currency. This is the hook the large majority of
 * Client Components should use — they only ever format money in the caller's
 * own resolved currency, so binding it here means a component's own
 * `formatCurrency(amount)` call sites don't need to separately import
 * `useCurrencyDisplay` and pass its value through by hand at every call.
 * A component that must format a currency OTHER than the caller's own
 * resolved preference (none exist in this app today) should call
 * `useCurrencyDisplay`/`formatCurrency` directly instead.
 */
export function useFormatCurrency(): (amount: number) => string {
  const currency = useCurrencyDisplay()
  return (amount: number) => formatCurrency(amount, currency)
}
