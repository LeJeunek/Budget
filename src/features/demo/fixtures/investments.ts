import type {
  AllocationBy,
  AllocationEntry,
  DividendEntry,
  GrowthPoint,
  HoldingDetail,
  HoldingValueHistoryEntry,
  PortfolioContainerBreakdown,
  PortfolioOverview,
  Sector,
} from "@/features/investments/types"

import { DEMO_ACCOUNT_IDS, DEMO_HOLDING_IDS, DEMO_USER_ID } from "./ids"
import { relativeDate } from "./relative-date"

/**
 * The demo household's investment portfolio — five holdings split across the
 * two Investments containers (`DEMO_ACCOUNT_IDS.brokerage`/`retirement401k`),
 * hand-authored with a deliberate mix of gains and losses (public-demo.md
 * Capability 2 AC4: "a mix of gain and loss ... so gain/loss coloring and
 * allocation both render meaningfully rather than uniformly") and several
 * months of value-update/dividend history so `GrowthChart` has an actual
 * trend to plot, not a single flat point.
 *
 * `gainLossAmount`/`gainLossPercent` are computed with the exact formula
 * `features/investments/server/service.ts`'s `toHolding()` uses
 * (`gainLossAmount = currentValue - costBasis`; `gainLossPercent = null` only
 * when `costBasis === 0`) — see `buildHolding` below.
 *
 * File-size note: this file runs ~350 lines, over this codebase's ~300-line
 * guideline. Justified rather than split further: the five holdings'
 * hand-authored value-history/dividend data is the bulk of it (an atomic
 * fixture entity file's whole job, per public-demo-technical-design.md §2.1
 * item 1), and `computeDemoPortfolioOverview`/`computeDemoAllocation`/
 * `computeDemoGrowthHistory` below are small, single-responsibility,
 * Investments-domain-specific presentational aggregations with no
 * cross-domain dependency of their own (unlike Net Worth/Monthly Summary,
 * which do need a dedicated `derive/*.ts` file) — splitting them into a
 * second file would separate them from the exact data they're trivially
 * derived from for no real readability gain.
 */

interface ValueUpdate {
  daysAgo: number
  previousValue: number
  newValue: number
}

interface DividendReceipt {
  daysAgo: number
  amount: number
}

function buildValueHistory(
  holdingId: string,
  updates: ValueUpdate[],
  now: Date,
): HoldingValueHistoryEntry[] {
  return updates.map((update, index) => ({
    id: `${holdingId}-value-${index}`,
    holdingId,
    userId: DEMO_USER_ID,
    previousValue: update.previousValue,
    newValue: update.newValue,
    recordedAt: relativeDate(update.daysAgo, now),
  }))
}

function buildDividends(
  holdingId: string,
  receipts: DividendReceipt[],
  now: Date,
): DividendEntry[] {
  return receipts.map((receipt, index) => ({
    id: `${holdingId}-dividend-${index}`,
    holdingId,
    userId: DEMO_USER_ID,
    amount: receipt.amount,
    date: relativeDate(receipt.daysAgo, now),
    createdAt: relativeDate(receipt.daysAgo, now),
  }))
}

function buildHolding(params: {
  id: string
  accountId: string
  name: string
  assetType: HoldingDetail["assetType"]
  sector: Sector | null
  costBasis: number
  currentValue: number
  openedDaysAgo: number
  valueUpdates: ValueUpdate[]
  dividends?: DividendReceipt[]
  now: Date
}): HoldingDetail {
  const {
    id,
    accountId,
    name,
    assetType,
    sector,
    costBasis,
    currentValue,
    openedDaysAgo,
    valueUpdates,
    dividends = [],
    now,
  } = params

  const gainLossAmount = currentValue - costBasis
  const gainLossPercent = costBasis === 0 ? null : (gainLossAmount / costBasis) * 100

  return {
    id,
    userId: DEMO_USER_ID,
    accountId,
    name,
    assetType,
    sector,
    costBasis,
    currentValue,
    gainLossAmount,
    gainLossPercent,
    closedAt: null,
    createdAt: relativeDate(openedDaysAgo, now),
    updatedAt: relativeDate(valueUpdates[valueUpdates.length - 1]?.daysAgo ?? openedDaysAgo, now),
    valueHistory: buildValueHistory(id, valueUpdates, now),
    dividends: buildDividends(id, dividends, now),
  }
}

