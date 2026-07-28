import type { AccountType } from "@prisma/client"

import { db } from "@/lib/db"
import { getAccounts } from "@/features/accounts/server/service"
import type { Account } from "@/features/accounts/types"

import type { Notification } from "../../types"
import { createNotificationIfNew } from "../notification-mapper"
import { getNotificationThresholdSettings } from "../preferences"

/** Eligible account types (notifications-v2.md's Low Balance trigger AC1):
 * Credit Card is excluded (its balance represents money owed, not available
 * — "low balance" is backwards for it); Investment/Retirement/Crypto are
 * excluded (their balance reflects manually-entered portfolio value, not a
 * cash-flow risk). */
const ELIGIBLE_ACCOUNT_TYPES: readonly AccountType[] = ["CHECKING", "SAVINGS", "CASH"]

/**
 * Resolves the effective low-balance threshold for one account: its own
 * override, else the user's global setting, else the system default —
 * exactly `account.lowBalanceThresholdOverride ?? userThresholdSettings.lowBalanceThreshold ??
 * systemDefault` per phase-4b-technical-design.md §6. Exported for direct
 * unit testing (pure, no Prisma) — the one piece of this trigger's logic
 * worth isolating from its DB-touching evaluator below.
 */
export function resolveEffectiveLowBalanceThreshold(
  accountOverride: number | null,
  userDefaultThreshold: number,
): number {
  return accountOverride ?? userDefaultThreshold
}

/**
 * `LOW_BALANCE` trigger (notifications-v2.md's Low Balance trigger,
 * phase-4b-technical-design.md §6/§7.4).
 *
 * **Deterministic only, per binding constraint 1** — a plain `Account.balance`
 * vs. threshold comparison. No import from `features/analytics/server/insights.ts`
 * or any `lib/ai/` file anywhere in this file.
 *
 * **Scope** (AC1): non-archived Checking/Savings/Cash accounts only —
 * `getAccounts(userId)`'s default (`includeArchived: false`) already
 * excludes archived accounts, and `ELIGIBLE_ACCOUNT_TYPES` narrows to the
 * three eligible types.
 *
 * **Crossing + re-arm** (AC3/AC4), via `Account.lowBalanceNotifiedAt` as the
 * ONLY dedup mechanism for this trigger (there is no `Notification`
 * unique constraint on `accountId` — schema.prisma §7.2 is explicit that
 * this is deliberate, since this is the one trigger that legitimately fires
 * more than once per account over its lifetime):
 *   - Balance below threshold AND `lowBalanceNotifiedAt` is `null` (armed):
 *     atomically claims the latch (`updateMany({ where: { id, userId,
 *     lowBalanceNotifiedAt: null }, data: { lowBalanceNotifiedAt: now() } })`,
 *     checking `count === 1`) and, only if the claim won, creates the
 *     `LOW_BALANCE` notification — never a read-then-write.
 *   - Balance at-or-above threshold AND `lowBalanceNotifiedAt` is non-null
 *     (previously fired, still armed-to-recover): atomically clears the
 *     latch back to `null` (same `updateMany` shape, opposite `where`/`data`)
 *     so a later drop below threshold fires again (AC4) — no notification is
 *     created for a recovery itself, only the latch changes.
 *   - Every other combination (below threshold but already notified; at/above
 *     threshold and already armed) requires no write at all.
 *
 * **Fires retroactively for an already-below-threshold account at launch or
 * creation** (Edge Cases, the deliberate opposite of Goal Achieved's rule) —
 * this falls out for free from `lowBalanceNotifiedAt`'s own default `null`
 * state on every existing/new row, with no backfill migration (schema.prisma
 * §7.4's own comment): the very first evaluation for such an account finds
 * `lowBalanceNotifiedAt: null` and a below-threshold balance, which is
 * exactly the "armed to fire" case above.
 */
export async function evaluateLowBalanceTriggers(userId: string): Promise<Notification[]> {
  const [accounts, { lowBalanceThreshold: userDefaultThreshold }] = await Promise.all([
    getAccounts(userId),
    getNotificationThresholdSettings(userId),
  ])

  const eligibleAccounts = accounts.filter((account) =>
    ELIGIBLE_ACCOUNT_TYPES.includes(account.type),
  )

  const created = await Promise.all(
    eligibleAccounts.map((account) =>
      evaluateOneAccount(userId, account, userDefaultThreshold),
    ),
  )

  return created.filter((notification): notification is Notification => notification !== null)
}

async function evaluateOneAccount(
  userId: string,
  account: Account,
  userDefaultThreshold: number,
): Promise<Notification | null> {
  const threshold = resolveEffectiveLowBalanceThreshold(
    account.lowBalanceThresholdOverride,
    userDefaultThreshold,
  )
  const isBelowThreshold = account.balance < threshold

  if (isBelowThreshold) {
    const claim = await db.account.updateMany({
      where: { id: account.id, userId, lowBalanceNotifiedAt: null },
      data: { lowBalanceNotifiedAt: new Date() },
    })
    if (claim.count !== 1) {
      // Already armed (a prior crossing already notified and hasn't
      // recovered yet) — nothing new to notify about.
      return null
    }

    return createNotificationIfNew({
      userId,
      type: "LOW_BALANCE",
      accountId: account.id,
    })
  }

  // At or above threshold: clear the latch if it was set, so a future drop
  // re-arms and fires again (AC4). No notification for a recovery itself.
  await db.account.updateMany({
    where: { id: account.id, userId, lowBalanceNotifiedAt: { not: null } },
    data: { lowBalanceNotifiedAt: null },
  })
  return null
}
