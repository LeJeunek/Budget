// Flow: Import (Transactions CSV) — exercises the real CSV import dialog
// end to end: choosing a target account, attaching a well-formed CSV file
// (in-memory, via Playwright's own `setInputFiles({ buffer })`, so this
// spec needs no fixture file on disk), submitting, and confirming both the
// summary counts and the newly imported row in the Transactions list.
//
// Distinct from flows/transaction-entry.spec.ts (which exercises the
// single-row "Add transaction" dialog) — this flow is the bulk,
// file-upload path (features/transactions/server/import.ts), a materially
// different code path (its own Route Handler, CSV parsing, dedupe
// detection) worth its own independent coverage per this suite's charter's
// explicit "Import flows" entry.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"
import { uniqueLabel } from "../support/unique"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Import (Transactions CSV)", () => {
  test.beforeEach(({}, testInfo) => {
    // Same rationale as flows/transaction-entry.spec.ts's identical guard —
    // Transactions' table renders both the desktop <table> and mobile
    // card-list markup simultaneously (CSS-hidden, not DOM-absent), so this
    // flow's `getByRole("row", ...)` assertion only runs under the desktop
    // project.
    test.skip(
      testInfo.project.name !== "desktop",
      "Transactions' table has a distinct mobile card-list rendering — this flow only runs under the desktop project (see comment above).",
    )
  })

  test("imports a CSV file and the new row appears in the Transactions list", async ({ page }) => {
    const merchant = uniqueLabel("E2E Flow CSV Merchant")
    const today = new Date().toISOString().slice(0, 10)
    // Matches import.ts's REQUIRED_COLUMNS ("date", "merchant", "amount")
    // plus the optional "category"/"notes" columns — a negative amount is a
    // real expense row, consistent with every other flow's fixture data.
    const csvContent = `date,merchant,amount,category,notes\n${today},${merchant},-12.34,Entertainment,E2E CSV import test\n`

    await page.goto("/transactions")
    await page.getByRole("button", { name: "Import CSV" }).click()

    const dialog = page.getByRole("dialog", { name: "Import transactions from CSV" })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel("Account").click()
    await page.getByRole("option", { name: "E2E Checking" }).click()

    await dialog.getByLabel("CSV file").setInputFiles({
      name: "e2e-flow-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    })

    await dialog.getByRole("button", { name: "Import" }).click()

    // ImportDialog's own summary line: "<N> imported, <N> duplicate(s)
    // skipped, <N> error(s)." — one clean row, no duplicates, no errors.
    await expect(dialog.getByText(/1 imported/)).toBeVisible()
    await expect(dialog.getByText(/0 duplicates? skipped/)).toBeVisible()
    await expect(dialog.getByText(/0 errors?\.$/)).toBeVisible()

    // Two elements in this dialog share the accessible name "Close": the
    // footer's own text button (DialogFooter's `{summary ? "Close" :
    // "Cancel"}` button, import-dialog.tsx) and DialogContent's built-in
    // icon-only close control (components/ui/dialog.tsx's own `<XIcon>` +
    // `sr-only` "Close" text) — `.first()` is the footer button, since it
    // renders as part of `children` before that built-in control does.
    await dialog.getByRole("button", { name: "Close" }).first().click()
    await expect(dialog).toBeHidden()

    // `.filter({ visible: true })`: see flows/transaction-entry.spec.ts's
    // identical comment — ResponsiveDataTable renders this same "Search
    // transactions"-labeled input twice (desktop table + CSS-hidden mobile
    // card-list), and `getByLabel` doesn't filter to the visible one on its
    // own the way `getByRole` does.
    await page.getByLabel("Search transactions").filter({ visible: true }).fill(merchant)
    const row = page.getByRole("row", { name: new RegExp(merchant) })
    await expect(row).toBeVisible()
    await expect(row.getByText("12.34")).toBeVisible()
  })
})
