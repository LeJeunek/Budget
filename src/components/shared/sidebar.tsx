"use client"

/**
 * Sidebar — collapsible primary navigation for the authenticated app shell.
 *
 * Domain-agnostic: it only knows about `{ label, href, icon }` nav items
 * (see `NAV_SECTIONS` below). It does not fetch data or know about the
 * current user — the Frontend Lead composes this into
 * `app/(dashboard)/layout.tsx` alongside `TopNav`.
 *
 * Usage:
 * ```tsx
 * // Persistent desktop rail — collapses to icon-only below the `lg`
 * // breakpoint automatically, and can also be toggled manually.
 * <Sidebar />
 *
 * // Start collapsed
 * <Sidebar defaultCollapsed />
 *
 * // Always-expanded variant for embedding inside a Sheet on small screens
 * // (this is what TopNav does internally for its mobile menu trigger).
 * <Sidebar mobile onNavigate={() => setSheetOpen(false)} />
 * ```
 *
 * To add a nav item for a later phase, append to `NAV_SECTIONS` — the
 * rendering logic below never needs to change.
 */

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BarChart3,
  Banknote,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  Flag,
  LayoutDashboard,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface NavSection {
  /** Optional heading shown above the section when the sidebar is expanded. */
  title?: string
  items: NavItem[]
}

/**
 * Central nav configuration for the app shell. Grouped into sections so
 * later phases can append items/sections without touching render logic.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Accounts", href: "/accounts", icon: Wallet },
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Planning",
    items: [
      { label: "Budgeting", href: "/budgeting", icon: PiggyBank },
      { label: "Goals", href: "/goals", icon: Target },
      { label: "Bills", href: "/bills", icon: CalendarClock },
      // (Phase 3a) Recurring Income placement decision, made by the Frontend
      // Lead per docs/architecture/api-contracts.md's Recurring Income
      // section (no nav placement was specified there — this call was left
      // to frontend composition). Placed in "Planning" alongside Bills, not
      // "Wealth" alongside Debt/Investments: Debt/Investments are
      // balance-sheet/net-worth surfaces (a snapshot of what you owe/own),
      // while Recurring Income — like Budgeting/Bills — is a forward-looking
      // cash-flow planning surface (what's expected to come in, on what
      // schedule). recurring-income.md's own Business Value section frames
      // this feature explicitly as "Bills' direct mirror on the income
      // side," reusing Bills' recurring-schedule pattern — grouping it next
      // to Bills keeps that mirrored relationship visible in the nav, not
      // just in the code.
      { label: "Income", href: "/income", icon: Banknote },
    ],
  },
  {
    title: "Wealth",
    items: [
      { label: "Debt", href: "/debt", icon: CreditCard },
      { label: "Investments", href: "/investments", icon: TrendingUp },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      // (Phase 3b) Financial Goals placement decision, made by the Frontend
      // Lead — docs/architecture/api-contracts.md's Financial Goals section
      // specifies the route (`/financial-goals`) but, like Recurring
      // Income before it, leaves nav placement to frontend composition.
      // Placed in "Wealth" alongside Debt/Investments/Analytics, not
      // "Planning" alongside the existing Goals (Savings Goals): every
      // Financial Goal type reads a balance-sheet/insight figure this
      // section already owns (a Debt's balance, Net Worth, the Savings
      // Rate Analytics/Dashboard compute) rather than a forward-looking
      // cash-flow plan the user actively allocates toward — grouping it
      // here, visually apart from "Goals," reinforces financial-goals.md's
      // own Boundary section: the two "goal" concepts must never read as
      // the same interaction model, even in the nav.
      { label: "Financial Goals", href: "/financial-goals", icon: Flag },
    ],
  },
]

export interface SidebarProps {
  className?: string
  /**
   * Renders the always-expanded variant meant to be embedded inside a
   * `Sheet` for small viewports. Disables the responsive icon-only
   * breakpoint and the manual collapse toggle.
   */
  mobile?: boolean
  /** Initial collapsed state for the desktop rail. Ignored when `mobile`. */
  defaultCollapsed?: boolean
  /** Invoked after a nav link is activated — e.g. to close a mobile Sheet. */
  onNavigate?: () => void
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Label/heading visibility shared by nav item labels and section titles. */
function labelVisibilityClasses(mobile: boolean, collapsed: boolean): string {
  if (mobile) return "inline"
  return cn("hidden lg:inline", collapsed && "lg:hidden")
}

interface SidebarLinkProps {
  item: NavItem
  active: boolean
  mobile: boolean
  collapsed: boolean
  onNavigate?: () => void
}

function SidebarLink({
  item,
  active,
  mobile,
  collapsed,
  onNavigate,
}: SidebarLinkProps) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        !mobile && "justify-center lg:justify-start",
        collapsed && "justify-center"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span
        className={cn("truncate", labelVisibilityClasses(mobile, collapsed))}
      >
        {item.label}
      </span>
    </Link>
  )
}

export function Sidebar({
  className,
  mobile = false,
  defaultCollapsed = false,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  // The mobile variant is always expanded regardless of manual state.
  const effectiveCollapsed = mobile ? false : collapsed

  return (
    <aside
      data-slot="sidebar"
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        !mobile &&
          "hidden border-r transition-[width] duration-200 ease-in-out md:flex",
        !mobile && (effectiveCollapsed ? "w-16" : "w-16 lg:w-64"),
        mobile && "w-full",
        className
      )}
    >
      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-4 overflow-y-auto p-2"
      >
        {NAV_SECTIONS.map((section, index) => (
          <div
            key={section.title ?? `section-${index}`}
            className="flex flex-col gap-1"
          >
            {section.title && (
              <span
                className={cn(
                  "px-3 text-xs font-medium text-sidebar-foreground/60",
                  labelVisibilityClasses(mobile, effectiveCollapsed)
                )}
              >
                {section.title}
              </span>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={isActivePath(pathname ?? "", item.href)}
                    mobile={mobile}
                    collapsed={effectiveCollapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!mobile && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? (
              <ChevronsRight className="size-4" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      )}
    </aside>
  )
}
