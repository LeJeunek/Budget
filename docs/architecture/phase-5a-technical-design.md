# FinanceOS — Phase 5a Technical Design: Playwright/axe-core Bootstrap, Bottom Navigation, Mobile-Treatment Primitives

**Author:** Solution Architect, per `roadmap.md`'s Phase 5a milestone 3 ("Solution Architect... pass: decides the Playwright/axe-core bootstrap approach... designs the bottom-navigation component's boundary/reuse relationship to `components/shared/sidebar.tsx`... designs the Calendar v2 day-detail affordance the resolution pass above left to this pass, and decides on visual-regression tooling").
**Status:** design-stage. No production code, test code, or config file has been written against this document yet. E2E Test Engineer's Playwright-suite build-out and Frontend Lead's/UI Component Engineer's responsive implementation are the next dispatches, gated on this document per the roadmap's own phase-gate sequencing.
**Scope:** the six questions the roadmap's Phase 5a milestone 3 and the dispatch prompt route to this pass — the Playwright/axe-core test-infrastructure bootstrap (location, config, browser/viewport scope, axe wiring, route-inventory iteration, authentication strategy), the bottom-navigation component's code boundary and its relationship to the existing hamburger `Sheet`, the card-list responsive primitive's shape (plus naming the other three mobile-treatment patterns' homes), a confirmation pass on accessibility infrastructure beyond axe-core itself (reduced-motion overlap, `Dialog`/`Sheet` focus-trap/return), the visual-regression tooling call, and the technical build order within 5a. **No Database Architect participation is required or used** — the reduced-motion-override question already resolved to "no, OS-level only" (`phase-5a-accessibility-responsive.md`, Open Questions Resolved (a)), so this phase introduces no schema change of any kind.

This document assumes the reader has already read `docs/product/phase-5a-accessibility-responsive.md` in full, `docs/planning/roadmap.md`'s "Phase 5 CTO kickoff pass" and "Phase 5a CTO resolution pass" sections, and risk-register.md rows #39–47 — reasoning already settled there (WCAG 2.1 AA as the binding floor, the three named breakpoints, the six data-heavy surfaces' mobile-treatment assignments, both Open Question resolutions, the 24-route inventory) is not re-litigated here. This document, like `phase-4c-technical-design.md` before it, is a "substantial cross-cutting decision earns its own file" companion to `Architecture.md`, `folder-tree.md`, and `naming-standards.md` — those three files should each gain a short Phase 5a pointer section in the same dispatch that begins implementing this document (not done here, since this pass's own deliverable is this file alone; flagged explicitly in §8 below so it isn't silently skipped).

Every code path, file, and existing pattern cited below was confirmed by direct inspection of current source (`src/components/shared/sidebar.tsx`, `top-nav.tsx`, `components/ui/dialog.tsx`, `sheet.tsx`, `components/shared/data-table/data-table.tsx`, `features/calendar/components/calendar-grid.tsx`, `features/bills/components/occurrence-history-table.tsx`, `src/lib/auth.ts`, `vitest.config.ts`, `package.json`, `scripts/grant-admin.ts`, `prisma/seed-showcase.ts`) — the same "trust but verify against actual code, not just spec prose" discipline every prior architecture/resolution pass in this project has used, applied here since three of this pass's six questions (focus-trap ownership, `BottomNav`'s state-sharing boundary, the test-runner collision) can only be answered correctly by reading the real files, not by inference from the product spec alone.

---

## 1. Playwright + axe-core bootstrap

### 1.1 Location: `tests/e2e/` at repo root — not `src/tests/e2e/`, correcting a stale placeholder

**Decision: Playwright specs, config, and support files live under a new, repo-root-level `tests/e2e/` directory — sibling to `src/`, `prisma/`, `vitest.config.ts` — never nested under `src/`.**

`folder-tree.md`'s Phase 0 section reserves `src/tests/e2e/` ("E2E Test Engineer — reserved"), written speculatively before this role was ever dispatched (confirmed — Risk #41, no `tests/e2e/` directory exists anywhere in the repo today). That placement, if followed literally now, creates a real, concrete conflict this pass is positioned to catch before it ships: `vitest.config.ts` (read directly for this pass) sets no `test.include`/`test.exclude` override, so Vitest falls back to its own default include glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`), which matches any `.spec.ts` file anywhere under the project root Vitest resolves from — including `src/`. A Playwright spec file (which imports its own `test`/`expect` from `@playwright/test`, a completely different test-runner contract than Vitest's globally-injected `test`/`expect`, per `vitest.config.ts`'s own `globals: true`) placed inside `src/tests/e2e/*.spec.ts` would be **collected and executed by `npm run test` (Vitest) as well as by Playwright** — Vitest has no way to know a `@playwright/test`-authored file isn't one of its own, and running a Playwright spec's `test()` calls outside the actual Playwright test runner (no browser context, no worker fixtures) fails immediately and confusingly, corrupting `npm run test`'s own signal for every other, legitimate Vitest suite in the same run.

