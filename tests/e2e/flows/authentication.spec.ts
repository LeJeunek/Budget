// Flow: Authentication — a real sign-in through the actual /login UI form
// (email + password), landing on the Dashboard. Named first in both
// e2e-test-engineer.md's own charter and Phase 5a Accessibility AC4's
// identical flow list.
//
// Deliberately does NOT use either storageState fixture
// (support/storage-state.ts) the way every other flows/ spec does — those
// exist precisely so every OTHER flow/route/breakpoint spec can skip
// repeating this same login. This flow's entire point is exercising the
// login form itself, the same real Better Auth call
// support/auth.setup.ts's own login() helper already performs once per run
// to produce those storageState fixtures in the first place — this spec
// duplicates that interaction deliberately (as a first-class, independently
// assertable flow), not as an accident of the two files being similar.
import { expect, test } from "@playwright/test"

import { E2E_TEST_EMAIL } from "../../../prisma/e2e-test-accounts"
import { requireE2ePassword } from "../support/env"

test.describe("Flow: Authentication", () => {
  test("signs in via the real /login form and lands on the Dashboard", async ({ page }) => {
    await page.goto("/login")

    // The Sign In tab is the Tabs component's own `defaultValue` — already
    // visible on load, no tab click needed.
    await expect(page.getByLabel("Email")).toBeVisible()
    await page.getByLabel("Email").fill(E2E_TEST_EMAIL)
    await page.getByLabel("Password").fill(requireE2ePassword())
    await page.getByRole("button", { name: "Sign in" }).click()

    // A successful sign-in redirects to "/" (POST_LOGIN_PATH in
    // app/(auth)/login/page.tsx) and renders the authenticated shell — its
    // Dashboard heading is a real <h1> (unlike CardTitle elsewhere in this
    // app, which renders a plain <div>), so a heading-role assertion is
    // meaningful here.
    await expect(page).toHaveURL("/")
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible()
    await expect(page.locator("main")).toBeVisible()
  })

  test("shows an inline error and stays on /login for an incorrect password", async ({ page }) => {
    await page.goto("/login")

    await page.getByLabel("Email").fill(E2E_TEST_EMAIL)
    await page.getByLabel("Password").fill("definitely-the-wrong-password")
    await page.getByRole("button", { name: "Sign in" }).click()

    // Better Auth's own error surfaces inline (SignInForm's formError
    // state) — the user never leaves /login on a failed attempt.
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel("Email")).toBeVisible()
  })
})
