import type { NotificationType } from "@prisma/client"

import { db } from "@/lib/db"

import type {
  NotificationPreferenceView,
  NotificationThresholdSettingsView,
} from "../types"

/**
 * Lazily-materialized per-user notification preferences/threshold settings,
 * per docs/architecture/phase-4b-technical-design.md §7.5 and
 * docs/architecture/api-contracts.md's Phase 4b section. Row absence (or a
 * `null` column within an existing row) always means "use the documented
 * default" — the identical "row presence encodes unset vs. explicit"
 * convention Budgeting already established for `BudgetCategory`
 * (prisma/schema.prisma's own comment on both models below).
 */

/** Every `NotificationType` member, in the same order surfaced everywhere
 * else in this codebase (v1's two, then the four Phase 4b additions) — the
 * one place this exact list is spelled out, so `getNotificationPreferences`
 * always materializes all six regardless of which rows actually exist. */
export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  "BUDGET_OVER",
  "BILL_DUE_SOON",
  "BILL_LATE",
  "GOAL_ACHIEVED",
  "LARGE_PURCHASE",
  "LOW_BALANCE",
  "MONTHLY_SUMMARY_READY",
]

/** Documented default for every trigger type per notifications-v2.md AC3:
 * "In-App defaults to on for all six trigger types." */
const DEFAULT_IN_APP_ENABLED = true
/** Documented default for every trigger type per notifications-v2.md AC1/AC4:
 * "Email defaults to off for every trigger type, for every user, at launch." */
const DEFAULT_EMAIL_ENABLED = false

/** Proposed system default (phase-4b-technical-design.md §6): "a proposed
 * starting point for the architecture/backend pass, not a fixed product
 * mandate" — used only when the user has no row, or an explicit `null`
 * column, in `NotificationThresholdSettings`. */
export const DEFAULT_LARGE_PURCHASE_THRESHOLD = 500
/** See `DEFAULT_LARGE_PURCHASE_THRESHOLD`'s JSDoc — the Low Balance
 * counterpart, same non-binding "proposed starting point" framing. */
export const DEFAULT_LOW_BALANCE_THRESHOLD = 100

/**
 * All six trigger types' in-app/email preferences for `userId`, with every
 * missing row materialized to the documented defaults — never a partial
 * list, so a caller (the preferences settings screen, `email-dispatch.ts`)
 * never has to separately handle "no row for this type yet."
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferenceView[]> {
  const rows = await db.notificationPreference.findMany({ where: { userId } })
  const byType = new Map(rows.map((row) => [row.type, row]))

  return ALL_NOTIFICATION_TYPES.map((type) => {
    const row = byType.get(type)
    return {
      type,
      inAppEnabled: row?.inAppEnabled ?? DEFAULT_IN_APP_ENABLED,
      emailEnabled: row?.emailEnabled ?? DEFAULT_EMAIL_ENABLED,
    }
  })
}

/**
 * Whether email is currently enabled for exactly one `(userId, type)` pair —
 * a single indexed point-lookup (the `@@unique([userId, type])` constraint),
 * rather than `getNotificationPreferences`'s full 6-type materialization.
 * `email-dispatch.ts` uses this narrower read since it only ever needs one
 * type's answer per newly-created `Notification` row, not the whole settings
 * screen's view.
 */
export async function getEmailEnabledForType(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const row = await db.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { emailEnabled: true },
  })
  return row?.emailEnabled ?? DEFAULT_EMAIL_ENABLED
}

/**
 * The two user-adjustable dollar thresholds Large Purchase/Low Balance
 * evaluate against, with row/column absence resolved to the system default —
 * never `null`, so every trigger evaluator gets a plain, ready-to-compare
 * number with no further fallback logic of its own.
 */
export async function getNotificationThresholdSettings(
  userId: string,
): Promise<NotificationThresholdSettingsView> {
  const row = await db.notificationThresholdSettings.findUnique({ where: { userId } })

  return {
    largePurchaseThreshold:
      row?.largePurchaseThreshold?.toNumber() ?? DEFAULT_LARGE_PURCHASE_THRESHOLD,
    lowBalanceThreshold: row?.lowBalanceThreshold?.toNumber() ?? DEFAULT_LOW_BALANCE_THRESHOLD,
  }
}
