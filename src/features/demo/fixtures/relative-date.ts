/**
 * The demo fixture dataset's never-visibly-stale date mechanism, per
 * docs/architecture/public-demo-technical-design.md §5.1.
 *
 * Every fixture entity that carries a date field must store an integer
 * offset (a plain number of days or months), never a literal `Date`/ISO
 * string — this is what makes public-demo.md Capability 2 AC6 ("must not
 * visibly grow stale the longer it goes unmaintained") true by construction:
 * a transaction authored as `{ merchant: "Whole Foods", daysAgo: 4 }` reads
 * as "4 days before whenever this page is rendered," forever, with zero
 * maintenance — never a date that eventually just reads "2026" regardless of
 * when it's viewed.
 *
 * Both functions accept an injectable `now` (defaulting to `new Date()`)
 * purely so every fixture file can be resolved against one, single,
 * shared `now` captured once per render (see `household.ts`) — the same
 * "inject `now` for testability and for a single shared anchor" convention
 * this codebase already uses throughout (e.g.
 * `features/budgeting/server/validation.ts`'s `currentMonthStart`/
 * `isPastMonth`, `features/debt/payoff-math.ts`'s `computeAmortization`).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * A `Date` exactly `daysAgo` calendar days before `now`, at `now`'s own
 * time-of-day. `daysAgo: 0` is `now` itself. Negative values are rejected —
 * every fixture date is in the past or "today," never a fabricated future
 * date (a demo transaction dated after "now" would look like a data-entry
 * bug, not a feature).
 */
export function relativeDate(daysAgo: number, now: Date = new Date()): Date {
  if (daysAgo < 0) {
    throw new Error(`relativeDate: daysAgo must be >= 0, received ${daysAgo}`)
  }
  return new Date(now.getTime() - daysAgo * MS_PER_DAY)
}

/**
 * The UTC first-of-month `Date` for the calendar month `monthsAgo` months
 * before `now`'s own calendar month — the month-scale sibling to
 * `relativeDate`, for goal/budget-month framing (e.g. "this Savings Goal's
 * earliest contribution was logged 5 months ago," a budget month's own
 * `"YYYY-MM"` key). Built via `Date.UTC` month-index arithmetic (never a
 * local-timezone `Date` constructor), matching this codebase's established
 * UTC-calendar-date convention for month-boundary math
 * (`features/dashboard/server/service.ts`'s `utcMonthStart`,
 * `features/budgeting/server/validation.ts`'s `currentMonthStart`).
 * `monthsAgo: 0` is the first day of `now`'s own calendar month.
 */
export function relativeMonthStart(monthsAgo: number, now: Date): Date {
  if (monthsAgo < 0) {
    throw new Error(`relativeMonthStart: monthsAgo must be >= 0, received ${monthsAgo}`)
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1))
}
