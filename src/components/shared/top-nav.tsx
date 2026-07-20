"use client"

/**
 * TopNav — top bar for the authenticated app shell: mobile nav trigger
 * (opens `Sidebar` in a `Sheet`), a global search input (presentation
 * only — no fetching), a theme toggle slot, a notification bell slot, and a
 * user menu.
 *
 * Usage:
 * ```tsx
 * <TopNav
 *   user={{ name: "Ada Lovelace", email: "ada@example.com" }}
 *   onSignOut={() => signOutAction()}
 *   onSearchChange={(value) => setQuery(value)}
 *   notificationBell={<NotificationBell />}
 * />
 *
 * // No user loaded yet (e.g. still fetching in a Server Component parent)
 * <TopNav />
 * ```
 *
 * `onSearchChange` only forwards the raw input value — wiring it to real
 * search/filtering logic is a feature module's responsibility.
 * `onSignOut` is left unimplemented here on purpose — auth logic belongs
 * to the Backend Engineer's `lib/auth.ts` / server actions.
 * `notificationBell` has no default (unlike `themeToggle`, which defaults to
 * `<ThemeToggle />`) because this component must stay domain-agnostic and
 * fetch-free — it cannot import `features/notifications/components/notification-bell`
 * itself. Callers (currently `app/(dashboard)/layout.tsx`) pass it in; when
 * omitted, no bell renders.
 */

import * as React from "react"
import { LogOut, Menu, Search, User as UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Sidebar } from "@/components/shared/sidebar"
import { ThemeToggle } from "@/components/shared/theme-toggle"

export interface TopNavUser {
  name: string
  email?: string
  avatarUrl?: string
}

export interface TopNavProps {
  className?: string
  /** Signed-in user summary for the avatar/menu. Omit to render a generic placeholder. */
  user?: TopNavUser
  /** Called when "Sign out" is selected — implement the actual sign-out elsewhere. */
  onSignOut?: () => void
  searchPlaceholder?: string
  /** Presentational only — forwards the raw input value, never calls an API. */
  onSearchChange?: (value: string) => void
  /** Override the default `<ThemeToggle />` slot if needed. */
  themeToggle?: React.ReactNode
  /** Notification bell slot, rendered between the theme toggle and the user
   * menu. No default — see this file's top JSDoc for why. Pass
   * `<NotificationBell />` (`features/notifications/components/notification-bell.tsx`)
   * from a page/layout that has access to that feature module. */
  notificationBell?: React.ReactNode
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  return initials || "?"
}

export function TopNav({
  className,
  user,
  onSignOut,
  searchPlaceholder = "Search transactions, accounts...",
  onSearchChange,
  themeToggle,
  notificationBell,
}: TopNavProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  return (
    <header
      data-slot="top-nav"
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4",
        className
      )}
    >
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <Sidebar
            mobile
            onNavigate={() => setMobileNavOpen(false)}
            className="pt-10"
          />
        </SheetContent>
      </Sheet>

      <div className="relative max-w-md flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          aria-label="Search"
          className="pl-8"
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {themeToggle ?? <ThemeToggle />}
        {notificationBell}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Open user menu"
            >
              <Avatar size="sm">
                {user?.avatarUrl && (
                  <AvatarImage src={user.avatarUrl} alt="" />
                )}
                <AvatarFallback>
                  {user ? (
                    getInitials(user.name)
                  ) : (
                    <UserIcon className="size-4" aria-hidden="true" />
                  )}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {user?.name ?? "Account"}
              </span>
              {user?.email && (
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon aria-hidden="true" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSignOut?.()}>
              <LogOut aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
