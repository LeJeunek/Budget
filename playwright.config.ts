import fs from "node:fs"

import { defineConfig, devices } from "@playwright/test"

/**
 * Loads `.env` into `process.env` for the Playwright test-runner process
 * itself. Next.js's own dev server (`npm run dev`, this config's own
 * `webServer` below) already loads `.env` automatically — but Playwright's
 * top-level test process (which runs `tests/e2e/support/auth.setup.ts`,
 * reading `process.env.E2E_TEST_USER_PASSWORD` to log in) is a separate
 * Node process that does not. Node's built-in `loadEnvFile` (no `dotenv`
 * dependency needed) mirrors this codebase's existing "generate a real
 * secret in .env, never commit it" convention (.env.example) rather than
 * introducing a second, Playwright-specific secrets mechanism.
 */
if (fs.existsSync(".env")) {
  process.loadEnvFile(".env")
}

/**
 * FinanceOS's Playwright config — repo root, sibling to `vitest.config.ts`,
 * deliberately NOT under `src/` (see `tests/e2e/`'s own placement rationale
 * in docs/architecture/phase-5a-technical-design.md §1.1: a Playwright spec
 * placed under `src/` would also be collected by Vitest's default include
 * glob, corrupting `npm run test`'s own signal).
 *
 * Browser scope: Chromium only, explicitly, for Phase 5a — cross-browser
 * (WebKit/Firefox) is out of scope, not merely deferred, per
 * phase-5a-technical-design.md §1.2 ("don't build the general/configurable
 * version of a capability before a demonstrated need justifies it"). Adding
 * `webkit`/`firefox` projects later, if a real cross-browser bug is found,
 * is a config-only addition — not a rearchitecture.
 *
 * Viewport scope: three named projects, matching the three binding
 * breakpoints Responsive AC1 fixes (mobile < 640px, tablet 640-1024px,
 * desktop >= 1024px) — see phase-5a-technical-design.md §1.2's own
 * illustrative config. Every spec file under `tests/e2e/` runs once per
 * project (Playwright's own fan-out mechanism), so `responsive/
 * route-breakpoints.spec.ts` gets its per-breakpoint coverage for free with
 * no extra looping in the spec itself.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  // `webServer` below targets `npm run dev` (Turbopack dev mode, not a
  // production build) deliberately — see that option's own comment.
  // Turbopack compiles each route's bundle lazily, on its first request per
  // dev-server lifetime; a route's very first navigation in a given run has
  // been measured taking ~10s (a cold "/" -> /login redirect alone), well
  // past Playwright's 5s default assertion timeout — not a suite bug, an
  // accurate reflection of dev-mode's own lazy-compile cost. 20s covers the
  // slowest observed cold-compile route with headroom; every already-
  // compiled route resolves far faster than this ceiling in practice.
  expect: { timeout: 20_000 },
  timeout: 60_000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // 45s, not Playwright's 30s default: a real, observed finding, not
    // guesswork — /analytics's Spending Insights card triggers a
    // server-side AI-narrative generation call on render (with its own
    // internal safety-check retry loop), measured taking 13-31s end to end
    // even after Turbopack's own cold-compile cost is excluded. Worth
    // flagging to the team as a genuine performance characteristic (a
    // Performance Engineer concern, not an E2E-suite one) — this suite
    // works around it rather than silently failing on a slow-but-working
    // page.
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },

  // Real Better Auth login via the actual /login UI form (never a bypass),
  // executed once per run and persisted as storageState — see
  // support/auth.setup.ts and phase-5a-technical-design.md §1.5.
  //
  // `accessibility/route-a11y.spec.ts` is deliberately restricted to the
  // "desktop" project only (`testIgnore` on mobile/tablet below): §1.4's
  // "one generated test per ROUTE_INVENTORY entry" would otherwise become
  // three tests per route (once per viewport project) purely as a side
  // effect of the viewport fan-out §1.2 introduces for the *responsive*
  // suite — axe-core's own WCAG-tag rules are DOM/ARIA-structural, not
  // viewport-dependent, so tripling that suite's run count/report volume
  // would add run time without adding real coverage.
  // `responsive/route-breakpoints.spec.ts` has no such restriction — its
  // entire point is running once per viewport project (§1.2/§1.4).
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 667 } },
      testIgnore: [/auth\.setup\.ts/, /accessibility\//],
      dependencies: ["setup"],
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } },
      testIgnore: [/auth\.setup\.ts/, /accessibility\//],
      dependencies: ["setup"],
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
