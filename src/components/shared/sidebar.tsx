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
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BarChart3,
  Banknote,
  CalendarClock,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  FileText,
  Flag,
  HeartPulse,
  LayoutDashboard,
  Palette,
  PiggyBank,
  Settings,
  SlidersHorizontal,
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
      // (Phase 4c) Calendar v2 placement decision, made by the Frontend
      // Lead — calendar-v2.md AC13 only requires this stay "reachable from
      // primary navigation, not effectively hidden as a sub-toggle a user
      // would only discover while already inside Bills," leaving the exact
      // section to frontend composition (phase-4c-technical-design.md §2.5).
      // Considered "Wealth," Analytics'/Reports'/Health Score's own
      // precedent for "a whole-picture read over other domains' data" — not
      // chosen here, because Calendar v2's own three composed sources
      // (features/calendar/server/service.ts: Bills, Recurring Income, and
      // Budgeting's month-boundary) are themselves all three already members
      // of *this* "Planning" section, not Wealth's balance-sheet/net-worth
      // domains (Debt, Investments) the way Analytics/Reports/Health Score
      // aggregate. Placed here, last in Planning, as the composed
      // whole-month view *over* Budgeting/Bills/Income immediately above it
      // — the same "the aggregate view sits at the end of the section whose
      // members it composes" structure Wealth's own Reports/Health Score
      // placement already establishes, just applied within the section that
      // actually matches Calendar v2's own sources.
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Wealth",
    items: [
      { label: "Debt", href: "/debt", icon: CreditCard },
      { label: "Investments", href: "/investments", icon: TrendingUp },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      // (Phase 4b) Reports placement decision, made by the Frontend Lead —
      // docs/architecture/api-contracts.md's Phase 4b Reports row specifies
      // the route (`GET /api/reports`) but leaves nav placement to frontend
      // composition, same as every prior phase's own domain feature.
      // Placed in "Wealth" immediately after Analytics, not a new top-level
      // section: reports.md's own Business Value section frames this
      // feature explicitly as taking data that "already exists somewhere in
      // the app today — the Dashboard, Analytics, Debt Tracker,
      // Investments, Budgeting" and making it a downloadable document,
      // never computing anything new of its own (Cross-Cutting Requirement
      // #2, "no independently duplicated numbers") — it is a presentation
      // layer *over* this section's own aggregate/analytical surfaces, the
      // same reasoning Health Score below already uses for its own
      // placement here, so grouping the two together keeps every
      // "whole-picture read over other domains' data" surface in one place.
      { label: "Reports", href: "/reports", icon: FileText },
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
      // (Phase 4a) Financial Health Score placement decision, made by the
      // Frontend Lead — docs/architecture/api-contracts.md's Feature 5
      // section specifies the read functions/detail-view requirement (AC8)
      // but leaves nav placement to frontend composition, same as Recurring
      // Income/Financial Goals before it. Placed in "Wealth" alongside
      // Debt/Investments/Analytics/Financial Goals: this score is an
      // aggregate whole-picture read *over* every one of those domains'
      // already-computed figures (debt, net worth, budget, savings), so it
      // belongs with the other whole-picture/analytical surfaces, not
      // "Planning" alongside the forward-looking cash-flow tools.
      { label: "Health Score", href: "/financial-health-score", icon: HeartPulse },
    ],
  },
  {
    // (Phase 4b) Notification Preferences placement decision, made by the
    // Frontend Lead — docs/product/notifications-v2.md's Email Delivery
    // Channel AC2 introduces this product's first settings-style screen,
    // with no route/nav placement specified by the architecture doc (same
    // "left to frontend composition" pattern as every prior phase's own
    // domain feature). Deliberately a new, separate "Account" section
    // rather than folded into "Planning" or "Wealth": every other section
    // here groups a *domain* (data the user tracks — bills, debt,
    // investments), while this page configures how the app notifies the
    // user about all of them at once — an account-level, cross-cutting
    // concern with no balance-sheet or cash-flow figure of its own to sit
    // alongside. Placed here in the Sidebar (via `NAV_SECTIONS`, this
    // file's own documented, safe extension point for a new nav item)
    // rather than as a new slot on `TopNav`: `TopNav`
    // (`components/shared/top-nav.tsx`) is a shared, domain-agnostic
    // primitive outside the Frontend Lead's "assemble, never build/modify
    // reusable components" mandate — adding a new prop/slot to it is a
    // structural change to that component, not page composition, so it's
    // the wrong extension point for this decision even though the feature
    // brief floated it as an option.
    title: "Account",
    items: [
      { label: "Notification Preferences", href: "/settings/notifications", icon: Settings },
      // (Phase 4c) Customization's two settings pages
      // (phase-4c-technical-design.md §3.6), placed in this same "Account"
      // section rather than a new one — same reasoning as Notification
      // Preferences immediately above: accent color/Dashboard layout and
      // currency/timezone are account-level, cross-cutting configuration
      // with no balance-sheet or cash-flow figure of their own, not a
      // domain feature that would belong in "Planning"/"Wealth."
      { label: "Appearance", href: "/settings/appearance", icon: Palette },
      { label: "Preferences", href: "/settings/preferences", icon: SlidersHorizontal },
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
  /**
   * Public Demo Mode addition (`docs/architecture/
   * public-demo-technical-design.md` §6.1): an externally-supplied nav
   * section list, defaulting to `NAV_SECTIONS` below. Exists so `/demo`'s
   * own composition (`features/demo/components/demo-shell.tsx`) can render
   * this same component with a `/demo`-scoped, ten-item nav
   * (`DEMO_NAV_SECTIONS`) instead of the real app's own hrefs — several of
   * which point at out-of-scope or authenticated-only routes a public,
   * unauthenticated page must never link to (public-demo.md Capability 5
   * AC4). Purely additive: every existing call site that doesn't pass this
   * prop renders byte-for-byte identically to before, per the same
   * "zero behavioral change for every existing render path" precedent
   * `phase-5a-technical-design.md` §2.2 already used for `TopNav`'s own
   * `mobileNavOpen`/`onMobileNavOpenChange` controlled props.
   */
  sections?: NavSection[]
}

/**
 * Exported (Phase 5a) so `BottomNav` (`components/shared/bottom-nav.tsx`)
 * can reuse the identical "is this the active route" logic for its own
 * `aria-current="page"` treatment instead of reimplementing it — see
 * `docs/architecture/phase-5a-technical-design.md` §2.3. No behavior change.
 */
export function isActivePath(pathname: string, href: string): boolean {
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
  sections = NAV_SECTIONS,
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
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-4",
          !mobile && "justify-center lg:justify-start",
          effectiveCollapsed && "justify-center"
        )}
      >
        {/* Two emblem variants, swapped via Tailwind's `dark:` variant
         * (pure CSS, no useTheme() hydration risk) — see login page's
         * identical pattern/comment. */}
        <Image
          src="/brand/emblem-light.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 dark:hidden"
        />
        <Image
          src="/brand/emblem-dark.png"
          alt=""
          width={32}
          height={32}
          className="hidden size-8 shrink-0 dark:block"
        />
        <span
          className={cn(
            "truncate text-sm font-semibold",
            labelVisibilityClasses(mobile, effectiveCollapsed)
          )}
        >
          LK Budget
        </span>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-4 overflow-y-auto p-2"
      >
        {sections.map((section, index) => (
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
