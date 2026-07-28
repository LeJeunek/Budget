import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import {
  getNotificationPreferences,
  getNotificationThresholdSettings,
} from "@/features/notifications/server/preferences"
import { NotificationPreferencesList } from "@/features/notifications/components/notification-preferences-list"
import { NotificationThresholdSettingsForm } from "@/features/notifications/components/notification-threshold-settings-form"

/**
 * Notification Preferences — docs/product/notifications-v2.md's Email
 * Delivery Channel AC2 ("a single notification-preferences screen").
 *
 * Placed under `/settings/notifications` rather than a `NAV_SECTIONS`
 * "Wealth"/"Planning" domain entry — see `components/shared/sidebar.tsx`'s
 * own placement comment on the new "Account" section this page's nav item
 * lives in for the full reasoning (this is account-level configuration, not
 * a domain feature with its own data). The `/settings/...` prefix (rather
 * than a flat `/notification-preferences`) is deliberate too: this is the
 * first settings-style screen this product has, and nesting it under
 * `/settings` now avoids a future settings page (e.g. profile, email
 * verification) needing a disruptive route rename later.
 *
 * A Server Component: resolves the authenticated user, then fetches both
 * reads directly, in parallel, per docs/architecture/api-contracts.md's
 * Phase 4b "Server Component direct call" rows
 * (`getNotificationPreferences`, `getNotificationThresholdSettings`),
 * handing each result to its own Client Component as an `initial*` prop —
 * the same Server-Component-fetches/Client-Component-renders split every
 * other read-heavy page in this codebase already uses (e.g.
 * `financial-health-score/page.tsx`).
 */
export default async function NotificationSettingsPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const [preferences, thresholdSettings] = await Promise.all([
    getNotificationPreferences(user.id),
    getNotificationThresholdSettings(user.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Notification Preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Control which alerts you see in the app and which are also emailed
          to you, plus the dollar thresholds that trigger a Large Purchase
          or Low Balance alert.
        </p>
      </div>

      <NotificationPreferencesList initialPreferences={preferences} />
      <NotificationThresholdSettingsForm initialSettings={thresholdSettings} />
    </div>
  )
}
