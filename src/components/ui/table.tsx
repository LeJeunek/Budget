"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      // Accessibility fix (docs/testing/e2e/accessibility-run-report.md
      // finding #4, axe `scrollable-region-focusable`, serious): this
      // `overflow-x-auto` wrapper is the actual "scrollable table
      // container" the report's Analytics-suite finding traces to
      // (`features/analytics/components/budget-vs-actual-table.tsx` renders
      // through this exact `Table` primitive, per that file's own JSDoc —
      // "Wrapped in Table's own overflow-x-auto container"). A div with
      // `overflow-x-auto` and no `tabIndex` is not natively reachable by
      // keyboard, so a keyboard-only user has no way to scroll a table
      // wider than its container. `tabIndex={0}` fixes it at this one
      // shared primitive rather than at each of `Table`'s many feature
      // consumers (`DataTable`'s own table markup renders through this same
      // `Table` component, so this fix also covers every `DataTable`/
      // `ResponsiveDataTable` consumer's wide-table case for free) — the
      // identical mechanism `components/shared/scroll-affordance-container.tsx`
      // already established for Analytics' charts, mirrored here.
      //
      // Deliberately `tabIndex={0}` only, not also `role="group"` +
      // `aria-label` (unlike `ScrollAffordanceContainer`): a `<table>`
      // already carries its own semantics and, where a consumer supplies
      // one, its own accessible name via `<TableCaption>` or an adjacent
      // heading — wrapping it in an unnamed `role="group"` would add a
      // second, redundant, unlabeled landmark rather than improve on it.
      // The failing axe rule here (`scrollable-region-focusable`) only
      // requires focusability, not a name, so this stays the minimal fix
      // for the actual finding.
      tabIndex={0}
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
