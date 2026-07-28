"use server"

import { getCurrentUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ok, fail, type ApiResult } from "@/lib/api-response"

import type { Notification, NotificationPreferenceView } from "../types"
import { NOTIFICATION_INCLUDE, toNotification } from "./notification-mapper"
import { getNotificationThresholdSettings } from "./preferences"
import {
  NotificationIdSchema,
  UpdateNotificationPreferenceSchema,
  UpdateNotificationThresholdSettingsSchema,
} from "./validation"

/**
 * Mutating Server Actions for the Notifications module, per
 * docs/architecture/api-contracts.md's Notifications section:
 * `dismissNotification`, `markNotificationRead`, `markAllNotificationsRead`
 * (Notifications v1), plus Phase 4b's `updateNotificationPreference`/
 * `updateNotificationThresholdSettings`.
 *
 * Every action, per folder-tree.md's rule:
 *   1. Calls getCurrentUser() and fails closed with "UNAUTHENTICATED".
 *   2. Scopes every Prisma call by that user's id — a client-supplied `id`
 *      is never trusted on its own; every lookup filters by
 *      `{ id, userId: user.id }` (AC5 — notifications scoped strictly to
 *      the authenticated user's own data), same convention as every other
 *      domain's actions.ts (e.g. features/goals/server/actions.ts).
 *   3. Never mutates Budgeting/Bills data (AC4: dismissing/marking read does
 *      not undo or change the underlying budget/bill state) — every write
 *      below touches only the `Notification` row's own `readAt`/`dismissedAt`
 *      columns.
 */

/**
 * Marks a single notification as read (AC4). Idempotent — marking an
 * already-read notification read again is a harmless no-op that returns its
 * current state, matching this codebase's established idempotent-action
 * convention (e.g. `archiveAccount`, `archiveGoal`).
 */
export async function markNotificationRead(
  input: unknown,
): Promise<ApiResult<Notification>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = NotificationIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid notification id")
  }

  const existing = await db.notification.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  })
  if (!existing) {
    return fail("Notification not found")
  }

  const updated = await db.notification.update({
    where: { id: existing.id },
    data: { readAt: existing.readAt ?? new Date() },
    include: NOTIFICATION_INCLUDE,
  })

  const notification = toNotification(updated)
  if (!notification) {
    return fail("Notification could not be read back")
  }

  return ok(notification)
}

/**
 * Dismisses a single notification (AC4) — sets `dismissedAt` only. Per AC4
 * and this module's boundary rule, this never writes to Budgeting or Bills
 * data; the underlying over-budget/due/late condition is untouched and may
 * still be true, it simply no longer shows in the inbox (see
 * `server/service.ts`'s `getNotifications`, which excludes dismissed rows).
 * Idempotent, same rationale as `markNotificationRead`.
 */
export async function dismissNotification(
  input: unknown,
): Promise<ApiResult<Notification>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = NotificationIdSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid notification id")
  }

  const existing = await db.notification.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  })
  if (!existing) {
    return fail("Notification not found")
  }

  const updated = await db.notification.update({
    where: { id: existing.id },
    data: { dismissedAt: existing.dismissedAt ?? new Date() },
    include: NOTIFICATION_INCLUDE,
  })

  const notification = toNotification(updated)
  if (!notification) {
    return fail("Notification could not be read back")
  }

  return ok(notification)
}

/**
 * Marks every currently active (non-dismissed), unread notification as read
 * in one call — the notification bell's "mark all read" action. Scoped by
 * `userId` via `updateMany`'s `where`, same ownership guarantee as every
 * single-id action above, just applied to a set instead of one row.
 * Dismissed notifications are excluded from the `where` clause since they
 * are already out of the active inbox — there is nothing meaningful to mark
 * read on a row the user has already dismissed.
 */
export async function markAllNotificationsRead(): Promise<
  ApiResult<{ count: number }>
> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const result = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, dismissedAt: null },
    data: { readAt: new Date() },
  })

  return ok({ count: result.count })
}

// ---------------------------------------------------------------------------
// Phase 4b — notification preferences / threshold settings, per
// docs/architecture/api-contracts.md's Phase 4b section.
// ---------------------------------------------------------------------------

/**
 * Updates one trigger type's in-app/email preference (notifications-v2.md's
 * preferences screen). Upserts on `(userId, type)` — a caller flipping a
 * toggle for a trigger type with no existing row yet is exactly the "lazy
 * materialization" case `preferences.ts`'s own JSDoc describes (row absence
 * = defaults; this is the point at which a row first becomes explicit).
 * Only the field(s) actually present in the parsed input are written, same
 * "undefined means leave unchanged" convention as `updateAccount` — a caller
 * flipping only the Email toggle for an as-yet-unmaterialized row still
 * needs the OTHER column's create-time value to be its own documented
 * default, not an accidental `undefined`/DB-default mismatch, so the
 * `create` branch below always supplies both columns' documented defaults
 * explicitly.
 */
export async function updateNotificationPreference(
  input: unknown,
): Promise<ApiResult<NotificationPreferenceView>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateNotificationPreferenceSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid notification preference input")
  }
  const { type, inAppEnabled, emailEnabled } = parsed.data

  const row = await db.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: {
      userId: user.id,
      type,
      inAppEnabled: inAppEnabled ?? true,
      emailEnabled: emailEnabled ?? false,
    },
    update: {
      ...(inAppEnabled !== undefined ? { inAppEnabled } : {}),
      ...(emailEnabled !== undefined ? { emailEnabled } : {}),
    },
  })

  return ok({ type: row.type, inAppEnabled: row.inAppEnabled, emailEnabled: row.emailEnabled })
}

/**
 * Updates the caller's Large Purchase / Low Balance dollar thresholds.
 * Upserts on `userId` (one row per user, per `NotificationThresholdSettings`'s
 * `@@unique` on that column) — same lazy-materialization-on-first-customization
 * convention as `updateNotificationPreference` above. Returns the fully
 * resolved view (via `preferences.getNotificationThresholdSettings`, not the
 * raw row) so a `null` column the caller didn't touch still comes back as
 * its resolved system default, exactly what the settings screen displays.
 */
export async function updateNotificationThresholdSettings(
  input: unknown,
): Promise<ApiResult<{ largePurchaseThreshold: number; lowBalanceThreshold: number }>> {
  const user = await getCurrentUser()
  if (!user) return fail("UNAUTHENTICATED")

  const parsed = UpdateNotificationThresholdSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid threshold settings input")
  }
  const { largePurchaseThreshold, lowBalanceThreshold } = parsed.data

  await db.notificationThresholdSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      largePurchaseThreshold,
      lowBalanceThreshold,
    },
    update: {
      ...(largePurchaseThreshold !== undefined ? { largePurchaseThreshold } : {}),
      ...(lowBalanceThreshold !== undefined ? { lowBalanceThreshold } : {}),
    },
  })

  return ok(await getNotificationThresholdSettings(user.id))
}
