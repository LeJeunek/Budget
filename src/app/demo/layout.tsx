import type { ReactNode } from "react"

import { CurrencyPreferenceProvider } from "@/app/(dashboard)/currency-preference-provider"
import { DemoShell } from "@/features/demo/components/demo-shell"

/**
 * Public Demo Mode layout — the top-level, real (non-route-group) `/demo`
 * segment's shell, per docs/architecture/public-demo-technical-design.md §1/
 * §5/§6. Sibling to `(auth)/`, `(dashboard)/`, `admin/`, and `api/`, never
 * nested inside `(dashboard)` — this file never calls `getCurrentUser()` and
 * never reads a session cookie of any kind (public-demo.md Capability 1
 * AC3), so there is no authentication gate here to weaken or bypass (AC4).
 *
 * `export const revalidate = 86400` (§5.2): Next.js resolves a route's
 * effective ISR window as the minimum across every segment config in its
 * tree, so setting this once here establishes a same-day-fresh ceiling for
 * every nested `/demo` page — every fixture date (relative-offset-based, per
 * `features/demo/fixtures/relative-date.ts`) stays "never visibly stale"
 * (Capability 2 AC6) without any page needing to repeat this declaration.
 * This is additive on top of Next's own default static classification: no
 * dynamic API (`cookies()`, `headers()`, a live `fetch`) is ever called
 * anywhere in this tree, since nothing here reads a session or queries a
 * database (Capability 3).
 *
 * Mounts `DemoShell` (nav + banner + layout chrome, `features/demo/
 * components/demo-shell.tsx` — UI Component Engineer territory, already
 * built) with a fixture `user` — `/demo` has no per-visitor identity, so this
 * is a plain, honest placeholder label, never a fabricated individual's name
 * (public-demo.md Capability 4 AC2's "never implies the data is real").
 *
 * Also mounts `CurrencyPreferenceProvider` (`app/(dashboard)/currency-
 * preference-provider.tsx` — root-layout plumbing per that file's own
 * ownership note, "belongs to the Frontend Lead's... remit," not the UI
 * Component Engineer's `components/shared/`) with a fixed `"USD"` value.
 * This is required, not optional: several of the real chart/section
 * components this route reuses verbatim per the design doc's §3.1 allowlist
 * (`SpendingByCategoryChart`, `IncomeVsExpenseChart`, `MonthlyTrendsChart`,
 * `GrowthChart`, `AllocationChart`) call that provider's `useFormatCurrency()`/
 * `useCurrencyDisplay()` hooks internally, which **throw** outside a mounted
 * provider (see that file's own `useCurrencyDisplay` JSDoc) — `/demo` has no
 * per-visitor currency preference to resolve (no session, no Settings row),
 * so this mounts the same provider shape with a fixed default instead of a
 * fetched one, exactly matching every demo presentational twin's own
 * `currency = "USD"` prop default.
 */
export const revalidate = 86400

const DEMO_USER = { name: "Demo Household" }
const DEMO_CURRENCY = "USD"

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-svh overflow-hidden">
      <CurrencyPreferenceProvider currency={DEMO_CURRENCY}>
        <DemoShell user={DEMO_USER}>{children}</DemoShell>
      </CurrencyPreferenceProvider>
    </div>
  )
}
