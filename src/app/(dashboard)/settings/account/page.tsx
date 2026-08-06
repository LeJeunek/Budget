import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { ChangePasswordForm } from "@/features/settings/components/change-password-form"

/**
 * Account settings — the page `TopNav`'s "Profile" menu item now links to
 * (`top-nav.tsx`'s `profileHref`, `dashboard-shell.tsx` passes
 * `/settings/account`). Previously that menu item rendered with no
 * `href`/`onSelect` at all — a real bug reported directly, closed by
 * building this page rather than just wiring the item to somewhere that
 * didn't exist yet.
 *
 * Server Component: resolves the authenticated user for the read-only
 * name/email display. The one actual mutation on this page
 * (`ChangePasswordForm`) goes through Better Auth's own `changePassword`
 * client call directly — no Server Action of this feature's own, since
 * there's no FinanceOS-domain data involved, only auth state Better Auth
 * itself already owns.
 */
export default async function AccountSettingsPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders.
  if (!user) {
    redirect("/login")
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account details and sign-in credentials.
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
        <span className="text-sm text-muted-foreground">Name</span>
        <span className="text-sm font-medium text-foreground">{user.name}</span>
        <span className="mt-2 text-sm text-muted-foreground">Email</span>
        <span className="text-sm font-medium text-foreground">{user.email}</span>
      </div>

      <ChangePasswordForm />
    </div>
  )
}
