import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { LayoutDashboard } from "lucide-react"

import { getCurrentAdminUser } from "@/lib/auth"
import { AdminNav, type AdminNavItem } from "@/features/admin/components/admin-nav"

/**
 * Admin shell (docs/product/admin.md Capability 1; phase-4c-technical-
 * design.md §1.4). `app/admin/` is a new, top-level route segment — sibling
 * to `(auth)/` and `(dashboard)/`, NOT nested inside either, per that
 * design doc section's explicit placement reasoning: Admin is operational
 * tooling that must stay structurally separate from the consumer product,
 * so it gets its own layout tree rather than composing into `(dashboard)`'s
 * sidebar/nav chrome.
 *
 * **The guard, in full, per AC4:** `getCurrentAdminUser()` is called first,
 * before anything else in this Server Component. A `null` result redirects
 * to `/` immediately — no error message, no partial render of any admin
 * content (Server Component layouts resolve data before rendering children
 * at all, so nothing below this call ever executes for a non-admin). Every
 * page under `app/admin/**` is a child of this one guarded layout, so no
 * second, per-page check is needed for AC2/AC3/AC4 to hold together.
 *
 * A small top bar + horizontal tab nav is Admin's entire chrome — no
 * Sidebar/TopNav reuse (see this design doc section's own "does not need to
 * render the ordinary dashboard sidebar/nav chrome" note).
 */
const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Users", href: "/admin/users" },
  { label: "Audit Log", href: "/admin/audit-log" },
  { label: "Feature Flags", href: "/admin/feature-flags" },
  { label: "Categories", href: "/admin/categories" },
]

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdminUser()
  if (!admin) {
    redirect("/")
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/30 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <span className="font-heading text-lg font-semibold text-foreground">Admin</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Internal tools — not part of the ordinary product experience
          </span>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Back to Dashboard
        </Link>
      </header>
      <AdminNav items={ADMIN_NAV_ITEMS} />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  )
}
