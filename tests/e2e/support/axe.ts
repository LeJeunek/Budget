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
 */
export async function checkAccessibility(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
}
