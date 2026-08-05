/**
 * Demo-scoped bottom nav items, per
 * docs/architecture/public-demo-technical-design.md §6.1.
 *
 * Mirrors `demo-nav-sections.ts`'s own rationale: `BottomNav`
 * (`components/shared/bottom-nav.tsx`) is domain-agnostic and renders
 * whatever `NavItem[]` it's given (`items` prop, defaulting to the real
 * app's own `BOTTOM_NAV_ITEMS`), so `/demo` supplies its own `/demo`-prefixed
 * four-item subset instead of inheriting the real app's hrefs. Picks the same
 * four high-traffic surfaces `BOTTOM_NAV_ITEMS` picks from
 * (Dashboard/Transactions/Budgeting), substituting Goals for the
 * out-of-scope Bills entry — Savings Goals is one of this demo's ten
 * in-scope pages (public-demo.md's In-Scope list) and, alongside
 * Dashboard/Transactions/Budgeting, rounds out a representative "quick
 * access" set for a small-viewport visitor exploring the demo.
 *
 * `NavItem` is imported from `sidebar.tsx` (never redefined here), matching
 * `bottom-nav.tsx`'s own "reused directly from sidebar.tsx" convention for
 * `BOTTOM_NAV_ITEMS`.
 */

import { ArrowLeftRight, LayoutDashboard, PiggyBank, Target } from "lucide-react"

import type { NavItem } from "@/components/shared/sidebar"

export const DEMO_BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/demo", icon: LayoutDashboard },
  { label: "Transactions", href: "/demo/transactions", icon: ArrowLeftRight },
  { label: "Budgeting", href: "/demo/budgeting", icon: PiggyBank },
  { label: "Goals", href: "/demo/goals", icon: Target },
]
