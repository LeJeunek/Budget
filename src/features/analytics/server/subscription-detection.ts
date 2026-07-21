import { normalizeMerchantName } from "@/lib/merchant-normalization"

import type { SubscriptionCandidate, SubscriptionInterval, SubscriptionStatus } from "../types"
import { formatDateKey } from "./period"

/**
 * PURE subscription-detection algorithm, per docs/product/analytics.md's
 * "Subscription Cost Detection — Heuristic Definition" section and
 * docs/architecture/folder-tree.md's Phase 3b file layout note. No Prisma,
 * no `lib/db.ts`/`lib/auth.ts` import — a plain, side-effect-free function of
 * its `transactions` argument, fully unit-testable with fixture arrays, the
 * same testability bar `features/debt/payoff-math.ts` established.
 *
 * `server/subscriptions.ts` is this function's only caller: it fetches a
 * user's expense `Transaction` rows, converts them into this file's input
 * shape, calls `detectSubscriptionCandidates`, then filters the result
 * against that user's `DismissedSubscriptionMerchant` rows — none of that
 * I/O belongs in this file.
 */

/** This file's input shape — deliberately narrower than a full Prisma
 * `Transaction` row (no `id`/`userId`/`categoryId`/etc.), so this function
 * can be called with plain fixture objects in tests with zero DB
 * dependency. `amount` is a positive, already-absolute-valued expense amount
 * (the caller negates `Transaction.amount`'s stored sign, same convention as
 * `expense-breakdown.ts`'s `getTopMerchants`) — this file never inspects
 * sign itself. */
export interface SubscriptionDetectionTransaction {
  merchant: string
  amount: number
  date: Date
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** analytics.md's own stated minimum: "Two matching transactions are
 * explicitly not enough to flag a subscription... three or more at a
 * consistent cadence is the minimum bar for genuine confidence." */
const MINIMUM_QUALIFYING_OCCURRENCES = 3

/** analytics.md's own example tolerance band ("within a small tolerance
 * band, e.g. ±10%"), applied to the ratio between a candidate charge and its
 * price segment's anchor amount. */
const AMOUNT_TOLERANCE_PERCENT = 0.1

/**
 * At most one price-change point is treated as "the same subscription
 * continuing at an updated price" (analytics.md's price-change handling). A
 * *second* would-be price-change point within what would otherwise be one
 * interval-consistent chain is this algorithm's signal that the amounts are
 * genuinely erratic (analytics.md's "one-off repeat purchase"/wildly
 * inconsistent-amount case), not a subscription with a single price
 * increase — see `detectRunFromSorted`'s JSDoc for exactly how this cap is
 * applied.
 */
const MAX_PRICE_SEGMENTS = 2

/** analytics.md's Status rule: "Active (a charge has landed within roughly
 * 1.5x the detected interval of the last one)". */
const ACTIVE_GRACE_INTERVAL_MULTIPLIER = 1.5

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Each supported cadence's day-gap tolerance window (min/max days between
 * consecutive charges for the gap to count as "this interval"), its
 * canonical day-length (used for Status's 1.5x grace window), and how many
 * times a year it recurs (used for `estimatedAnnualizedCost`).
 *
 * `MONTHLY`'s 28–34 day window is analytics.md's own explicit example
 * ("'monthly' tolerates 28–34 days between charges"). The other three
 * windows are this implementation's own judgment call (analytics.md gives no
 * other explicit numbers, only "a reasonable tolerance window per interval"
 * for weekly/quarterly/annually) — each sized proportionally to `MONTHLY`'s
 * ~±10% band around its canonical length, and chosen so the four windows
 * never overlap (a given gap can only ever classify as one interval).
 */
const INTERVAL_WINDOWS: Record<
  SubscriptionInterval,
  { minDays: number; maxDays: number; canonicalDays: number; occurrencesPerYear: number }
> = {
  WEEKLY: { minDays: 6, maxDays: 9, canonicalDays: 7, occurrencesPerYear: 52 },
  MONTHLY: { minDays: 28, maxDays: 34, canonicalDays: 30, occurrencesPerYear: 12 },
  QUARTERLY: { minDays: 85, maxDays: 97, canonicalDays: 91, occurrencesPerYear: 4 },
  ANNUALLY: { minDays: 350, maxDays: 380, canonicalDays: 365, occurrencesPerYear: 1 },
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY)
}

/** Classifies a gap (in days) into one of the four supported intervals, or
 * `null` if it falls in none of their tolerance windows — a `null` result is
 * this algorithm's "the cadence broke here" signal. */
