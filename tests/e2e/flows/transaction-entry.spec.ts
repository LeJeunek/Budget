// Flow: Transaction entry — opens the "Add transaction" dialog, fills it
// out, submits, and confirms the new row actually appears in the
// Transactions list (not just that the dialog closed without error).
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"
import { uniqueLabel } from "../support/unique"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Transaction entry", () => {
  test.beforeEach(({}, testInfo) => {
    // Transactions' table renders through ResponsiveDataTable, which mounts
    // BOTH the desktop <table> and the mobile card-list markup
    // simultaneously (CSS-hidden via `hidden sm:flex`/`sm:hidden`, never
    // DOM-absent) — components/shared/data-table/responsive-data-table.tsx.
    // A `getByRole("row", ...)` assertion below only makes sense against
    // the desktop project restricting this interaction flow to it avoids
    // selector ambiguity between the two parallel renderings, mirroring
    // accessibility/route-a11y.spec.ts's identical desktop-only
    // restriction for the same underlying reason.
    test.skip(
      testInfo.project.name !== "desktop",
      "Transactions' table has a distinct mobile card-list rendering — this flow only runs under the desktop project (see comment above).",
    )
  })

  test("adds a transaction and it appears in the Transactions list", async ({ page }) => {
    const merchant = uniqueLabel("E2E Flow Merchant")

    await page.goto("/transactions")
    await page.getByRole("button", { name: "Add transaction" }).click()

    const dialog = page.getByRole("dialog", { name: "Add transaction" })
    await expect(dialog).toBeVisible()

    // Waits for the Account field's real default ("E2E Checking", from
    // useAccounts()) to resolve before typing anything else. This flow
    // originally found a real bug here: `transaction-form.tsx`'s
    // reset-on-open effect used to re-fire (and silently wipe out anything
    // already typed) whenever `accounts` resolved after the dialog was
    // already open. Now fixed at the source (that effect only fires on the
    // actual closed->open transition; the Account field backfills via a
    // narrow, targeted `setValue` instead of a full form reset) — this wait
    // is kept as a defensive assertion that the field's real default
    // genuinely resolves, not a workaround for an open bug.
    await expect(dialog.getByLabel("Account")).toHaveText("E2E Checking")

    // Date/Account/Type/Category all keep their sensible defaults (today,
    // first non-archived account, Expense, No category) — only the two
    // fields that make this row identifiable/assertable are filled in.
    await dialog.getByLabel("Merchant").fill(merchant)
    await dialog.getByLabel("Amount").fill("42.17")
    await dialog.getByRole("button", { name: "Add transaction" }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Added "${merchant}".`)).toBeVisible()

    // TransactionTable's own free-text search (merchant/notes) narrows the
    // list down to just the row this test created. ResponsiveDataTable
    // passes this same toolbar render-prop to BOTH its desktop <table> and
    // its (CSS-hidden at this breakpoint, but still DOM-present) mobile
    // card-list rendering, so two elements share the "Search transactions"
    // aria-label at any given moment — unlike `getByRole`, `getByLabel`
    // does not itself filter out the CSS-hidden one, hence
    // `.filter({ visible: true })`. The desktop table's `<tr>` markup is
    // real, so `getByRole("row", ...)` below has no equivalent ambiguity
    // (the mobile card-list uses `<li>`, not `role="row"`).
    await page.getByLabel("Search transactions").filter({ visible: true }).fill(merchant)
    const row = page.getByRole("row", { name: new RegExp(merchant) })
    await expect(row).toBeVisible()
    await expect(row.getByText("42.17")).toBeVisible()
  })
})
