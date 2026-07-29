import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Money is stored as Prisma Decimal server-side; by the time it reaches a
// Client Component it has been serialized to a plain number, which is what
// this expects. See docs/database/performance-considerations.md re: Decimal.
//
// Phase 4c (phase-4c-technical-design.md §3.6, docs/product/customization.md
// Currency Display capability): this signature already accepted a `currency`
// parameter before this phase — every existing call site simply never passed
// one, relying on the `"USD"` default. `Intl.NumberFormat` derives the
// correct decimal-place convention (e.g. JPY's zero decimals) from
// `currency` alone, independent of the fixed `"en-US"` locale used for
// grouping, so no locale-per-currency mapping is needed for AC1's six-currency
// list to format correctly. `features/settings/components/currency-display-select.tsx`
// is this phase's one wired demonstration call site
// (`formatCurrency(amount, preference.currencyDisplay)`); updating every
// other existing call site across the app (Dashboard, Transactions, Reports,
// notifications, etc.) to pass the caller's resolved
// `UserPreference.currencyDisplay` is explicitly out of scope for this
// dispatch — real, broad call-site plumbing work, not a signature change,
// per that design doc section's own framing.
export function formatCurrency(
  amount: number,
  currency: string = "USD"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value)
}
