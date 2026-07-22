import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"

import type { DismissedSubscriptionMerchantEntry, SubscriptionCandidate } from "../types"
import { detectSubscriptionCandidates } from "./subscription-detection"

// Prisma-touching orchestration for Subscription Cost Detection
// (analytics.md's own section, and the "Subscription Cost Detection" row in
// docs/architecture/api-contracts.md's Analytics table). This file owns:
//   1. Fetching the caller's expense transaction history.
//   2. Running it through `subscription-detection.ts`'s pure algorithm.
//   3. Filtering out anything the user has already dismissed
//      (`DismissedSubscriptionMerchant`).
// Kept as its own file, separate from `subscription-detection.ts`, per
// folder-tree.md's explicit split ("PURE: the merchant-grouping/interval/
// amount-tolerance detection algorithm. No Prisma." vs. "Prisma-touching
// orchestration + dismissal filtering").
//
// Always all-time (analytics.md's Subscription Cost Detection row in
// api-contracts.md: "ignores the shared period control entirely — needs
// full history for first/most-recent detection") — neither function below
// takes a `period` argument.

/** The set of normalized merchant names this user has already dismissed as
 * "not a subscription" (analytics.md's "User override" — a durable, per-user
 * exclusion rule, per `DismissedSubscriptionMerchant`'s own schema comment).
 */
async function getDismissedMerchantNames(userId: string): Promise<Set<string>> {
  const rows = await db.dismissedSubscriptionMerchant.findMany({
    where: { userId },
    select: { normalizedMerchantName: true },
  })
  return new Set(rows.map((row) => row.normalizedMerchantName))
}

/**
 * Subscription Cost Detection's candidate list (analytics.md's own section,
 * AC16): the caller's full expense-transaction history, run through
 * `detectSubscriptionCandidates`, with any dismissed merchant excluded from
 * the result.
 *
 * Fetches only `merchant`/`amount`/`date` (never a full transaction row),
 * the same bounded, column-projected `findMany` shape
 * Architecture.md's Risk #11 sanctions for `expense-breakdown.ts`'s
 * `getTopMerchants` — this is the same "reduce a user's own, realistically
 * bounded transaction history in application code" pattern, just with a
 * pattern-detection reduction instead of a simple sum/rank.
 */
export async function getSubscriptionCandidates(userId: string): Promise<SubscriptionCandidate[]> {
  const [transactions, dismissedMerchantNames] = await Promise.all([
    db.transaction.findMany({
      where: { userId, amount: { lt: 0 }, ...EXCLUDE_SPLIT_PARENTS },
      select: { merchant: true, amount: true, date: true },
    }),
    getDismissedMerchantNames(userId),
  ])

  const detectionInput = transactions.map((txn) => ({
    merchant: txn.merchant,
    // Expenses are stored as negative amounts; negate to the positive
    // amount `subscription-detection.ts` expects, same convention as
    // `expense-breakdown.ts`'s `getTopMerchants`.
    amount: -(txn.amount.toNumber()) || 0,
    date: txn.date,
  }))

  const candidates = detectSubscriptionCandidates(detectionInput)

  return candidates.filter(
    (candidate) => !dismissedMerchantNames.has(candidate.normalizedMerchantName),
  )
}

/**
 * Pure re-shaping of an already-computed `getSubscriptionCandidates` result
 * into the running-total shape (analytics.md's "a running total of
 * estimated combined annualized subscription cost across all currently
 * Active detected subscriptions") — the actual math
 * `getActiveSubscriptionAnnualizedTotal` below performs, extracted so a
 * caller that has *already* fetched `getSubscriptionCandidates` for the same
 * `userId` (e.g. `app/(dashboard)/analytics/page.tsx`) can derive the total
 * from that one result directly, instead of triggering a second, fully
 * redundant `getSubscriptionCandidates` call (and therefore a second full
 * expense-transaction fetch plus a second run of the detection algorithm)
 * purely to throw its own copy away. Performance follow-up from the Phase 3b
 * Performance Engineer review: `getActiveSubscriptionAnnualizedTotal` and the
 * page were each independently computing `getSubscriptionCandidates`'s
 * result for the exact same `userId`.
 *
 * No DB access — plain in-memory aggregation only, so this can be called as
 * many times as needed with zero additional query cost.
 */
export function deriveActiveSubscriptionAnnualizedTotal(
  candidates: SubscriptionCandidate[],
): { total: number } {
  const total = candidates
    .filter((candidate) => candidate.status === "ACTIVE")
    .reduce((sum, candidate) => sum + candidate.estimatedAnnualizedCost, 0)

  return { total }
}

/**
 * Subscription Cost Detection's running total (analytics.md's own section:
 * "a running total of estimated combined annualized subscription cost across
 * all currently Active detected subscriptions"). Deliberately reuses
 * `getSubscriptionCandidates` rather than re-running detection independently
 * — guarantees this total can never silently disagree with the individual
 * list it's summing (the same "one computation, multiple derived views"
 * discipline `income-analytics.ts`'s `getIncomeSources` follows for
 * `getIncomeGrowth`).
 *
 * Standalone entry point for any caller that has *not* already fetched
 * `getSubscriptionCandidates` itself — it still computes
 * `getSubscriptionCandidates` internally exactly once. A caller that already
 * has that result in hand (like the Analytics page, which renders the
 * Subscriptions list from the same data) should call
 * `deriveActiveSubscriptionAnnualizedTotal` directly instead, to avoid the
 * redundant fetch this function's own body would otherwise trigger.
 */
export async function getActiveSubscriptionAnnualizedTotal(
  userId: string,
): Promise<{ total: number }> {
  const candidates = await getSubscriptionCandidates(userId)
  return deriveActiveSubscriptionAnnualizedTotal(candidates)
}

/**
 * Lists the caller's standing `DismissedSubscriptionMerchant` exclusions
 * (bugfix: docs/testing/bug-reports/
 * subscription-dismissal-normalized-name-collision.md). A dismissal
 * previously had no reversibility surface at all — once dismissed, a
 * normalized merchant name was excluded from every future
 * `getSubscriptionCandidates` call forever, with nothing in the product
 * surfacing that exclusion or letting the user undo it. This does not
 * change detection or dismissal semantics (the normalized-name collision
 * risk the bug report describes is an accepted, documented limitation, not
 * what this fixes) — it only makes the *existing* exclusion list visible so
 * `actions.ts`'s `undismissSubscriptionMerchant` has something for a caller
 * to act on.
 *
 * Ordered most-recently-dismissed first, the natural order for a "review
 * what you've hidden" list.
 */
export async function getDismissedSubscriptionMerchants(
  userId: string,
): Promise<DismissedSubscriptionMerchantEntry[]> {
  const rows = await db.dismissedSubscriptionMerchant.findMany({
    where: { userId },
    select: { normalizedMerchantName: true, dismissedAt: true },
    orderBy: { dismissedAt: "desc" },
  })

  return rows
}