/** Builds all five demo holdings, resolved against a single shared `now`. */
export function buildDemoHoldings(now: Date): HoldingDetail[] {
  return [
    buildHolding({
      id: DEMO_HOLDING_IDS.totalMarketEtf,
      accountId: DEMO_ACCOUNT_IDS.brokerage,
      name: "Vanguard Total Stock Market ETF",
      assetType: "ETF",
      sector: null,
      costBasis: 8000,
      currentValue: 9450,
      openedDaysAgo: 400,
      valueUpdates: [
        { daysAgo: 165, previousValue: 8000, newValue: 8300 },
        { daysAgo: 135, previousValue: 8300, newValue: 8600 },
        { daysAgo: 105, previousValue: 8600, newValue: 8150 },
        { daysAgo: 75, previousValue: 8150, newValue: 8900 },
        { daysAgo: 45, previousValue: 8900, newValue: 9200 },
        { daysAgo: 15, previousValue: 9200, newValue: 9450 },
      ],
      dividends: [
        { daysAgo: 160, amount: 58.2 },
        { daysAgo: 70, amount: 63.75 },
      ],
      now,
    }),
    buildHolding({
      id: DEMO_HOLDING_IDS.nexaTechStock,
      accountId: DEMO_ACCOUNT_IDS.brokerage,
      name: "NexaTech Inc.",
      assetType: "STOCK",
      sector: "TECHNOLOGY",
      costBasis: 3000,
      currentValue: 2150,
      openedDaysAgo: 380,
      valueUpdates: [
        { daysAgo: 165, previousValue: 3000, newValue: 2850 },
        { daysAgo: 135, previousValue: 2850, newValue: 2600 },
        { daysAgo: 105, previousValue: 2600, newValue: 2300 },
        { daysAgo: 75, previousValue: 2300, newValue: 2450 },
        { daysAgo: 45, previousValue: 2450, newValue: 2100 },
        { daysAgo: 15, previousValue: 2100, newValue: 2150 },
      ],
      now,
    }),
    buildHolding({
      id: DEMO_HOLDING_IDS.meridianReit,
      accountId: DEMO_ACCOUNT_IDS.brokerage,
      name: "Meridian REIT Trust",
      assetType: "STOCK",
      sector: "REAL_ESTATE",
      costBasis: 2500,
      currentValue: 2890,
      openedDaysAgo: 300,
      valueUpdates: [
        { daysAgo: 165, previousValue: 2500, newValue: 2600 },
        { daysAgo: 120, previousValue: 2600, newValue: 2550 },
        { daysAgo: 75, previousValue: 2550, newValue: 2750 },
        { daysAgo: 30, previousValue: 2750, newValue: 2890 },
      ],
      dividends: [
        { daysAgo: 120, amount: 39.5 },
        { daysAgo: 20, amount: 41.8 },
      ],
      now,
    }),
    buildHolding({
      id: DEMO_HOLDING_IDS.targetRetirement2050,
      accountId: DEMO_ACCOUNT_IDS.retirement401k,
      name: "Target Retirement 2050 Fund",
      assetType: "RETIREMENT_FUND",
      sector: null,
      costBasis: 15000,
      currentValue: 17800,
      openedDaysAgo: 900,
      valueUpdates: [
        { daysAgo: 165, previousValue: 15000, newValue: 15600 },
        { daysAgo: 135, previousValue: 15600, newValue: 16200 },
        { daysAgo: 105, previousValue: 16200, newValue: 16000 },
        { daysAgo: 75, previousValue: 16000, newValue: 16900 },
        { daysAgo: 45, previousValue: 16900, newValue: 17400 },
        { daysAgo: 15, previousValue: 17400, newValue: 17800 },
      ],
      dividends: [
        { daysAgo: 100, amount: 144.6 },
        { daysAgo: 10, amount: 149.9 },
      ],
      now,
    }),
    buildHolding({
      id: DEMO_HOLDING_IDS.globalBondIndex,
      accountId: DEMO_ACCOUNT_IDS.retirement401k,
      name: "Global Bond Index Fund",
      assetType: "BOND",
      sector: null,
      costBasis: 6200,
      currentValue: 5890,
      openedDaysAgo: 900,
      valueUpdates: [
        { daysAgo: 150, previousValue: 6200, newValue: 6100 },
        { daysAgo: 100, previousValue: 6100, newValue: 5950 },
        { daysAgo: 50, previousValue: 5950, newValue: 5800 },
        { daysAgo: 10, previousValue: 5800, newValue: 5890 },
      ],
      dividends: [{ daysAgo: 90, amount: 54.3 }],
      now,
    }),
  ]
}

