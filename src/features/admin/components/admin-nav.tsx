"use client"

/**
 * AdminNav — Admin's own small top-level nav (Users / Audit Log / Feature
 * Flags / Categories / Demo Data). Admin is deliberately a separate, simpler
 * shell from the ordinary authenticated dashboard (phase-4c-technical-
 * design.md §1.4: "does not need to render the ordinary dashboard sidebar/
 * nav chrome") — this is a small horizontal tab bar, not a second copy of
 * `components/shared/sidebar.tsx`.
 *
 * A Client Component only because it highlights the active tab via
 * `usePathname()` — `app/admin/layout.tsx` (a Server Component) computes
 * `items` (including the environment-gated Demo Data entry,
 * `isDemoDataSeedAvailable()`) and passes them down; this component owns no
 * data of its own.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export interface AdminNavItem {
  label: string
  href: string
}

export interface AdminNavProps {
  items: AdminNavItem[]
}

export function AdminNav({ items }: AdminNavProps) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Admin navigation"
      className="flex flex-wrap gap-1 border-b bg-background px-4 py-2 md:px-6"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
