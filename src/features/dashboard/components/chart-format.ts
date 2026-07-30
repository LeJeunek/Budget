/**
 * Compact axis-tick currency formatter shared by the dashboard's bar/line
 * charts (`IncomeVsExpenseChart`, `MonthlyTrendsChart`).
 *
 * Deliberately distinct from `lib/utils.ts`'s `formatCurrency` (used
 * everywhere a full, exact value is shown — stat cards, tooltips, legends):
 * axis ticks render at a fixed, narrow pixel width, so a long fully-formatted
 * value like "$12,480.00" would overlap adjacent ticks or get clipped. This
 * formatter is chart-axis-specific presentation logic, not a general-purpose
 * money formatter, so it lives alongside the chart components that use it
 * rather than in the shared `lib/utils.ts` (owned as a general utility, not
 * a dashboard-chart concern).
 *
 * `currency` mirrors `formatCurrency`'s own `currency = "USD"` parameter/
 * default exactly (docs/release/phase-4c-notes.md Section 1) — every call
 * site should pass the caller's resolved `useCurrencyDisplay()` value rather
 * than relying on the default.
 */
export function formatCompactCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}
