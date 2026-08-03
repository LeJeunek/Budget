// Flow: Budget creation — sets a monthly budget category allocation via the
// Budgeting planner's inline input (docs/product/budgeting.md AC6-AC9) and
// confirms it both renders immediately and persists across a real reload
// (not just optimistic client state). Uses the ordinary
// e2e-test@lkbudget.dev fixture account; the seed only allocates the "Food"
// category (prisma/seed-e2e-test-user.ts), so this flow targets
// "Transportation" — one of the fixture's 11 default categories
// (features/categories/default-categories.ts) left deliberately unset —
// rather than colliding with the seed's own already-allocated row.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Budget creation", () => {
  test("sets a category allocation and it persists after reload", async ({ page }) => {
    await page.goto("/budgeting")
    await expect(page.getByRole("heading", { name: "Budgeting", exact: true })).toBeVisible()

    const allocationInput = page.getByLabel("Allocated amount for Transportation")
    await allocationInput.fill("150")

    // BudgetCategoryRow saves on blur (no separate Save button, matching
    // this app's inline-edit convention) — Tab moves focus off the input,
    // triggering `setCategoryAllocation`'s Server Action call. The input's
    // own displayed value stays "150" the instant it's typed (React state,
    // independent of the save's own network round trip), so asserting on
    // it alone would not actually confirm the save landed before this test
    // moves on to `page.reload()` below — waiting for the network to go
    // idle here ensures that Server Action call (and the `router.refresh()`
    // it triggers on success) has genuinely completed first.
    await allocationInput.press("Tab")
    await page.waitForLoadState("networkidle")
    await expect(allocationInput).toHaveValue("150")

    // Reload from scratch to confirm real DB persistence, not merely
    // in-memory client state surviving the same page instance.
    await page.reload()
    await expect(page.getByLabel("Allocated amount for Transportation")).toHaveValue("150")
  })
})
