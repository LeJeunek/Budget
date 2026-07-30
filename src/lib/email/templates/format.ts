/**
 * Tiny, dependency-free display-formatting helpers shared by every
 * per-trigger-type email template — kept separate from `shared-layout.tsx`
 * (which owns structural/visual layout, not formatting) per single-
 * responsibility. Not a rendering component, so it deliberately does not
 * live under `templates/<trigger-type>.tsx`'s per-type naming.
 */

/**
 * `"$1,234.56"` (or `"€1.234,56"`, etc., depending on `currency`) — matches
 * the same US-locale-grouping, currency-driven convention `lib/utils.ts`'s
 * own `formatCurrency` already established (`Intl`/`toLocaleString` derive
 * decimal-place conventions, e.g. JPY's zero decimals, from `currency` alone,
 * independent of the fixed `"en-US"` locale used for grouping — no
 * locale-per-currency mapping needed).
 *
 * Phase 4c (phase-4c-technical-design.md §3.6, docs/product/customization.md
 * Currency Display capability, docs/release/phase-4c-notes.md §1's blocking
 * finding): `currency` is a required parameter here — every one of this
 * feature's five currency-formatting call sites (`budget-over.tsx`,
 * `bill-due-soon.tsx`, `bill-late.tsx`, `large-purchase.tsx`,
 * `low-balance.tsx`) must pass the recipient's own resolved
 * `UserPreference.currencyDisplay`, threaded down from
 * `features/notifications/server/email-dispatch.ts`'s `dispatchNotificationEmail`
 * (the same `userId` that function already resolves everything else from —
 * never a second, independently-scoped lookup). Deliberately no default
 * value (unlike `lib/utils.ts`'s own `formatCurrency`) so a future new email
 * template that adds a currency figure fails to compile if it forgets to
 * thread this through, rather than silently defaulting to USD the way the
 * pre-4c call sites across this app did (per the Release Manager's rejection
 * notes, §1).
 */
export function formatCurrency(amount: number, currency: string): string {
  return amount.toLocaleString("en-US", { style: "currency", currency })
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
