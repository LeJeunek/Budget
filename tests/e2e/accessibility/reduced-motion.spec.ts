// Regression coverage for Phase 5b (Motion & Craft)'s own Definition of
// Done (docs/product/phase-5b-motion-craft.md): "Automated Playwright
// coverage (extending 5a's existing tests/e2e/ suite, not a second suite)
// confirms, via page.emulateMedia({ reducedMotion: "reduce" }), that at
// least one concrete instance of each of the five capabilities above
// (including the two pre-existing ProgressRing/Progress animations now
// brought under the shared reduced-motion mechanism) renders its end state
// instantly with no animation."
//
// Six tests below, one per required instance:
//   1. Number Counters      — Dashboard's Net Worth stat card (AnimatedNumber)
//   2. Chart Transitions    — Dashboard's Spending by Category donut (Recharts)
//   3. Page Transitions     — Dashboard -> Accounts in-app navigation (FadeIn)
//   4. Expandable Cards     — Transactions' mobile DataTableCardList "Show more"
//   5. Pre-existing motion  — ProgressRing's SVG stroke sweep (Goals)
//   6. Pre-existing motion  — Progress's CSS-transition fill (Budgeting)
//
// "Reduced-Motion Foundation" (the sixth capability named in the product
// spec) is not a separate, seventh test here — it's the shared mechanism
// (`src/app/providers.tsx`'s `<MotionConfig reducedMotion="user">` plus
// `useReducedMotion()`) every test below actually exercises; there is no
// separate DOM surface of its own to assert against beyond what the six
// tests already cover.
//
// Placed under `accessibility/` (not a new top-level folder) specifically so
// playwright.config.ts's existing `testIgnore: [..., /accessibility\//]` on
// the "mobile"/"tablet" projects applies here for free, exactly as it
// already does for accent-contrast.spec.ts/route-a11y.spec.ts — reduced
// motion is not viewport-dependent, so this file only needs to run once, on
// "desktop" (test 4 below overrides its own viewport locally to reach the
// mobile-only DataTableCardList markup — see that test's own comment).
//
// Every test below reads real data from the seeded ordinary e2e-test fixture
// account (prisma/seed-e2e-test-user.ts) — none of these tests know or
// assert the exact underlying figures, only that whatever value is shown is
// already final (never a zero/partial starting point, never still changing)
// the moment it can be observed, which is what "instant, no animation"
// actually means for a reduced-motion user.
import { expect, test } from "@playwright/test"

import { ORDINARY_STORAGE_STATE } from "../support/storage-state"

test.use({ storageState: ORDINARY_STORAGE_STATE })

