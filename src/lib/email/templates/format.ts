/**
 * Tiny, dependency-free display-formatting helpers shared by every
 * per-trigger-type email template — kept separate from `shared-layout.tsx`
 * (which owns structural/visual layout, not formatting) per single-
 * responsibility. Not a rendering component, so it deliberately does not
 * live under `templates/<trigger-type>.tsx`'s per-type naming.
 */

/** `"$1,234.56"` — matches the same US-locale currency display convention
 * this codebase's UI components already use. */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

/** `"January 5, 2026"` — a plain, unambiguous long date, UTC-based (matching
 * this codebase's `@db.Date` + UTC convention, risk-register.md #8) so an
 * email never shows a date shifted by the recipient's own mail client
 * timezone. */
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}
