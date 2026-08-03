// Flow: Reports — generates a report via the Reports page's real
// type/period picker and confirms generation succeeds end to end (the
// download actually fires, with no failure). Uses the default Monthly
// Report selection (report-type-select.tsx's `createDefaultReportSelection`
// — the current month-to-date, already a complete, valid selection per that
// file's own "current month is itself a valid... selection" comment), so
// this flow's own interaction is choosing to generate, not first assembling
// a valid selection — see flows/export.spec.ts for a flow that also
// switches report type/period and inspects the downloaded artifact itself.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Reports", () => {
  test("generates the default Monthly Report and the download succeeds", async ({ page }) => {
    await page.goto("/reports")
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible()

    const downloadButton = page.getByRole("button", { name: "Download report" })
    await expect(downloadButton).toBeEnabled()

    // 45s — see flows/export.spec.ts's identical comment for why (dev-mode
    // Turbopack's first-hit lazy-compile cost on `GET /api/reports`).
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      downloadButton.click(),
    ])

    expect(download.suggestedFilename()).toMatch(/monthly.*\.pdf$/i)
    expect(await download.failure()).toBeNull()
  })
})
