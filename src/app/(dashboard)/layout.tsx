import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { TimezoneAutoCapture } from "@/features/settings/components/timezone-auto-capture"
import { getUserPreference } from "@/features/settings/server/service"
import { CurrencyPreferenceProvider } from "./currency-preference-provider"
import { DashboardShell } from "./dashboard-shell"

/**
 * Authenticated app shell (see docs/architecture/folder-tree.md:
 * "(dashboard)/layout.tsx — authenticated layout, sidebar + top nav").
 *
 * Server Component: resolves the current user via `getCurrentUser()` and
 * redirects unauthenticated visitors to /login before rendering any shell
 * chrome. `Sidebar` is the persistent desktop rail (hidden below `md` via
 * its own responsive classes); mobile navigation is already handled inside
 * `TopNav`'s built-in Sheet trigger (see top-nav.tsx), so it is not
 * duplicated here.
 *
 * `NotificationBell` (a Client Component that fetches its own data) is
 * passed into `TopNav`'s `notificationBell` slot rather than imported inside
 * `top-nav.tsx` itself — that file must stay domain-agnostic/fetch-free per
 * its own JSDoc, so this layout (which already knows about feature modules,
 * e.g. via `getCurrentUser`) is the composition point instead, per AC3's
 * "reachable from anywhere" requirement being satisfied at the one shell
 * every authenticated page renders through.
 *
 * **Phase 4c addition (docs/product/customization.md, "Theme & Accent
 * Color" capability):** this layout also resolves the caller's saved accent
 * color (`getUserPreference`, Settings' own Server-Component-direct-call
 * read — same "no client-refetchable endpoint" contract
 * `TimezoneAutoCapture` already relies on) and applies it via a
 * `data-accent="<value>"` attribute on the shell's outer wrapper below. This
 * is the mounting point for the *effect* of Settings' Accent Color picker
 * (`/settings/appearance`) — the picker itself only writes the preference;
 * every authenticated route rendered through this layout is what actually
 * shows it, satisfying AC4's "applies consistently everywhere the product
 * uses [the] primary/accent color token," not just the Dashboard page.
 * `src/app/globals.css`'s own `[data-accent="..."]` block is what the
 * attribute set here composes with — see that file's comment for exactly
 * which CSS custom properties each preset overrides and why. A user who
 * never sets an accent color (`accentColor` is `null`) gets no `data-accent`
 * attribute at all (React omits an attribute whose value is `undefined`),
 * so none of those overrides apply and the product's current default look
 * is unchanged, per that capability's own "never sets an accent color" Edge
 * Case.
 *
 * **Phase 5a addition (docs/architecture/phase-5a-technical-design.md §2):**
 * `Sidebar`/`TopNav`/`BottomNav`/`children` composition now lives in
 * `./dashboard-shell.tsx`, a thin Client Component — `BottomNav`'s "More"
 * button and `TopNav`'s hamburger `Sheet` need to share one lifted
 * `mobileNavOpen` boolean (see that file's own JSDoc for the full reasoning),
 * which requires `useState`, unavailable in this Server Component. This
 * layout still resolves the user/preferences and stays a Server Component —
 * only the boolean-sharing chrome composition moved out.
 *
 * **Phase 4c release-gate fix (docs/release/phase-4c-notes.md Section 1,
 * "Currency Display is not wired to any surface outside its own settings-page
 * preview"):** this layout also threads the same `preference.currencyDisplay`
 * value into a `CurrencyPreferenceProvider` (`./currency-preference-provider.tsx`)
 * wrapping the entire shell below — the mounting point for every Client
 * Component's `useCurrencyDisplay()`/`useFormatCurrency()` read, exactly one
 * `getUserPreference` call shared with the accent-color read above, never a
 * second fetch. Server Components still need their own `getUserPreference`
 * call (or a `currency` prop threaded down from one) since they can't consume
 * a Context — see that provider file's own JSDoc for the full split.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  const preference = await getUserPreference(user.id)

  return (
    <div
      className="flex h-svh overflow-hidden"
      data-accent={preference.accentColor ?? undefined}
    >
      <CurrencyPreferenceProvider currency={preference.currencyDisplay}>
        {/* Phase 4c (phase-4c-technical-design.md §3.3): renders no visible UI
            of its own — see its own JSDoc. Mounted here, alongside where
            `ThemeProvider` is mounted (root layout), per that section's
            "component built by the feature owner, mounted by the Frontend Lead
            in the authenticated layout" split. */}
        <TimezoneAutoCapture />
        <DashboardShell
          user={{ name: user.name, email: user.email }}
          notificationBell={<NotificationBell />}
        >
          {children}
        </DashboardShell>
      </CurrencyPreferenceProvider>
    </div>
  )
}
