import { AccountType, AssetType, Sector } from "@prisma/client"
import type {
  Holding as PrismaHoldingRow,
  HoldingValueHistoryEntry as PrismaHoldingValueHistoryRow,
  DividendEntry as PrismaDividendEntryRow,
} from "@prisma/client"

import { db } from "@/lib/db"
import { toAccount } from "@/features/accounts/server/service"

import type {
  AllocationBy,
  AllocationEntry,
  ContainerSummary,
  DividendEntry,
  GetGrowthHistoryOptions,
  GetHoldingsOptions,
  GrowthPoint,
  Holding,
  HoldingDetail,
  HoldingValueHistoryEntry,
  PortfolioContainerBreakdown,
  PortfolioOverview,
} from "../types"

// This module is imported directly by Server Components (per
// docs/architecture/api-contracts.md's Investments section: "List
// containers | Server Component direct call to service.getContainers(userId)",
// and every other read row in that table) and by `server/actions.ts`. It
// must never be imported from a Client Component — every exported function
// requires a pre-resolved `userId` from `getCurrentUser()` (see lib/auth.ts),
// never a client-supplied value, and this module never calls
// `getCurrentUser()` itself, matching `features/accounts/server/service.ts`
// and `features/goals/server/service.ts`'s convention.
//
// Imports `toAccount` from `features/accounts/server/service` — a
// deliberate, one-directional dependency (Investments -> Accounts), never
// the reverse, per docs/database/er-diagram.md's Phase 3a design note #2
// ("grow Account as the container") and note #4 (the derived-balance
// write-back). No other cross-feature import exists in this file.

/** Account types that can act as a Holding container, per investments.md
 * AC1 and prisma/schema.prisma's `Holding.accountId` comment. Reused by
 * `getContainers` (which account rows to list) and `getAllocation`/
 * `getGrowthHistory` (a defensive filter — a Holding should never exist
 * under any other account type, since `server/actions.ts`'s `createHolding`
 * enforces this at write time, but re-checking here costs nothing and keeps
 * every read immune to a future write-path bug). */
const CONTAINER_ACCOUNT_TYPES: AccountType[] = [
  AccountType.INVESTMENT,
  AccountType.RETIREMENT,
  AccountType.CRYPTO,
]

/** Human-readable labels for `AssetType`, used only by `getAllocation`
 * (AC9) — the enum's own `SCREAMING_CASE` values are correct for storage/
 * comparison but not for display. */
const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  STOCK: "Stock",
  ETF: "ETF",
  MUTUAL_FUND: "Mutual Fund",
  BOND: "Bond",
  CRYPTO: "Crypto",
  RETIREMENT_FUND: "Retirement Fund",
  OTHER: "Other",
}

/** Human-readable labels for `Sector`, used only by `getAllocation` (AC9). */
const SECTOR_LABELS: Record<Sector, string> = {
  TECHNOLOGY: "Technology",
  HEALTHCARE: "Healthcare",
  FINANCIALS: "Financials",
  ENERGY: "Energy",
  CONSUMER: "Consumer",
  REAL_ESTATE: "Real Estate",
  INDUSTRIALS: "Industrials",
  OTHER: "Other",
}

/** AC9/Edge Cases: holdings with `sector: null` (Crypto/Bond/Other/
 * Retirement Fund — see `validation.ts`'s flagged gap on this last one) are
 * grouped into this single bucket rather than excluded, so sector
 * allocation's percentages always sum to 100%. */
const SECTOR_NOT_APPLICABLE_LABEL = "Other / Not Applicable"

// ---------------------------------------------------------------------------
// Prisma row -> client-safe shape converters
// ---------------------------------------------------------------------------

/**
 * Converts a Prisma `Holding` row into the plain-number, gain/loss-enriched
 * `Holding` shape defined in `../types.ts`. AC6's formula, computed fresh on
 * every read, never stored: `gainLossAmount = currentValue - costBasis`;
 * `gainLossPercent` guards the `costBasis === 0` divide-by-zero case the
 * same way `payoff-math.ts` guards a 0% interest rate.
 */
