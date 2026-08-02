"use client"

/**
 * DashboardShell — thin Client Component wrapper composing `Sidebar` /
 * `TopNav` / `BottomNav` / `children` for the authenticated app shell.
 *
 * Why this file exists (Phase 5a,
 * docs/architecture/phase-5a-technical-design.md §2.2): `BottomNav`'s
 * "More" button and `TopNav`'s hamburger `Sheet` must open/close the exact
 * same mobile-nav surface rather than each owning an independent, competing
 * `Sheet` (see the architecture doc's rejected alternatives). That requires
 * one `useState<boolean>` shared by both — but `(dashboard)/layout.tsx` is a
 * Server Component (it awaits `getCurrentUser()`/`getUserPreference()`), and
 * `useState` requires a Client Component. This file is the minimal
 * `"use client"` boundary that owns that one lifted `mobileNavOpen` boolean
 * and threads it into `TopNav`'s new, optional, controlled-mode props
 * (`mobileNavOpen`/`onMobileNavOpenChange` — see `top-nav.tsx`'s own JSDoc)
 * and `BottomNav`'s `onMoreClick`. It is pure composition/state-lifting, not
 * a new reusable component — mirrors `currency-preference-provider.tsx`'s
 * own "root-layout plumbing, not a components/shared/ primitive" ownership
 * note, and the same co-located `*-client.tsx` pattern this app already uses
 * for every Server Component page that needs a client-side composition root
 * (e.g. `bills/bills-client.tsx`, `transactions/transactions-client.tsx`).
 *
 * `<main>` gains `pb-16 sm:pb-0` here (not in `layout.tsx`) since `<main>` is
 * rendered by this same composition — matching bottom padding to
 * `BottomNav`'s own height so its fixed position never obscures page content
 * below `sm` (640px), per the architecture doc §2.4's "required companion
 * change, not optional."
 *
 * Everything server-resolved (the signed-in user, notification bell JSX,
 * `children`) is passed in as props from `layout.tsx` — this file fetches
 * nothing itself.
 */

import * as React from "react"
import type { ReactNode } from "react"

import { Sidebar } from "@/components/shared/sidebar"
import { TopNav, type TopNavUser } from "@/components/shared/top-nav"
import { BottomNav } from "@/components/shared/bottom-nav"

export interface DashboardShellProps {
  user: TopNavUser
  notificationBell: ReactNode
  children: ReactNode
}

export function DashboardShell({
  user,
  notificationBell,
  children,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  return (
    <>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          user={user}
          notificationBell={notificationBell}
          mobileNavOpen={mobileNavOpen}
          onMobileNavOpenChange={setMobileNavOpen}
        />
        <main className="flex-1 overflow-y-auto p-4 pb-16 sm:pb-0 md:p-6">
          {children}
        </main>
      </div>
      <BottomNav onMoreClick={() => setMobileNavOpen(true)} />
    </>
  )
}
