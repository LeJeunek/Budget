/**
 * Pure `"YYYY-MM"` month-string helpers, deliberately in their own
 * non-"use client" module.
 *
 * Real bug fixed here (2026-07-20): these were originally defined inside
 * `month-navigator.tsx`, which starts with `"use client"` (required for the
 * `MonthNavigator` component's `onClick` handlers). Next.js's module
 * boundary is per-*file*, not per-export — importing a plain function from
 * a `"use client"` file into a Server Component doesn't get you the actual
 * function body, it gets you an opaque client reference that throws at
 * render time when called directly. `(dashboard)/page.tsx`,
 * `(dashboard)/budgeting/page.tsx`, and `(dashboard)/bills/page.tsx` are all
 * Server Components that called `currentMonthString()`/`formatMonthLabel()`
 * directly — every one of them crashed. Caught via a live server-side
 * exception on the Dashboard after signing in, not by typecheck/lint/build
 * (a "use client" violation like this is a runtime error, not a type
 * error). Moving the pure logic here, with no client directive, means
 * Server Components can import and call it directly, while
 * `month-navigator.tsx` re-exports it for existing client-side callers and
 * still uses it internally for the `MonthNavigator` component itself.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function assertValidMonth(month: string): void {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`Invalid month "${month}" — expected "YYYY-MM"`)
  }
}

/** Adds `delta` calendar months to a `"YYYY-MM"` string, wrapping year
 * boundaries correctly in either direction (e.g. `shiftMonth("2026-01", -1)`
 * === `"2025-12"`). */
export function shiftMonth(month: string, delta: number): string {
  assertValidMonth(month)
  const [yearStr, monthStr] = month.split("-")
  const totalMonths = Number(yearStr) * 12 + (Number(monthStr) - 1) + delta
  const year = Math.floor(totalMonths / 12)
  const monthIndex = ((totalMonths % 12) + 12) % 12
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`
}

/** `"YYYY-MM"` for the current UTC calendar month — matches
 * `features/budgeting/server/validation.ts`'s `currentMonthStart`'s own UTC
 * convention (risk-register.md #8), so a client evaluating "is this the
 * current month" never disagrees with the server. */
export function currentMonthString(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Human-readable label for a `"YYYY-MM"` string, e.g. `"July 2026"`. */
export function formatMonthLabel(month: string): string {
  assertValidMonth(month)
  const [yearStr, monthStr] = month.split("-")
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1))
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}
