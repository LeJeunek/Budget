import type {
  NetWorthHistoryPoint,
  NetWorthHistoryRange,
  NetWorthHistoryResponse,
} from "@/features/dashboard/types"

import { relativeDate } from "../relative-date"

/**
 * Synthesizes and precomputes the full `Record<NetWorthHistoryRange,
 * NetWorthHistoryResponse>` map in one call, per
 * public-demo-technical-design.md §2.3 — the demo has no backing
 * `GET /api/dashboard/net-worth-history` route to refetch from, so every
 * range's data must already be resolved before `DemoNetWorthHistoryChart`
 * mounts; switching ranges client-side becomes a pure, local lookup.
 *
 * The real `features/dashboard/server/net-worth-history.ts` reads already-
 * captured `NetWorthSnapshot` rows — this fixture module has no such table
 * to read (net worth snapshots aren't one of this feature's atomic fixture
 * entities), so it authors a smooth, deterministic ~6-month trajectory of
 * historical points converging exactly to `currentNetWorth`/
 * `currentDebtLiability` "today" — the same two figures `derive/net-worth.ts`
 * computes from the household's real accounts/debts, passed in by the
 * caller so this chart's most recent point always agrees with Dashboard's
 * own Net Worth stat and Accounts' balance list. `assets - debt = netWorth`
 * holds at every point, matching `NetWorthSnapshot`'s own stored-formula
 * invariant.
 *
 * `resolveRangeStart`'s window-day math mirrors
 * `features/dashboard/server/net-worth-history.ts`'s function of the same
 * name exactly (that file lives under `features/dashboard/server/`, blocked
 * by public-demo-technical-design.md §4.1's `no-restricted-imports` rule,
 * hence this reimplementation — flagged per §2.2). This fixture's ~61-point
 * master series never exceeds that file's `THINNING_THRESHOLD_POINTS`
 * (120), so the real function's thinning step is a documented no-op here,
 * not reimplemented.
 */

const SPARSE_HISTORY_THRESHOLD_DAYS = 14
const RANGE_WINDOW_DAYS: Record<Exclude<NetWorthHistoryRange, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
}
const ALL_RANGES: NetWorthHistoryRange[] = ["30d", "90d", "1y", "all"]

const TOTAL_DAYS_OF_HISTORY = 180
const STEP_DAYS = 3
const POINT_COUNT = Math.floor(TOTAL_DAYS_OF_HISTORY / STEP_DAYS) + 1

interface MasterPoint {
  daysAgo: number
  netWorth: number
  assets: number
  debt: number
}

/** Small, deterministic (never `Math.random`) wave used to give the
 * synthesized trajectory realistic month-to-month texture instead of a
 * perfectly straight line — same "hand-authored, not randomized" discipline
 * every other fixture file in this module follows. */
function wave(index: number): number {
  return Math.sin(index * 0.9) * 220 - Math.cos(index * 0.5) * 140
}

/**
 * Exported so `derive/financial-health-score.ts`'s Net Worth Trend component
 * can look up "net worth ~3 months ago" against this exact same synthesized
 * trajectory, rather than generating a second, independent historical
 * series that could disagree with what the Net Worth History chart shows.
 */
export function buildMasterSeries(
  currentNetWorth: number,
  currentDebtLiability: number,
): MasterPoint[] {
  const startNetWorth = currentNetWorth - 6200
  const startDebtLiability = currentDebtLiability + 4200

  const points: MasterPoint[] = []
  for (let i = 0; i < POINT_COUNT; i++) {
    const fraction = i / (POINT_COUNT - 1)
    const isLast = i === POINT_COUNT - 1

    const netWorth = isLast
      ? currentNetWorth
      : startNetWorth + (currentNetWorth - startNetWorth) * fraction + wave(i)
    const debt = isLast
      ? currentDebtLiability
      : startDebtLiability + (currentDebtLiability - startDebtLiability) * fraction

    points.push({
      daysAgo: TOTAL_DAYS_OF_HISTORY - i * STEP_DAYS,
      netWorth,
      assets: netWorth + debt,
      debt,
    })
  }

  return points
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Mirrors `resolveRangeStart`'s inclusive-lower-bound math exactly —
 * `null` for `"all"` (no lower bound). */
function resolveRangeStart(range: NetWorthHistoryRange, now: Date): Date | null {
  if (range === "all") {
    return null
  }
  return relativeDate(RANGE_WINDOW_DAYS[range] - 1, now)
}

function buildResponseForRange(
  range: NetWorthHistoryRange,
  masterSeries: MasterPoint[],
  daysTracked: number,
  now: Date,
): NetWorthHistoryResponse {
  const rangeStart = resolveRangeStart(range, now)

  const resolved = masterSeries
    .map((point) => ({ ...point, date: relativeDate(point.daysAgo, now) }))
    .filter((point) => rangeStart === null || point.date >= rangeStart)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const lastIndex = resolved.length - 1
  const points: NetWorthHistoryPoint[] = resolved.map((point, index) => ({
    date: formatDateKey(point.date),
    netWorth: point.netWorth,
    assets: point.assets,
    debt: point.debt,
    isMostRecent: index === lastIndex,
  }))

  return {
    range,
    daysTracked,
    isSparse: daysTracked < SPARSE_HISTORY_THRESHOLD_DAYS,
    points,
  }
}

/** Precomputes every range's `NetWorthHistoryResponse` in one call, resolved
 * against a single shared `now`. `currentNetWorth`/`currentDebtLiability`
 * should be `derive/net-worth.ts`'s own `deriveNetWorth(...)` output for the
 * household's current accounts/debts, so this chart's newest point always
 * agrees with Dashboard's Net Worth stat. */
export function deriveNetWorthHistory(
  currentNetWorth: number,
  currentDebtLiability: number,
  now: Date,
): Record<NetWorthHistoryRange, NetWorthHistoryResponse> {
  const masterSeries = buildMasterSeries(currentNetWorth, currentDebtLiability)
  const daysTracked = masterSeries.length

  const entries = ALL_RANGES.map(
    (range) => [range, buildResponseForRange(range, masterSeries, daysTracked, now)] as const,
  )

  return Object.fromEntries(entries) as Record<NetWorthHistoryRange, NetWorthHistoryResponse>
}
