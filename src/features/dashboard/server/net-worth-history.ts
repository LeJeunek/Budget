import { z } from "zod"

import { db } from "@/lib/db"

import type {
  DefaultRangeResolution,
  NetWorthHistoryPoint,
  NetWorthHistoryRange,
  NetWorthHistoryResponse,
} from "../types"

// The Net Worth History chart's read layer (Phase 3b), per
// docs/architecture/api-contracts.md's "Net Worth History chart" section and
// docs/architecture/Architecture.md's "Net Worth History chart's data source
// and read-side contract" section. A pure read layer over the existing
// `NetWorthSnapshot` table (Phase 3a) — no new model, no new index (the
// `@@index([userId, capturedAt])` already anticipated this exact query, per
// that model's own schema comment). Lives inside `features/dashboard/`
// (sibling to `snapshot.ts`), not a new feature module — same reasoning
// already applied to the snapshot job itself: no data of its own beyond
// reads over a table Dashboard already owns.
//
// Every exported function here takes a pre-resolved `userId` from the
// caller's `getCurrentUser()` result (see lib/auth.ts) and scopes every
// Prisma query by it, matching this module's own `service.ts` convention —
// never called from a Client Component directly, and never trusts a
// client-supplied user id (net-worth-history.md AC10).

/** AC4's sparse-history threshold: fewer than this many distinct captured
 * days renders the "Building your net worth history" messaging instead of a
 * fully-populated trend chart. */
const SPARSE_HISTORY_THRESHOLD_DAYS = 14

/** AC3's default-range threshold: once the user's earliest snapshot is this
 * many days old (or older), the chart's default range flips from "All Time"
 * to "90 Days". */
const DEFAULT_RANGE_HISTORY_THRESHOLD_DAYS = 90

/** Architecture.md's "~120 points" legibility threshold (AC7) — thinning
 * only kicks in once a resolved range's row count would exceed this. */
const THINNING_THRESHOLD_POINTS = 120

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Number of calendar days each non-"all" range covers, inclusive of today —
 * e.g. `"30d"` means "today and the 29 days before it". */
const RANGE_WINDOW_DAYS: Record<Exclude<NetWorthHistoryRange, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
}

/** Validates the `?range=` query string param on the Route Handler
 * (`app/api/dashboard/net-worth-history/route.ts`) — the one HTTP boundary
 * this module has. `getNetWorthHistory`'s own `range` parameter is already
 * typed via `NetWorthHistoryRange` for its Server Component callers, so this
 * schema exists specifically to turn an untyped query string into that same
 * union, per this codebase's "Zod at every boundary" convention. No default:
 * per api-contracts.md, this route is only ever called by
 * `use-net-worth-history.ts` *after* the initial load already resolved a
 * concrete range (via `resolveDefaultRange` or a user's own selector change),
 * so a missing/invalid value here is always a genuine client bug, not a case
 * to silently paper over with a fallback.
 */
export const NetWorthHistoryRangeSchema = z.enum(["30d", "90d", "1y", "all"], {
  error: "range must be one of: 30d, 90d, 1y, all",
})

/** Today's UTC calendar date, truncated to midnight — matching
 * `NetWorthSnapshot.capturedDate`'s own `@db.Date` + UTC convention
 * (risk-register.md #8), same pattern as `service.ts`'s `resolveMonthToDateRange`. */
function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** `"yyyy-MM-dd"` key for a UTC date, built manually from UTC getters (never
 * a local-timezone-dependent formatter), mirroring `service.ts`'s
 * `formatMonthKey`. */
function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Resolves the inclusive lower bound (`capturedDate >= start`) for a given
 * range, or `null` for `"all"` (no lower bound — the query is otherwise
 * naturally bounded by the user's account age, per Architecture.md's
 * "thousands, not millions, of rows per user" scale note).
 *
 * Exported (not just a private helper) specifically so this pure date-math
 * — the boundary calculation the product spec's Definition of Done calls out
 * as needing test coverage "not just eyeballed" — is directly unit-testable
 * without a database, mirroring `features/debt/payoff-math.ts`'s "extract
 * the pure calculation, test it in isolation" precedent. See
 * `net-worth-history.test.ts`.
 */
export function resolveRangeStart(
  range: NetWorthHistoryRange,
  now: Date = new Date(),
): Date | null {
  if (range === "all") {
    return null
  }

  const windowDays = RANGE_WINDOW_DAYS[range]
  const today = utcToday(now)

  // `windowDays - 1` because the window is inclusive of today — a "30 Days"
  // range spans today plus the 29 days before it, i.e. 30 calendar days
  // total, not 31.
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - (windowDays - 1),
    ),
  )
}

/** One already-captured snapshot row, narrowed to exactly the columns
 * `getNetWorthHistory` needs (avoids over-fetching `id`/`userId`/`capturedAt`,
 * which this function never uses). Exported so `net-worth-history.test.ts`
 * can build fixture rows without depending on Prisma's `Decimal` class
 * directly — any object with a `toNumber()` method structurally satisfies
 * this. */
export interface SnapshotRow {
  capturedDate: Date
  totalAccountBalance: { toNumber(): number }
  totalUnlinkedDebtLiability: { toNumber(): number }
  totalNetWorth: { toNumber(): number }
}

