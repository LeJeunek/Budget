// Flow: Account management — creates a new account via the "Add account"
// dialog and confirms it renders in the Active accounts list with the
// values that were entered. `AccountGrid`'s plain CSS grid layout
// (app/(dashboard)/accounts/page.tsx) has no mobile/desktop dual-rendering
// concern the way Transactions' ResponsiveDataTable does, so this flow runs
// across every viewport project without restriction.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"
import { uniqueLabel } from "../support/unique"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Account management", () => {
  test("creates a new account and it appears in the Accounts list", async ({ page }) => {
    const name = uniqueLabel("E2E Flow Account")

    await page.goto("/accounts")
    await page.getByRole("button", { name: "Add account" }).click()

    const dialog = page.getByRole("dialog", { name: "Add account" })
    await expect(dialog).toBeVisible()

    // Type keeps its sensible default (Checking) — only the fields that
    // make this account identifiable/assertable are filled in.
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByLabel("Balance").fill("1234.56")
    await dialog.getByRole("button", { name: "Add account" }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText("Account created")).toBeVisible()

    // Scoped to this account's own Card (`data-slot="card"`, components/ui/
    // card.tsx) rather than a page-wide text search: re-running this suite
    // against the same seeded database leaves every prior run's own "E2E
    // Flow Account ..." row in place, and this exact balance can otherwise
    // also match unrelated page text (e.g. a Reconciliation Prompt's own
    // "Based on your transactions..." figure) — this card is unambiguous.
    const card = page.locator('[data-slot="card"]').filter({ hasText: name })
    await expect(card).toBeVisible()
    await expect(card.getByText(/\$1,234\.56/)).toBeVisible()
  })
})
