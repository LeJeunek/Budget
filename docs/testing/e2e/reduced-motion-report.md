# E2E Run Report — Reduced Motion (`tests/e2e/accessibility/reduced-motion.spec.ts`)

**Run date:** 2026-08-03
**Command:** `npx playwright test tests/e2e/accessibility/reduced-motion.spec.ts --project=desktop --workers=1 --reporter=list`
**Environment:** local dev server (`npm run dev`, Turbopack), Chromium, `desktop` project only (1440x900) — this file lives under `tests/e2e/accessibility/`, so `playwright.config.ts`'s existing `testIgnore: [..., /accessibility\//]` on the `mobile`/`tablet` projects already restricts it to `desktop`, matching `accent-contrast.spec.ts`/`route-a11y.spec.ts`'s own precedent (reduced motion is not viewport-dependent).
**Fixture account:** `e2e-test@lkbudget.dev` (ordinary user, seeded via `npm run seed:e2e`)

## Purpose

Closes `docs/product/phase-5b-motion-craft.md`'s own Definition of Done line: "Automated Playwright coverage (extending 5a's existing `tests/e2e/` suite, not a second suite) confirms, via `page.emulateMedia({ reducedMotion: "reduce" })`, that at least one concrete instance of each of the five capabilities above (including the two pre-existing `ProgressRing`/`Progress` animations now brought under the shared reduced-motion mechanism) renders its end state instantly with no animation." One new spec file, six tests, one per required instance — no second suite stood up.

## The six instances covered

| # | Capability / instance | Route | Component | Result |
|---|---|---|---|---|
| 1 | Number Counters | `/` (Dashboard) | `AnimatedNumber` via `AnimatedCurrencyStatValue` (Net Worth stat card) | **FAIL — real bug** |
| 2 | Chart Transitions | `/` (Dashboard) | `SpendingByCategoryChart` (Recharts `<Pie>`, `useChartAnimationProps()`) | PASS |
| 3 | Page Transitions | `/` → `/accounts` | `PageTransition`/`FadeIn` (`(dashboard)/template.tsx`) | PASS |
| 4 | Expandable Cards | `/transactions` (mobile card list, 375x812 viewport override) | `ExpandableCard` via `DataTableCardList`'s Tags/Notes "Show more" | PASS |
| 5 | Pre-existing motion: `ProgressRing` | `/goals` | `ProgressRing`'s `motion.circle` stroke sweep (`goal-card.tsx`) | **FAIL — real bug** |
| 6 | Pre-existing motion: `Progress` | `/budgeting` | `Progress`'s CSS-transition fill (`budget-category-row.tsx`) | PASS |

## Result

**6 tests, 4 passed, 2 failed — both failures are a real, filed product bug, not a test-authoring defect.** Reproduced consistently across repeated fresh-context runs (3/3 and 3/3 for the two failing tests; 4/4, 4/4, and 4/4+ for three of the four passing tests, individually re-run to confirm stability — see below).

Full run:
```
Running 8 tests using 1 worker (2 setup logins + 6 spec tests)

  ok   [setup] authenticate as the ordinary e2e test user
  ok   [setup] authenticate as the admin e2e test user
  FAIL Number Counters: Dashboard's Net Worth stat card shows its final value immediately, never a count-up from zero
  ok   Chart Transitions: Dashboard's Spending by Category donut renders fully drawn immediately, no sweeping entrance
  ok   Page Transitions: navigating Dashboard -> Accounts shows the new route's content instantly, no fade/slide
  ok   Expandable Cards: Transactions' mobile card 'Show more' toggle shows/hides content instantly, aria-expanded flips correctly
  FAIL Pre-existing motion: ProgressRing's SVG stroke sweep renders its final position immediately (Goals)
  ok   Pre-existing motion: Progress's fill renders its final position immediately, no CSS transition (Budgeting)

6 passed / 8 total (including 2 setup logins), 2 failed
```

## The bug behind the two failures