export function toHolding(row: PrismaHoldingRow): Holding {
  const costBasis = row.costBasis.toNumber()
  const currentValue = row.currentValue.toNumber()
  const gainLossAmount = currentValue - costBasis
  const gainLossPercent = costBasis === 0 ? null : (gainLossAmount / costBasis) * 100

  return { ...row, costBasis, currentValue, gainLossAmount, gainLossPercent }
}

/** Converts a Prisma `HoldingValueHistoryEntry` row (`previousValue`/
 * `newValue` are `Decimal`) into the plain-number shape. */
export function toHoldingValueHistoryEntry(
  row: PrismaHoldingValueHistoryRow,
): HoldingValueHistoryEntry {
  return {
    ...row,
    previousValue: row.previousValue.toNumber(),
    newValue: row.newValue.toNumber(),
  }
}

/** Converts a Prisma `DividendEntry` row (`amount` is `Decimal`) into the
 * plain-number shape. */
export function toDividendEntry(row: PrismaDividendEntryRow): DividendEntry {
  return { ...row, amount: row.amount.toNumber() }
}

// ---------------------------------------------------------------------------
// Growth-history internals (AC7)
// ---------------------------------------------------------------------------

/** UTC `"YYYY-MM-DD"` calendar-date string for a `Date` — used for both
 * `Holding.createdAt` and `HoldingValueHistoryEntry.recordedAt`, which are
 * full timestamps; the growth chart is day-granular, matching this app's
 * established UTC-calendar-date convention (e.g. `Transaction.date`,
 * `Goal`'s month keys). */
function toIsoDateString(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface RawHistoryRow {
  previousValue: number
  newValue: number
  recordedAt: Date
}

/**
 * Reconstructs one holding's growth series from its value-history rows
 * (AC4/AC7). A `HoldingValueHistoryEntry` only exists for an *edit* — a
 * holding never edited since creation has zero rows — so the "single-point/
 * not enough history yet" state (AC7) is produced explicitly here rather
 * than ever returning an empty array for a holding that does exist.
 *
 * With N history rows (N >= 1), this returns N + 1 points: the holding's
 * value at creation (the earliest row's `previousValue`, dated at
 * `createdAt`), followed by each edit's `newValue` (dated at that edit's
 * `recordedAt`), in chronological order.
 */
function buildHoldingGrowthSeries(
  createdAt: Date,
  currentValue: number,
  history: RawHistoryRow[],
): GrowthPoint[] {
  if (history.length === 0) {
    return [{ date: toIsoDateString(createdAt), value: currentValue }]
  }

  const sorted = [...history].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  )
  const points: GrowthPoint[] = [
    { date: toIsoDateString(createdAt), value: sorted[0].previousValue },
  ]
  for (const row of sorted) {
    points.push({ date: toIsoDateString(row.recordedAt), value: row.newValue })
  }
  return points
}

/**
 * Builds the portfolio-level aggregate growth series (AC7's "aggregated at
 * the portfolio level") from every active holding's own series. At each
 * distinct date any holding recorded a value, the portfolio total is the sum
 * of every active holding's *latest known value as of that date* — a
 * holding not yet created, or not yet edited past its own initial point,
 * simply carries forward its last known value rather than being treated as
 * zero.
 *
 * Scoped to active (non-Closed) holdings only, matching AC9/AC10's
 * "active holdings only" scope for allocation/overview — this is a
 * deliberate consistency choice, not a binding requirement from
 * api-contracts.md (which does not specify Closed-holding treatment for this
 * one read), flagged in the final report as a judgment call.
 */
