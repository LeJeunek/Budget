import type { ReactNode } from "react"

import { PageTransition } from "@/components/shared/motion"

/**
 * Page Transitions' composition point in the app shell (Phase 5b,
 * docs/architecture/phase-5b-technical-design.md §4.1).
 *
 * Next.js's `template.tsx` file convention creates a fresh instance of its
 * children on every navigation within its scope — unlike `layout.tsx`,
 * which persists across navigations. That is exactly what a per-navigation
 * page-transition wrapper needs, and exactly why this is a new file here
 * rather than a change to `./layout.tsx` or `./dashboard-shell.tsx`: those
 * two must keep persisting unchanged (`DashboardShell`'s own
 * `mobileNavOpen`/`lastMobileNavOpenTriggerRef` state would break if that
 * file remounted on every navigation). `Sidebar`/`TopNav`/`BottomNav` all
 * live in `layout.tsx`/`dashboard-shell.tsx`, entirely outside this file's
 * scope, so they keep their continuous, un-remounted lifecycle — only the
 * route segment's own content (already unmounted/remounted on every
 * navigation today, `template.tsx` or not) gains the animated wrapper.
 *
 * Scoped to `(dashboard)/` only (this file's own route-group location),
 * matching Page Transitions AC4 — `/login` and `/admin/*` (its own separate
 * layout tree) are unaffected.
 *
 * Thin by design: all animation/reduced-motion logic lives in
 * `PageTransition` (a Client Component, `components/shared/motion/`,
 * UI-Component-Engineer-owned) — this file is pure composition, no logic of
 * its own, so it needs no `"use client"` directive itself.
 */
export default function DashboardTemplate({
  children,
}: {
  children: ReactNode
}) {
  return <PageTransition>{children}</PageTransition>
}
