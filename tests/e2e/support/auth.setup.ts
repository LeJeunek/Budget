// Playwright project-based setup — a REAL Better Auth login through the
// actual /login UI form (never a bypass, never a direct API/DB session
// injection), executed once per test run, per account, persisted as
// storageState and reused by every other spec's browser context via
// `test.use({ storageState })`.
//
// Per docs/architecture/phase-5a-technical-design.md §1.5: this is Playwright's
// own first-class mechanism for this, not a FinanceOS-specific workaround —
// zero change to any production code path (no new route, no new header, no
// new environment branch in src/lib/auth.ts). The resulting session is an
// ordinary, DB-backed `Session` row, exactly what production sign-in
// produces, so every subsequent spec exercises the identical authenticated
// code path real traffic does.
//
// Registered as its own Playwright project ("setup" in playwright.config.ts)
// that every viewport project (mobile/tablet/desktop) depends on — Playwright
// runs it exactly once, before those projects' own tests, per run.
import { expect, test as setup } from "@playwright/test"

import { E2E_TEST_ADMIN_EMAIL, E2E_TEST_EMAIL } from "../../../prisma/e2e-test-accounts"
import { ADMIN_STORAGE_STATE, ORDINARY_STORAGE_STATE } from "./storage-state"

function requirePassword(): string {
  const password = process.env.E2E_TEST_USER_PASSWORD
  if (!password) {
    throw new Error(
      "E2E_TEST_USER_PASSWORD is not set — required to log in as the seeded " +
        "e2e-test@/e2e-test-admin@lkbudget.dev accounts (see .env.example). " +
        "Run `npm run seed:e2e` first if these accounts don't exist yet.",
    )
  }
  return password
}

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login")
  // The Sign In tab is the Tabs component's own `defaultValue`, already
  // visible on load — no tab click needed.
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()

  // A successful sign-in redirects to "/" (POST_LOGIN_PATH in
  // app/(auth)/login/page.tsx) and renders the authenticated shell's <main>
  // landmark — waiting on that, not a fixed timeout, per this suite's own
  // "wait for a stable landmark" convention.
  await expect(page.locator("main")).toBeVisible()
}

setup("authenticate as the ordinary e2e test user", async ({ page }) => {
  const password = requirePassword()
  await login(page, E2E_TEST_EMAIL, password)
  await page.context().storageState({ path: ORDINARY_STORAGE_STATE })
})

setup("authenticate as the admin e2e test user", async ({ page }) => {
  const password = requirePassword()
  await login(page, E2E_TEST_ADMIN_EMAIL, password)
  await page.context().storageState({ path: ADMIN_STORAGE_STATE })
})
