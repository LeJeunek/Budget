# E2E Run Report — Accessibility (`tests/e2e/accessibility/route-a11y.spec.ts`)

**Run date:** 2026-08-02
**Command:** `npx playwright test --project=desktop accessibility`
**Environment:** local dev server (`npm run dev`, Turbopack), Chromium, `desktop` viewport project (1440x900)
**Fixture account:** `e2e-test@lkbudget.dev` (ordinary routes), `e2e-test-admin@lkbudget.dev` (6 `/admin/*` routes) — both seeded by `npm run seed:e2e` + `npm run grant:admin -- e2e-test-admin@lkbudget.dev`

## Result

**32 tests run (2 setup logins + 30 routes). 8 passed, 24 failed.**

This is the first accessibility audit this codebase has ever run (Risk #41) — every failure below is a genuine, newly-discovered finding against real, rendered app markup, not a suite bug. No production code was modified to produce or "fix" these results, per this role's charter.

### Passing routes (8)
- Both `auth.setup.ts` logins (real Better Auth sign-in through the `/login` form)
- `/login` itself
- `/admin`, `/admin/users`, `/admin/audit-log`, `/admin/feature-flags`, `/admin/categories`

### Failing routes (24) — zero critical/serious violations was NOT met

Every one of the 24 non-admin authenticated routes (Dashboard, Accounts, Transactions list/detail, Budgeting, Savings Goals list/detail, Bills list/detail, Recurring Income list/detail, Calendar v2, Debt Tracker, Investments list/detail, Analytics, Reports, Financial Goals list/detail, Financial Health Score, all three Settings pages, `/admin/demo-data`) failed on **at least one "serious" or "critical" axe-core finding**. The recurring root causes, by frequency:

1. **`color-contrast` (serious) — the top-nav user-menu avatar fallback initials ("ET"), present on every authenticated page.**
   `<span data-slot="avatar-fallback" class="... bg-muted text-sm text-muted-foreground ...">ET</span>` — measured contrast 4.34:1 against the required 4.5:1 (`text-muted-foreground` `#737373` on `bg-muted` `#f5f5f5`). This is the single highest-frequency finding — it alone accounts for the majority of the 24 failing routes, since it's part of the global `TopNav` chrome rendered on every authenticated route.

2. **`color-contrast` (serious) — destructive-variant buttons/badges** (e.g. `Financial Goal detail`'s archive button, `Admin — Seed Demo Data`'s destructive action): `text-destructive`/`bg-destructive/10` combinations measuring 4.0:1 against the 4.5:1 floor.

3. **`aria-progressbar-name` (serious) — Financial Goals' `Progress` component has no accessible name** (`Financial Goals list`, `Financial Goal detail`): `<div role="progressbar" ...>` with no `aria-label`/`aria-labelledby`/title.

4. **`scrollable-region-focusable` (serious) — scrollable table containers and `<main>` itself are not keyboard-focusable** (`Financial Health Score detail`, `Analytics suite`): `overflow-x-auto` containers with no `tabindex`.

5. **`aria-valid-attr-value` (CRITICAL) — Analytics' period-selector `Tabs` component.** `<button role="tab" aria-controls="radix-_R_...-content-THIS_YEAR">` — axe flags the Radix-generated `aria-controls` value as an invalid ARIA attribute value. This is the run's only **critical**-impact finding and the one most worth a Frontend Lead/UI Component Engineer look first, since "critical" is the top of axe's own severity scale.

**Full violation payloads (rule id, exact node, contrast ratios, HTML snippet) for every failing route are preserved in `test-results/` from this run and in Playwright's HTML report (`npx playwright show-report`).** This markdown file summarizes root causes rather than reproducing ~24 multi-KB JSON payloads verbatim.

### Moderate/minor findings backlog

Zero moderate/minor findings were recorded on this run — see the auto-generated `docs/testing/e2e/accessibility-report.md` (written by this spec's own `test.afterAll` hook on every run). Every finding above was serious or critical, none moderate/minor.

## Fixes made to the test suite itself during this run (not production code)

- `playwright.config.ts` gained `process.loadEnvFile(".env")` — the Playwright test process is a separate Node process from `npm run dev` and does not inherit `.env` the way Next.js's own dev server does.
- `playwright.config.ts`'s `expect.timeout` (20s) and `use.navigationTimeout` (45s) were raised from Playwright's defaults (5s/30s): this app's dev-mode (Turbopack) lazy-compiles each route on its first request per server lifetime (~10s measured for a cold `/`), and `/analytics` specifically triggers a server-side AI-narrative generation call (Spending Insights) measured taking 13-31s end to end — a real performance characteristic worth a Performance Engineer look, not a suite defect.
- `route-a11y.spec.ts`'s `/login` wait condition was changed from `getByRole("heading", { name: "LK Budget" })` to `getByLabel("Email")`: `CardTitle` (`src/components/ui/card.tsx`) renders a plain `<div>`, not a real heading element, so the original wait condition never resolved.

## Out of scope for this role

Per this role's charter ("Never edit production code"), none of the findings above were fixed in application code. They are reported here as real signal for the Frontend Lead / UI Component Engineer / Bug Hunter to triage and assign, consistent with Accessibility AC2's "named, owned backlog item" requirement.
