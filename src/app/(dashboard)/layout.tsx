import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { Sidebar } from "@/components/shared/sidebar"
import { TopNav } from "@/components/shared/top-nav"

/**
 * Authenticated app shell (see docs/architecture/folder-tree.md:
 * "(dashboard)/layout.tsx — authenticated layout, sidebar + top nav").
 *
 * Server Component: resolves the current user via `getCurrentUser()` and
 * redirects unauthenticated visitors to /login before rendering any shell
 * chrome. `Sidebar` is the persistent desktop rail (hidden below `md` via
 * its own responsive classes); mobile navigation is already handled inside
 * `TopNav`'s built-in Sheet trigger (see top-nav.tsx), so it is not
 * duplicated here.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav user={{ name: user.name, email: user.email }} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
