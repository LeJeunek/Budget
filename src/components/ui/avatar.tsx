"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn(
        "aspect-square size-full rounded-full object-cover",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      // Accessibility fix (docs/testing/e2e/accessibility-run-report.md
      // finding #1, axe `color-contrast`, serious): `text-muted-foreground`
      // on `bg-muted` measured 4.34:1 in light mode — below the 4.5:1 WCAG
      // 2.1 AA floor (`phase-5a-accessibility-responsive.md` AC1). This is
      // the top-nav user-menu initials fallback, rendered on every
      // authenticated route, so the fix belongs here at the primitive
      // rather than patched at `top-nav.tsx`'s call site.
      //
      // `text-foreground` replaces it: computed against both themes'
      // `--muted`/`--foreground` tokens (`src/app/globals.css`) —
      //   light: foreground #0a0a0a on muted #f5f5f5  ≈ 18.2:1
      //   dark:  foreground #fafafa on muted #262626  ≈ 14.5:1
      // both comfortably clear 4.5:1, and `text-foreground` is an
      // already-established, non-accent-customizable token (not touched by
      // `[data-accent="..."]` overrides in globals.css), so this reads
      // correctly under every accent-color preset too.
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-foreground group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      // Same `bg-muted`/`text-*` pairing as `AvatarFallback` above (this
      // component has no current consumer in the app, but shares the
      // identical contrast bug by construction) — kept in sync with that
      // fix (`text-foreground`, not `text-muted-foreground`) so a future
      // consumer never reintroduces the same finding.
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}