test.describe("Reduced motion — end states render instantly, no animation", () => {
  test("Number Counters: Dashboard's Net Worth stat card shows its final value immediately, never a count-up from zero", async ({
    page,
  }) => {
    // Must be emulated BEFORE navigation — AnimatedNumber
    // (components/shared/motion/animated-number.tsx) reads
    // `useReducedMotion()` on its very first render to decide whether its
    // mount-time tween (AC1a: "animates once, from zero, exactly like any
    // other first-mount case") ever starts at all.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")

    // dashboard-card-groups.tsx: the Net Worth StatCard's `value` is an
    // `AnimatedCurrencyStatValue` (an `AnimatedNumber` wrapper) — the exact
    // Number Counters AC6 surface named first in the product spec's
    // ten-surface list.
    const netWorthCard = page.locator('[data-slot="card"]').filter({ hasText: "Net Worth" })
    const value = netWorthCard.locator('[data-slot="card-content"] span').first()
    await expect(value).toBeVisible()

    // The very first read, as early as Playwright's own navigation/paint
    // wait allows: already a real, fully-formatted currency figure (through
    // the same formatCurrency pipeline per AC3), never the "$0.00" starting
    // point a non-reduced-motion mount would render for at least one frame.
    const immediateText = (await value.textContent())?.trim()
    expect(immediateText).toMatch(/^-?\$[\d,]+\.\d{2}$/)

    // AnimatedNumber's shared tween duration (NUMBER_COUNTER_DURATION_MS,
    // components/shared/motion/constants.ts) is 600ms — waiting well past
    // that and re-reading proves the value never moved. Under reduced
    // motion this isn't "it settled by now," it's "it was never anything
    // else" (animated-number.tsx's `prefersReducedMotion` branch calls
    // `motionValue.set(value)` synchronously, with no tween ever started) —
    // this assertion is what would actually fail if that branch regressed.
    await page.waitForTimeout(700)
    const settledText = (await value.textContent())?.trim()
    expect(settledText).toBe(immediateText)
  })

  test("Chart Transitions: Dashboard's Spending by Category donut renders fully drawn immediately, no sweeping entrance", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")

    // spending-by-category-chart.tsx spreads `useChartAnimationProps()`
    // onto Recharts' <Pie>, which sets `isAnimationActive: false` under
    // reduced motion (chart-animation.ts) — Recharts' own native animation
    // mechanism (Chart Transitions AC3), not a Framer Motion reimplementation.
    const chartCard = page.locator('[data-slot="card"]').filter({ hasText: "Spending by Category" })
    const sectors = chartCard.locator("g.recharts-pie-sector path")
    await expect(sectors.first()).toBeVisible()

    // Recharts' entrance animation, when active, interpolates each sector
    // path's own `d` attribute across animation frames (growing arcs). A
    // fully-drawn-on-first-paint chart's path data is already stable the
    // instant it's observable and never changes afterward — capturing it
    // immediately and again after CHART_TRANSITION_DURATION_MS's 500ms bound
    // (chart-animation.ts) has fully elapsed is the direct, non-inferential
    // proof no entrance animation ever played.
    const immediatePaths = await sectors.evaluateAll((els) =>
      els.map((el) => el.getAttribute("d")),
    )
    expect(immediatePaths.length).toBeGreaterThan(0)
    expect(immediatePaths.every((d) => !!d)).toBe(true)

    await page.waitForTimeout(800)
    const settledPaths = await sectors.evaluateAll((els) => els.map((el) => el.getAttribute("d")))
    expect(settledPaths).toEqual(immediatePaths)
  })

  test("Page Transitions: navigating Dashboard -> Accounts shows the new route's content instantly, no fade/slide", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible()
    // Settle past Next.js's own client-side hydration before clicking — a
    // click fired in the brief window before the Sidebar `<Link>`'s own
    // event handler has attached can be lost entirely (reproduced
    // independent of reduced motion: an identical click-too-early race
    // against plain `no-preference` navigation too), which is a hydration-
    // timing characteristic of this test harness, not a reduced-motion
    // regression this file is chartered to cover — see this file's own
    // accompanying test run report for the full investigation.
    await page.waitForLoadState("networkidle")

    // A real in-app navigation via the Sidebar, matching Page Transitions
    // AC1's own scope ("via Sidebar, BottomNav, TopNav, or an in-app
    // link") — not a page.goto(), which would bypass the client-side
    // transition (`(dashboard)/template.tsx`'s `PageTransition` wrapper)
    // entirely.
    await page.getByRole("link", { name: "Accounts", exact: true }).click()
    await expect(page).toHaveURL(/\/accounts$/)
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible()

    // FadeIn (components/shared/motion/fade-in.tsx), PageTransition's own
    // mechanism, renders a PLAIN <div> with no Framer Motion wrapper at all
    // when reduced motion is active — not merely a zero-duration tween.
    // That file's own module doc names this exact assertion as the
    // intended one: "a Playwright assertion... can assert 'no
    // animation-bearing element is present,' a strictly stronger...
    // guarantee than 'the duration happened to resolve to zero.'" A settled
    // motion.div would still carry leftover inline styling
    // (`style="opacity: 1; transform: none;"`) even long after its own
    // animation finished — this file's own first child inside <main>
    // carrying NO inline style at all is what actually distinguishes
    // "never animated" from "already finished animating."
    const routeRoot = page.locator("main > div").first()
    const styleAttr = await routeRoot.getAttribute("style")
    expect(styleAttr).toBeNull()
  })

  test("Expandable Cards: Transactions' mobile card 'Show more' toggle shows/hides content instantly, aria-expanded flips correctly", async ({
    page,
  }) => {
    // DataTableCardList (the mobile row-renderer) is mounted in the DOM at
    // every viewport (responsive-data-table.tsx: "CSS-only... never
    // DOM-absent") but is only visually reachable below the `sm` (640px)
    // breakpoint (`sm:hidden`) — this test overrides its own viewport to
    // actually see and click it, matching transaction-entry.spec.ts's own
    // documented reasoning for why the desktop `<table>` rendering is
    // scoped by project instead.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/transactions")

    // transaction-table.tsx: the Tags/Notes columns are annotated
    // `meta: { cardDisplay: "expandable" }` — the exact Expandable Cards
    // AC4 consumer named in the product spec ("every mobile card-list row
    // rendered by 5a's DataTableCardList"). ExpandableCard
    // (components/shared/motion/expandable-card.tsx) composes Radix's
    // Collapsible (real aria-expanded/aria-controls wiring) with a Framer
    // Motion height/opacity reveal, gated by the same shared
    // `useReducedMotion()` hook every other primitive in this file uses.
    const trigger = page.getByRole("button", { name: "Show more" }).first()
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")

    // Radix's own `CollapsibleTrigger` (@radix-ui/react-collapsible,
    // confirmed by direct inspection of the installed package) only emits
    // `aria-controls` while `open` is true (`context.open ? context.contentId
    // : void 0`) — omitting it entirely while collapsed is that primitive's
    // own documented behavior, not a gap `components/ui/collapsible.tsx`
    // (a thin, intentionally-unmodified wrapper) or `ExpandableCard`
    // introduces. So `aria-controls` is read AFTER opening below, once Radix
    // actually populates it — the disclosed region's own `id` is stable
    // (`useId()`-backed) across open/close, so the same id remains valid to
    // re-query after closing again.
    await trigger.click()

    // A tight timeout here is the actual point: ExpandableCard's reduced-
    // motion branch passes `initial={false}` (skip the enter animation
    // entirely, render directly in its final "open" layout) and
    // `transition={{ duration: 0 }}` — there is no animation frame for a
    // real content reveal (EXPANDABLE_CARD_DURATION_MS is normally 250ms)
    // to be caught mid-flight in. A regression that dropped the
    // reduced-motion branch would still pass a generous/default timeout
    // here, which is exactly the "eventually settles correctly" false
    // positive this file's own dispatch instructions warn against.
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 200 })
    const controlsId = await trigger.getAttribute("aria-controls")
    expect(controlsId).toBeTruthy()
    const region = page.locator(`#${controlsId}`)
    await expect(region.getByText("Tags", { exact: true })).toBeVisible({ timeout: 200 })

    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "false", { timeout: 200 })
    // Collapsed again: the disclosed region's own content isn't merely
    // visually hidden, it isn't rendered at all (ExpandableCard's
    // `{isOpen && (...)}` gate) — "Tags" (one of the two expandable
    // columns' own header label) has zero matches inside the region, the
    // same stable id captured above.
    await expect(region.getByText("Tags", { exact: true })).toHaveCount(0)
  })

  test("Pre-existing motion: ProgressRing's SVG stroke sweep renders its final position immediately (Goals)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/goals")

    // goal-card.tsx: every Active goal renders a ProgressRing
    // (components/shared/progress-ring.tsx) — the first pre-existing motion
    // instance the product spec names explicitly (Reduced-Motion
    // Foundation AC3).
    const ring = page.locator('[role="progressbar"]').first()
    await expect(ring).toBeVisible()

    const valueNow = await ring.getAttribute("aria-valuenow")
    expect(valueNow).not.toBeNull()
    const percent = Number(valueNow)

    // progress-ring.tsx renders two <circle>s: the static track first, then
    // the animated `motion.circle` indicator — its `strokeDashoffset` is
    // what actually sweeps from "fully hidden" to the real progress amount.
    const indicatorCircle = ring.locator("svg circle").nth(1)
    const { offset, expectedOffset } = await indicatorCircle.evaluate((el, pct) => {
      const circle = el as SVGCircleElement
      const r = Number(circle.getAttribute("r"))
      const circumference = 2 * Math.PI * r
      const computedOffset = parseFloat(window.getComputedStyle(circle).strokeDashoffset)
      // Reproduces progress-ring.tsx's own formula
      // (`circumference - (clamped / 100) * circumference`) — the offset a
      // FULLY SWEPT ring rests at, never the "clamped === 0" starting
      // offset (a full, un-swept `circumference`) a non-reduced-motion
      // mount would render for at least one animation frame.
      const expected = circumference - (pct / 100) * circumference
      return { offset: computedOffset, expectedOffset: expected }
    }, percent)

    expect(offset).toBeCloseTo(expectedOffset, 0)
  })

  test("Pre-existing motion: Progress's fill renders its final position immediately, no CSS transition (Budgeting)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/budgeting")

    // budget-category-row.tsx: every category with a plan allocated renders
    // a `<Progress>` (components/ui/progress.tsx) — the second pre-existing
    // motion instance the product spec names explicitly. Unlike
    // ProgressRing (a Framer Motion value, covered by `MotionConfig` for
    // free), this one's fill is a plain CSS `transition-all` class — the
    // one pre-existing instance that needed an actual code change (a
    // conditional class) rather than a free retrofit, per that file's own
    // module doc.
    const indicator = page.locator('[data-slot="progress-indicator"]').first()
    await expect(indicator).toBeVisible()

    // Direct, non-timing-based proof the reduced-motion branch was actually
    // taken: the CSS transition class itself is absent, not merely "fast."
    await expect(indicator).not.toHaveClass(/transition-all/)

    // With no transition possible, the fill's inline `transform` can never
    // change after mount — reading it immediately and again after a delay
    // (comfortably past Tailwind's own default transition duration, in
    // case the class-absence assertion above were ever silently bypassed)
    // is the direct behavioral confirmation, not just a static class check.
    const immediateTransform = await indicator.evaluate((el) => (el as HTMLElement).style.transform)
    expect(immediateTransform).toMatch(/^translateX\(-?\d+(\.\d+)?%\)$/)

    await page.waitForTimeout(500)
    const settledTransform = await indicator.evaluate((el) => (el as HTMLElement).style.transform)
    expect(settledTransform).toBe(immediateTransform)
  })
})
