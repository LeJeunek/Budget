import { db } from "@/lib/db"
import { DASHBOARD_CARD_KEYS } from "@/features/dashboard/dashboard-cards"

import type { DashboardCardView, UserPreferenceView } from "../types"

/**
 * Read-side of the Settings module, per phase-4c-technical-design.md §3.6.
 * Both functions below are Server-Component-direct-call reads (no `GET`
 * route/hook — same "no client-refetchable endpoint" contract
 * Notifications' Phase 4b preferences screen already established); every
 * settings page fetches these once and hands the result down as an
 * `initial*` prop to its Client Component.
 */

/** Product defaults applied when a `UserPreference` row is somehow missing
 * (see `getUserPreference`'s own JSDoc for why this is a defensive fallback,
 * not the expected path). Mirrors `UserPreference`'s own column defaults in
 * prisma/schema.prisma exactly, so a missing row and a freshly-seeded row
 * resolve identically. */
const DEFAULT_USER_PREFERENCE: UserPreferenceView = {
  accentColor: null,
  currencyDisplay: "USD",
  timezone: "UTC",
  timezoneConfirmed: false,
}

/**
 * The caller's preferences row. Per §3.2, `UserPreference` is EAGERLY seeded
 * at signup (`lib/auth.ts`'s `databaseHooks.user.create.after`), so this
 * should always find a real row — `findUnique` (not `findUniqueOrThrow`)
 * plus the documented default above is a deliberate defensive fallback for
 * an account that predates that seeding (or whose seeding attempt failed and
 * was only logged, per that hook's own try/catch), not a signal that row
 * absence is an expected, ordinary state the way it is for
 * `DashboardCardPreference` below. This keeps the read side resilient
 * without ever throwing a user out of their own settings page.
 */
export async function getUserPreference(userId: string): Promise<UserPreferenceView> {
  const row = await db.userPreference.findUnique({ where: { userId } })
  if (!row) {
    return DEFAULT_USER_PREFERENCE
  }

  return {
    accentColor: row.accentColor,
    currencyDisplay: row.currencyDisplay,
    timezone: row.timezone,
    timezoneConfirmed: row.timezoneConfirmed,
  }
}

/** The subset of a `DashboardCardPreference` row `materializeDashboardCardPreferences`
 * actually needs — kept narrow and Prisma-independent so the merge algorithm
 * itself stays a pure, unit-testable function (per this codebase's "no
 * integration-test database" convention, e.g.
 * `financial-health-score/server/service.test.ts`'s own top-of-file note). */
export interface DashboardCardPreferenceRow {
  cardKey: string
  order: number
  visible: boolean
}

/**
 * The row-absence materialization algorithm itself, per §3.5:
 *   1. every row for the caller, keyed by `cardKey`
 *   2. for each key in `DASHBOARD_CARD_KEYS` (canonical order): use the row's
 *      own `order`/`visible` if one exists, else synthesize
 *      `{ visible: true }`, positioned after every key that DOES have a row
 *   3. return the merged list, sorted by effective order
 *
 * A stored row whose `cardKey` no longer appears in `DASHBOARD_CARD_KEYS`
 * (a card removed in a later phase while old preference rows still
 * reference it, risk-register.md #36) is ignored entirely here — it
 * contributes nothing to either the merge or the "existing max order"
 * computation below, so a stale key can never influence where a legitimate
 * canonical card gets appended.
 *
 * Extracted as a standalone, database-free export specifically so it can be
 * unit-tested directly (`service.test.ts`) without a live database, per this
 * codebase's standing convention for pure business logic that happens to sit
 * inside an otherwise DB-touching `server/service.ts` file.
 */
export function materializeDashboardCardPreferences(
  rows: DashboardCardPreferenceRow[],
): DashboardCardView[] {
  const rowsByKey = new Map(
    rows
      .filter((row) => DASHBOARD_CARD_KEYS.some((card) => card.key === row.cardKey))
      .map((row) => [row.cardKey, row] as const),
  )

  const maxExistingOrder = Array.from(rowsByKey.values()).reduce(
    (max, row) => Math.max(max, row.order),
    -1,
  )

  let nextAppendOrder = maxExistingOrder + 1

  const views = DASHBOARD_CARD_KEYS.map(({ key, label }) => {
    const row = rowsByKey.get(key)
    if (row) {
      return { key, label, order: row.order, visible: row.visible }
    }
    return { key, label, order: nextAppendOrder++, visible: true }
  })

  return views.sort((a, b) => a.order - b.order)
}

/**
 * AC3's "at least one Dashboard card must remain visible" guard, as a pure
 * predicate: true when hiding `key` (from `current`'s already-materialized
 * state) would leave zero visible cards. Extracted out of
 * `server/actions.ts`'s `updateDashboardCardVisibility` specifically so the
 * guard's own logic is unit-testable without a database — the same "pure,
 * database-free function" rationale `materializeDashboardCardPreferences`
 * above already documents.
 *
 * `updateDashboardCardVisibility` calls this INSIDE a `Serializable`
 * `db.$transaction`, against a `current` snapshot read fresh from that same
 * transaction (never a snapshot read before the transaction began) — that
 * placement, not this function's own logic, is what closes the TOCTOU race
 * documented in dashboard-card-visibility-toctou-empty-dashboard.md; this
 * function only expresses the invariant itself, correctly, for whatever
 * `current` it's given.
 */
export function wouldHideLastVisibleCard(
  current: DashboardCardView[],
  key: string,
  visible: boolean,
): boolean {
  if (visible) {
    return false
  }
  const currentlyVisible = current.filter((card) => card.visible)
  const targetIsCurrentlyVisible = currentlyVisible.some((card) => card.key === key)
  return targetIsCurrentlyVisible && currentlyVisible.length <= 1
}

/**
 * Every Dashboard card's fully-resolved show/hide/order state for `userId`,
 * per §3.5. `DashboardCardPreference` is LAZILY materialized (unlike
 * `UserPreference` above) — row absence here is the ordinary, expected case
 * for any card a user has never touched, not a defensive fallback.
 */
export async function getDashboardCardPreferences(
  userId: string,
): Promise<DashboardCardView[]> {
  const rows = await db.dashboardCardPreference.findMany({ where: { userId } })
  return materializeDashboardCardPreferences(rows)
}
