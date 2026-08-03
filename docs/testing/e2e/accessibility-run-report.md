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

---

## Re-run — 2026-08-02 (post-fix pass, commit `2c659d1`)

**Run date:** 2026-08-02
**Command:** `npx playwright test --project=desktop accessibility` (run twice in succession — identical 8 failures both times, confirming these are deterministic, real findings, not flaky)
**Pre-run steps performed:** `npm run seed:e2e` (re-ran to refresh the dedicated fixture account/data) then `npm run grant:admin -- e2e-test-admin@lkbudget.dev` (re-grants ADMIN, since `seed:e2e` deletes-and-recreates the admin account and its role is not persisted by that script — confirmed both completed successfully before this run)
**Fix pass under verification:** commit `2c659d1` ("Phase 5a: accessibility structural-fix pass") — see that commit's message for the 5 root causes it targeted: avatar-fallback `color-contrast`, destructive-variant `color-contrast`, `Progress`'s `aria-progressbar-name`, `Table`'s `scrollable-region-focusable`, and Analytics' Tabs `aria-valid-attr-value`.

### Result

**32 tests run (2 setup logins + 30 routes). 24 passed, 8 failed.**

This is a real, measured improvement from the first run's 8 passed / 24 failed — 16 previously-failing routes now pass, and the run's only **critical**-impact finding (`aria-valid-attr-value` on Analytics' Tabs) is confirmed gone. **The gate is still not met**: Accessibility AC2 requires zero critical/serious violations across all 30 routes, and 8 routes still fail on genuine serious-impact findings. Do not treat this as a passing gate.

### Confirmed fixed (no longer reproducing)

- `aria-valid-attr-value` (critical) — Analytics' Tabs `aria-controls`: gone. Analytics suite's remaining failure (below) is a different, unrelated rule.
- `aria-progressbar-name` (serious) — Financial Goals list/detail: both routes now pass; `Progress`'s default `"{value}% complete"` accessible name resolved this.
- The original top-nav avatar-fallback `color-contrast` finding itself (the exact `avatar-fallback`/`AV` node): gone from every route it previously failed on — `Avatar`'s fix (`text-muted-foreground` → `text-foreground`) is confirmed working.
- Destructive-variant `color-contrast` (Financial Goal detail's archive button, Admin — Seed Demo Data's destructive action): both routes now pass.

### Still failing (8 routes) — zero critical/serious was NOT met

Every failure below reproduced identically across two consecutive runs. Full axe payloads are in `test-results/` and Playwright's HTML report from this run; exact rule id / node / contrast ratio for each is recorded here per this task's own "do not paper over a remaining failure" instruction.

1. **`color-contrast` (serious) — "positive/success" semantic text color (`text-emerald-600 dark:text-emerald-400`) on a white card background, measuring 3.65:1 against the 4.5:1 floor.** This is the highest-frequency remaining root cause — 5 of the 8 failing routes:
   - **Dashboard Overview**: `<span class="text-sm font-medium text-emerald-600 dark:text-emerald-400">Good</span>` (Financial Health Score summary card's band label) — 2 occurrences (`fgColor: #009966`, `bgColor: #ffffff`, `contrastRatio: 3.65`, 14px/normal weight). Source: `src/features/financial-health-score/components/financial-health-score-badge.tsx`'s `LABEL_STYLES.Good`.
   - **Budgeting**: identical `text-emerald-600`/`Good` label, `contrastRatio: 3.65`, 14px — `src/features/budgeting/components/budget-health-score-badge.tsx`'s equivalent `LABEL_STYLES`.
   - **Financial Health Score detail**: identical pattern at 16px, `contrastRatio: 3.65`.
   - **Investments portfolio**: `<span class="text-emerald-600 dark:text-emerald-400">+$200.00</span>` — a positive-gain table cell, `contrastRatio: 3.65`. Source: `src/features/investments/components/holding-row.tsx` / `portfolio-overview-section.tsx`.
   - **Holding detail**: `<span class="font-heading text-xl font-semibold text-emerald-600 dark:text-emerald-400">+$200.00 (+6.7%)</span>` — 20px, `contrastRatio: 3.65`.

   This is the same *class* of bug the fix pass already closed for the destructive-variant token (`text-destructive` was too light against its background) — the success/positive-value token (`emerald-600` light / `emerald-400` dark) needs the identical treatment (a darker light-mode token, verified against white) but was not in scope of this fix pass, and is not one of the 5 originally-documented root causes. **This is a new finding, not a regression of an already-fixed one.**

2. **`color-contrast` (serious) — `text-muted-foreground` on `bg-muted` (12px, `text-xs`) still fails at other call sites the fix pass did not touch.** `<p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Only one year of history so far — year-over-year comparisons will appear once a second year of data exists.</p>` on **Analytics suite** — `fgColor: #737373`, `bgColor: #f5f5f5`, `contrastRatio: 4.34` against the 4.5:1 floor. This is numerically the *exact same* token pair and ratio as the original run's #1 root cause (the avatar-fallback finding), but a different DOM node: the fix pass changed `Avatar`'s own className (`text-muted-foreground` → `text-foreground`), which fixes every `Avatar` consumer, but did not touch the underlying `text-muted-foreground`/`bg-muted` CSS custom-property pair itself. That pair is used elsewhere at the same small font size and still fails identically — confirmed by grep, at minimum `src/features/dashboard/components/net-worth-history-chart.tsx:275` and `src/features/analytics/components/category-trends-chart.tsx:98` share this exact `rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground` className string (Analytics suite's failure traces to `yearly-spending-chart.tsx`'s identical instance). **Worth flagging to whoever owns the follow-up: a token-level fix (darkening `--muted-foreground` or lightening `--muted`, the same "fix the token, not each call site" approach Edge Cases already prescribes for accent-color contrast failures) would close this class of finding everywhere at once, rather than requiring a repeat of the avatar-specific, per-component fix for every other consumer found.**

3. **`aria-hidden-focus` (serious) — a genuine regression introduced by this fix pass itself, on Transactions list.** `<div class="overflow-hidden rounded-lg border" aria-hidden="true">` (the `TableSkeleton` wrapper, `src/components/shared/loading-skeleton.tsx`) contains `<div data-slot="table-container" tabindex="0">` (the `Table` primitive's own wrapper, `src/components/ui/table.tsx`) — an `aria-hidden="true"` ancestor may never contain a focusable descendant (axe: "Focusable content should have tabindex=\"-1\" or be removed from the DOM"). This is a direct, mechanical side effect of this fix pass's own `scrollable-region-focusable` fix (unconditionally adding `tabIndex={0}` to `Table`'s wrapper div in every context, including inside `TableSkeleton`'s pre-existing `aria-hidden="true"` loading placeholder, which the fix pass's own commit message does not mention having checked). Reproduced on both runs, meaning the Transactions list route's `DataTable` was still in its `isLoading`/skeleton state at the moment axe scanned it — a real, observable timing condition, not a test artifact. **This is a new regression, not one of the 5 originally-documented root causes, and is a direct consequence of the fix for #4 in the original report.**

4. **`color-contrast` (serious) — UploadThing's own base-stylesheet `<label>` element, on Transaction detail.** `<label class="group relative flex ..." data-state="readying" data-ut-element="button">` — `fgColor: #ffffff`, `bgColor: #60a5fa`, `contrastRatio: 2.54` against 4.5:1, 14px. Source: `src/features/transactions/components/receipt-uploader.tsx`'s `<UploadButton>` (`@uploadthing/react`) — the `appearance.button` override this component already passes does not reach this particular sub-element (`data-ut-element="button"`'s "readying" state), which is styled by UploadThing's own imported `@uploadthing/react/styles.css`, not this app's Tailwind/shadcn tokens. **This is a new finding outside the scope of every one of the 5 originally-documented root causes** (none of which mentioned the receipt-upload third-party widget) — worth flagging separately since the fix, if any, is either an additional `appearance` override key or an UploadThing version/config change, not a `components/ui/` token change like the other findings above.

### Summary for the release gate

| # | Rule | Impact | Routes affected | Status |
|---|---|---|---|---|
| 1 | `color-contrast` — `text-emerald-600`/`dark:text-emerald-400` success token | serious | Dashboard Overview, Budgeting, Financial Health Score detail, Investments portfolio, Holding detail (5) | **New finding** |
| 2 | `color-contrast` — `text-muted-foreground`/`bg-muted` at other call sites | serious | Analytics suite (1; at least 2 more call sites confirmed by grep, not yet hit by axe's crawl) | **Same token pair as original root cause #1, un-fixed at other sites** |
| 3 | `aria-hidden-focus` — `TableSkeleton` wrapping `Table`'s new `tabIndex={0}` | serious | Transactions list (1) | **New regression caused by this fix pass** |
| 4 | `color-contrast` — UploadThing's own `<label data-ut-element="button">` | serious | Transaction detail (1) | **New finding, third-party widget** |

Per this role's charter, none of the above were fixed here — reported for the Frontend Lead / UI Component Engineer / Bug Hunter to triage, same discipline as the first run.

---

## Final re-run — 2026-08-02 (all 4 remaining findings closed, commit follows)

**Run date:** 2026-08-02
**Command:** `npx playwright test --project=desktop accessibility --reporter=list`
**Fix pass under verification:** direct follow-up fixes applied after the second re-run above surfaced 4 remaining findings (1 regression, 3 new/latent instances) beyond the original 5 root causes.

### Result

**32 tests run (2 setup logins + 30 routes). 32 passed, 0 failed.**

**The gate is met.** Zero critical/serious axe-core violations across every route in the inventory, confirmed by a live run, not inferred from source review alone.

### What closed the remaining 4 findings from the prior re-run

1. **`aria-hidden-focus` regression (`TableSkeleton`)**: `components/ui/table.tsx`'s `Table` gained an optional `wrapperTabIndex` prop (default `0`, the correct value for every real, visible table); `components/shared/loading-skeleton.tsx`'s `TableSkeleton` now passes `wrapperTabIndex={-1}` — axe's own prescribed remedy for focusable content inside an `aria-hidden` ancestor — since its entire subtree, including the `Table` it reuses for visual-shape fidelity, is decorative.

2. **`color-contrast` — `text-emerald-600`/`text-red-600` (and raw `text-destructive`) used directly as body/heading text, not through Button/Badge/DropdownMenuItem's already-fixed variants.** This root cause proved far more widespread than the two routes the second re-run's crawl happened to hit: a systematic grep-and-fix pass found and closed it in every file using the pattern — `financial-health-score-badge.tsx`, `budget-health-score-badge.tsx`, `financial-health-score/page.tsx` (all three independent copies of the same `LABEL_STYLES` shape, including their `"Needs attention"`/`text-destructive` entries, not yet exercised by any crawled route's current fixture data but the identical latent bug), `holding-row.tsx`, `portfolio-overview-section.tsx`, `investments/[holdingId]/page.tsx` (a third, page-level instance distinct from the list-row component), `stat-card.tsx` (a `components/shared/` primitive — fixes every consumer at once), `transaction-detail-client.tsx`, `transaction-table.tsx`, `seed-demo-data-button.tsx`, and `split-dialog.tsx`. All swapped `-600` → `-700` (light mode only; `-400` dark-mode shades were already passing, confirmed by the original fix pass's own measurement).

3. **`color-contrast` — `text-muted-foreground`/`bg-muted` at the three other exact call sites** (`net-worth-history-chart.tsx`, `category-trends-chart.tsx`, `yearly-spending-chart.tsx`, all sharing the identical informational-caption pattern): swapped to `text-foreground`, the same fix already verified working for `Avatar`.

4. **UploadThing's own `data-[state=readying]` background**: root-caused to `@uploadthing/react`'s bundled source directly (confirmed by reading `node_modules/@uploadthing/react/dist/index.js`) — its own `data-[state=readying]:bg-blue-400` is a state-scoped utility that wins the cascade over this component's plain `bg-primary` override regardless of stylesheet load order. Fixed with real `data-[state=...]` attribute variants (replacing a pre-existing, never-actually-functional `ut-uploading:` prefix — confirmed no such custom Tailwind variant is registered anywhere in this codebase) forced with `!important` so they win unconditionally. Also fixed the identical, previously-silently-broken `data-[state=uploading]` case while in the file.

### One unrelated item observed, not addressed here

A benign-looking Next.js dev console warning appeared during this run on at least one route: `Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported. {amount: Decimal, date: Date}`. It did not fail any test and is unrelated to accessibility — flagged here for the Bug Hunter's upcoming pass to triage (a Prisma `Decimal`/`Date` value likely being passed as a prop to a Client Component somewhere without `.toNumber()`/serialization first), not investigated further under this role's scope.