/** The sum of a container Account's active holdings' `currentValue` — the
 * exact figure `Account.balance`'s Phase 3a schema comment documents as that
 * derived-balance meaning once a container has active holdings ("the sum of
 * those holdings' currentValue"), so `accounts.ts` uses this instead of a
 * separately hand-typed literal, keeping the two fixture files from ever
 * silently disagreeing. */
export function sumActiveHoldingsValue(holdings: HoldingDetail[], accountId: string): number {
  return holdings
    .filter((holding) => holding.accountId === accountId && holding.closedAt === null)
    .reduce((sum, holding) => sum + holding.currentValue, 0)
}

/**
 * Mirrors `features/investments/server/service.ts`'s `getPortfolioOverview`
 * formula exactly (per `investments/types.ts`'s `PortfolioOverview`/
 * `PortfolioContainerBreakdown` JSDoc): `currentValue`/`gainLoss` are summed
 * over active holdings only; `dividendIncome` includes Closed holdings too
 * (none of the demo's holdings are Closed, so this distinction is inert here,
 * but the formula is kept faithful to the real read function regardless).
 */
export function computeDemoPortfolioOverview(
  holdings: HoldingDetail[],
  accounts: { id: string; name: string }[],
): PortfolioOverview {
  const byContainer: PortfolioContainerBreakdown[] = accounts.map((account) => {
    const containerHoldings = holdings.filter((h) => h.accountId === account.id)
    const activeHoldings = containerHoldings.filter((h) => h.closedAt === null)

    return {
      accountId: account.id,
      accountName: account.name,
      currentValue: activeHoldings.reduce((sum, h) => sum + h.currentValue, 0),
      gainLoss: activeHoldings.reduce((sum, h) => sum + h.gainLossAmount, 0),
      dividendIncome: containerHoldings.reduce(
        (sum, h) => sum + h.dividends.reduce((dSum, d) => dSum + d.amount, 0),
        0,
      ),
    }
  })

  return {
    totalCurrentValue: byContainer.reduce((sum, c) => sum + c.currentValue, 0),
    totalGainLoss: byContainer.reduce((sum, c) => sum + c.gainLoss, 0),
    totalDividendIncome: byContainer.reduce((sum, c) => sum + c.dividendIncome, 0),
    byContainer,
  }
}

const ASSET_TYPE_LABELS: Record<HoldingDetail["assetType"], string> = {
  STOCK: "Stock",
  ETF: "ETF",
  MUTUAL_FUND: "Mutual Fund",
  BOND: "Bond",
  CRYPTO: "Crypto",
  RETIREMENT_FUND: "Retirement Fund",
  OTHER: "Other",
}

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

const OTHER_NOT_APPLICABLE_LABEL = "Other / Not Applicable"

/**
 * Mirrors `features/investments/server/service.ts`'s `getAllocation`
 * formula: active holdings only, grouped by asset type or sector, with a
 * null-sector holding folded into the `"Other / Not Applicable"` bucket
 * (AC9/Edge Cases) so percentages always sum to 100.
 */
export function computeDemoAllocation(
  holdings: HoldingDetail[],
  by: AllocationBy,
): AllocationEntry[] {
  const activeHoldings = holdings.filter((h) => h.closedAt === null)
  const totals = new Map<string, number>()

  for (const holding of activeHoldings) {
    const label =
      by === "assetType"
        ? ASSET_TYPE_LABELS[holding.assetType]
        : (holding.sector ? SECTOR_LABELS[holding.sector] : OTHER_NOT_APPLICABLE_LABEL)
    totals.set(label, (totals.get(label) ?? 0) + holding.currentValue)
  }

  const grandTotal = [...totals.values()].reduce((sum, v) => sum + v, 0)

  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      percent: grandTotal === 0 ? 0 : (value / grandTotal) * 100,
    }))
    .sort((a, b) => b.value - a.value)
}

/** One holding's growth series (`GrowthChart`'s data source): an initial
 * point at `costBasis`/`createdAt`, then one point per logged value-history
 * update — mirrors `features/investments/server/service.ts`'s
 * `getGrowthHistory(userId, { holdingId })` shape (`GrowthPoint[]`, oldest
 * first). */
export function computeDemoGrowthHistory(holding: HoldingDetail): GrowthPoint[] {
  const points: GrowthPoint[] = [
    { date: toDateKey(holding.createdAt), value: holding.costBasis },
  ]
  for (const entry of holding.valueHistory) {
    points.push({ date: toDateKey(entry.recordedAt), value: entry.newValue })
  }
  return points
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
