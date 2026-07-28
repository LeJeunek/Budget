import { NotificationType } from "@prisma/client"
import { z } from "zod"

/**
 * Server-Action input validation for the Notifications module — per
 * docs/architecture/naming-standards.md's `PascalCase` + `Schema` convention.
 *
 * Notifications v1 had no dedicated `validation.ts` (folder-tree.md's Phase 2
 * note: "this module has no complex input to validate... the single small id
 * schema lives [in actions.ts] instead of a dedicated file that would
 * otherwise hold nothing else"). Phase 4b's two new preference/threshold
 * Server Actions are exactly the "something else" that note anticipated, so
 * this file now exists — `NotificationIdSchema` moves here from `actions.ts`
 * alongside the two new schemas, consolidating every Server-Action input
 * schema for this module in the one place every other feature already keeps
 * them.
 */

export const NotificationIdSchema = z.object({
  id: z.string().min(1, "Notification id is required"),
})

export type NotificationIdInput = z.infer<typeof NotificationIdSchema>

// Matches the DB column precision (`NotificationThresholdSettings.largePurchaseThreshold`/
// `lowBalanceThreshold` are both `Decimal(14, 2)`, prisma/schema.prisma §7.5)
// — same reasoning/shape as `features/accounts/server/validation.ts`'s
// `MAX_BALANCE_ABS`/`decimalPrecision`, duplicated here rather than
// cross-imported per this codebase's established "features/<domain>/server
// modules don't reach into another domain's internals" convention.
const MAX_THRESHOLD_ABS = 999_999_999_999.99

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100
  return Math.abs(Math.round(cents) - cents) < 1e-6
}

const thresholdSchema = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a finite number`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_THRESHOLD_ABS, `${label} must be no larger than ${MAX_THRESHOLD_ABS.toLocaleString("en-US")}`)
    .refine(hasAtMostTwoDecimalPlaces, {
      message: `${label} supports at most 2 decimal places`,
    })

/**
 * `updateNotificationPreference` input — per-trigger-type in-app/email
 * toggle (api-contracts.md's Phase 4b `UpdateNotificationPreferenceSchema`).
 * Both fields optional so a caller can flip just one channel at a time (the
 * settings screen's two independent toggles per row) without being forced
 * to resupply the other's current value.
 */
export const UpdateNotificationPreferenceSchema = z.object({
  type: z.nativeEnum(NotificationType, {
    error: "Type must be one of the supported notification types",
  }),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
})

export type UpdateNotificationPreferenceInput = z.infer<
  typeof UpdateNotificationPreferenceSchema
>

/**
 * `updateNotificationThresholdSettings` input — the two user-adjustable
 * dollar thresholds (api-contracts.md's Phase 4b
 * `UpdateNotificationThresholdSettingsSchema`). Both optional so a user can
 * customize just one threshold without being forced to also supply an
 * explicit value for the other (mirrors `NotificationThresholdSettings`'s
 * own independently-nullable columns, prisma/schema.prisma §7.5).
 */
export const UpdateNotificationThresholdSettingsSchema = z.object({
  largePurchaseThreshold: thresholdSchema("Large purchase threshold").optional(),
  lowBalanceThreshold: thresholdSchema("Low balance threshold").optional(),
})

export type UpdateNotificationThresholdSettingsInput = z.infer<
  typeof UpdateNotificationThresholdSettingsSchema
>
