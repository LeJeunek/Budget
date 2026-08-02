"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

interface TabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  /**
   * Set to `false` when this `Tabs` instance has no corresponding
   * `TabsContent` anywhere in the tree — i.e. it's being used as a
   * segmented-control/toggle (a value changes, e.g. a URL search param,
   * and something *outside* this component tree re-renders) rather than
   * the ordinary tab-panel pattern (`Tabs` switching visible `TabsContent`
   * panels of its own).
   *
   * Root cause (docs/testing/e2e/accessibility-run-report.md finding #5,
   * axe `aria-valid-attr-value`, CRITICAL — the run's only critical-impact
   * finding): Radix's `TabsTrigger` unconditionally computes
   * `aria-controls={${baseId}-content-${value}}` (confirmed by direct read
   * of `@radix-ui/react-tabs`'s source, `TabsTrigger`'s render) — it has no
   * way to know whether a matching `TabsContent` will ever actually be
   * rendered anywhere in the tree, since `TabsTrigger` and `TabsContent`
   * don't share a live registry of which values are mounted. When a
   * consumer renders `Tabs`/`TabsList`/`TabsTrigger` with zero
   * `TabsContent` (Analytics' `ReportingPeriodSelector`, per this run's
   * concrete instance — it changes a `?period=` URL param and lets the
   * whole Server Component page re-render, rather than swapping a DOM
   * panel), every `TabsTrigger`'s `aria-controls` permanently references
   * an id that has never existed and never will — an ARIA relationship
   * defect for real assistive-tech users (a screen reader announcing "tab,
   * controls [nothing]"), not merely an axe-rule technicality or a
   * generated-id character-grammar quirk. This is NOT a Radix version bug:
   * every other current consumer of this file (12 of 13, confirmed by
   * repo-wide search) correctly pairs each `TabsTrigger` with a matching
   * `TabsContent`, so `aria-controls` resolves for them exactly as
   * intended.
   *
   * Fix: set `hasAssociatedPanel={false}` on a `TabsTrigger` used without
   * any `TabsContent`. Internally, this passes `aria-controls={undefined}`
   * through to Radix's `TabsPrimitive.Trigger` — consumer-supplied props
   * are spread *after* Radix's own internally-computed `aria-controls` in
   * its render (confirmed directly in `@radix-ui/react-tabs`'s source), so
   * an explicit `undefined` here overrides Radix's default and React omits
   * the attribute entirely, rather than rendering a dangling reference.
   * This has always been technically possible by passing `aria-controls`
   * through this component's existing prop passthrough — this named,
   * documented prop exists so the fix is self-explanatory and discoverable
   * at any current or future contentless-`Tabs` call site, instead of
   * requiring a future engineer to rediscover Radix's prop-spread-order
   * behavior from scratch (or, worse, "fix" this by passing
   * `aria-controls=""`, which is itself an invalid, still-dangling ARIA
   * reference — an empty ID token — not a fix).
   *
   * Defaults to `true` — zero behavior change for every existing
   * `TabsTrigger` usage that already pairs correctly with `TabsContent`.
   *
   * Usage (the one real 5a call site needing this — not made in this pass,
   * since `features/analytics/components/reporting-period-selector.tsx` is
   * outside `components/ui`'s ownership; flagged for that file's owner):
   * ```tsx
   * <TabsTrigger value={option.value} hasAssociatedPanel={false}>
   *   {option.label}
   * </TabsTrigger>
   * ```
   */
  hasAssociatedPanel?: boolean
}

function TabsTrigger({
  className,
  hasAssociatedPanel = true,
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
      // Deliberately spread *after* `...props`, and deliberately only
      // included as a key at all when `hasAssociatedPanel` is `false` — see
      // this component's own `TabsTriggerProps.hasAssociatedPanel` JSDoc.
      // `{...props}` alone (the default, `hasAssociatedPanel === true`
      // case) never introduces an `aria-controls` key unless a consumer
      // explicitly supplied one, so Radix's own internally-computed
      // `aria-controls` continues to apply exactly as before for every
      // existing, correctly-paired `TabsTrigger`/`TabsContent` consumer —
      // spreading `{}` here is a deliberate no-op, not dead code. Only when
      // `hasAssociatedPanel` is `false` does this add an explicit
      // `aria-controls: undefined` key, which — because object spread lets
      // a later key win, and this is the last spread in this element,
      // ahead of Radix's own internal default assignment inside
      // `TabsPrimitive.Trigger` itself — overrides Radix's default and
      // React omits the attribute entirely.
      {...(hasAssociatedPanel ? {} : { "aria-controls": undefined })}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
