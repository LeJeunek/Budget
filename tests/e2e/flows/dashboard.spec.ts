// Flow: Dashboard — verifies the Dashboard Overview's key stat cards and
// charts render with real data once signed in (Phase 5a Accessibility AC4's
// "dashboard (`/`)" flow). Read-only by nature: uses the ordinary
// e2e-test@lkbudget.dev fixture account and its one seeded row across every
// domain (prisma/seed-e2e-test-user.ts) rather than creating anything new.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Flow: Dashboard", () => {
  test("renders the Overview's stat cards and charts with real fixture data", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible()

    // The fixture account has real accounts/transactions, so
    // dashboard-overview.md's "brand-new user, zero accounts" empty state
    // (app/(dashboard)/page.tsx's "Connect your first account" prompt) must
    // NOT render — every stat card/chart below should instead.
    await expect(page.getByText("Connect your first account")).toHaveCount(0)

    // StatCard renders its `label` as a plain <span>, not a heading
    // (components/shared/stat-card.tsx) — "Net Worth" is the first stat
    // card dashboard-overview.md's own inventory names.
    await expect(page.getByText("Net Worth", { exact: true })).toBeVisible()
    // At least one real, formatted currency figure is on screen — confirms
    // this page's data pipeline actually resolved numbers, not just labels.
    await expect(page.getByText(/\$[\d,]+\.\d{2}/).first()).toBeVisible()

    // A representative chart from each of the two chart families this page
    // composes (category breakdown, historical trend) — CardTitle renders a
    // plain <div>, not a heading role, so these are text assertions, not
    // heading-role ones. Full per-card/per-route coverage (every card,
    // every a11y rule) is accessibility/route-a11y.spec.ts's job, not this
    // flow's — this is a representative sample confirming the real
    // interaction/data path, not an exhaustive card-by-card sweep.
    await expect(page.getByText("Spending by Category", { exact: true })).toBeVisible()
    await expect(page.getByText("Net Worth History", { exact: true })).toBeVisible()
  })
})
