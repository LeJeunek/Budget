/**
 * DemoModeBanner — persistent, non-dismissible "you're looking at a demo"
 * landmark, built for the public `/demo` route
 * (docs/architecture/public-demo-technical-design.md §6.2, public-demo.md
 * Capability 4).
 *
 * Mounted once by `demo-shell.tsx` so it is structurally present on every
 * reachable `/demo` page without any individual page needing to remember to
 * render it (Capability 4 AC1). Static and always-present — no dismiss
 * control, no `aria-live` region — per AC3's "not a blocking modal or
 * interstitial... but persistent enough that trust is never in question"
 * and the spec's own Edge Case guidance: "a static, always-present landmark
 * is sufficient; it does not need to re-announce itself on every page
 * change."
 *
 * `role="region"` + `aria-label` gives this a genuine, discoverable
 * landmark region (not merely a styled `<div>`), satisfying AC4's WCAG 2.1
 * AA floor for "announced sensibly to assistive technology." The info icon
 * is `aria-hidden` — the message is conveyed by the text alone, never by
 * color, per AC4's "never conveyed by color alone."
 *
 * Purely presentational: no props, no state, no fetch. A plain Server
 * Component is enough — nothing here needs the client runtime.
 *
 * Usage:
 * ```tsx
 * <DemoModeBanner />
 * ```
 */

import { Info } from "lucide-react"

export function DemoModeBanner() {
  return (
    <div
      role="region"
      aria-label="Demo mode notice"
      className="flex shrink-0 items-center gap-2 border-b bg-muted px-4 py-2 text-sm text-foreground"
    >
      <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p>
        You&apos;re viewing a demo of FinanceOS populated with fictional,
        sample data. Nothing here is real, and nothing you do on this page
        is saved.
      </p>
    </div>
  )
}