function buildPortfolioGrowthSeries(
  holdings: { id: string; createdAt: Date; currentValue: number; history: RawHistoryRow[] }[],
): GrowthPoint[] {
  if (holdings.length === 0) {
    return []
  }

  const events = holdings.flatMap((holding) =>
    buildHoldingGrowthSeries(holding.createdAt, holding.currentValue, holding.history).map(
      (point) => ({ ...point, holdingId: holding.id }),
    ),
  )
  events.sort((a, b) => a.date.localeCompare(b.date))

  const latestValueByHolding = new Map<string, number>()
  const totalByDate = new Map<string, number>()
  for (const event of events) {
    latestValueByHolding.set(event.holdingId, event.value)
    const total = Array.from(latestValueByHolding.values()).reduce(
      (sum, value) => sum + value,
      0,
    )
    totalByDate.set(event.date, total)
  }

  return Array.from(totalByDate.entries()).map(([date, value]) => ({ date, value }))
}

// ---------------------------------------------------------------------------
// Allocation internals (AC9)
// ---------------------------------------------------------------------------

/** The minimal, plain-number shape `computeAllocationEntries` needs per
 * holding — deliberately narrower than the full `Holding`/Prisma row (no
 * Decimal, no id/userId/etc.), so the percentage math below can be unit
 * tested with plain fixture data, with no database access required. */
interface AllocationSourceHolding {
  assetType: AssetType
  sector: Sector | null
  currentValue: number
}

/**
 * Pure allocation-percentage calculation, extracted out of `getAllocation`
 * below (Unit Test Engineer, Phase 3a gate-review follow-up: `getAllocation`
 * itself always queries the database directly with no way to inject fixture
 * data, so this calculation-only portion is pulled out into its own exported
 * function purely so it can be unit tested in isolation — a mechanical,
 * behavior-preserving extraction, not a formula change).
 *
 * AC9's grouping/percentage rules: groups `holdings` by asset-type label or
 * sector label (per `by`), with `null`-sector holdings bucketed into
 * `SECTOR_NOT_APPLICABLE_LABEL` rather than excluded (Edge Cases), and each
 * group's `percent = value / totalValue * 100`. Returns `[]` for an empty
 * (or all-zero-value) `holdings` array rather than dividing by zero (Edge
 * Case: "zero holdings in a container, or zero containers at all").
 */
export function computeAllocationEntries(
  holdings: AllocationSourceHolding[],
  by: AllocationBy,
): AllocationEntry[] {
  const totalValue = holdings.reduce((sum, holding) => sum + holding.currentValue, 0)
  if (totalValue === 0) {
    return []
  }

  const valueByLabel = new Map<string, number>()
  for (const holding of holdings) {
    const label =
      by === "assetType"
        ? ASSET_TYPE_LABELS[holding.assetType]
        : holding.sector
          ? SECTOR_LABELS[holding.sector]
          : SECTOR_NOT_APPLICABLE_LABEL

    valueByLabel.set(label, (valueByLabel.get(label) ?? 0) + holding.currentValue)
  }

  return Array.from(valueByLabel.entries()).map(([label, value]) => ({
    label,
    value,
    percent: (value / totalValue) * 100,
  }))
}

// ---------------------------------------------------------------------------
// Public service functions (docs/architecture/api-contracts.md — Investments)
// ---------------------------------------------------------------------------

/**
 * Lists the caller's Investment/Retirement/Crypto containers (AC1), each
 * annotated with its active holding count — `hasHoldings` is the signal the
 * container-detail UI uses to show "this account's balance is now calculated
 * from its holdings below" (per `Account.balance`'s Phase 3a doc comment).
 * Archived containers are excluded, matching every other domain's default
 * active-list behavior in this app.
 */
export async function getContainers(userId: string): Promise<ContainerSummary[]> {
  const rows = await db.account.findMany({
    where: { userId, type: { in: CONTAINER_ACCOUNT_TYPES }, archivedAt: null },
    include: {
      _count: { select: { holdings: { where: { closedAt: null } } } },
    },
    orderBy: { createdAt: "asc" },
  })

  return rows.map((row) => {
    const holdingCount = row._count.holdings
    return { ...toAccount(row), holdingCount, hasHoldings: holdingCount > 0 }
  })
}