function classifyInterval(gapDays: number): SubscriptionInterval | null {
  for (const interval of Object.keys(INTERVAL_WINDOWS) as SubscriptionInterval[]) {
    const window = INTERVAL_WINDOWS[interval]
    if (gapDays >= window.minDays && gapDays <= window.maxDays) {
      return interval
    }
  }
  return null
}

/** `true` when `amount` is within `AMOUNT_TOLERANCE_PERCENT` of `anchor` —
 * the "roughly consistent amount" check for a single price segment. Guards
 * `anchor === 0` defensively (a $0 expense transaction should not occur in
 * practice, but this avoids a division by zero rather than trusting that
 * invariant silently). */
function withinAmountTolerance(amount: number, anchor: number): boolean {
  if (anchor === 0) {
    return amount === 0
  }
  return Math.abs(amount - anchor) / anchor <= AMOUNT_TOLERANCE_PERCENT
}

/** Rounds to whole cents, same convention/rationale as
 * `features/debt/payoff-math.ts`'s `roundCurrency` — every intermediate sum/
 * average below is a plain JS float. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// One merchant group's run detection
// ---------------------------------------------------------------------------

interface DetectedRun {
  interval: SubscriptionInterval
  /** Every transaction included in the detected run, chronological
   * (ascending by date). */
  chronological: SubscriptionDetectionTransaction[]
  /** The average amount of the *most recent* price segment — see the
   * module JSDoc's price-change handling note. */
  mostRecentPriceSegmentAverage: number
}

/**
 * Detects, for one merchant's transactions (already sorted ascending by
 * date), the longest *trailing* interval-consistent run ending at the most
 * recent transaction — analytics.md's detection heuristic applied to a
 * single merchant group.
 *
 * **Why scan backward from the most recent transaction, not forward from the
 * oldest:** analytics.md's Status classification (Active vs. Possibly
 * Cancelled) and every displayed field (`mostRecentChargeDate`,
 * `averageAmount` as "the most recent price segment") are all anchored to
 * "what is this subscription doing *now*" — a merchant with an old,
 * long-since-stopped recurring pattern followed by an unrelated gap and then
 * a handful of coincidentally-timed recent charges should be evaluated on
 * that recent behavior, not have an ancient dormant pattern extend its
 * `mostRecentChargeDate` backward in time. Scanning backward and stopping at
 * the first broken link naturally produces exactly that "most recent
 * ongoing pattern" run, with zero extra bookkeeping to track candidate runs
 * separately.
 *
 * **Interval consistency**: once the first (most recent) gap establishes an
 * interval bucket, every earlier gap must classify into that *same* bucket
 * or the run stops there — analytics.md's "roughly consistent interval"
 * applied across the whole run, not just pairwise.
 *
 * **Amount consistency and price-change handling**: transactions are
 * grouped into "price segments" as the scan proceeds — a segment is a
 * maximal run of transactions all within tolerance of that segment's
 * *anchor* (its first, i.e. most recent, member). The first transaction
 * that doesn't fit the active segment starts a second segment (representing
 * a single price change, most recent price -> its predecessor price,
 * analytics.md's explicit example). If a transaction fits neither the first
 * nor the second segment, extending the run would require a *third* price
 * segment — this is exactly analytics.md's "wildly inconsistent amount"
 * case (a coincidental-cadence, unrelated-purchase pattern, not a genuine
 * subscription with one price increase), so the run stops there instead of
 * ever opening a third segment.
 *
 * Returns `null` when the resulting run is shorter than
 * `MINIMUM_QUALIFYING_OCCURRENCES`, or when there aren't even enough
 * transactions to reach that minimum in the first place (the `length < 3`
 * guard up front, matching analytics.md's own "two matches is not enough"
 * edge case exactly — a two-transaction group never even enters the
 * scanning loop).
 */
