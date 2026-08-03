// Flow: Goals — creates a new Savings Goal via the "Add goal" dialog and
// confirms it renders in the Active goals list with the values entered.
// `GoalGrid`'s plain CSS grid layout (app/(dashboard)/goals/page.tsx) has no
// mobile/desktop dual-rendering concern the way Transactions'
// ResponsiveDataTable does, so this flow runs across every viewport
// project without restriction.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"
import { uniqueLabel } from "../support/unique"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Goals", () => {
  test("creates a savings goal and it appears in the Goals list", async ({ page }) => {
    const name = uniqueLabel("E2E Flow Goal")

    await page.goto("/goals")
    await page.getByRole("button", { name: "Add goal" }).click()

    const dialog = page.getByRole("dialog", { name: "Add goal" })
    await expect(dialog).toBeVisible()

    // Target date / planned monthly contribution are both optional
    // (goal-form.tsx) — only the required fields are filled in.
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByLabel("Target amount").fill("2500")
    await dialog.getByRole("button", { name: "Add goal" }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText("Goal created")).toBeVisible()

    // Scoped to this goal's own Card (`data-slot="card"`, components/ui/
    // card.tsx): re-running this suite against the same seeded database
    // leaves every prior run's own "E2E Flow Goal ..." row in place (each
    // with its own distinct target amount), so a page-wide text search
    // isn't reliably unique — this card is. GoalCard itself also renders
    // "$2,500.00" twice within one card ("... of $2,500.00" and "$2,500.00
    // remaining"), hence `.first()`.
    const card = page.locator('[data-slot="card"]').filter({ hasText: name })
    await expect(card).toBeVisible()
    // GoalCard renders "$0.00 of $2,500.00" for a brand-new goal with no
    // contributions yet — asserting the target-amount figure confirms the
    // real value round-tripped through the server, not just the name.
    await expect(card.getByText(/\$2,500\.00/).first()).toBeVisible()
  })
})