/**
 * Lists the holdings under one container, scoped to the calling user.
 * Defaults to the active (non-Closed) list; pass `{ includeClosed: true }`
 * for the dedicated "Closed holdings" view (AC5/Edge Cases). Scoping the
 * query by both `userId` and `accountId` together means a caller-supplied
 * `accountId` belonging to a different user simply yields an empty result
 * (no Holding row can ever have `userId` = the caller and `accountId` =
 * another user's account), the same safe-by-construction pattern
 * `features/goals/server/service.ts`'s `getGoalById` documents.
 */
export async function getHoldingsForContainer(
  userId: string,
  accountId: string,
  options: GetHoldingsOptions = {},
): Promise<Holding[]> {
  const { includeClosed = false } = options

  const rows = await db.holding.findMany({
    where: {
      userId,
      accountId,
      closedAt: includeClosed ? { not: null } : null,
    },
    orderBy: { createdAt: "asc" },
  })

  return rows.map(toHolding)
}

/**
 * Fetches a single holding by id, scoped to the calling user, with its full
 * value-history (most-recent-first, AC4/AC7) and dividend history
 * (most-recent-first, AC8). Returns `null` for a missing id *or* an id
 * owned by a different user, matching `getAccountById`'s convention.
 */
export async function getHoldingById(
  userId: string,
  id: string,
): Promise<HoldingDetail | null> {
  const row = await db.holding.findFirst({
    where: { id, userId },
    include: {
      valueHistory: { orderBy: { recordedAt: "desc" } },
      dividends: { orderBy: { date: "desc" } },
    },
  })
  if (!row) {
    return null
  }

  const { valueHistory, dividends, ...holdingRow } = row
  return {
    ...toHolding(holdingRow),
    valueHistory: valueHistory.map(toHoldingValueHistoryEntry),
    dividends: dividends.map(toDividendEntry),
  }
}

/**
 * Portfolio-wide overview (AC10): total current value, total gain/loss, and
 * total dividend income across every active holding in every container, plus
 * the same three figures broken down per container.
 *
 * `totalCurrentValue`/`totalGainLoss` are summed over **active holdings
 * only** (AC9/AC10's explicit scope). `totalDividendIncome` sums dividends
 * from *every* holding regardless of `closedAt` (Edge Cases: "a dividend
 * logged on a Closed holding ... still counts toward ... the portfolio's
 * total dividend income") — the one figure here that is not active-only.
 */
export async function getPortfolioOverview(userId: string): Promise<PortfolioOverview> {
  const containers = await db.account.findMany({
    where: { userId, type: { in: CONTAINER_ACCOUNT_TYPES }, archivedAt: null },
    select: { id: true, name: true },
  })
  const containerIds = containers.map((c) => c.id)

  const breakdownByAccountId = new Map<string, PortfolioContainerBreakdown>()
  for (const container of containers) {
    breakdownByAccountId.set(container.id, {
      accountId: container.id,
      accountName: container.name,
      currentValue: 0,
      gainLoss: 0,
      dividendIncome: 0,
    })
  }

  if (containerIds.length === 0) {
    // Edge Case: "zero containers at all" — a well-formed, empty overview,
    // not a broken/undefined one.
    return { totalCurrentValue: 0, totalGainLoss: 0, totalDividendIncome: 0, byContainer: [] }
  }

  const [activeHoldings, dividends] = await Promise.all([
    db.holding.findMany({
      where: { userId, accountId: { in: containerIds }, closedAt: null },
      select: { accountId: true, costBasis: true, currentValue: true },
    }),
    db.dividendEntry.findMany({
      where: { userId, holding: { accountId: { in: containerIds } } },
      select: { amount: true, holding: { select: { accountId: true } } },
    }),
  ])

  for (const holding of activeHoldings) {
    const entry = breakdownByAccountId.get(holding.accountId)
    if (!entry) continue
    const currentValue = holding.currentValue.toNumber()
    const costBasis = holding.costBasis.toNumber()
    entry.currentValue += currentValue
    entry.gainLoss += currentValue - costBasis
  }

  for (const dividend of dividends) {
    const entry = breakdownByAccountId.get(dividend.holding.accountId)
    if (!entry) continue
    entry.dividendIncome += dividend.amount.toNumber()
  }

  const byContainer = Array.from(breakdownByAccountId.values())
  const totals = byContainer.reduce(
    (acc, entry) => ({
      totalCurrentValue: acc.totalCurrentValue + entry.currentValue,
      totalGainLoss: acc.totalGainLoss + entry.gainLoss,
      totalDividendIncome: acc.totalDividendIncome + entry.dividendIncome,
    }),
    { totalCurrentValue: 0, totalGainLoss: 0, totalDividendIncome: 0 },
  )

  return { ...totals, byContainer }
}

