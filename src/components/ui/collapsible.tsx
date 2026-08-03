"use client"

/**
 * Collapsible — thin, unstyled wrapper over Radix's `Collapsible` primitive.
 * No Framer Motion, no animation, no FinanceOS-specific visual opinion —
 * matches `components/ui/dialog.tsx`/`sheet.tsx`'s existing convention
 * exactly (raw Radix semantics wrapper, `data-slot` markers, arbitrary props
 * forwarded straight through to the underlying primitive).
 *
 * This is the accessibility-critical layer only: Radix generates and links
 * the matching `aria-expanded`/`aria-controls`/id pair between
 * `CollapsibleTrigger` and `CollapsibleContent` automatically, with zero
 * opt-in configuration — closing the exact gap
 * (`features/analytics/components/subscriptions-list.tsx`'s pre-5b
 * "dismissed merchants" toggle had `aria-expanded` but no `aria-controls`)
 * this primitive exists to fix everywhere, for every consumer old and new.
 *
 * The actual animated, product-level "expandable card" experience —
 * Framer Motion's height/opacity reveal, the shared reduced-motion branch —
 * is a separate, higher layer:
 * `components/shared/motion/expandable-card.tsx`. See
 * `docs/architecture/phase-5b-technical-design.md` §3.1 for the full
 * reasoning behind this two-tier split (mirroring `ui/sheet.tsx`'s raw Radix
 * `Dialog` vs. a feature's own composition on top of it).
 *
 * Usage:
 * ```tsx
 * <Collapsible defaultOpen={false}>
 *   <CollapsibleTrigger asChild>
 *     <Button variant="ghost" size="sm">Toggle</Button>
 *   </CollapsibleTrigger>
 *   <CollapsibleContent>
 *     <p>Disclosed content...</p>
 *   </CollapsibleContent>
 * </Collapsible>
 * ```
 */

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