function detectRunFromSorted(
  sorted: SubscriptionDetectionTransaction[],
): DetectedRun | null {
  if (sorted.length < MINIMUM_QUALIFYING_OCCURRENCES) {
    return null
  }

  let establishedInterval: SubscriptionInterval | null = null
  // Indices into `sorted`, accumulated most-recent-first as the scan walks
  // backward; re-sorted to chronological order only once the run is final.
  const includedIndices: number[] = [sorted.length - 1]
  // Each inner array holds indices belonging to one price segment, in the
  // order segments were opened (index 0 = the most recent/current price).
  const priceSegments: number[][] = [[sorted.length - 1]]

  for (let i = sorted.length - 2; i >= 0; i--) {
    const gapDays = daysBetween(sorted[i].date, sorted[i + 1].date)
    const bucket = classifyInterval(gapDays)

    if (!bucket) {
      break
    }
    if (establishedInterval === null) {
      establishedInterval = bucket
    } else if (bucket !== establishedInterval) {
      break
    }

    const activeSegment = priceSegments[priceSegments.length - 1]
    const anchorAmount = sorted[activeSegment[0]].amount

    if (withinAmountTolerance(sorted[i].amount, anchorAmount)) {
      activeSegment.push(i)
      includedIndices.push(i)
      continue
    }

    if (priceSegments.length >= MAX_PRICE_SEGMENTS) {
      break
    }

    priceSegments.push([i])
    includedIndices.push(i)
  }

  if (!establishedInterval || includedIndices.length < MINIMUM_QUALIFYING_OCCURRENCES) {
    return null
  }

  const chronological = [...includedIndices]
    .sort((a, b) => a - b)
    .map((index) => sorted[index])

  const mostRecentSegment = priceSegments[0]
  const mostRecentPriceSegmentAverage =
    mostRecentSegment.reduce((sum, index) => sum + sorted[index].amount, 0) /
    mostRecentSegment.length

  return { interval: establishedInterval, chronological, mostRecentPriceSegmentAverage }
}

/**
 * Active vs. Possibly Cancelled (analytics.md's Status rule): Active when
 * `now` is within `ACTIVE_GRACE_INTERVAL_MULTIPLIER`x the detected
 * interval's canonical length of the last charge; Possibly Cancelled once
 * that grace window has passed with no matching charge since.
 */
function resolveStatus(
  mostRecentChargeDate: Date,
  interval: SubscriptionInterval,
  now: Date,
): SubscriptionStatus {
  const graceDays = INTERVAL_WINDOWS[interval].canonicalDays * ACTIVE_GRACE_INTERVAL_MULTIPLIER
  const daysSinceLastCharge = daysBetween(mostRecentChargeDate, now)
  return daysSinceLastCharge <= graceDays ? "ACTIVE" : "POSSIBLY_CANCELLED"
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Groups `transactions` by normalized merchant name and runs
 * `detectRunFromSorted` against each group, returning one
 * `SubscriptionCandidate` per merchant with a qualifying run.
 *
 * `now` is injectable (defaults to `new Date()`) purely for deterministic
 * unit testing of `resolveStatus`'s Active/Possibly Cancelled boundary,
 * matching `features/debt/payoff-math.ts`'s `computeAmortization(debt, now)`
 * convention exactly.
 *
 * Results are sorted by `estimatedAnnualizedCost` descending (largest
 * apparent recurring cost first) — a reasonable default ranking for a list
 * whose entire value proposition (per analytics.md) is surfacing what
 * subscriptions are actually costing the user.
 */
export function detectSubscriptionCandidates(
  transactions: SubscriptionDetectionTransaction[],
  now: Date = new Date(),
): SubscriptionCandidate[] {
  interface MerchantGroup {
    displayName: string
    displayDate: Date
    transactions: SubscriptionDetectionTransaction[]
  }

  const groupsByKey = new Map<string, MerchantGroup>()

  for (const txn of transactions) {
    const key = normalizeMerchantName(txn.merchant)
    const existing = groupsByKey.get(key)

    if (!existing) {
      groupsByKey.set(key, { displayName: txn.merchant, displayDate: txn.date, transactions: [txn] })
      continue
    }

    existing.transactions.push(txn)
    if (txn.date >= existing.displayDate) {
      existing.displayName = txn.merchant
      existing.displayDate = txn.date
    }
  }

  const candidates: SubscriptionCandidate[] = []

  for (const [normalizedMerchantName, group] of groupsByKey) {
    const sorted = [...group.transactions].sort((a, b) => a.date.getTime() - b.date.getTime())
    const run = detectRunFromSorted(sorted)
    if (!run) {
      continue
    }

    const firstDetectedDate = run.chronological[0].date
    const mostRecentChargeDate = run.chronological[run.chronological.length - 1].date
    const averageAmount = roundCurrency(run.mostRecentPriceSegmentAverage)
    const estimatedAnnualizedCost = roundCurrency(
      run.mostRecentPriceSegmentAverage * INTERVAL_WINDOWS[run.interval].occurrencesPerYear,
    )

    candidates.push({
      normalizedMerchantName,
      displayName: group.displayName,
      averageAmount,
      detectedInterval: run.interval,
      firstDetectedDate: formatDateKey(firstDetectedDate),
      mostRecentChargeDate: formatDateKey(mostRecentChargeDate),
      estimatedAnnualizedCost,
      status: resolveStatus(mostRecentChargeDate, run.interval, now),
    })
  }

  return candidates.sort((a, b) => b.estimatedAnnualizedCost - a.estimatedAnnualizedCost)
}
