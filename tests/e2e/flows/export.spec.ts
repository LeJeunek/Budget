// Flow: Export (Reports PDF download) — a real, end-to-end export: switches
// the report type/period selection (Cash Flow Report, "This Year"), then
// inspects the actual downloaded bytes, not just that a download event
// fired. Distinct from flows/reports.spec.ts (which exercises the default
// generation path and only checks the download didn't fail) — this flow is
// the artifact-verification half named separately in this suite's own
// charter ("Export flows"): confirming the exported file is a genuine PDF,
// with real content, not an empty or corrupt response.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Export", () => {
  test("exports a Cash Flow Report and the downloaded file is a genuine PDF", async ({ page }) => {
    await page.goto("/reports")

    await page.getByLabel("Report type").click()
    await page.getByRole("option", { name: "Cash Flow Report" }).click()

    // The flexible-period control defaults to "This Year"
    // (report-type-select.tsx's `createDefaultReportSelection`) — already a
    // complete, valid selection, so no further period interaction is
    // needed before Download is enabled.
    await expect(page.getByLabel("Period")).toHaveText("This Year")
    const downloadButton = page.getByRole("button", { name: "Download report" })
    await expect(downloadButton).toBeEnabled()

    // 45s, not Playwright's own action-timeout default (15s, per
    // playwright.config.ts's `use.actionTimeout`): this app's dev-mode
    // (Turbopack) lazy-compiles each route on its first request per server
    // lifetime — the same documented characteristic
    // accessibility/route-a11y.spec.ts's own run report cites for
    // `navigationTimeout`, applying identically here since `GET /api/reports`
    // may not have been hit yet by any earlier test in the run.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      downloadButton.click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^cash-flow-.*\.pdf$/i)

    const stream = await download.createReadStream()
    expect(stream, "download produced no readable stream").not.toBeNull()

    const chunks: Buffer[] = []
    for await (const chunk of stream!) {
      chunks.push(chunk as Buffer)
    }
    const fileBuffer = Buffer.concat(chunks)

    // The first 5 bytes of any well-formed PDF are its own format magic
    // number ("%PDF-") — the strongest available confirmation this is a
    // real, intact PDF and not an empty/truncated/error response that
    // merely happened to trigger a download event.
    expect(fileBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    expect(fileBuffer.length).toBeGreaterThan(500)
  })
})