`docs/testing/bug-reports/reduced-motion-not-honored-on-first-page-load-animated-number-progress-ring.md` — filed, not fixed here (E2E Test Engineer role never edits production code). Summary: on a **fresh, full page load** with `page.emulateMedia({ reducedMotion: "reduce" })` set before `page.goto` (the exact scenario Reduced-Motion Foundation's own Edge Case #1 names as binding — "first page load of a session"), both `AnimatedNumber` (Dashboard's Net Worth stat card: renders `$0.00` for ~80-100ms before jumping to the real value) and `ProgressRing` (Goals' per-goal progress ring: plays a genuine ~600-800ms stroke sweep, sampled at 10 points showing smooth frame-by-frame interpolation) ignore the active reduced-motion preference for their own mount-time animation. `components/ui/progress.tsx`'s CSS-transition-based fill, using the identical shared `useReducedMotion()` hook, does **not** exhibit this and was re-verified stable across 4 additional isolated re-runs — the defect is specific to the two Framer-Motion-*driven* value animations, not the shared mechanism generally. Both failing tests were deliberately left failing rather than weakened to pass around the bug — a red test is the correct, honest signal here, and the bug report's own "Test Coverage" section points back at this file.

## Test-authoring issues found and fixed during this run (not product bugs)

1. **Page Transitions — click-before-hydration race.** The first attempt clicked the Sidebar's "Accounts" link immediately after the Dashboard heading became visible; the click was accepted by Playwright but no navigation occurred. Reproduced identically with reduced motion **not** emulated at all, and resolved by waiting `page.waitForLoadState("networkidle")` before clicking — confirming this is a generic hydration-timing characteristic of clicking a Next.js `<Link>` in the brief pre-hydration window, unrelated to Phase 5b/reduced motion, so no bug report was filed for it. Worth a heads-up to the team if other flows hit the same click-too-early race, but out of this file's own chartered scope.
2. **Expandable Cards — `aria-controls` only present while open.** `@radix-ui/react-collapsible`'s own `CollapsibleTrigger` (confirmed by direct inspection of the installed package, `node_modules/@radix-ui/react-collapsible/dist/index.mjs`) sets `aria-controls` conditionally — `context.open ? context.contentId : void 0` — omitting the attribute entirely while collapsed. The test originally read `aria-controls` before the first click (when it is legitimately absent by that primitive's own design); fixed by reading it after opening instead, then reusing that same (`useId`-stable) region id to verify the collapsed state afterward. This is Radix's own documented upstream behavior, not a `components/ui/collapsible.tsx` or `ExpandableCard` defect, and not reduced-motion-related, so no bug report was filed for it either — though it is worth flagging to whoever owns Expandable Cards AC2 ("the trigger element carries `aria-expanded`... and `aria-controls`... for every consumer old and new, not `aria-expanded` alone") that the *collapsed* state's own accessible name/description relies on `aria-expanded` alone by construction of the underlying primitive, which may or may not be what that AC intended.

## What this run does NOT cover

- Only one concrete instance per capability, per the Definition of Done's own "at least one" bar — not an exhaustive per-consumer sweep across all ten Number Counters surfaces, all fourteen Recharts charts, every `DataTableCardList` consumer, etc. (that per-surface exhaustive verification is the Definition of Done's separate, non-reduced-motion-specific bullets, out of this file's scope.)
- The **reactive, mid-session** half of Reduced-Motion Foundation AC4 ("if a user changes their OS-level reduced-motion setting while FinanceOS is open in a tab... every subsequently-triggered animation... respects the new setting immediately") is not exercised by this file at all — every test here sets the preference once, before navigation. Untracked scratch probes already present in `tests/e2e/` at the time of this run (`_tmp-bughunt-reduced-motion-mounted.spec.ts`, `_tmp-bughunt-reduced-motion-reactivity.spec.ts`) appear to be a separate, in-progress investigation into exactly that question — left untouched, not duplicated or cleaned up here, since they are not this dispatch's own artifacts.
- Cumulative Layout Shift / Time-to-Interactive measurement (Chart Transitions' CLS bar, Page Transitions' TTI bar) — these are the Performance Engineer's own review-gate bar per the product spec's Definition of Done, not something this file measures.
