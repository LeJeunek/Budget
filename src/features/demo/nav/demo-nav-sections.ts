/**
 * Demo-scoped sidebar sections, per
 * docs/architecture/public-demo-technical-design.md §6.1.
 *
 * `Sidebar` (`components/shared/sidebar.tsx`) is domain-agnostic and
 * fetch-free by design — it only ever renders whatever `NavSection[]` it's
 * given (`sections` prop, defaulting to the real app's own `NAV_SECTIONS`).
 * Reusing `NAV_SECTIONS` unmodified inside `/demo` would render working links
 * straight into the real, authenticated app (several out-of-scope pages, and
 * every href missing the `/demo` prefix) — a direct violation of
 * public-demo.md Capability 5 AC4 ("nothing under `/demo` links out to ...
 * any authenticated route"). This file is the demo's own, `/demo`-prefixed
 * mirror, covering exactly the ten in-scope pages
 * (docs/product/public-demo.md's "In-Scope Pages" list) — no Bills, Income,
 * Calendar, Settings, Reports, or Admin.
 *
 * `NavItem`/`NavSection` are imported from `sidebar.tsx` (never redefined
 * here) so this file can never structurally drift from the shape `Sidebar`
 * actually renders.
 */

import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  Flag,
  HeartPulse,
  LayoutDashboard,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react"

import type { NavSection } from "@/components/shared/sidebar"

export const DEMO_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/demo", icon: LayoutDashboard },
      { label: "Accounts", href: "/demo/accounts", icon: Wallet },
      { label: "Transactions", href: "/demo/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Planning",
    items: [
      { label: "Budgeting", href: "/demo/budgeting", icon: PiggyBank },
      { label: "Goals", href: "/demo/goals", icon: Target },
    ],
  },
  {
    title: "Wealth",
    items: [
      { label: "Debt", href: "/demo/debt", icon: CreditCard },
      { label: "Investments", href: "/demo/investments", icon: TrendingUp },
      { label: "Analytics", href: "/demo/analytics", icon: BarChart3 },
      { label: "Financial Goals", href: "/demo/financial-goals", icon: Flag },
      { label: "Health Score", href: "/demo/financial-health-score", icon: HeartPulse },
    ],
  },
]
