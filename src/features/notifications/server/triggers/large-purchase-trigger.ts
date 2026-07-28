import { db } from "@/lib/db"
import { EXCLUDE_SPLIT_PARENTS } from "@/features/transactions/server/service"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"
import { getNotificationThresholdSettings } from "../preferences"

/**
 * Recency window (docs/product/notifications-v2.md's Large Purchase Edge
 * Cases: "fires only for transactions dated within a recent window ... a
 * bulk import of old historical transactions does not flood the user").
 * **Proposed default: 7 days** — flagged in
 * docs/architecture/phase-4b-technical-design.md §6 as "an architecture-pass
 * detail," a Backend Engineer implementation default, not a fixed product
 * mandate (mirrors `service.ts`'s original `DUE_SOON_WINDOW_DAYS` framing for
 * the identical kind of non-binding numeric default).
 */
const RECENCY_WINDOW_DAYS = 7

/**
 * `LARGE_PURCHASE` trigger (notifications-v2.md's Large Purchase trigger,
 * phase-4b-technical-design.md §6).
 *
 * **Deterministic only, per binding constraint 1** — a plain `Transaction.amount`
 * comparison against `NotificationThresholdSettings.largePurchaseThreshold`.
 * No import from `features/analytics/server/insights.ts` (Spending Insights)
 * or any `lib/ai/` file anywhere in this file — verified by construction, not
 * convention, per notifications-v2.md's Definition of Done and Risk #19/#20.
 *
 * **Scope** (AC1): expense transactions (`amount < 0`) and split line items,
 * using each line item's own amount, via `EXCLUDE_SPLIT_PARENTS` — the exact
 * same predicate Transaction Auto-Categorization's own suggestion logic
 * already uses for the identical split-parent exclusion (`ai-features.md`
 * Feature 1 AC8) — never a split-parent row, whose `amount` is purely
 * informational (`transactions.md` AC14).
 *
 * **Recency window** (Edge Cases): filtered on `Transaction.date`, never
 * `createdAt` — a bulk CSV import of old, historically-dated transactions is
 * naturally excluded regardless of when it's imported, as a direct
 * consequence of this filter rather than a special case layered on top of
 * it. This also means an edit to a transaction dated OUTSIDE the current
 * window never fires this trigger even if the edit newly crosses the
 * threshold (AC5's "re-evaluated on edit" is scoped by the same recency
 * rule as everything else here — there is no separate "edited recently"
 * carve-out, per the design doc's own reasoning for why `date` alone is
 * sufficient).
 *
 * **Dedup** (AC2): entirely the `Notification` `@@unique([transactionId, type])`
 * constraint via `createNotificationIfNew` — no separate latch column exists
 * on `Transaction` (schema.prisma §7.6's summary table is explicit: "No new
 * latch field" for this trigger). A transaction that already has a
 * `LARGE_PURCHASE` notification, or one later edited back below the
 * threshold, is left exactly as-is (AC6/AC5's "the earlier notification is
 * not retroactively deleted, no further notification fires").
 */
export async function evaluateLargePurchaseTriggers(userId: string): Promise<Notification[]> {
  const [{ largePurchaseThreshold }, windowStart] = await Promise.all([
    getNotificationThresholdSettings(userId),
    Promise.resolve(new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
  ])

  const candidates = await db.transaction.findMany({
    where: {
      userId,
      amount: { lt: 0 },
      date: { gte: windowStart },
      ...EXCLUDE_SPLIT_PARENTS,
    },
    select: { id: true, amount: true },
  })

  const qualifying = candidates.filter(
    (transaction) => Math.abs(transaction.amount.toNumber()) >= largePurchaseThreshold,
  )

  const created = await Promise.all(
    qualifying.map((transaction) =>
      createNotificationIfNew({
        userId,
        type: "LARGE_PURCHASE",
        transactionId: transaction.id,
      }),
    ),
  )

  return created.filter((notification): notification is Notification => notification !== null)
}
