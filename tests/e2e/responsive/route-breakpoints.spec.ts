// One generated test per ROUTE_INVENTORY entry, fanned out across the three
// viewport projects (mobile/tablet/desktop) automatically by Playwright's
// own `projects` config (playwright.config.ts) — no extra viewport looping
// needed in this file itself, per
// docs/architecture/phase-5a-technical-design.md §1.4.
//
// Asserts `document.documentElement.scrollWidth <= window.innerWidth` — the
// automatable half of Responsive AC2's "no horizontal scroll of the page
// shell" bar. Clipped/overlapping content and functionally-unreachable
// controls are the harder-to-automate other half of AC2 and remain the Bug
// Hunter's manual cross-breakpoint pass (this suite narrows, but does not
// eliminate, that manual surface — §1.4's own framing).
import { expect, test } from "@playwright/test"

import { ADMIN_STORAGE_STATE, ORDINARY_STORAGE_STATE } from "../support/storage-state"
import { ROUTE_INVENTORY } from "../support/route-inventory"

for (const route of ROUTE_INVENTORY) {
  test.describe(route.label, () => {
    test.use({
      storageState: route.requiresAdmin ? ADMIN_STORAGE_STATE : ORDINARY_STORAGE_STATE,
    })

    test(`${route.label} — no horizontal page scroll`, async ({ page }) => {
      await page.goto(route.path)
      // See accessibility/route-a11y.spec.ts's identical wait condition for
      // why /login waits on its Email field rather than a heading role.
      if (route.path === "/login") {
        await expect(page.getByLabel("Email")).toBeVisible()
      } else {
        await expect(page.locator("main")).toBeVisible()
      }

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))

      expect(
        scrollWidth,
        `Page shell scrolls horizontally at this viewport: scrollWidth (${scrollWidth}px) > innerWidth (${innerWidth}px)`,
      ).toBeLessThanOrEqual(innerWidth)
    })
  })
}
