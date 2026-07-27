// Shared constants for the showcase seed script (prisma/seed-showcase.ts and
// its helper modules in this directory). Centralized here, instead of
// repeated as magic numbers in every module, so the handful of "current,
// live" figures that must agree across multiple models (e.g. the Brokerage
// Account's balance must equal the sum of its Holdings' currentValue; the
// final NetWorthSnapshot must equal the live Account/Debt balances) are each
// defined exactly once and simply imported everywhere they're needed —
// avoiding the drift risk of hand-copying the same number into five files.

/** Login credentials for the demo account — printed again at the end of the
 * script's run for convenience, but this is the single source of truth. */
export const SHOWCASE_EMAIL = "showcase@lkbudget.demo"
export const SHOWCASE_PASSWORD = "ShowcaseDemo!2026"
export const SHOWCASE_NAME = "Jordan Casey"

/**
 * Fixed "as of" anchor date for every figure this script seeds — deliberately
 * NOT `new Date()` evaluated at run time. Every month label, bill due/paid-
 * vs-upcoming split, and the final (most recent) Financial Health Score /
 * Net Worth snapshot below is authored relative to this fixed point so the
 * demo reads as "today" no matter which actual calendar day this script is
 * re-run on. Matches the date this script was authored against; bump this
 * (and the MONTHS table below) forward if the showcase is regenerated much
 * later and the "current, partial month" framing starts to look stale.
 */
export const TODAY = new Date(Date.UTC(2026, 6, 27)) // July 27, 2026

/** UTC-midnight Date helper — every date-typed column in this schema
 * (`@db.Date` columns like Transaction.date/Budget.month, and the
 * DateTime columns we also treat as calendar dates here) uses this same
 * "no time-of-day, no local-timezone drift" convention throughout the real
 * app (risk-register.md #8), so seed data follows it too. */
export function utcDate(year: number, monthIndexZeroBased: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndexZeroBased, day))
}

/** One entry per calendar month this showcase account has history for —
 * February through July 2026, six months, mirroring the task's "several
 * months old account" framing. `monthIndex` is zero-based (JS Date
 * convention) to pass directly to `utcDate`/`Date.UTC`. The last entry
 * (July) is the current, partial (through TODAY) month — every other
 * module below must treat it as such (e.g. no MonthlySummary row for it,
 * since Automatic Monthly Summaries are never generated for an
 * in-progress month per ai-features.md Feature 3 AC3). */
export interface MonthDef {
  year: number
  monthIndex: number
  label: string
  isCurrent: boolean
}

export const MONTHS: MonthDef[] = [
  { year: 2026, monthIndex: 1, label: "February 2026", isCurrent: false },
  { year: 2026, monthIndex: 2, label: "March 2026", isCurrent: false },
  { year: 2026, monthIndex: 3, label: "April 2026", isCurrent: false },
  { year: 2026, monthIndex: 4, label: "May 2026", isCurrent: false },
  { year: 2026, monthIndex: 5, label: "June 2026", isCurrent: false },
  { year: 2026, monthIndex: 6, label: "July 2026", isCurrent: true },
]

/** The account-creation anchor — "several months old account" per the task,
 * used to backdate User.createdAt and every other model's createdAt so the
 * whole account looks like it has genuinely existed since the first month
 * in MONTHS, not like everything was created in one instant today. */
export const ACCOUNT_CREATED_AT = utcDate(2026, 1, 1) // February 1, 2026

// ---- Live (as-of-TODAY) balances, referenced by both accounts.ts/debt.ts
// (which write these as the actual current Account/Debt rows) and
// net-worth.ts (whose final/most-recent NetWorthSnapshot must equal them
// exactly, per this schema's own "persisted copy of live numbers" rule for
// that model). Defined once here so those two modules can never drift
// apart from each other. -------------------------------------------------
export const CHECKING_BALANCE = 3200.0
export const SAVINGS_BALANCE = 12500.0
export const CREDIT_CARD_BALANCE = 460.0
/** Must equal the sum of the Brokerage account's active Holdings'
 * currentValue (investments.ts) — Account.balance's schema comment
 * documents this as a derived-but-manually-kept-in-sync-here value for
 * static seed data, the same precedent prisma/seed.ts already established. */
export const BROKERAGE_BALANCE = 9300.0
export const RETIREMENT_BALANCE = 42000.0
export const STUDENT_LOAN_BALANCE = 18200.0
