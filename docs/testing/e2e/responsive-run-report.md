# E2E Run Report — Responsive (`tests/e2e/responsive/route-breakpoints.spec.ts`)

**Run date:** 2026-08-02
**Command:** `npx playwright test responsive`
**Environment:** local dev server (`npm run dev`, Turbopack), Chromium, all three viewport projects — `mobile` (375x667), `tablet` (820x1180), `desktop` (1440x900)
**Fixture account:** `e2e-test@lkbudget.dev` (ordinary routes), `e2e-test-admin@lkbudget.dev` (6 `/admin/*` routes)

## Result

**92 tests run (2 setup logins + 30 routes x 3 viewport projects). 92 passed, 0 failed.**

Every one of the 24 route inventory's 30 individually-testable paths (see `tests/e2e/support/route-inventory.ts`'s own header comment on the 24-vs-30 count) passed `document.documentElement.scrollWidth <= window.innerWidth` at all three named breakpoints — the automatable half of Responsive AC2's "no horizontal scroll of the page shell" bar. No horizontal-page-scroll regression was found anywhere in the current route inventory at any of the three binding breakpoints.

## What this run does NOT cover

Per this suite's own design (`phase-5a-technical-design.md` §1.4) and Responsive AC2's own two-part bar, this automated check covers only the "no horizontal page-shell scroll" half. It does **not** detect:
- Clipped or overlapping content that doesn't produce a wider scrollWidth (e.g. text truncated behind another element, a dialog whose content is cut off but doesn't force page-level scroll)
- Functionally-unreachable controls (a button rendered off-screen within a fixed-height container, a hover-only affordance with no touch equivalent)
- 44x44px touch-target sizing (Responsive AC5)
- Whether Transactions/Admin/Bills'/Recurring-Income's occurrence-history tables actually render their documented card-list mobile treatment below 640px (that treatment did not exist in the app as of this run — Phase 5a's responsive implementation work is a separate, parallel dispatch to this one)

These remain the Bug Hunter's manual cross-breakpoint pass, per the product spec's own Definition of Done ("this suite narrows, but does not eliminate, that manual surface").

## Fixes made to the test suite itself during this run

Same two fixes as the accessibility run (`.env` loading in `playwright.config.ts`, raised `expect`/`navigationTimeout` for dev-mode cold-compile + `/analytics`'s AI-narrative generation latency, and the `/login` wait-condition fix) — see `docs/testing/e2e/accessibility-run-report.md` for the full detail; not repeated here since both specs share the same `playwright.config.ts`.
