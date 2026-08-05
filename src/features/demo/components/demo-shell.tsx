"use client"

/**
 * DemoShell — thin Client Component composition root for the public `/demo`
 * route, mirroring `src/app/(dashboard)/dashboard-shell.tsx`'s exact shape
 * (docs/architecture/public-demo-technical-design.md §6.2).
 *
 * Owns the one lifted `mobileNavOpen` boolean `TopNav`'s hamburger `Sheet`
 * and `BottomNav`'s "More" button share — the identical reason
 * `dashboard-shell.tsx` exists as its own `"use client"` boundary (see that
 * file's own top JSDoc): `src/app/demo/layout.tsx` is expected to be a
 * plain, synchronous Server Component with nothing to `await` (no
 * `getCurrentUser()`, no `getUserPreference()` — `/demo` has no per-visitor
 * preference or session to resolve, per public-demo.md Capability 1 AC3),
 * and `useState` requires a Client Component.
 *
 * Composes `Sidebar` with `sections={DEMO_NAV_SECTIONS}`, `TopNav` with a
 * fixture `user`, no `notificationBell` (nothing renders — matches that
 * component's documented no-default behavior; `/demo` has no notifications
 * to show), and `sidebarSections={DEMO_NAV_SECTIONS}` (so its own internal
 * mobile-Sheet `Sidebar` instance shows the same demo-scoped nav list as the
 * desktop rail — this prop was added to `top-nav.tsx` specifically to close
 * that gap, since `TopNav` previously had no way for a caller to override
 * its mobile Sidebar's sections independently of the desktop one), `BottomNav`
 * with `items={DEMO_BOTTOM_NAV_ITEMS}`, `DemoModeBanner` (mounted once here
 * so it is structurally present on every reachable demo page — Capability 4
 * AC1), and `children`. `onSearchChange` is a plain no-op — `TopNav`'s search
 * input stays present for visual authenticity but is never wired to
 * anything, per Capability 5 AC3's explicitly-permitted inert control.
 * `onSignOut` is left unwired — genuinely truthful, not misleading, since
 * `/demo` has no session to end (Capability 1 AC2/AC3).
 *
 * Reproduces `dashboard-shell.tsx`'s own focus-return fix (Bug Hunter, Phase
 * 5a review gate,
 * phase-5a-sheet-focus-return-broken-for-externally-triggered-sheets.md):
 * Radix's `Sheet` always restores focus, on close, to whatever DOM node it
 * tracks as its own `SheetTrigger` (the hamburger button) — wrong when the
 * Sheet was opened via `BottomNav`'s "More" button instead. Since this file
 * reuses the exact same `Sidebar`/`TopNav`/`BottomNav` components, the same
 * bug would otherwise recur here; `lastMobileNavOpenTriggerRef`/
 * `handleMobileNavCloseAutoFocus` below are copied verbatim from that fix,
 * not reinvented.
 *
 * Everything (the fixture user, `children`) is passed in as props — this
 * file fetches nothing itself.
 */

import * as React from "react"
import type { ReactNode } from "react"

import { Sidebar } from "@/components/shared/sidebar"
import { TopNav, type TopNavUser } from "@/components/shared/top-nav"
import { BottomNav } from "@/components/shared/bottom-nav"
import { DemoModeBanner } from "@/features/demo/components/demo-mode-banner"
import { DEMO_NAV_SECTIONS } from "@/features/demo/nav/demo-nav-sections"
import { DEMO_BOTTOM_NAV_ITEMS } from "@/features/demo/nav/demo-bottom-nav-items"

export interface DemoShellProps {
  user: TopNavUser
  children: ReactNode
}

/** Presentational-only no-op — `TopNav`'s search box stays visually present
 * (Capability 5 AC3) but never filters anything or issues a request. */
function handleSearchChange(): void {
  // Intentionally empty — see this file's own top JSDoc.
}

export function DemoShell({ user, children }: DemoShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  // See this file's own top JSDoc "focus-return fix" note for the full
  // reasoning — copied from dashboard-shell.tsx verbatim.
  const lastMobileNavOpenTriggerRef = React.useRef<HTMLElement | null>(null)

  const handleMoreClick = React.useCallback(() => {
    lastMobileNavOpenTriggerRef.current = document.activeElement as HTMLElement | null
    setMobileNavOpen(true)
  }, [])

  const handleMobileNavCloseAutoFocus = React.useCallback((event: Event) => {
    const trigger = lastMobileNavOpenTriggerRef.current
    if (trigger) {
      event.preventDefault()
      trigger.focus()
      lastMobileNavOpenTriggerRef.current = null
    }
    // else: this Sheet was opened via its own real SheetTrigger (the
    // hamburger button), so Radix's own default restore-focus-to-trigger
    // behavior is already correct.
  }, [])

  return (
    <>
      <Sidebar sections={DEMO_NAV_SECTIONS} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          user={user}
          onSearchChange={handleSearchChange}
          mobileNavOpen={mobileNavOpen}
          onMobileNavOpenChange={setMobileNavOpen}
          onSheetCloseAutoFocus={handleMobileNavCloseAutoFocus}
          sidebarSections={DEMO_NAV_SECTIONS}
        />
        <DemoModeBanner />
        <main
          className="flex-1 overflow-y-auto p-4 pb-16 sm:pb-0 md:p-6"
          tabIndex={0}
        >
          {children}
        </main>
      </div>
      <BottomNav items={DEMO_BOTTOM_NAV_ITEMS} onMoreClick={handleMoreClick} />
    </>
  )
}
