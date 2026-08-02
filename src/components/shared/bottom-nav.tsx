"use client"

/**
 * BottomNav — fixed, mobile-only (`< 640px`) quick-access navigation bar
 * for this product's most-used routes, per
 * `docs/architecture/phase-5a-technical-design.md` §2 and
 * `docs/product/phase-5a-accessibility-responsive.md`'s Open Question (b)
 * resolution.
 *
 * Domain-agnostic, exactly like `Sidebar`/`TopNav` already are: it only
 * knows about `NavItem` (`{ label, href, icon }`, reused directly from
 * `sidebar.tsx` rather than redefined here — see `BOTTOM_NAV_ITEMS` below)
 * and never imports `Sheet`/`Sidebar` itself. The fifth "More" entry is
 * deliberately NOT a `NavItem` — it's a plain button exposing an
 * `onMoreClick` callback so a parent layout (which already owns the
 * hamburger `Sheet`'s open state, per the architecture doc §2.2's "lift
 * `mobileNavOpen` into `(dashboard)/layout.tsx`" decision) can wire it to
 * that same Sheet without this component ever needing to know Sheet/
 * Sidebar exist. This keeps BottomNav at the same "components/shared/ may
 * import nothing domain-specific" tier Sidebar/TopNav already occupy.
 *
 * Additive, not a sidebar replacement: BottomNav surfaces a fixed 4-item
 * subset of the app's routes for fast access; the hamburger `Sheet`
 * (`<Sidebar mobile />`, opened via the "More" button here) remains the
 * one complete navigation surface for every route in the app. Renders only
 * below the `sm` (640px) breakpoint — a different, deliberately narrower
 * breakpoint than `Sidebar`'s own `md`(768px)/`lg`(1024px) transitions; see
 * the architecture doc §2.4 for why `sm:hidden`, never `md:hidden`, is
 * load-bearing here (copying Sidebar's/TopNav's breakpoint would either
 * duplicate a nav surface or open an unintended navigation gap in the
 * 640–768px band).
 *
 * This component does not mount itself anywhere — the Frontend Lead
 * composes it into `app/(dashboard)/layout.tsx` alongside `Sidebar`/
 * `TopNav`, wiring `onMoreClick` to that layout's own lifted
 * `mobileNavOpen` state, and adding matching bottom padding to `<main>`
 * (e.g. `pb-16 sm:pb-0`) so this bar never obscures page content — both
 * companion changes are the architecture doc's §2.4/§2.5, not made here.
 *
 * Usage:
 * ```tsx
 * <BottomNav onMoreClick={() => setMobileNavOpen(true)} />
 *
 * // "More" button's handler omitted — it still renders, and is still
 * // keyboard/screen-reader operable, it just does nothing on activation
 * // until wired. Fine during incremental adoption, not for final ship.
 * <BottomNav />
 * ```
 */

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  CalendarClock,
  LayoutDashboard,
  MoreHorizontal,
  PiggyBank,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { type NavItem, isActivePath } from "@/components/shared/sidebar"

/**
 * Hand-maintained, deliberately separate from `Sidebar`'s `NAV_SECTIONS` —
 * not a runtime-filtered subset of it. See the architecture doc §2.1 for
 * the full "why not derive this from NAV_SECTIONS" reasoning: NAV_SECTIONS
 * is grouped by domain section, not by frequency of use, and this list is
 * meant to be tuned independently (e.g. from real mobile-usage data) rather
 * than silently growing every time NAV_SECTIONS gains an entry.
 *
 * Kept in sync with `NAV_SECTIONS` by hand — a route renamed/removed there
 * without a corresponding update here would silently point to a stale
 * `href`. A small Vitest unit test asserting every item below has a
 * matching `NAV_SECTIONS` href is recommended (architecture doc §2.1) but
 * is test-authoring work outside this component file's own scope.
 */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Budgeting", href: "/budgeting", icon: PiggyBank },
  { label: "Bills", href: "/bills", icon: CalendarClock },
]

export interface BottomNavProps {
  className?: string
  /**
   * Invoked when the "More" button is activated. Expected to open the
   * existing hamburger `Sheet` (`<Sidebar mobile />`) — BottomNav itself
   * never imports or renders that Sheet; see this file's own top JSDoc.
   */
  onMoreClick?: () => void
}

/**
 * Shared sizing/focus/active-state classes for every bar item (nav links
 * and the "More" button alike). `min-h-11 min-w-11` (44px) satisfies
 * Responsive AC5's touch-target minimum regardless of how narrow the
 * viewport is. The focus ring mirrors `Sidebar`'s own
 * `focus-visible:ring-2 ... focus-visible:ring-offset-2` shape exactly
 * (Accessibility AC3's binding "match the existing baseline" requirement)
 * — using the generic `ring`/`background` design tokens rather than
 * Sidebar's `sidebar`-namespaced ones, since BottomNav sits on the app's
 * ordinary `bg-background` chrome, not the sidebar surface.
 */
function itemClasses(active: boolean): string {
  return cn(
    "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors",
    "hover:bg-accent hover:text-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active && "text-foreground"
  )
}

interface BottomNavLinkProps {
  item: NavItem
  active: boolean
}

function BottomNavLink({ item, active }: BottomNavLinkProps) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={itemClasses(active)}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function BottomNav({ className, onMoreClick }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      data-slot="bottom-nav"
      aria-label="Quick access"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex sm:hidden",
        "items-stretch gap-1 border-t bg-background px-1 py-1",
        className
      )}
    >
      {BOTTOM_NAV_ITEMS.map((item) => (
        <BottomNavLink
          key={item.href}
          item={item}
          active={isActivePath(pathname ?? "", item.href)}
        />
      ))}
      <button
        type="button"
        aria-label="More navigation options"
        onClick={onMoreClick}
        className={itemClasses(false)}
      >
        <MoreHorizontal className="size-5 shrink-0" aria-hidden="true" />
        <span className="truncate">More</span>
      </button>
    </nav>
  )
}
