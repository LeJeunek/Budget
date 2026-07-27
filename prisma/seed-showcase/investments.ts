// Investments: three Holdings in the Brokerage container (a broad-market
// ETF plus two individual stocks — one up, one down, a realistic mix rather
// than uniform growth), several HoldingValueHistoryEntry rows spanning the
// same six months (for a believable value-over-time chart), and two logged
// DividendEntry rows against the ETF. The three Holdings' currentValue sum
// must equal config.ts's BROKERAGE_BALANCE (5750 + 2450 + 1100 = 9300) — see
// that file's own comment on why this figure is centralized.
import { AssetType, Sector } from "@prisma/client"
import { prisma } from "./client"
import { utcDate } from "./config"

export async function createInvestments(userId: string, brokerageAccountId: string): Promise<void> {
  const etf = await prisma.holding.create({
    data: {
      userId,
      accountId: brokerageAccountId,
      name: "Vanguard Total Stock Market ETF (VTI)",
      assetType: AssetType.ETF,
      // No single sector fits a broad-market fund — Sector.OTHER, the same
      // choice prisma/seed.ts's own "Demo Total Market ETF" precedent made.
      sector: Sector.OTHER,
      costBasis: 5000.0,
      currentValue: 5750.0,
      createdAt: utcDate(2026, 1, 3),
    },
  })

  const aapl = await prisma.holding.create({
    data: {
      userId,
      accountId: brokerageAccountId,
      name: "Apple Inc. (AAPL)",
      assetType: AssetType.STOCK,
      sector: Sector.TECHNOLOGY,
      costBasis: 2000.0,
      currentValue: 2450.0,
      createdAt: utcDate(2026, 1, 10),
    },
  })

  const nee = await prisma.holding.create({
    data: {
      userId,
      accountId: brokerageAccountId,
      name: "NextEra Energy, Inc. (NEE)",
      assetType: AssetType.STOCK,
      sector: Sector.ENERGY,
      costBasis: 1200.0,
      // A modest paper loss — realistic portfolio texture (not everything
      // in a real account is a winner), and this feature's own "gain or
      // loss" surface has nothing to show if every holding only ever goes up.
      currentValue: 1100.0,
      createdAt: utcDate(2026, 3, 2),
    },
  })

  // ETF: a full monthly chain, Feb -> Jul, ending exactly at its
  // currentValue above — the primary holding driving the portfolio chart.
  const etfHistory: Array<[number, number, Date]> = [
    [5000.0, 5150.0, utcDate(2026, 1, 28)],
    [5150.0, 5300.0, utcDate(2026, 2, 28)],
    [5300.0, 5500.0, utcDate(2026, 3, 28)],
    [5500.0, 5400.0, utcDate(2026, 4, 28)], // a real dip, not a straight line up
    [5400.0, 5600.0, utcDate(2026, 5, 28)],
    [5600.0, 5750.0, utcDate(2026, 6, 27)],
  ]

  const aaplHistory: Array<[number, number, Date]> = [
    [2000.0, 2150.0, utcDate(2026, 2, 28)],
    [2150.0, 2300.0, utcDate(2026, 4, 28)],
    [2300.0, 2450.0, utcDate(2026, 6, 27)],
  ]

  const neeHistory: Array<[number, number, Date]> = [
    [1200.0, 1150.0, utcDate(2026, 3, 28)],
    [1150.0, 1100.0, utcDate(2026, 5, 28)],
  ]

  await prisma.holdingValueHistoryEntry.createMany({
    data: [
      ...etfHistory.map(([previousValue, newValue, recordedAt]) => ({
        userId,
        holdingId: etf.id,
        previousValue,
        newValue,
        recordedAt,
      })),
      ...aaplHistory.map(([previousValue, newValue, recordedAt]) => ({
        userId,
        holdingId: aapl.id,
        previousValue,
        newValue,
        recordedAt,
      })),
      ...neeHistory.map(([previousValue, newValue, recordedAt]) => ({
        userId,
        holdingId: nee.id,
        previousValue,
        newValue,
        recordedAt,
      })),
    ],
  })

  await prisma.dividendEntry.createMany({
    data: [
      { userId, holdingId: etf.id, amount: 45.2, date: utcDate(2026, 3, 15) },
      { userId, holdingId: etf.id, amount: 48.1, date: utcDate(2026, 6, 15) },
    ],
  })
}