/**
 * Asset-type or sector allocation (AC9), computed from **active holdings
 * only**, across every container. Returns `[]` when there is nothing to
 * allocate (Edge Case: "zero holdings in a container, or zero containers at
 * all") rather than dividing by zero — the caller (Frontend Lead's
 * `allocation-chart.tsx`) renders its own empty state for that case, the
 * same "empty array is a valid response, not an error" convention
 * `getGrowthHistory` below also follows.
 *
 * Sector allocation's `null`-sector holdings (Crypto/Bond/Other/Retirement
 * Fund) are grouped into the `"Other / Not Applicable"` bucket rather than
 * excluded (AC9/Edge Cases), so percentages always sum to 100.
 */
export async function getAllocation(
  userId: string,
  options: { by: AllocationBy },
): Promise<AllocationEntry[]> {
  const holdings = await db.holding.findMany({
    where: {
      userId,
      closedAt: null,
      account: { type: { in: CONTAINER_ACCOUNT_TYPES } },
    },
    select: { assetType: true, sector: true, currentValue: true },
  })

  return computeAllocationEntries(
    holdings.map((holding) => ({
      assetType: holding.assetType,
      sector: holding.sector,
      currentValue: holding.currentValue.toNumber(),
    })),
    options.by,
  )
}

/**
 * Historical growth chart data (AC7): a single holding's own series if
 * `holdingId` is supplied, or the portfolio-level aggregate series otherwise
 * — see `buildHoldingGrowthSeries`/`buildPortfolioGrowthSeries` above for the
 * reconstruction logic. Returns `[]` for a `holdingId` that doesn't exist or
 * doesn't belong to the caller (fails safe, no data leak, same convention as
 * `getHoldingsForContainer`), and `[]` for "no containers/holdings at all"
 * at the portfolio level (Edge Cases).
 */
export async function getGrowthHistory(
  userId: string,
  options: GetGrowthHistoryOptions = {},
): Promise<GrowthPoint[]> {
  const { holdingId } = options

  if (holdingId) {
    const holding = await db.holding.findFirst({
      where: { id: holdingId, userId },
      select: {
        createdAt: true,
        currentValue: true,
        valueHistory: { select: { previousValue: true, newValue: true, recordedAt: true } },
      },
    })
    if (!holding) {
      return []
    }

    return buildHoldingGrowthSeries(holding.createdAt, holding.currentValue.toNumber(), [
      ...holding.valueHistory.map((entry) => ({
        previousValue: entry.previousValue.toNumber(),
        newValue: entry.newValue.toNumber(),
        recordedAt: entry.recordedAt,
      })),
    ])
  }

  const holdings = await db.holding.findMany({
    where: { userId, closedAt: null, account: { type: { in: CONTAINER_ACCOUNT_TYPES } } },
    select: {
      id: true,
      createdAt: true,
      currentValue: true,
      valueHistory: { select: { previousValue: true, newValue: true, recordedAt: true } },
    },
  })

  return buildPortfolioGrowthSeries(
    holdings.map((holding) => ({
      id: holding.id,
      createdAt: holding.createdAt,
      currentValue: holding.currentValue.toNumber(),
      history: holding.valueHistory.map((entry) => ({
        previousValue: entry.previousValue.toNumber(),
        newValue: entry.newValue.toNumber(),
        recordedAt: entry.recordedAt,
      })),
    })),
  )
}