/**
 * Thins `rows` (already sorted ascending by `capturedDate`) down to at most
 * `THINNING_THRESHOLD_POINTS` entries, per Architecture.md's "AC7 legibility"
 * shape: one **real, already-captured** row per bucket, keeping the last
 * (most recent) row within each bucket — never an averaged or synthetic
 * point, so AC6's "hover shows that day's exact date and value" and AC8's
 * "never fabricate an interpolated value" both stay honest even on a thinned
 * series.
 *
 * The bucket width (in days) is computed dynamically from the actual row
 * count, rather than a fixed per-range week/month rule: this keeps the
 * output bounded at the threshold regardless of gaps in captured history
 * (AC8's "missed cron invocation" case naturally yields fewer rows without
 * this needing its own branch), and generalizes Architecture.md's own
 * "e.g. the last snapshot in each week or month bucket, depending on range"
 * example rather than hard-coding those two specific bucket sizes.
 *
 * No-op (returns `rows` unchanged) when `rows.length` is already at or under
 * the threshold — thinning is the exception at short ranges, not the rule.
 *
 * Exported for the same test-isolation reason as `resolveRangeStart` above —
 * see `net-worth-history.test.ts`.
 */
export function thinRows<T extends SnapshotRow>(rows: T[]): T[] {
  if (rows.length <= THINNING_THRESHOLD_POINTS) {
    return rows
  }

  const bucketDays = Math.ceil(rows.length / THINNING_THRESHOLD_POINTS)
  const firstCapturedAt = rows[0].capturedDate.getTime()

  // A `Map` naturally preserves insertion order; since `rows` is sorted
  // ascending, each row's bucket key is non-decreasing as we iterate, so
  // overwriting `buckets.set(bucketKey, row)` on a repeat key always
  // replaces the entry's *value* (the row) while keeping its original
  // insertion position — meaning the surviving row per bucket is always the
  // last (most recent) one seen for that bucket, and final iteration order
  // is still ascending by date.
  const buckets = new Map<number, T>()
  for (const row of rows) {
    const dayOffset = Math.round(
      (row.capturedDate.getTime() - firstCapturedAt) / MS_PER_DAY,
    )
    const bucketKey = Math.floor(dayOffset / bucketDays)
    buckets.set(bucketKey, row)
  }

  return Array.from(buckets.values())
}

/**
 * The Net Worth History chart's one read function (net-worth-history.md,
 * api-contracts.md's `getNetWorthHistory(userId, range)` row). Fetches every
 * `NetWorthSnapshot` row `userId` has captured within `range`'s resolved
 * window (a single indexed query against `@@index([userId, capturedAt])`),
 * thins it for legibility (AC7) when needed, and shapes each surviving row
 * into the chart's `netWorth`/`assets`/`debt` breakdown (AC5) — all three
 * figures already present on every point, so the Frontend Lead's breakdown
 * toggle never needs a second fetch.
 *
 * `daysTracked`/`isSparse` are always computed against the user's **entire**
 * history, independent of `range` (a separate, cheap `count`, not derived
 * from `rows.length`) — per the `NetWorthHistoryResponse.daysTracked` JSDoc,
 * AC4's sparse-history messaging must read correctly even when a shorter
 * range happens to be selected.
 */
export async function getNetWorthHistory(
  userId: string,
  range: NetWorthHistoryRange,
): Promise<NetWorthHistoryResponse> {
  const start = resolveRangeStart(range)

  const [rows, daysTracked] = await Promise.all([
    db.netWorthSnapshot.findMany({
      where: {
        userId,
        ...(start ? { capturedDate: { gte: start } } : {}),
      },
      orderBy: { capturedDate: "asc" },
      select: {
        capturedDate: true,
        totalAccountBalance: true,
        totalUnlinkedDebtLiability: true,
        totalNetWorth: true,
      },
    }),
    db.netWorthSnapshot.count({ where: { userId } }),
  ])

  const thinnedRows = thinRows(rows)
  const lastIndex = thinnedRows.length - 1

  const points: NetWorthHistoryPoint[] = thinnedRows.map((row, index) => ({
    date: formatDateKey(row.capturedDate),
    netWorth: row.totalNetWorth.toNumber(),
    assets: row.totalAccountBalance.toNumber(),
    debt: row.totalUnlinkedDebtLiability.toNumber(),
    isMostRecent: index === lastIndex,
  }))

  return {
    range,
    daysTracked,
    isSparse: daysTracked < SPARSE_HISTORY_THRESHOLD_DAYS,
    points,
  }
}

/**
 * Resolves AC3's default range — `"all"` when the user's earliest snapshot
 * is less than 90 days old, `"90d"` once it is 90 or more days old — via a
 * cheap `aggregate`(`min`)/`count` pair, not a full row fetch, so the initial
 * Server Component render can pick the right default before paying for
 * `getNetWorthHistory`'s own (potentially thinned) row query.
 *
 * A user with zero snapshots yet (net-worth-history.md's "Zero snapshots"
 * edge case) resolves to `{ defaultRange: "all", daysTracked: 0 }` — "All
 * Time" over an empty history is the correct default for the Frontend Lead's
 * empty-state rendering to key off of, and `daysTracked: 0` is itself the
 * signal that empty state applies (rather than the sparse-history message).
 */
export async function resolveDefaultRange(
  userId: string,
): Promise<DefaultRangeResolution> {
  const [earliest, daysTracked] = await Promise.all([
    db.netWorthSnapshot.aggregate({
      where: { userId },
      _min: { capturedDate: true },
    }),
    db.netWorthSnapshot.count({ where: { userId } }),
  ])

  const earliestCapturedDate = earliest._min.capturedDate
  if (!earliestCapturedDate) {
    return { defaultRange: "all", daysTracked: 0 }
  }

  const ageDays = Math.floor(
    (utcToday().getTime() - earliestCapturedDate.getTime()) / MS_PER_DAY,
  )

  return {
    defaultRange:
      ageDays >= DEFAULT_RANGE_HISTORY_THRESHOLD_DAYS ? "90d" : "all",
    daysTracked,
  }
}
