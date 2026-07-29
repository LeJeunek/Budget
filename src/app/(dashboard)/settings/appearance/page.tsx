import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import {
  getDashboardCardPreferences,
  getUserPreference,
} from "@/features/settings/server/service"
import { AccentColorPicker } from "@/features/settings/components/accent-color-picker"
import { DashboardLayoutEditor } from "@/features/settings/components/dashboard-layout-editor"

/**
 * Appearance settings — accent color + Dashboard layout, per
 * phase-4c-technical-design.md §3.6 (one of the two suggested settings
 * pages; "a single combined page is an equally valid alternative... nothing
 * in this design depends on the page split above being exact" — this split
 * groups the two visual/layout-personalization preferences together,
 * currency/timezone forms the sibling `preferences` page).
 *
 * A Server Component: resolves the authenticated user, then fetches both
 * reads directly in parallel (same "Server Component fetches once, Client
 * Component mutates" pattern as `settings/notifications/page.tsx`), handing
 * each result down as an `initial*` prop.
 */
export default async function AppearanceSettingsPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const [preference, dashboardCards] = await Promise.all([
    getUserPreference(user.id),
    getDashboardCardPreferences(user.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Appearance
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalize your accent color and choose which Dashboard cards you
          see, and in what order.
        </p>
      </div>

      <AccentColorPicker initialPreference={preference} />
      <DashboardLayoutEditor initialCards={dashboardCards} />
    </div>
  )
}
