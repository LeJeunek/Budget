// Shared axe-core wiring — a single helper, not 24+ hand-written axe setups,
// per docs/architecture/phase-5a-technical-design.md §1.3.
import AxeBuilder from "@axe-core/playwright"
import type { AxeResults } from "axe-core"
import type { Page } from "@playwright/test"

/**
 * WCAG 2.1 AA is the binding target level app-wide (Accessibility AC1,
 * docs/product/phase-5a-accessibility-responsive.md) — `withTags` is
 * axe-core's own rule-tag taxonomy, the mechanism that operationalizes that
 * bar, not a new invention.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/**
 * Runs an axe-core scan of the current page's already-rendered DOM. Callers
 * are responsible for waiting on a stable landmark (e.g. `<main>` visible)
 * before calling this, rather than this helper adding its own fixed
 * timeout — see accessibility/route-a11y.spec.ts.
 *
 * Callers assert zero "critical"/"serious" violations (the release-gating
 * bar, Accessibility AC2); "moderate"/"minor" findings are the caller's
 * responsibility to collect and write to docs/testing/e2e/ as a named,
 * owned backlog artifact — never silently dropped, never failing the run.
 *
 * Phase 5b addition: waits for every currently-running Web Animation
 * (`document.getAnimations()` — this covers both Framer Motion's and plain
 * CSS transitions/animations, since Framer Motion drives the real Web
 * Animations API under the hood) to finish before scanning. Without this, a
 * scan that lands mid-flight through `(dashboard)/template.tsx`'s
 * page-transition fade (or any other Phase 5b entrance animation) can catch
 * an element at a partially-transparent, in-transit color rather than its
 * true, settled one — axe's own `color-contrast` check computes the actual
 * rendered/blended color at the instant it runs, so a genuinely-passing
 * element can read as a spurious contrast failure purely because the scan
 * landed mid-fade, not because anything is actually wrong with its final,
 * at-rest state. Confirmed empirically: `accessibility/accent-contrast.spec.ts`
 * intermittently failed a real `bg-primary` button's contrast this way
 * before this wait was added, on a route this exact fade wraps. Bounded at
 * 2s so a genuinely stuck/infinite animation (a bug in its own right) still
 * surfaces as a real timeout rather than hanging the suite forever.
 */
export async function checkAccessibility(page: Page): Promise<AxeResults> {
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState !== "running"),
      { timeout: 2000 },
    )
    .catch(() => {
      // A still-running animation past the timeout is itself worth surfacing
      // as a real, separate finding (a stuck/infinite animation) — not
      // something this helper should silently swallow by proceeding to scan
      // anyway, since that would just reintroduce the exact flake this wait
      // exists to close. Let the scan run regardless; if the underlying
      // animation truly never settles, the resulting contrast finding is a
      // legitimate one to investigate, not a false positive.
    })

  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
}
