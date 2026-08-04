"use client"

/**
 * ExpandableCard — the one shared "reveal more detail inline, without
 * navigating to a new page" disclosure primitive (Expandable Cards, Phase
 * 5b), per `docs/architecture/phase-5b-technical-design.md` §3.
 *
 * Composes `components/ui/collapsible.tsx` (Radix's `Collapsible`, for
 * correct `aria-expanded`/`aria-controls` semantics) with a Framer Motion
 * height/opacity reveal, gated by the shared `useReducedMotion()` hook.
 *
 * Renders NO `Card`/border chrome of its own — it is the disclosure
 * mechanism only. This is deliberate, so it composes correctly both inside
 * a `DataTableCardList` row's own existing `<Card>`
 * (`components/shared/data-table/data-table-card-list.tsx`) and inside a
 * feature's own existing outer `<Card>` (e.g.
 * `features/analytics/components/subscriptions-list.tsx`'s "dismissed
 * merchants" toggle) without ever double-nesting a second border/shadow.
 *
 * `open`/`onOpenChange` mirror Radix's own controlled/uncontrolled
 * `Collapsible` contract exactly (`defaultOpen` for uncontrolled use, or
 * `open`+`onOpenChange` for a caller-owned open state) — this component
 * tracks its own local open boolean internally (in sync with whatever mode
 * is in use) purely so the Framer Motion layer below knows exactly when to
 * mount/unmount its reveal; Radix's own `Collapsible` remains the single
 * source of truth for the actual `aria-expanded`/`aria-controls` wiring
 * either way.
 *
 * Each `ExpandableCard` instance owns its own independent state by
 * construction — there is no shared/global expanded-index anywhere in this
 * primitive, so multiple cards can be expanded simultaneously with no
 * special handling.
 *
 * Reduced motion: `aria-expanded` still flips and content still toggles
 * correctly and instantly — only the height/opacity tween itself is
 * skipped (a zero-duration, no `initial`/`exit` states), never the
 * disclosure mechanism itself.
 *
 * `aria-controls`: Radix's own `CollapsibleTrigger` only emits
 * `aria-controls` while `open` is `true` (confirmed by direct read of
 * `node_modules/@radix-ui/react-collapsible/dist/index.mjs`:
 * `"aria-controls": context.open ? context.contentId : void 0`) — so every
 * card's default, as-loaded, collapsed state (every card, on every page
 * load, until a user interacts with it) shipped with no `aria-controls` at
 * all, contradicting Expandable Cards AC2
 * (`docs/testing/bug-reports/expandable-card-aria-controls-missing-while-collapsed.md`).
 * Since `CollapsibleContent forceMount` already guarantees the disclosed
 * region is a real, stable, present DOM node regardless of `isOpen`, this
 * component generates its own stable id via `useId()` and threads it
 * explicitly as `id` on `CollapsibleContent` and `aria-controls` on
 * `CollapsibleTrigger` — both override Radix's own conditional/generated
 * values (each of Radix's own defaults is spread *before* this component's
 * own explicit props in Radix's own prop order, confirmed by the same
 * source read), so the attribute is correct and present in every state, not
 * only once a card has been expanded at least once.
 *
 * Usage:
 * ```tsx
 * // Uncontrolled (the common case)
 * <ExpandableCard
 *   trigger={
 *     <Button variant="ghost" size="sm" className="w-fit gap-1 px-2 text-muted-foreground">
 *       <ChevronRight className="size-4" aria-hidden="true" />
 *       Dismissed merchants (3)
 *     </Button>
 *   }
 * >
 *   <Table>...</Table>
 * </ExpandableCard>
 *
 * // Controlled
 * <ExpandableCard trigger={<Button>Show more</Button>} open={isOpen} onOpenChange={setIsOpen}>
 *   <p>Disclosed detail...</p>
 * </ExpandableCard>
 * ```
 */

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useReducedMotion } from "./use-reduced-motion"
import { EXPANDABLE_CARD_DURATION_MS } from "./constants"

export interface ExpandableCardProps {
  /**
   * Content of the always-visible trigger control (label + chevron, etc.)
   * — NOT a summary of the disclosed content. Rendered via Radix's
   * `asChild`, so this should be a single element (e.g. a `Button`) that
   * forwards its ref and spreads arbitrary props onto its rendered DOM
   * node, the same contract every other `asChild` consumer in this
   * codebase (`DialogClose asChild`, `SheetClose asChild`) already relies
   * on.
   */
  trigger: React.ReactNode
  /** The disclosed detail, hidden until expanded. */
  children: React.ReactNode
  /** Initial open state for uncontrolled use. Defaults to `false`. */
  defaultOpen?: boolean
  /** Controlled open state — pair with `onOpenChange`. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Applied to the outer `Collapsible` root element. */
  className?: string
}

export function ExpandableCard({
  trigger,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: ExpandableCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen
  // Stable regardless of open state, and independent of Radix's own
  // internal `contentId` — this is what lets the trigger below carry a
  // correct `aria-controls` even while collapsed (see this file's own doc
  // comment, "aria-controls" section).
  const contentId = React.useId()

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={className}
    >
      <CollapsibleTrigger asChild aria-controls={contentId}>
        {trigger}
      </CollapsibleTrigger>
      {/* `forceMount` hands unmount/remount timing to the `AnimatePresence`
          below instead of Radix's own default instant show/hide — the
          standard Radix-primitive-plus-Framer-Motion-visual-layer
          composition (§3.1). The `isOpen` gate below is this component's
          own locally-tracked state, always kept identical to the
          `Collapsible`'s own (it's the value driving `open` above), which
          is what lets `AnimatePresence` know exactly when to play the
          enter/exit animation. The explicit `id` overrides Radix's own
          auto-generated `contentId`, matching the `aria-controls` above. */}
      <CollapsibleContent forceMount id={contentId}>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{
                duration: prefersReducedMotion
                  ? 0
                  : EXPANDABLE_CARD_DURATION_MS / 1000,
                ease: "easeOut",
              }}
              style={{ overflow: "hidden" }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  )
}
