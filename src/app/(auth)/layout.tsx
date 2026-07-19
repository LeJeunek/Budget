import type { ReactNode } from "react"

// Unauthenticated route-group layout (see docs/architecture/folder-tree.md:
// "(auth)/layout.tsx — unauthenticated layout, no sidebar"). Deliberately
// bare — the authenticated shell (sidebar + top nav) lives in
// (dashboard)/layout.tsx and is Frontend Lead/UI Component Engineer scope,
// not this one. This file exists only so app/(auth)/login/page.tsx has
// somewhere to render without inheriting a shell meant for logged-in users.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      {children}
    </div>
  )
}
