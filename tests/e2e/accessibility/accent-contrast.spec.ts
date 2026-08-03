// Regression coverage for the Phase 5a Release Manager's first-pass REJECT
// (docs/release/phase-5a-notes.md, Section 1): Accessibility AC5 requires
// every accent-color preset's contrast to be "audited," but no automated
// test this phase built ever actually selected a non-default accent — the
// gap that let 5 of 6 presets ship failing WCAG 2.1 AA. This file closes
// that gap per the Release Manager's own suggested fix: parametrize over
// every `ACCENT_COLOR_OPTIONS` preset (src/features/settings/server/validation.ts)
// and assert zero critical/serious axe violations with each one actually
// applied — not a one-time manual check, so a future preset (or a future
// re-darkening) regressing this is caught by the suite, not a human.
//
// Runs on the "desktop" Playwright project only, matching
// accessibility/route-a11y.spec.ts's own single-project scope.
//
// Sequential (`test.describe.configure({ mode: "serial" })`): each preset
// is applied via the real Settings UI on top of whatever the previous
// iteration left selected, and the final step resets back to "no accent"
// (the product default) so this file never leaves cross-test state behind
// for any other spec that runs against the same seeded ordinary-user
// fixture account.
import { expect, test } from "@playwright/test"

import { checkAccessibility } from "../support/axe"
import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

// Mirrors `ACCENT_COLOR_OPTIONS` (src/features/settings/server/validation.ts)
// — duplicated here rather than imported since no other spec in this suite
// imports application source directly (support/route-inventory.ts and this
// file's siblings only ever import from ./support), and this list is a
// small, code-owned, rarely-changing palette (customization.md AC1: "on the
// order of five to eight options"). A future preset added there without a
// matching entry here would simply go unaudited by this file, same as any
// other hand-maintained test fixture — not a silent mismatch risk, since
// `phase-5a-technical-design.md`'s own note on this array already flags it
// as needing a matching update wherever it's mirrored.
const ACCENT_PRESETS = ["Blue", "Violet", "Emerald", "Amber", "Rose", "Teal"]

test.describe.configure({ mode: "serial" })

test.describe("Accent color presets — zero critical/serious contrast violations", () => {
  test.use({ storageState: ORDINARY_STORAGE_STATE })

  for (const label of ACCENT_PRESETS) {
    test(`${label} preset clears WCAG 2.1 AA on a real bg-primary button`, async ({ page }) => {
      await page.goto("/settings/appearance")
      const swatch = page.getByRole("button", { name: new RegExp(`^${label}\\b`) })
      await swatch.click()
      await expect(swatch).toHaveAttribute("aria-pressed", "true")

      // The mutation only updates the client-side TanStack Query cache
      // (use-user-preference.ts's `onSuccess`) — the `data-accent` attribute
      // itself is set by (dashboard)/layout.tsx, a Server Component, so a
      // full reload is what actually picks up the newly-persisted
      // preference for this test, not client-side navigation alone.
      await page.reload()

      await page.goto("/transactions")
      const addTransactionButton = page.getByRole("button", { name: "Add transaction" })
      await expect(addTransactionButton).toBeVisible()

      const results = await checkAccessibility(page)
      const contrastViolations = results.violations.filter(
        (violation) =>
          violation.id === "color-contrast" &&
          ["critical", "serious"].includes(violation.impact ?? ""),
      )

      expect(
        contrastViolations,
        contrastViolations
          .map((v) => `[${v.impact}] ${v.id}: ${v.nodes.length} node(s)`)
          .join("\n"),
      ).toHaveLength(0)
    })
  }

  test("reset accent back to the product default", async ({ page }) => {
    await page.goto("/settings/appearance")
    // The last preset applied above (Teal) is still selected — clicking its
    // own swatch again is this UI's documented toggle-off affordance
    // (accent-color-picker.tsx: "selecting the already-active preset clears
    // it back to the product default"), leaving no accent-color state
    // behind for any other spec that reuses this fixture account.
    const lastPreset = ACCENT_PRESETS[ACCENT_PRESETS.length - 1]
    const swatch = page.getByRole("button", { name: new RegExp(`^${lastPreset}\\b`) })
    await swatch.click()
    await expect(swatch).toHaveAttribute("aria-pressed", "false")
  })
})