The fix is a placement rule, not a Vitest config change alone (a `vitest.config.ts` exclude is added too, as defense-in-depth — see below — but the primary fix is not putting Playwright specs under `src/` in the first place, since a config-only fix would leave `src/tests/e2e/` still misleadingly implying Playwright specs are meant to sit alongside application source): `tests/e2e/` at the repo root, matching Playwright's own default/most common convention industry-wide, and matching `.claude/agents/e2e-test-engineer.md`'s own charter line verbatim ("Place tests under `tests/e2e/`" — no `src/` prefix in that text either). `vitest.config.ts` additionally gains an explicit `test.exclude` entry for `tests/e2e/**` as belt-and-suspenders (Vitest's own default exclude list already omits `node_modules`/`dist`/`.git`, but does not omit an arbitrary repo-root `tests/` folder by default) — a one-line addition, Backend Engineer's implementation, not designed further here.

**Consequence for `folder-tree.md`: its Phase 0 `src/tests/e2e/` line is stale and should be corrected to `tests/e2e/` (repo root) the next time that file is edited** — flagged here as a required correction (§8), not made in this pass, since this pass's own deliverable is this one new file.

```
Budget/
├── tests/
│   └── e2e/
│       ├── support/
│       │   ├── route-inventory.ts      # ROUTE_INVENTORY — single source, §1.4
│       │   ├── axe.ts                  # checkAccessibility(page) helper, §1.4
│       │   └── auth.setup.ts           # globalSetup — real login → storageState, §1.5
│       ├── accessibility/
│       │   └── route-a11y.spec.ts      # one generated test per ROUTE_INVENTORY entry
│       ├── responsive/
│       │   └── route-breakpoints.spec.ts   # one generated test per (route × viewport project)
│       └── flows/                      # the 9 named e2e-test-engineer.md flows — one file each,
│                                        #   e2e engineer's own build-out, not enumerated further here
├── playwright.config.ts                # repo root, sibling to vitest.config.ts
├── vitest.config.ts                    # gains test.exclude: ["tests/e2e/**"]
```

### 1.2 Playwright config target and browser/viewport scope

**Dev-server target:** `playwright.config.ts`'s `webServer` option launches `npm run dev` (or reuses one already running, via `reuseExistingServer: !process.env.CI`) against `http://localhost:3000` — already a `trustedOrigins` entry in `lib/auth.ts` (confirmed by direct read), so no auth-layer config change is needed to let Playwright's browser contexts authenticate against it. `baseURL: "http://localhost:3000"` in the Playwright config lets every spec use relative paths (`page.goto("/transactions")`), matching `ROUTE_INVENTORY`'s own path shape directly.

**Browser scope: Chromium only, explicitly, for 5a. Cross-browser (WebKit/Firefox) is out of scope for this phase, not merely deferred by omission.** Neither the CTO's Section 3 acceptance criteria nor the Product Owner spec names cross-browser compatibility as a 5a requirement anywhere — every binding constraint (WCAG 2.1 AA, the three named breakpoints, axe-core coverage, keyboard operability, screen-reader smoke tests) is about viewport size and DOM/ARIA structure, not rendering-engine differences. Introducing a second and third browser engine into the very first Playwright suite this codebase has ever stood up would roughly triple total CI run time and roughly triple the number of environment-specific flakiness sources to debug, for a category of bug (`WebKit`-specific CSS quirk, a `Firefox`-specific focus-order difference) this phase's own DoD never asks to be caught. This is the same "don't build the general/configurable version of a capability before a demonstrated need justifies it over the simpler, standard one" discipline this project has applied three times already (Risk #28's widget-builder/multi-currency rejection, the reduced-motion-override rejection) — reapplied here to test-matrix breadth rather than a product feature. If a real, production cross-browser bug is later found (the concrete evidence this project's own precedent requires before adopting speculative infrastructure), extending `playwright.config.ts`'s `projects` array to add `webkit`/`firefox` variants is a config-only, low-risk addition at that time — not a rearchitecture.

**Viewport scope: three Playwright `projects`, one per the spec's own three named breakpoints — this dimension IS in scope, unlike cross-browser, because Responsive AC2 explicitly requires per-breakpoint verification of all 24 routes.**

```ts
// playwright.config.ts — projects array (illustrative shape, not full config)
projects: [
  { name: "mobile",  use: { viewport: { width: 375,  height: 667 } } },  // <640px
  { name: "tablet",  use: { viewport: { width: 820,  height: 1180 } } }, // 640–1024px
  { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },  // ≥1024px
]
```
Each project uses the Chromium engine (per the browser-scope decision above) with only its `viewport` varying — the exact minimum test-matrix expansion the Responsive workstream's own binding breakpoints require, no more.

### 1.3 axe-core wiring: a shared helper, not 24 hand-written files

**New devDependency: `@axe-core/playwright`** (alongside `@playwright/test` itself). A single shared helper, `tests/e2e/support/axe.ts`, exports one function:

```ts
// Illustrative signature only — implementation is the E2E Test Engineer's
export async function checkAccessibility(page: Page): Promise<AxeResults>
  // new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  // caller asserts zero "critical"/"serious" violations; "moderate"/"minor"
  // findings are collected, never silently dropped and never failing the run —
  // written to docs/testing/e2e/ as a named, owned backlog artifact, per
  // Accessibility AC2/DoD's "named, owned backlog item, not silently dropped"
  // requirement
```
`withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])` is the concrete axe-core configuration that operationalizes Accessibility AC1's "WCAG 2.1 AA is the binding target level" — axe-core's own rule-tag taxonomy is the mechanism, not a new invention.

### 1.4 Iterating the 24-route inventory without 24 near-identical files

**`tests/e2e/support/route-inventory.ts` exports one constant, `ROUTE_INVENTORY`, mirroring `phase-5a-accessibility-responsive.md`'s own Route/Screen Inventory table verbatim — the single source of truth for "which 24 routes," never redefined a second time inside a test file.**

```ts
// Illustrative shape
export interface RouteInventoryEntry {
  path: string          // e.g. "/transactions", "/bills/[billId]" resolved to a real fixture id
  label: string          // human-readable, used as the generated test's own name
  requiresAdmin?: boolean  // true for the 6 /admin/* routes — see §1.5
}
export const ROUTE_INVENTORY: RouteInventoryEntry[] = [ /* all 24, per the product spec's table */ ]
```
Dynamic routes (`/transactions/[id]`, `/goals/[goalId]`, `/bills/[billId]`, `/income/[streamId]`, `/investments/[holdingId]`, `/financial-goals/[goalId]`) resolve to a real record's ID belonging to the dedicated E2E test account's own seeded fixture data (§1.5) — not a placeholder/guessed ID, so every detail-route test exercises a genuinely populated page, not an empty/not-found state (populated and empty states can have different landmark/table structure, and both need coverage at some point, but the *inventory* pass's job is verifying the real, populated shape every route renders in ordinary use).

**One generated test per route, via Playwright's native "loop to generate tests" pattern — not 24 hand-authored files:**
```ts
// tests/e2e/accessibility/route-a11y.spec.ts — illustrative shape
for (const route of ROUTE_INVENTORY) {
  test(`${route.label} — zero critical/serious axe violations`, async ({ page }) => {
    await page.goto(route.path)
    // wait for a stable landmark (e.g. <main>) rather than a fixed timeout
    const results = await checkAccessibility(page)
    expect(results.violations.filter(v => ["critical", "serious"].includes(v.impact ?? "")))
      .toHaveLength(0)
    // moderate/minor findings appended to a docs/testing/e2e/ report artifact, not asserted here
  })
}
```
Playwright registers each loop iteration as its own individually-named, individually-reportable test — this is Playwright's own documented mechanism for exactly this "N near-identical checks over a data table" shape, not a FinanceOS-specific workaround. `tests/e2e/responsive/route-breakpoints.spec.ts` follows the identical shape, nested one level deeper (route × the three viewport `projects` from §1.2, which Playwright's own `projects` config already fans a spec file out across without any additional looping needed in the spec itself) — asserting `document.documentElement.scrollWidth <= window.innerWidth` (the automatable half of Responsive AC2's "no horizontal scroll" bar) at each. Clipped/overlapping content and functionally-unreachable controls are the harder-to-automate half of AC2 and remain the Bug Hunter's manual cross-breakpoint pass, per the spec's own DoD — this suite narrows, but does not eliminate, that manual surface.

### 1.5 Authentication strategy

**Decision: a real Better Auth login, executed once per test run via Playwright's `globalSetup`, persisted as `storageState` and reused by every subsequent test's browser context — never a test-only auth-bypass code path.**

| Option | Rejected / accepted because |
|---|---|
| **Real UI login as setup for every one of the ~24+ tests** | **Rejected as the default.** Multiplies total suite run time by the login flow's own latency × the number of tests, for zero added coverage beyond what a single, dedicated login-flow test (already one of the nine named flows in Accessibility AC4/`e2e-test-engineer.md`'s charter) already provides. Running it 24+ times also *dilutes* signal — a failure becomes "route N's setup broke" noise instead of a clear "login itself is broken" signal from the one dedicated test. Kept in exactly one place: the login-flow-specific test. |
| **A test-only auth-bypass endpoint or header, `NODE_ENV`-gated** | **Rejected outright, not just "not now."** A production code path that lets any request skip Better Auth's real session-issuance mechanism is precisely the standing risk-surface class this codebase's own security posture (Risk #4's "every route scoped by authenticated user ID," the Admin authorization mechanism's own design-stage-plus-pre-release Security Architect review precedent) exists to prevent — an environment-detection bug, a misconfigured deploy, or a staging environment reachable from outside would turn a "test-only" bypass into a real one. `phase-5a-accessibility-responsive.md`'s own DoD flags exactly this category ("the new Playwright suite's own test-credential handling gets a quick look" from the Security Architect) — the correct response to that flag is not building a bypass at all, so there is nothing for that review to need to catch. |
| **`storageState` + `globalSetup` (Playwright's own first-class mechanism)** | **Chosen.** Zero change to any production code path — no new route, no new header, no new environment branch in `lib/auth.ts`. The real `emailAndPassword` sign-in flow is exercised, for real, exactly once per run, against a dedicated, fixed test account, in `globalSetup`; the resulting session is a completely ordinary, DB-backed `Session` row — the exact same live-joined session `getCurrentUser()` reads for every real user (per `lib/auth.ts`'s own documented "database strategy" design) — so every subsequent test exercises the identical authenticated code path production traffic does, not a special-cased one. This is, if anything, a *stronger* correctness guarantee for the login flow itself than option 1: one real login attempt with one clear pass/fail, rather than 24+ chances for a transient failure to be misattributed to whichever route happened to be running. |

**Fixture data — a new, dedicated seed script, not a reuse of `showcase@lkbudget.demo`:**

`prisma/seed-e2e-test-user.ts` (Database Architect/Backend Engineer implementation — `npm run seed:e2e`), following `prisma/seed-showcase.ts`'s own "operational script, not a product feature" precedent exactly (confirmed by direct read of that file's header comment): creates one fixed, real, loggable-in account (e.g. `e2e-test@lkbudget.dev`, password from an env var — `E2E_TEST_USER_PASSWORD`, never a literal committed to any test file, mirroring `.env.example`'s existing `CRON_SECRET`/`BETTER_AUTH_SECRET` "generate a real secret, never commit it" convention) with a small amount of fixture data across every domain the 24-route inventory needs to render meaningfully (at minimum: one Account, one Transaction, one Budget category with an allocation, one Bill, one Savings Goal, one Debt, one Investment holding, one Recurring Income stream, one Financial Goal) — enough that every dynamic-route entry in `ROUTE_INVENTORY` (§1.4) resolves to a real record, and every list-view route renders its populated state, not an empty-state screen.

**Deliberately a separate account from `showcase@lkbudget.demo`, not a reuse of it**, for two concrete reasons: (1) the showcase account is the explicit target of Admin's own Seed Demo Data capability (`admin.md` Capability 6), re-seedable at any time by a human admin through the product's own UI — a running Playwright suite depending on that same account's data staying stable mid-run would be silently broken the moment anyone (or any other automated process) triggers a demo reseed; (2) mixing "data a human might reset via the product's own UI mid-demo" with "data an automated test suite requires to exist in a stable, predictable shape" conflates two different concerns sharing one resource, the same smell this project's naming/ownership discipline avoids elsewhere (e.g. `ReportGenerationEvent`'s deliberately narrow, single-purpose shape per `phase-4c-technical-design.md` §5.1). `prisma/seed-e2e-test-user.ts` should include a `NODE_ENV === "production"` guard that refuses to run (throws, does not silently no-op) — a defensive addition beyond `seed-showcase.ts`'s own precedent (which has no such guard, since it's understood to be manually invoked by a trusted operator only), justified here because an E2E seed script is more plausible to end up wired into an automated pipeline than a manually-triggered demo script, and being defensive against that is cheap.

**Admin routes (6 of the 24: `/admin`, `/admin/users`, `/admin/audit-log`, `/admin/feature-flags`, `/admin/categories`, `/admin/demo-data`) need a second, separately-flagged test account.** The ordinary `e2e-test@lkbudget.dev` account must **not** hold the `ADMIN` tier — a second, dedicated `e2e-test-admin@lkbudget.dev` account is granted `ADMIN` via the **existing**, already-reviewed `scripts/grant-admin.ts` operational script (`npm run grant:admin -- e2e-test-admin@lkbudget.dev`, run as one more step of the same seed sequence) — reusing that already-sanctioned mechanism rather than inventing a second grant path. Playwright's `projects`/`test.use({ storageState })` mechanism scopes a distinct `storageState` file per test file or `describe` block natively — `ROUTE_INVENTORY`'s `requiresAdmin` flag (§1.4) is what the generated-test loop reads to decide which of the two `storageState` files a given route's test runs under; no custom plumbing beyond Playwright's own documented API is needed.

---

## 2. Bottom-navigation component design

### 2.1 New component: `components/shared/bottom-nav.tsx`, reusing `NavItem` but not `NAV_SECTIONS`' data

**Decision: `components/shared/bottom-nav.tsx`, a new, UI-Component-Engineer-owned file at the same ownership tier as `sidebar.tsx`/`top-nav.tsx` — reusing `sidebar.tsx`'s exported `NavItem` type directly, but backed by its own small, separately-declared item list, not a runtime-filtered subset of `NAV_SECTIONS`.**

Reusing the type: `BottomNav`'s items are structurally identical to `Sidebar`'s (`{ label, href, icon }`) — importing `NavItem` from `sidebar.tsx` (`import type { NavItem } from "@/components/shared/sidebar"`) avoids redefining an identical shape a second time, the same "avoid duplication" discipline this project applies everywhere else.

**Not deriving the list by filtering `NAV_SECTIONS`, deliberately:**
1. `NAV_SECTIONS` has no field to filter on — it is grouped by *domain section* (Planning/Wealth/Account), not by *frequency of use*, and `NavItem` carries no `priority`/`pinned` flag today. Making a filter-based derivation work would require adding a new field to `NAV_SECTIONS` — a structural change to a shared, `Sidebar`-owned data structure — purely to serve one narrower consumer's need, a heavier coupling than the relationship calls for.
2. The product spec's own Open Question (b) resolution frames the exact 4–5-route set as "the Frontend Lead's implementation call, not fixed here" — i.e., deliberately expected to be tuned independently of `NAV_SECTIONS`' own future edits. A filter-based derivation would silently and automatically add a bottom-nav slot every time a future phase adds a `NAV_SECTIONS` entry, which is exactly the kind of unintended coupling an explicit, separate list prevents.
3. A separately-declared 4–5-item array is a few lines of code — this is the *simpler* option, not the more "clever" one; deriving it via a filter would be more code, more indirection, and more implicit coupling for no benefit.

```ts
// components/shared/bottom-nav.tsx — illustrative shape, item list is Frontend Lead's exact call
import { type NavItem, isActivePath } from "@/components/shared/sidebar" // isActivePath, see §2.3

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Budgeting", href: "/budgeting", icon: PiggyBank },
  { label: "Bills", href: "/bills", icon: CalendarClock },
  // "More" is not a NavItem — see §2.2, rendered as a fifth, distinct button
]
```
**Risk closed cheaply, not left implicit:** because this list is hand-maintained separately from `NAV_SECTIONS`, a route renamed/removed from `NAV_SECTIONS` without a corresponding `BOTTOM_NAV_ITEMS` update would silently point to a stale `href`. Recommended for the E2E/Backend Engineer building this out: one small Vitest unit test asserting every `BOTTOM_NAV_ITEMS[i].href` exists among `NAV_SECTIONS`' flattened `href`s — cheap insurance, not a runtime dependency between the two files.

### 2.2 The "More" entry: lifting `mobileNavOpen` into `(dashboard)/layout.tsx`, not a second `Sheet`

The spec's own illustrative 4–5-item example includes a "More" entry opening the existing hamburger `Sheet`. Read directly, `TopNav`'s `Sheet`/`SheetTrigger`/`SheetContent` (rendering `<Sidebar mobile />`) is driven by an **internal, unexported `useState`** (`const [mobileNavOpen, setMobileNavOpen] = React.useState(false)`, `top-nav.tsx` line 100) — not lifted to any parent, not exposed via any prop today. Two files cannot both own that one boolean, so this needs an explicit answer.

| Option | Rejected / accepted because |
|---|---|
| **`BottomNav` renders its own second, independent `Sheet` + `<Sidebar mobile />`** | **Rejected.** Duplicates `TopNav`'s existing `Sheet`+`Sidebar mobile` composition verbatim in a second file — a direct "avoid duplication" violation — and reintroduces, in code, exactly the "two competing mobile-nav mechanisms" risk (Risk #42) the product spec's Open Question (b) resolution was written specifically to close at the product level. Two independently-openable Sheets for the same underlying nav content is a state-desync bug waiting to happen (e.g. both open at once, or one closing without the other noticing). |
| **A new shared React Context (`MobileNavContext`), provided once in the layout, consumed by both** | **Considered, not chosen.** Functionally equivalent to the chosen option for this specific two-consumer case, but Context is the heavier tool — justified in this codebase (`ThemeProvider`, `CurrencyPreferenceProvider`) when state must reach an arbitrary, unknown-in-advance depth of consumers. Here there are exactly two, both direct siblings mounted by the same parent layout file. No precedent anywhere in this codebase reaches for Context before prop-lifting through the nearest common parent is shown insufficient — introducing one here would be a third, novel state-sharing mechanism for what is a two-file relationship. |
| **Lift `mobileNavOpen` out of `TopNav` into `(dashboard)/layout.tsx`, threaded down as controlled props to both `TopNav` and `BottomNav`** | **Chosen.** `TopNavProps` gains two new **optional** props: `mobileNavOpen?: boolean` and `onMobileNavOpenChange?: (open: boolean) => void` — the ordinary controlled/uncontrolled pattern React (and `Sheet`'s own underlying Radix `open`/`onOpenChange` API) already uses. When omitted, `TopNav` falls back to its current internal `useState` exactly as today — **zero behavioral change for every existing render path that doesn't pass them** (every admin page, every test, every other consumer of `<TopNav />`). `TopNav`'s own `Sheet`/`SheetContent`/`<Sidebar mobile />` markup does not move at all. `(dashboard)/layout.tsx` — which already composes `Sidebar` + `TopNav` + `children`, and already needs to add `BottomNav` to that composition per this pass regardless — is the one file that lifts the boolean into its own `useState` and threads it into `TopNav`'s two new props and `BottomNav`'s own `onMoreClick` callback. `BottomNav` itself never imports or touches `Sheet`/`Sidebar` — it only exposes a plain `onMoreClick?: () => void` prop on its "More" button, keeping `BottomNav` exactly as domain/state-agnostic as `Sidebar`/`TopNav` already are per the module-boundary table's "`components/shared/` may import nothing domain-specific" rule. |

### 2.3 A second, real duplication risk found and closed: `isActivePath`

`sidebar.tsx` defines a private, unexported `isActivePath(pathname, href)` helper (handling the root-path exact-match special case) used only by `SidebarLink` today. `BottomNav` needs the identical "is this the active route" logic for its own `aria-current="page"` treatment (required to match `Sidebar`'s pattern, per Accessibility AC10). Leaving `BottomNav` to reimplement this itself would be a real, concrete duplication risk — a subtle drift between the two (e.g. the root-path special case being forgotten in one copy) is exactly the kind of bug this project's "avoid duplication" standard exists to prevent. **Decision: export `isActivePath` from `sidebar.tsx`** (a one-line visibility change, `function` → `export function`, no new file, no behavior change to `Sidebar` itself) and import it into `bottom-nav.tsx`. Flagged explicitly here so it's caught by design rather than at review.

### 2.4 Breakpoint: `sm:hidden`, not `Sidebar`'s `md`/`lg` — a load-bearing, easy-to-get-wrong detail

**`BottomNav` must be hidden at `sm` (640px) and above, not at `md` (768px) — a different breakpoint than `Sidebar`'s own existing hide points, and an easy mistake to make by copying `Sidebar`'s or `TopNav`'s existing responsive classes instead of the spec's own bound for bottom nav specifically.**

`Sidebar` (confirmed by direct read) is `hidden ... md:flex` (hidden below 768px) with its icon-only band between `md` and `lg`; `TopNav`'s hamburger trigger is `md:hidden` (visible below 768px). The Responsive Capability's own Edge Case is explicit: bottom nav is a `<640px`-only pattern, rendering nothing at tablet (640–1024px) and above. This produces a real, deliberate, already-product-resolved 640–768px "gap band" in which **neither** the persistent sidebar rail (still hidden below `md`=768px) **nor** bottom nav (hidden at `sm`=640px and above) is visible — only `TopNav`'s hamburger `Sheet` trigger (`md:hidden`, so still visible through 767px) is the way into navigation in that exact band, exactly matching **today's already-shipped, already-correct** behavior, which Responsive AC6 explicitly scopes this phase to *re-verify*, not rebuild. `BottomNav`'s own Tailwind class must therefore be `flex sm:hidden` — **not** a copy-paste of `Sidebar`'s/`TopNav`'s `md:` breakpoint — or the app would ship with either a duplicate nav surface visible in the 640–768px band (if `BottomNav` used `md:hidden`) or an unintended navigation gap elsewhere. Named here explicitly, in writing, so the Frontend Lead implementing this does not have to rediscover it by testing every breakpoint by hand.

**Companion change required, not optional:** once `BottomNav` is fixed-positioned at the viewport bottom below `sm`, `(dashboard)/layout.tsx`'s `<main>` element needs matching bottom padding at that same breakpoint (e.g. `pb-16 sm:pb-0`, exact value TBD by `BottomNav`'s final height) so bottom-nav-obscured content is never rendered unreachably behind it — the classic "forgot the safe-area padding" bug class, flagged here as a required companion edit to the same layout file, not a separate follow-up.

### 2.5 Mounting and touch targets

`BottomNav` mounts unconditionally in `(dashboard)/layout.tsx` (a Server Component, exactly like `Sidebar`/`TopNav` are already composed there today) — never in `app/admin/layout.tsx`, which is a structurally separate layout tree (`phase-4c-technical-design.md` §1.4's "sibling to `(auth)/` and `(dashboard)/`, not nested inside either") that simply never imports `BottomNav` at all; this is true by construction, not an exclusion check anyone has to write, and matches the spec's own Admin edge case verbatim ("Admin's own chrome... has no bottom-nav equivalent and is not in scope for one"). Each `BottomNavLink`/the "More" button must meet the 44×44px minimum (Responsive AC5) — a UI Component Engineer implementation detail (padding/hit-area), not further specified here. Ownership: UI Component Engineer builds it (matching `sidebar.tsx`/`top-nav.tsx`'s existing ownership per the module-boundary table); Frontend Lead mounts it in the layout — the identical "built by the feature-neutral owner, mounted by Frontend Lead in the authenticated layout" split `phase-4c-technical-design.md` §3.3 already established for `TimezoneAutoCapture`.

---

## 3. Mobile-treatment component patterns

### 3.1 Card-list fallback — the one pattern earning a genuinely reusable primitive

Six consumers (Transactions, Admin's `UserTable`/`AuditLogTable`, Bills'/Recurring Income's `OccurrenceHistoryTable` — confirmed the full, correct count directly via the resolution pass's own grep of every `components/shared/data-table` import) is enough volume to justify a shared primitive, per the dispatch's own framing. **Decision: lives in `components/shared/data-table/`, as a responsive companion to the existing `DataTable`, not a wholly separate primitive.**

**Mechanism: each consumer's existing `ColumnDef<TData>[]` array is the single source of truth for both layouts — no second, parallel "card config" per consumer.** TanStack Table's `ColumnDef` already supports an arbitrary, per-column `meta` object (an existing extension point of the library already in use, not a new mechanism this codebase invents). Each column gains an optional `meta: { cardDisplay?: "primary" | "secondary" | "hidden" }`:

- `"primary"` — rendered large/prominent at the top of the card (e.g. Transactions' merchant + amount, `OccurrenceHistoryTable`'s status).
- `"secondary"` (the default when `meta.cardDisplay` is omitted — a safe, visible-by-default fallback, so a column a developer forgets to annotate degrades to "shown, plainly" rather than silently vanishing from the mobile view, matching this project's own "never silently drop" discipline already established for Calendar v2's day-cell overflow edge case and moderate/minor a11y findings) — rendered as a smaller label:value pair in the card body.
- `"hidden"` — omitted from the card entirely (e.g. an internal sort-only column, if any exists).

The per-row action column (Bills'/Recurring Income's Mark Paid/Unmark button, Transactions'/Admin's row-action menu) needs no special handling at all: its `cell` renderer is already a fully-formed React node regardless of context, and `DataTableCardList` renders that exact same `cell` via TanStack's own `flexRender(column.columnDef.cell, cell.getContext())` — the identical call `data-table.tsx` (line ~235) already uses for table cells. **This is the concrete answer to "how does a consumer supply prominence without a bespoke per-feature card layout each time": the consumer writes its `columns` array exactly once, adds a few characters of `meta` annotation per column, and gets both layouts for free from that one declaration.**

**New files:**
```
components/shared/data-table/
├── data-table.tsx                  # UNCHANGED responsibility — still "the" table renderer;
│                                    #   gains one new optional prop, `table?: TanstackTable<TData>`,
│                                    #   used only by ResponsiveDataTable below (§ mechanism), so
│                                    #   every existing DataTable consumer is unaffected
├── data-table-card-list.tsx        # NEW — DataTableCardList<TData>, reads meta.cardDisplay,
│                                    #   renders one card per row via the same flexRender calls
├── responsive-data-table.tsx       # NEW — ResponsiveDataTable<TData, TValue>, thin composition:
│                                    #   constructs ONE shared useReactTable instance, renders
│                                    #   <DataTable table={table} className="hidden sm:block" />
│                                    #   alongside <DataTableCardList table={table} className="sm:hidden" />
├── data-table-column-header.tsx    # UNCHANGED
├── data-table-pagination.tsx       # UNCHANGED
└── index.ts                        # gains ResponsiveDataTable, DataTableCardList exports
```
**Breakpoint switch: the same CSS-only, dual-render-then-hide mechanism as `BottomNav`/`Sidebar`'s mobile variant — never a JS media-query detection, to avoid hydration mismatches (§2.4's own precedent, applied consistently a third time).** Both the table markup and the card-list markup exist in the DOM simultaneously (`hidden sm:block` / `sm:hidden`), a minor, bounded doubling of DOM nodes per table — acceptable at this app's realistic, pagination-bounded row counts (typically 10–50 rows per page), the same tradeoff already accepted for `Sidebar`'s own always-mounted mobile variant inside `TopNav`'s `Sheet`.

**"Identical pagination/search/sort/filter behavior" (the spec's own edge case) holds by construction, not by convention**: `DataTableCardList` is a pure alternate row-renderer sharing the exact same `useReactTable` instance, the exact same `table.getRowModel().rows`, the exact same pagination/sort/filter state as `DataTable`'s own table markup — there is no second, independent state to drift out of sync. The identical "verified by construction, not convention" discipline `phase-4c-technical-design.md` used repeatedly for its own guarantees (Reports' zero-`lib/ai/`-import, `SystemCategoryTemplate`'s AC7 non-retroactivity), reapplied here.

**Migration for the 5 existing consumers** (corrected from an earlier "6" miscount — see risk-register #46's Release Manager correction): each swaps `<DataTable columns={columns} data={...} />` for `<ResponsiveDataTable columns={columns} data={...} />` (identical remaining props — a drop-in replacement) and adds `meta: { cardDisplay: "primary" }` to its 1–2 most important columns. Which columns are "primary" per feature is the Frontend Lead's/UI Component Engineer's call — this pass fixes the mechanism, not the per-feature visual choice, consistent with this document's own stated non-goal.

### 3.2 The other three patterns — named homes, not fully designed (per the dispatch's own scope)

- **Column-priority collapse (Reports):** lives inside `features/reports/components/` itself, **not** a new shared primitive. Reports doesn't consume `components/shared/data-table` at all (confirmed by the resolution pass's own five-consumer count, which excludes Reports) — its surface is a type/period/Generate form plus an occasional preview table, structurally different from the five `DataTable` consumers. The form itself needs no new mechanism at all: ordinary Tailwind responsive-grid reflow (`grid-cols-1 sm:grid-cols-2`-style), the same pattern the resolution pass already confirmed Debt's `strategy-comparison.tsx` and Investments' `holding-row.tsx` use "by construction" today. If Reports' inline preview table needs literal column-hiding at narrow widths, that's a plain `hidden sm:table-cell` per-column treatment directly on whatever table markup Reports already renders — deliberately not routed through `ResponsiveDataTable`/card-list, since the product spec assigned Reports a different pattern for a stated reason (not a high-frequency interactive table), not by omission.
- **Horizontal-scroll-with-affordance (Analytics charts):** a new, small, domain-agnostic wrapper, `components/shared/scroll-affordance-container.tsx` — `overflow-x-auto` plus a pure-CSS edge-gradient/shadow affordance (no JS scroll-position tracking needed for a static, always-visible edge fade). Lives in `components/shared/` at the same tier as `stat-card.tsx`/`month-navigator.tsx` (generic, no domain knowledge), so however many of Analytics' Recharts-rendered charts need it (an exact count is Frontend Lead's implementation-time inventory, not fixed here) wrap their existing chart markup in this one shared container rather than each independently reinventing scroll-affordance CSS.
- **Condensed-grid-plus-tap-to-expand (Calendar v2):** designed in full in §4 below, since this is the one pattern the resolution pass explicitly left this pass to design the component boundary for.

---

## 4. Calendar v2's day-detail affordance

**Decision: reuse the existing `Sheet` primitive (`components/ui/sheet.tsx`), `side="bottom"` variant, in a new, feature-owned Client Component, `features/calendar/components/day-detail-sheet.tsx` — not a new popover/modal mechanism, and not a shared `components/shared/` primitive (this interaction pattern has exactly one consumer today).**

- **Why `Sheet`, not `Dialog` or a bespoke popover:** `Sheet` is already this codebase's established "tap a small element on mobile, reveal a fuller list in an overlay" primitive — `TopNav`'s own hamburger trigger uses it for structurally the identical shape (a compact icon → the full nav list), and reusing an already-proven pattern here follows the same discipline `CalendarGrid`'s own existing JSDoc already applies to its grid-layout math (reusing Calendar v1's helper rather than reinventing it). `Dialog` in this codebase reads as centered/modal, reserved for focused single-task flows (forms, confirmations); a day's full entry list is better served by `SheetContent`'s existing `side="bottom"` variant (already a supported prop, no new code needed in `sheet.tsx` itself) — a slide-up panel, not a centered modal.
- **Focus-trap/focus-return: already handled, confirmed by direct inspection (§5.2) — no new code needed for this guarantee.**
- **Entry rendering: reuses `BillEntry`/`PaydayEntry` verbatim inside the Sheet's content** — no new entry-rendering logic; each still links to its own Bill/Income-stream detail page exactly as today (`calendar-and-notifications.md` AC4, unchanged), since the Sheet is only a new *container context* for components that already exist.
- **State ownership:** `CalendarGrid` (already a Client Component owning `router`/`searchParams` state per its own existing JSDoc) adds one `useState<string | null>` — the currently-expanded day's key, or `null` — passed to `DayDetailSheet` as its `open`/`onOpenChange`-equivalent controlled prop, the same controlled shape `Sheet`'s own Radix primitive already expects.
- **Breakpoint:** the condensed cell + tap-to-expand affordance renders only below `sm` (640px, matching every other mobile-only treatment in this pass); the ordinary, full multi-entry-per-cell grid (today's existing, unchanged `CalendarGrid` rendering) continues at `sm`+ — the same CSS-only dual-render-then-hide mechanism as §2.4/§3.1, both existing in the DOM simultaneously for the same hydration-mismatch-avoidance reason.
- **Per-entry-type indicator** (a capped row of non-color-reliant dots/glyphs, "+N" overflow per the spec's own edge case): a new, small, **feature-owned** presentational component, `features/calendar/components/day-entry-indicators.tsx` — not promoted to `components/shared/`, since this rendering concept has no other consumer anywhere in the app today (the same "genuinely cross-feature" bar `lib/merchant-normalization.ts`'s own precedent requires before something moves out of a feature module). Promoting it later, if a future phase needs the identical treatment elsewhere, is a low-risk, additive move at that time, not a rewrite.

```
features/calendar/components/
├── calendar-grid.tsx           # UNCHANGED file, gains one useState + conditional render below sm
├── day-detail-sheet.tsx        # NEW — wraps components/ui/sheet.tsx, side="bottom"
├── day-entry-indicators.tsx    # NEW — condensed-cell dot/glyph row, capped + "+N" overflow
├── bill-entry.tsx               # UNCHANGED — reused verbatim inside DayDetailSheet
├── payday-entry.tsx             # UNCHANGED — reused verbatim inside DayDetailSheet
└── budget-reset-marker.tsx      # UNCHANGED
```

---

## 5. Accessibility infrastructure beyond axe-core

### 5.1 Reduced-motion: confirmed zero overlap with 5a, including for the new tap-to-expand interaction

**Agreement with the spec, re-verified against the actual new component this pass introduces (`DayDetailSheet`), not just restated:** 5a introduces exactly one new interactive overlay (`DayDetailSheet`, §4) whose open/close transition is `Sheet`'s own **pre-existing**, CSS-driven `data-[state=open]:animate-in`/`slide-in-from-bottom-10` treatment (confirmed directly in `components/ui/sheet.tsx`) — the identical animation every other `Sheet` consumer in this app (including the already-shipped hamburger nav `Sheet`) already has today, entirely unrelated to Framer Motion and entirely unrelated to anything 5a is newly introducing. Since `prefers-reduced-motion` support is explicitly deferred to 5b and scoped there to be implemented **once, centrally** (`MotionConfig reducedMotion="user"` or an equivalent single shared mechanism, per the CTO's own Section 3 binding constraint), there is no argument for `DayDetailSheet` receiving a bespoke reduced-motion carve-out now while every other pre-existing `Sheet`/`Dialog` instance in the app (including the one it's structurally identical to) remains unaddressed until 5b's centralized fix lands. **Conclusion: no reduced-motion-adjacent work belongs in 5a, including for the condensed-grid tap-to-expand interaction** — `DayDetailSheet` inherits whatever 5b's centralized mechanism does for every other `Sheet` in the app automatically and for free once that ships, the identical "inherits the fix automatically, no change required to this module" shape `phase-4c-technical-design.md` §2.4 already established for Calendar v2 and the (deferred) timezone-consuming-logic rewrite.

### 5.2 Focus-trap / focus-return for `Dialog`/`Sheet`: already handled by Radix, confirmed by direct inspection — no new code required

**Confirmed, not assumed:** `components/ui/dialog.tsx` and `components/ui/sheet.tsx` are both built directly on Radix UI's `Dialog` primitive (`import { Dialog as DialogPrimitive } from "radix-ui"` and, in `sheet.tsx`, `import { Dialog as SheetPrimitive } from "radix-ui"` — `Sheet` is, structurally, the same Radix `Dialog` primitive styled differently, not a separate underlying mechanism). Radix's `Dialog.Root`/`Dialog.Content` traps Tab/Shift+Tab cycling within the open dialog, sets initial focus on mount, and restores focus to whatever element had focus immediately before opening, the moment the dialog closes — **automatically, with zero opt-in configuration, entirely inside Radix's own internals, never touched by any FinanceOS-authored code in either file.** This is exactly the "closing the mobile nav `Sheet` returns focus to the hamburger trigger button" behavior the spec's Edge Case requires.

**Consequence: this AC/edge-case requirement is already satisfied, by the underlying library, for every existing `Dialog`/`Sheet` consumer in this app today, and for `DayDetailSheet` (§4) once built — no new production code is required.** What 5a's actual work on this front is, therefore, is **verification**, not construction:
1. Confirm no existing `Dialog`/`Sheet` consumer manually overrides focus in a way that fights Radix's own default restore-focus timing (e.g. a consumer calling `.focus()` on a different element inside an `onOpenChange` handler) — a targeted code-review pass, not a new mechanism.
2. **Write real, automated Playwright coverage of this behavior anyway** — the spec's own Edge Case explicitly treats a focus-trap/focus-return violation "as a defect, not a nice-to-have" — an automated assertion (open a `Dialog`/`Sheet`, Tab through every focusable element and assert focus never leaves it, close it, assert `document.activeElement` is the original trigger) is real, still-needed E2E Test Engineer work, distinct from whether new *production* code is needed (it is not).

---

## 6. Visual-regression tooling — declined for 5a, with an explicit revisit trigger

**Decision: do not adopt a visual-regression/screenshot-diffing tool for 5a. Rely on the newly-bootstrapped Playwright suite's structural checks (§1: no-horizontal-scroll, axe-core's landmark/contrast-adjacent structural rules) plus the Bug Hunter's manual cross-breakpoint/cross-theme review, per the existing DoD.**

**Against adopting now:**
1. **No demonstrated need — the same "don't build the general/configurable version of a capability before a demonstrated need justifies it" pattern this project has now applied four times** (Risk #28's widget-builder/multi-currency rejection, the reduced-motion-override rejection, cross-browser Playwright scope in §1.2, and now this). A visual-regression tool is real, ongoing infrastructure — baseline images to generate/maintain, an intentional-diff review/approval workflow, storage, and a genuinely new source of test flakiness (font-rendering/anti-aliasing differences between CI and local, animation-timing races even before 5b's motion work lands) this project has zero operating experience with.
2. **Zero prior visual-regression incidents exist as evidence such a tool would have caught anything** — no prior phase's release notes or bug reports (`docs/testing/bug-reports/*.md`, 21 files) cite a shipped visual regression missed by structural/manual review. The precedent this project actually has — structural Vitest coverage plus a manual, live Bug Hunter pass — has shipped nine phases/sub-phases cleanly.
3. **Adopting it inside the same phase that's also standing up Playwright/axe-core for the first time would double the amount of genuinely new testing infrastructure this one phase must get right**, when the spec's own DoD is already anchored on a narrower, different bar (zero critical/serious axe violations, no horizontal scroll, 44×44 touch targets) a screenshot-diff tool doesn't verify any more precisely than the structural checks already planned.

**Taking the case FOR adopting seriously, not waving it away (per the dispatch's own instruction):** the real, specific counter-argument is that 24 routes × 3 breakpoints × 2 themes × 7 accent-color states (the 5a contrast audit's own combinatorial surface) is genuinely too large for a human Bug Hunter to exhaustively eyeball every combination, and a fix to one route could silently regress another route sharing the same component. This is taken seriously, not dismissed — but the automated coverage this pass **is** already building targets the higher-severity half of that surface structurally (a horizontal-scroll regression, a clipped/overflowing element, and every landmark/contrast/focus-order violation axe-core catches are all DOM/CSSOM-detectable, no pixel-diff required), while the failure modes a screenshot-diff tool uniquely adds beyond that (a color slightly off, an icon subtly misaligned, a spacing regression that doesn't overflow) are lower-severity and already have a designed, non-catastrophic outcome under this phase's own DoD — a "named, owned backlog item," per Accessibility AC2, not a blocking failure. Given that asymmetry, the infrastructure this pass is already building targets the zero-tolerance failure class at its intended full coverage; a screenshot-diff tool would mostly catch the class this phase's own DoD already tolerates as tracked, non-blocking debt.

**Explicit revisit trigger, not a silent forever-decision** — matching this project's own standing discipline for every "not now" call (Risk #31's audit-log-retention "revisit if a real storage signal emerges"): **if 5b's later motion pass (chart transitions, page transitions, expandable-card animation — exactly the class of change where a screenshot-diff tool's actual strength, catching an unintended visual side-effect nobody thought to manually re-check, is most relevant) or any future phase's release notes surface a real, shipped visual regression this phase's structural checks plus manual review missed, that is the concrete evidence this project's precedent requires before adopting the tool — and 5b's (or a later) Solution Architect pass should weigh it fresh at that point,** not treat this as permanently closed. See §7 (Risks) for the tracked extension to Risk #45.

---

## 7. Sequencing within 5a's own implementation

The CTO's Section 1/Section 6 milestone list already fixes "responsive before accessibility" as a **product-level** build order (final structure lands, then the audit runs against it once). This pass refines that into three technically distinguishable sub-steps, since "the Playwright/axe-core bootstrap" is not one atomic event that must sit entirely before or entirely after the responsive work — it decomposes into markup-independent infrastructure standup versus markup-dependent assertion execution, and conflating the two would either needlessly delay useful tooling or needlessly rush a hard gate check against unfinished markup:

1. **Infrastructure standup starts immediately, in parallel with — not after — the responsive implementation.** Installing `@playwright/test`/`@axe-core/playwright`, `playwright.config.ts`, `tests/e2e/support/route-inventory.ts`, the dedicated E2E test-user seed script, and the `globalSetup` storage-state login (§1) have zero dependency on any route's final DOM shape — pure tooling/fixture work. Standing this up first gives the Frontend Lead/UI Component Engineer a working, running harness to use as a live verification tool from day one of the responsive pass, rather than building blind against a Playwright suite that doesn't exist yet or was never actually exercised until the very end.
2. **The no-horizontal-scroll structural checks (Responsive AC2's automatable half) run continuously, iteratively, throughout the responsive-implementation milestone** — orthogonal to the accessibility pass's own concerns (landmarks/ARIA/focus order), so there's no reason to withhold them until accessibility's turn. Running them early turns them into a fast, tight feedback loop for the responsive work itself, rather than a big-bang discovery at the very end.
3. **The axe-core accessibility assertions that actually gate the release (zero critical/serious violations) run only once, as a hard checkpoint, after both the responsive implementation and the accessibility structural-fix pass (landmarks/ARIA/focus order/contrast tokens) are complete** — exactly per the CTO's own Section 1 reasoning: auditing pre-final markup risks a second, narrower re-audit once the bottom nav/card-list conversions land, strictly more total work than auditing once against final structure. This is the one piece of Playwright/axe-core work that genuinely must wait.

**This does not override the CTO's binding sequencing decision** (the axe-core gate still fires exactly once, at the end, against final structure) — it clarifies that only the axe-core *gate check* is what's being sequenced after the responsive work; the tooling's *installation* and its *non-accessibility-specific structural checks* are not, and should not be read as blocked by milestone 4's "responsive... then accessibility" wording if implemented literally.

---

## 8. Follow-up corrections owed to sibling architecture documents (not made in this pass)

This pass's own deliverable is this one file. The following pointer/correction edits are recommended for the same dispatch that begins implementation, matching the "substantial cross-cutting decision earns its own file, sibling docs get a short pointer" pattern `phase-4b-technical-design.md`/`phase-4c-technical-design.md` established — flagged here explicitly so they are not silently skipped:

- **`folder-tree.md`**: correct the Phase 0 `src/tests/e2e/` line to `tests/e2e/` (repo root), per §1.1.
- **`Architecture.md`**: gains a short "Phase 5a status note" pointer to this document (mirroring the existing Phase 4a/4b/4c notes), plus a one-line addition to the module-boundary table for `components/shared/data-table/`'s new `ResponsiveDataTable`/`DataTableCardList` exports and `components/shared/bottom-nav.tsx` (both UI Component Engineer-owned, no new import direction — see §2/§3.1).
- **`naming-standards.md`**: gains a Phase 5a entry recording `ColumnDef.meta.cardDisplay`'s three-value convention (`"primary" | "secondary" | "hidden"`, default `"secondary"`) as this codebase's one sanctioned mechanism for row-prominence, so a future feature doesn't invent a second, differently-named convention for the same concept.
- **`api-contracts.md`**: no new entry is required — this phase introduces zero new Server Actions, Route Handlers, or Server-Component-direct-call read functions (confirmed: every change described in this document is either test infrastructure with no production API surface, or a presentation-layer component reusing existing data/props). Worth stating explicitly, matching `phase-4c-technical-design.md`'s own "Cross-cutting closeout" precedent of naming what did *not* change, not just what did.

---

## 9. Risks — new items surfaced by this pass

Five new risks are surfaced by the specific choices in this document, appended to `docs/planning/risk-register.md` as #48–#52 in the same dispatch as this document (full text there — see that file's now-appended rows).

- **#48** — `folder-tree.md`'s stale `src/tests/e2e/` Phase 0 placeholder, if followed literally, would place Playwright `.spec.ts` files where Vitest's own default include glob (confirmed via direct read of `vitest.config.ts`, no `test.include`/`exclude` override present) would also collect and attempt to execute them, corrupting `npm run test`'s signal — closed by this pass's placement decision (§1.1: `tests/e2e/` at repo root) plus a recommended `vitest.config.ts` exclude as defense-in-depth.
- **#49** — The E2E suite's authentication strategy (§1.5) introduces this codebase's first deliberate, durable, real-credential test fixture (a dedicated `e2e-test@lkbudget.dev`/`e2e-test-admin@lkbudget.dev` pair, real passwords via env vars, a real Better Auth login executed in `globalSetup`) — flagged for the Security Architect's standing-but-lighter-touch 5a review, per the spec's own DoD ("the new Playwright suite's own test-credential handling gets a quick look"), to confirm no password is ever a committed literal and the ordinary test account never holds the `ADMIN` tier.
- **#50** — `BottomNav`'s own breakpoint (`sm`/640px) deliberately diverges from `Sidebar`'s/`TopNav`'s existing `md`(768px)/`lg`(1024px) breakpoints (§2.4) — an easy off-by-breakpoint implementation mistake that would either duplicate a nav surface in the 640–768px band or introduce an unintended navigation gap; flagged as an explicit implementation requirement, not left to be inferred from context.
- **#51** — `ResponsiveDataTable`'s `meta.cardDisplay` convention (§3.1) depends on each of the 5 migrated `DataTable` consumers being deliberately annotated; an unannotated column degrades safely to `"secondary"` (visible, not hidden) rather than silently vanishing, but is still worth a one-time review pass across all 5 consumers at implementation time to confirm each feature's "primary" choice is actually the right 1–2 columns, not an accident of default behavior.
- **#52** — Visual-regression tooling declined for 5a (§6) — extends Risk #45 with this pass's explicit revisit trigger (a real, shipped visual regression surfacing in 5b's motion pass or later, missed by 5a's structural checks plus manual review) rather than leaving the decision unresolved indefinitely.
