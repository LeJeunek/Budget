/**
 * Shared, presentation-only formatting helpers for Analytics' chart
 * components. Deliberately its own copy rather than an import from
 * `features/dashboard/components/chart-format.ts` — per
 * `features/debt/components/debt-card.tsx`'s own precedent comment,
 * `features/<domain>/components` is not a shared cross-domain import target
 * (folder-tree.md's module boundary rule); every feature that needs this
 * exact "compact currency axis tick" / "yyyy-MM(-dd) -> short label" shape
 * keeps its own small copy instead.
 */

/** Compact axis-tick currency formatter (e.g. "$1.2K") — for chart axes only,
 * never for an exact figure shown in a tooltip/legend/table cell (those use
 * `lib/utils.ts`'s `formatCurrency`), same distinction
 * `dashboard/components/chart-format.ts` documents. */
export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

/** `"yyyy-MM"` -> short display label, e.g. "Jul 2026". Built from UTC
 * `Date.UTC`/`Intl` (with `timeZone: "UTC"` pinned) so the label never drifts
 * to an adjacent month depending on the browser's local timezone — mirrors
 * `monthly-trends-chart.tsx`'s `formatMonthLabel` exactly. */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

/** `"yyyy-MM-dd"` -> short display label, e.g. "Jul 21". Same UTC-built
 * convention as `formatMonthLabel` above, mirroring
 * `net-worth-history-chart.tsx`'s `formatDateLabel`. */
export function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

/** Cycled across every multi-series chart in this feature (pie slices, line
 * series, stacked bars) — sourced from the same `--chart-1`..`--chart-5` CSS
 * variables `dashboard/components/spending-by-category-chart.tsx` uses, so
 * Analytics' palette stays visually consistent with the Dashboard's charts
 * without importing that file directly. */
export const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
