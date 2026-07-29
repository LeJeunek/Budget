import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getUserPreference } from "@/features/settings/server/service"
import { CurrencyDisplaySelect } from "@/features/settings/components/currency-display-select"
import { TimezoneSelect } from "@/features/settings/components/timezone-select"

/**
 * Preferences settings — currency display + timezone, per
 * phase-4c-technical-design.md §3.6 (the sibling page to `settings/appearance`,
 * grouping the two "how figures/dates are shown" preferences together).
 *
 * A Server Component: resolves the authenticated user, then fetches the one
 * shared `UserPreference` read directly (both Client Components below read
 * from the same `useUserPreference` query-cache entry, seeded once here —
 * a currency-display edit and a timezone edit each write back through their
 * own Server Action but land in the same cached row, so neither screen ever
 * goes stale relative to the other).
 */
export default async function PreferencesSettingsPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const preference = await getUserPreference(user.id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Preferences
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose how currency amounts are formatted and set your timezone.
        </p>
      </div>

      <CurrencyDisplaySelect initialPreference={preference} />
      <TimezoneSelect initialPreference={preference} />
    </div>
  )
}
