# FinanceOS — Public Demo Mode Technical Design

**Author:** Solution Architect, per the Product Owner's `docs/product/public-demo.md`, which explicitly delegates "the fixture-data module's file format or location, the mechanism by which a page renders fixture data instead of a live query, or the route-group/layout structure `/demo` lives under" to this pass (that spec's own §3, restated in its Dependencies section).

**Status:** design-stage. No production code has been written against this document. Frontend Lead/UI Component Engineer implementation, Backend Engineer's fixture-data build-out, and Security Architect's Capability-3 review are the next dispatches, gated on this document.

**Scope:** the seven questions routed to this pass — route/module architecture for `/demo`, the fixture-data mechanism and its cross-page-consistency guarantee, the component-reuse-vs-new-component decision for each of the ten in-scope pages (naming any real component too tangled to reuse cleanly), the read-only-by-construction enforcement mechanism, the never-visibly-stale date mechanism and its Next.js rendering/caching implication, the demo nav/banner component boundary, and the detail-route fixture-ID strategy.

This document assumes the reader has read `docs/product/public-demo.md` in full. Every claim about existing code below was confirmed by direct inspection, not inferred from the product spec alone: `docs/architecture/folder-tree.md`, `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/debt/page.tsx`, `src/app/(dashboard)/accounts/page.tsx`, `src/app/(dashboard)/goals/page.tsx`, `src/app/(dashboard)/goals/[goalId]/page.tsx`, `src/app/(dashboard)/budgeting/page.tsx`, `src/app/(dashboard)/analytics/page.tsx`, `src/app/(dashboard)/transactions/page.tsx` + `transactions-client.tsx`, `src/app/(dashboard)/financial-health-score/page.tsx`, `src/app/(dashboard)/investments/[holdingId]/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard-shell.tsx`, `src/app/(dashboard)/_lib/dashboard-card-groups.tsx`, `src/components/shared/sidebar.tsx`, `src/components/shared/top-nav.tsx`, `src/components/shared/motion/animated-number.tsx`, `src/features/accounts/components/account-card.tsx`, `src/features/debt/components/total-active-debt-card.tsx`, `src/features/dashboard/components/net-worth-history-chart.tsx`, `src/features/dashboard/server/service.ts`, `eslint.config.mjs`, and a full-repo grep of every `features/*/components/*.tsx` file that imports `server/actions` (30 files — see §3.3). This document, like `phase-5a-technical-design.md`/`phase-4c-technical-design.md` before it, is a "substantial cross-cutting decision earns its own file" companion to `Architecture.md`/`folder-tree.md`/`naming-standards.md`, which each owe a short pointer update once implementation begins (§8) — not made in this pass, whose own deliverable is this one file.

---

## 1. Route structure

**Decision: a new, real (non-route-group) top-level segment, `src/app/demo/`, sibling to `(auth)/`, `(dashboard)/`, `admin/`, and `api/` — confirming the dispatch's own candidate, not proposing otherwise.**

`(auth)` and `(dashboard)` are *route groups* (`folder-tree.md`: "Route groups `(auth)` and `(dashboard)` split layouts without affecting URL structure") — parentheses mean the segment name is invisible in the URL. `/demo` is the opposite case: the product spec's own Scope-Already-Decided section fixes the literal, visible path (`e.g. /demo`) as a binding, client-decided constraint, so this must be a **real** folder segment (`demo/`, no parentheses), not a route group. This mirrors `admin.md`'s own precedent exactly — confirmed by direct read of `app/admin/layout.tsx` — which is also a real, visible top-level segment (`phase-4c-technical-design.md` §1.4: "sibling to `(auth)/` and `(dashboard)/`, not nested inside either"), for the identical structural reason (a standing requirement about how this route relates to the rest of the app, not merely a layout-sharing convenience). The product spec's own AC1 draws this exact parallel ("the same 'its own separate route tree' precedent Admin established... applied here in the opposite direction").

**Why not nested under `(dashboard)/demo/`:** `(dashboard)/layout.tsx` (confirmed by direct read) is `async`, calls `getCurrentUser()`, and `redirect("/login")`s when it's `null` — this is the *load-bearing* authentication gate for every route under that group. Capability 1 AC3/AC4 require `/demo` to check nothing session-related and to introduce **zero exception** to that existing gate. Nesting under `(dashboard)` would force a choice between (a) weakening that layout's guard with a `/demo`-shaped carve-out (directly forbidden by AC4: "purely additive; it introduces no new gap in an existing gate") or (b) `/demo` inheriting a redirect-to-login it must never trigger. A sibling top-level segment sidesteps the question entirely — `src/app/demo/layout.tsx` is a **new, separate file** that never touches `getCurrentUser()`, so there is no shared gate to weaken or bypass, satisfying AC3/AC4 structurally rather than by carve-out.

**Sub-route shape mirrors the real app's ten in-scope paths 1:1**, so the mental model ("what's the demo version of `/accounts/[accountId]`?") never requires a lookup table:

```
src/app/demo/
├── layout.tsx                 # sync-shaped Server Component — see §5, §6. No getCurrentUser().
├── not-found.tsx              # shared "not part of this demo" state — §1, §7
├── page.tsx                   # Dashboard equivalent
├── accounts/
│   ├── page.tsx
│   └── [accountId]/page.tsx
├── transactions/page.tsx
├── budgeting/page.tsx
├── goals/
│   ├── page.tsx
│   └── [goalId]/page.tsx
├── financial-goals/
│   ├── page.tsx
│   └── [goalId]/page.tsx
├── debt/page.tsx
├── investments/
│   ├── page.tsx
│   └── [holdingId]/page.tsx
├── analytics/page.tsx
├── financial-health-score/page.tsx
└── [...catchAll]/page.tsx     # any other /demo/* path — calls notFound(), §1
```

**Out-of-scope/invalid paths (Capability 5's Edge Case — `/demo/bills`, a mistyped detail ID, etc.): one shared mechanism, not a per-route special case.** `src/app/demo/[...catchAll]/page.tsx`'s entire body calls Next's `notFound()`; every dynamic detail page (`[accountId]`, `[goalId]`, `[holdingId]`) does the same when its ID doesn't resolve against the fixture dataset (§7). Both paths render the same `src/app/demo/not-found.tsx` — a single, shared "not part of this demo" state, still wrapped in `layout.tsx`'s nav/banner chrome (Next.js renders a segment's `not-found.tsx` within that segment's own layout tree, not as a bare page), so a visitor who mistypes a URL still has the demo's own navigation available to recover, never a dead end or a hard crash. This satisfies the Edge Case's "resolves to a clear 'not part of this demo' state... never a hard crash, and never silently falling through to render the real, authenticated page" without writing the same copy twice.

**`robots.txt`/search-indexing (Open Question 2) and in-product discoverability (Open Question 1) are explicitly not decided here** — they don't change this section's structure either way (a `noindex` meta tag or a `robots.txt` disallow entry is an additive, independent concern from where the route lives), so they're left open per the spec's own framing.

---

## 2. Fixture data module

**Decision: a new feature module, `src/features/demo/`, not `src/fixtures/` or a `lib/` module — applying this codebase's own existing placement test, not inventing a new one.**

`Architecture.md`'s Guiding Pattern (restated verbatim in `phase-4b-technical-design.md`'s Reports rationale) draws the `lib/` vs. `features/` line on genuine cross-consumption: "reading from many other domains does not make a module cross-feature infrastructure... Reports is a pure 'leaf' consumer... nothing outside it will ever import from it." The demo fixture dataset is structurally identical — it reads/depicts the shape of many other domains' data, but **nothing outside `/demo` will ever import it**. By that already-established test, it is a feature module (`features/demo/`), not `lib/`.

### 2.1 Shape: atomic entities + a small set of shared derive functions — never independently hand-typed aggregates per page

The real risk this section has to close is the spec's own named one (Capability 2 AC3's Edge Case): "Analytics' income figure diverging from Dashboard's after an unrelated edit to one fixture file." The naive fixture design — hand-typing each page's already-aggregated props independently (`DashboardProps.monthlyIncome = 8400`, `AnalyticsProps.incomeGrowth = [...]` with its own independently-chosen numbers) — makes that drift not just possible but *likely*, since nothing would ever force the two figures to agree.

**The chosen mechanism, closing that risk by construction, not convention:**

1. **Atomic fixture entities, hand-authored once, typed against this codebase's own real domain types** — `features/demo/fixtures/{accounts,transactions,debts,investments,savings-goals,financial-goals,budget}.ts`, each exporting a small array/object typed as the **real** `Account`/`Transaction`/`Debt`/`Holding`/`GoalWithProgress`/etc. from that domain's own `features/*/types.ts` (e.g. `import type { Account } from "@/features/accounts/types"`). These type files are pure TypeScript type declarations with zero runtime import (confirmed: `types.ts` files never import `lib/db`/Prisma/Server Actions) — reusing them costs nothing and buys a real, compiler-enforced guarantee: the fixture data can never silently drift out of shape from what the real presentational components (§3) actually expect as props, even as those types evolve in later phases.
2. **One composition file, `features/demo/fixtures/household.ts`, assembles the above into a single exported `DEMO_HOUSEHOLD` object** — the one root value every derive function and every demo page ultimately reads from. This is the concrete answer to AC3's "one single, internally consistent household."
3. **A small set of demo-owned, pure "derive" functions, `features/demo/fixtures/derive/*.ts`, compute every cross-page aggregate exactly once from `DEMO_HOUSEHOLD`** — `deriveNetWorth(accounts, debts)`, `deriveMonthlySummary(transactions, month)`, `deriveSpendingByCategory(transactions, month)`, `deriveBudgetMonth(...)`, `deriveBudgetHealthScore(...)`, `deriveFinancialHealthScore(...)`, `deriveNetWorthHistory(...)` (§2.3), and the handful of Analytics metrics the demo page shows. **Dashboard's Net Worth stat and Accounts' balance list, or Dashboard's Monthly Income and Analytics' income figure, agree because they are computed by calling the *same* function over the *same* input — not because two independently-authored numbers happen to match.** This is the identical "verified by construction, not convention" discipline `phase-4c-technical-design.md` used for Reports'/`SystemCategoryTemplate`'s own guarantees, applied here to cross-page numeric consistency instead of an import restriction.

### 2.2 A real, named constraint this mechanism works around: the app's real aggregation functions cannot be reused

Read directly, `features/dashboard/server/service.ts`'s `getIncomeAndExpenses` (and every sibling aggregate function in that file, `features/debt/server/service.ts`, `features/analytics/server/*.ts`, etc.) pushes its summation **into Postgres** via Prisma's `aggregate`/`groupBy` (the file's own comment: "Both sums are pushed to Postgres via `aggregate`... per `docs/database/performance-considerations.md`"), rather than fetching plain rows and summing them in a separable, Prisma-free JS function. This is the right call for the real, DB-backed app — but it means **none of this codebase's real aggregation logic is reusable inside a Prisma-free route**, unlike e.g. `features/debt/payoff-math.ts` (an isomorphic, feature-root, genuinely pure file by the naming-standard's own binding definition — see §4). The demo module's derive functions in §2.1 are therefore a **deliberate, necessary reimplementation** of each figure's *documented business rule* (month-to-date range resolution, split-parent exclusion, the `null`-not-`0` savings-rate convention, etc. — all already precisely JSDoc'd in the real service files this pass read directly), not a code-reuse opportunity. **Named risk, not silently worked around:** each derive function's own doc comment must cite the real service function whose rule it mirrors (e.g. `deriveMonthlySummary`'s comment pointing at `dashboard/server/service.ts`'s `getIncomeAndExpenses`) so a future change to that business rule has an explicit, discoverable pointer to the fixture-side copy that must be updated to match — the same "flagged as a real risk, not assumed away" treatment the product spec itself already gives AC3's cross-page-drift edge case.

### 2.3 Net Worth History and other range-selector data: precomputed, not derived per click

`NetWorthHistoryChart` (§3.4 below) needs all four range options' (`30d`/`90d`/`1y`/`all`) data available with **no network round-trip**, since the demo has no backing route to refetch from. `features/demo/fixtures/derive/net-worth-history.ts` exports `deriveNetWorthHistory(household, now)`, computing and returning the full `Record<NetWorthHistoryRange, NetWorthHistoryResponse>` map once, at render time — every range is already resolved before the chart mounts, so switching ranges client-side is a pure, local lookup, not a fetch (§3.4).

### 2.4 `ids.ts` — the fixture's own stable identity layer

`features/demo/fixtures/ids.ts` exports one named constant object per entity kind (`DEMO_ACCOUNT_IDS`, `DEMO_GOAL_IDS`, `DEMO_FINANCIAL_GOAL_IDS`, `DEMO_HOLDING_IDS`), each a plain, readable, prefixed string (e.g. `"demo-account-checking"`, not a random-looking `cuid()`-shaped value — deliberately: nothing under `/demo` is a real database row, so mimicking Prisma's ID format buys nothing, while a readable slug helps anyone reading a demo URL, this file, or a future E2E test immediately understand which fixture it names). Every cross-reference between fixture files (a `Transaction.accountId`, a `Debt.accountId`) is a lookup against these constants, never a re-typed literal string — a broken cross-reference becomes a TypeScript compile error (an undefined property access), not a silent runtime string mismatch. This is also the mechanism §7 (detail routes) is built on.

### 2.5 File layout

```
src/features/demo/
├── fixtures/
│   ├── ids.ts                     # every stable fixture entity ID — §2.4
│   ├── relative-date.ts           # offset -> Date, anchored to render-time `now` — §5
│   ├── accounts.ts
│   ├── transactions.ts
│   ├── budget.ts
│   ├── debts.ts
│   ├── investments.ts
│   ├── savings-goals.ts
│   ├── financial-goals.ts
│   ├── household.ts               # composes the above into DEMO_HOUSEHOLD — §2.1
│   └── derive/
│       ├── net-worth.ts
│       ├── monthly-summary.ts
│       ├── spending-by-category.ts
│       ├── budget-month.ts
│       ├── budget-health-score.ts
│       ├── financial-health-score.ts
│       ├── net-worth-history.ts   # §2.3
│       └── analytics-metrics.ts   # only the subset the demo Analytics page shows — §3.2
├── nav/                            # §6
│   ├── demo-nav-sections.ts
│   └── demo-bottom-nav-items.ts
└── components/                     # §3, §6
    └── ...
```

---

## 3. Component reuse strategy, page by page — including the real gap this pass found

### 3.1 The general rule, derived from direct inspection, not assumed

Every one of the ten real pages follows the identical shape confirmed by reading `page.tsx` (Dashboard, Debt, Accounts, Goals, Budgeting, Analytics, Financial Health Score) and `investments/[holdingId]/page.tsx` directly: an `async` Server Component that (1) calls `getCurrentUser()` + `redirect("/login")`, (2) fetches via `Promise.all` against that feature's `server/service.ts`, then (3) passes the already-resolved data as **plain props** to presentational children. **The page-level orchestration file itself (auth guard + fetch) is never reusable for `/demo` — a new demo `page.tsx` is required for every one of the ten routes, by construction, since Capability 1 AC3 forbids even calling `getCurrentUser()`.** The real, substantive question this section answers is which of each page's **child components** can be reused with fixture props substituted for DB-fetched ones.

**Cleanly reusable today (props-only, no fetch, no Server Action import — confirmed by direct read):** `components/shared/stat-card.tsx`, `components/shared/progress-ring.tsx`, `components/shared/motion/animated-number.tsx` (the exact `format`-callback Server/Client boundary split the dispatch pointed at — a plain `value: number` + `format: (n) => ReactNode` contract, no function ever crosses from a Server Component, so a fixture-fed Server Component page can hand it a derived number exactly like `total-active-debt-card.tsx` already does), the four Dashboard charts (`SpendingByCategoryChart`, `IncomeVsExpenseChart`, `MonthlyTrendsChart`), `BudgetHealthScoreBadge`, `FinancialHealthScoreBadge`/`FinancialHealthScoreBreakdownGrid`/`FinancialHealthScoreNarrativeCard`/`FinancialHealthScoreHeadlineCard`/`FinancialHealthScoreHistoryChart`, `TotalActiveDebtCard`, `HoldingDetailStatsCard`, `GrowthChart`, `ValueHistoryList`'s/`DividendHistoryList`'s read-only rendering (see §3.3 caveat below), and every Analytics chart component that only ever receives already-computed data (`YearlySpendingChart`, `CategoryTrendsChart`, `ExpenseDistributionChart`, `IncomeGrowthChart`, `IncomeSourcesChart`, `SavingsGrowthChart`, `DailySpendingHeatmap`). All of these are reused **directly**, fed by `features/demo/fixtures/derive/*.ts` output instead of a `Promise.all` of service calls.

### 3.2 Per-page composition (mirrors each real page's own JSX shape; new demo `page.tsx` for all ten)

| Page | Reused directly | Demo-owned twin needed (§3.3) | Deliberately omitted |
|---|---|---|---|
| Dashboard | `StatCard`, all 4 charts, `BudgetHealthScoreBadge`, `FinancialHealthScoreBadge`, `AnimatedNumber` | `DemoNetWorthHistoryChart` (§3.4) | Card show/hide/reorder (Settings-backed — no DB); Budget Advisor card, Spending Insights widget, Monthly Summary card (all AI-generated content — see §3.5) |
| Accounts | — | `DemoAccountCard` | Add/Edit/Archive account |
| Transactions | `ResponsiveDataTable`/`DataTableCardList` primitives (`components/shared/data-table/` — domain-agnostic, confirmed no Server Action import) | `DemoTransactionTable` (read-only rows + inert search, §3.3) | Add/Import/Split/Manage Categories/category-suggestion review |
| Budgeting | `BudgetSummaryCards`, `BudgetHealthScoreBadge` | `DemoBudgetCategoryRow` (display-only, no inline allocation edit) | Budget Advisor card (AI) |
| Savings Goals + detail | `GoalDetailProgressCard` | `DemoGoalCard`, `DemoContributionHistoryList` (read-only) | Add/Edit/Archive goal, log contribution |
| Financial Goals + detail | per-type progress display portion | `DemoFinancialGoalCard` | Add/Edit/Archive |
| Debt | `TotalActiveDebtCard`, `StrategyComparison` (client-side-only recompute over `payoff-math.ts` — no server call, confirmed by that component's own page-level JSDoc) | `DemoDebtCard` | Add/Edit/Archive debt, Link account |
| Investments + detail | `HoldingDetailStatsCard`, `GrowthChart` | `DemoHoldingRow`, read-only `ValueHistoryList`/`DividendHistoryList` twins | Add/Edit holding, log value update/dividend |
| Analytics | every chart component listed in §3.1 | — | Subscription Cost Detection card (§3.3 caveat), Spending Insights widget (AI) |
| Financial Health Score | all 5 components listed in §3.1 | — | — (already fully AI-independent, per that page's own JSDoc: "zero AI dependency, a plain deterministic read") |

### 3.3 The real gap this pass found: ~30 "card/row/list" components bundle their own Server-Action-wired mutation UI in the same file as their display markup

A repo-wide grep of every `features/{accounts,debt,investments,goals,financial-goals,budgeting,transactions,dashboard,analytics}/components/*.tsx` file that imports `server/actions` returned **30 matches**, including exactly the components each list page above renders per-row: `account-card.tsx`, `debt-card.tsx`, `goal-card.tsx`, `financial-goal-card.tsx`, `holding-row.tsx`, `budget-category-row.tsx`, `transaction-table.tsx`, `value-history-list.tsx`, `dividend-history-list.tsx`, `contribution-history-list.tsx`. Reading `account-card.tsx` directly confirms the pattern precisely: its own top-of-file comment states the reason plainly — *"the actions menu and the Edit dialog it opens both need local state and call Server Actions directly, so this whole card is a Client Component"* — and its imports include `archiveAccount`/`unarchiveAccount` from `@/features/accounts/server/actions` in the same file that renders the account's name/balance/badge.

**This is a systemic pattern, not an isolated oversight, and it is the concrete reason `/demo` cannot simply reuse each page's real list-item component with different props.** Reusing `AccountCard` as-is inside `/demo` would transitively pull `archiveAccount`/`unarchiveAccount` into the demo route's bundle and, more importantly, render a working Edit/Archive menu with no read-only mode to fall back to (these components have no `readOnly`/`disableActions` prop today — mutation affordance and display are one undifferentiated unit, not two composable halves).

**Decision: build a small, demo-owned, read-only presentational twin for each of these — never modify the real components, never reuse them raw.** Each twin (`features/demo/components/<domain>/demo-<name>.tsx`) renders only the fields the real card displays (balance, type badge, progress ring, gain/loss, payoff projection — everything already proven presentational in §3.1's list, e.g. `AnimatedNumber`, `Badge`, `ProgressRing`), omits the actions menu/dialog entirely, and its own doc comment names which real component it mirrors, so a future change to that real card's *displayed fields* (not its mutation logic) has an explicit pointer to the demo twin that should be kept visually consistent. Given each real card's display portion is a small fraction of its total ~100–300 lines (the majority is dialog/menu/mutation state), each twin is expected to be small — **not** a heavy duplication cost, and specifically *not* a change to any shipped, already-reviewed production file, which correctly stays this pass's floor: modifying ~15–20 real components to add a `readOnly` mode purely to serve one new, secondary consumer would be the wrong trade — the same "don't build the general/configurable version of a capability before a demonstrated need" discipline `phase-5a-technical-design.md` §1.2/§6 already applied twice, reapplied here in the opposite direction (don't retrofit configurability into already-shipped production components for a single new caller).

**Named exception with a caveat, not silently included:** `ValueHistoryList`/`DividendHistoryList` (Investments) and `ContributionHistoryList` (Savings Goals) also match the grep (each row has its own delete button) — their read-only twins simply omit the per-row delete affordance, identical treatment to the card components above.

### 3.4 `NetWorthHistoryChart`: the one chart component that is *not* purely presentational — flagged, not silently reused

Read directly, `NetWorthHistoryChart`'s range selector is wired to `useNetWorthHistory` (`features/dashboard/hooks/use-net-worth-history.ts`, TanStack Query), which refetches `GET /api/dashboard/net-worth-history?range=` — a real, session-authenticated Route Handler that queries Postgres — on every range-tab click. Reusing this component unmodified inside `/demo` would mean a visitor clicking "1 Year" issues a real network request to a real, DB-backed endpoint with no session, either 401ing silently or (worse) attempting to resolve `getCurrentUser()` against a null session in a route that has no redirect story for that case — a genuine violation of Capability 5 AC3's "must degrade safely... never a thrown error." **This is exactly the kind of tangled data-fetching/presentation component the dispatch asked to have named, not silently worked around.**

**Decision: `features/demo/components/demo-net-worth-history-chart.tsx`, a demo-owned twin reusing the real component's Recharts markup but replacing the live TanStack Query hook with a pure, local lookup into the fully-precomputed `Record<NetWorthHistoryRange, NetWorthHistoryResponse>` map §2.3 already produces.** Because the entire fixture dataset is static, every range's data can be (and is) precomputed once — switching ranges becomes a genuine, fully-functional, zero-network client-side state change, which is *strictly better* than Capability 5 AC3's own minimum bar ("not required to be functionally wired... a no-op"): the demo's range selector actually works, it just never touches a network.

### 3.5 AI-generated widgets are deliberately omitted from every demo page, not faked

The Budget Advisor card, Spending Insights widget, Monthly Summary/Monthly Recap card, and inline category-suggestion badges are all narration layers over `lib/ai/` (`ai-features-design.md`). Capability 2 AC4's minimum content bar never names any of these, and Capability 3's read-only-by-construction guarantee already keeps `/demo` structurally clear of `lib/ai/` (§4). Hand-authoring static "fake AI" text for these surfaces was considered and rejected: it would be the one place in the demo that *misrepresents* what the real product does (a real AI narrative is generated per-user, per-period, non-deterministic; a hard-coded string dressed up as one is not that, and would need its own staleness/consistency upkeep exactly like the Capability 2 AC6 problem this whole spec exists to avoid). **Decision: these widgets are omitted entirely from every demo page**, consistent with Capability 3 AC1's "the demo either omits it entirely... never a working control wired to nothing" applied to a display-only AI surface rather than a write control.

---

## 4. The read-only-by-construction guarantee mechanism

### 4.1 ESLint `no-restricted-imports`, scoped to every file demo code is allowed to author — necessary, confirmed insufficient alone

Following the exact, already-shipped pattern in `eslint.config.mjs` (Reports/Notifications never importing `lib/ai/`, Calendar's composition layer never importing `lib/db`/Prisma/either domain's status-math module — all direct quotes from that file, read in full for this pass), a new block scoped to **both** `src/app/demo/**/*.{ts,tsx}` **and** `src/features/demo/**/*.{ts,tsx}` (every file this pass's own design permits demo code to live in — see §1/§2/§6) blocks:

```js
{
  files: ["src/app/demo/**/*.{ts,tsx}", "src/features/demo/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/features/*/server/*", "@/features/*/server/**"],
          message: "Nothing under /demo may import any feature's server/ directory — " +
            "every Server Action (server/actions.ts) and every Prisma-touching read " +
            "(server/service.ts and siblings) lives there. See public-demo-technical-design.md §4." },
        { group: ["@/lib/db", "@/lib/db/*", "@prisma/client"],
          message: "Nothing under /demo may query the database, even read-only — " +
            "public-demo.md Capability 3 AC3." },
        { group: ["@/lib/auth", "@/lib/auth/*"],
          message: "Nothing under /demo may depend on session/auth state of any kind — " +
            "public-demo.md Capability 1 AC3." },
        { group: ["@/lib/ai", "@/lib/ai/*", "@/lib/email", "@/lib/email/*"],
          message: "Nothing under /demo may depend on a live AI or email call — " +
            "not required to be 'static... zero operational upkeep' otherwise." },
      ],
    }],
  },
},
```

`@/features/*/server/*` deliberately does **not** block a feature's `types.ts` (pure TS types, feature root, not under `server/`) or its own `-math.ts` files (`features/debt/payoff-math.ts` — feature-root, isomorphic, and per `naming-standards.md`'s own binding rule "must never import `lib/db.ts`, `lib/auth.ts`, or anything else server-only," so it is guaranteed Prisma-free by this codebase's own naming convention, not merely by inspection). This is a deliberately blunter rule than strictly necessary — it also excludes a few genuinely pure, Prisma-free files that happen to sit *under* `server/` for the client-callability reasons `naming-standards.md`'s Phase 3b rule already established (`analytics/server/period.ts`, `analytics/server/subscription-detection.ts`) — accepted as the cost of a rule any reviewer can verify by reading the glob alone, rather than a surgical per-file allowlist that would need re-verifying by hand every time a new file lands under any feature's `server/` directory. Same "the simpler, standard option over the more configurable one" discipline `phase-5a-technical-design.md` §1.2/§6 already applied twice.

**Why this alone is not sufficient, stated precisely rather than assumed:** `no-restricted-imports` inspects the literal import specifiers written **in the files matched by `files:`**. If a demo page imports `AccountCard` (`@/features/accounts/components/account-card` — not matched by the `server/*` pattern above), ESLint sees only that one, permitted-looking import statement; it never looks inside `account-card.tsx` to see that *that file* imports `archiveAccount` from `server/actions`. Capability 3 AC2's own wording is "imported or invoked... **directly or transitively**" — the transitive half of that bar is exactly what a single-file-scoped `no-restricted-imports` rule cannot enforce. This is a real, structural gap, named here rather than silently assumed closed by the ESLint rule alone (the same "flagged here so it's tested for explicitly... not assumed to never happen" standard Capability 3's own Edge Cases section demands of itself).

**§3.3's component-reuse design is what actually closes this gap today** — by never importing any of the ~30 tangled components identified there, and only ever importing the confirmed-pure allowlist in §3.1, no transitive path from any demo file to a Server Action or a Prisma query exists in practice. **But a design decision followed by discipline alone is exactly the "assumed to never happen" failure mode Capability 3's own Edge Cases section calls out** ("a future engineer... reflexively copies the real page's component, including its mutating controls"). **Decision: pair the ESLint rule above with a CI-enforced transitive dependency-graph check** (`dependency-cruiser` or equivalent — Backend/E2E Test Engineer's tool choice, not fixed here), configured with `src/app/demo/**` as its entry points and a `forbidden` rule asserting **zero** reachable module (at any depth) matches `**/server/actions.ts`, any path under a feature's `server/` directory, `lib/db`, `@prisma/client`, or `lib/auth`. This is the mechanism that actually satisfies the DoD's "verified by code inspection (not just UI spot-check)" bar for the transitive case — the ESLint rule catches a mistake the moment it's typed (fast, IDE-integrated); the dependency-graph check catches the one class of mistake the ESLint rule structurally cannot (a permitted-looking import of a component that itself, several files deep, reaches a forbidden one).

### 4.2 UI-layer inert controls (Capability 3 AC1/AC5) — a naming convention, not a new mechanism

Every write control a real page has (Add/Edit/Archive/Delete/Save/log-contribution/mark-paid) is either omitted entirely from its demo twin (§3.3's chosen default — the twins simply never render an actions menu) or, where visual authenticity is wanted (Transactions' search input, Analytics' period selector — both explicitly named by Capability 5 AC3), left present but wired to a plain no-op handler, never a Server Action. No new component-level "read-only mode" prop convention is needed, since §3.3 already establishes that demo twins never contain the mutation UI in the first place — there is nothing to disable.

---

## 5. The never-visibly-stale date mechanism, and its Next.js rendering implication

### 5.1 Every fixture date is an offset, not a calendar date

`features/demo/fixtures/relative-date.ts` exports one pure function, `relativeDate(daysAgo: number, now: Date = new Date()): Date`, plus a month-scale sibling `relativeMonthStart(monthsAgo: number, now: Date): Date` for goal/budget-month framing. **Every fixture entity that carries a date field stores an integer offset** (`{ merchant: "Whole Foods", amount: -84.12, daysAgo: 4 }`), never a literal `Date`/ISO string. The derive step (§2) resolves every offset against a single, shared `now = new Date()` captured once per render, so "several months of transaction history," "a Savings Goal in progress since," and the investment growth-history sparkline all stay anchored to *whenever the page is actually being rendered* — indefinitely, with zero maintenance, directly satisfying Capability 2 AC6 ("must not visibly grow stale the longer it goes unmaintained").

**Narrative/caption text follows the identical rule — no hand-written sentence anywhere bakes in an absolute year.** Any copy naming a span (a goal's "started N months ago" caption, the Financial Health Score's flavor text) is built from the same offset value at render time (`` `Started ${monthsAgo} month${monthsAgo === 1 ? "" : "s"} ago` ``), never literal prose. Absolute-looking calendar dates rendered elsewhere (a transaction row showing "May 4") are fine as-is, since they're derived from the offset + the render-time `now` on every regeneration (§5.2) — they never read as stale because they are, in fact, never more than one revalidation window old.

### 5.2 Rendering strategy: ISR via `export const revalidate`, not `force-dynamic` and not an unbounded static build

Because every page's content is now a pure function of `Date.now()` at render time even though nothing is fetched from a database, two naive options both fail Capability 2 AC6 or Capability 2's own zero-cost framing:

| Option | Rejected / accepted because |
|---|---|
| **Default static generation (no `revalidate`), baked in at build time** | **Rejected.** Every offset resolves once, at build time, and never again — this is *exactly* AC6's named failure mode ("a fixed calendar date that will eventually just say '2026' no matter when it's viewed"), just deferred until the first deploy after build instead of being visible on day one. |
| **`export const dynamic = "force-dynamic"`** | **Rejected.** Recomputes on every single request — real per-request render CPU cost for a route whose entire premise (per the spec's own Business Value section) is "always there... zero operational upkeep," for a freshness requirement (day/month-granularity relative dates) that doesn't need per-request precision. Success Metrics' "zero database queries" is satisfied either way (nothing here ever touches Postgres), but this option adds cost with no corresponding user-visible benefit over the option below. |
| **`export const revalidate = 86400` (ISR, daily) on `src/app/demo/layout.tsx`** | **Chosen.** Next.js's App Router resolves the *effective* revalidate window for a given route as the minimum across every segment config in that route's tree, so setting this once, on the layout, establishes a same-day-fresh ceiling for every nested demo page without repeating the declaration per page. A day-long window is far finer than the coarsest granularity anything on these pages actually displays (day/month-level relative language) — every displayed date is, at worst, a few hours behind "now," imperceptible to a visitor, while the page is served from cache (fast, effectively free) between regenerations. No dynamic API (`cookies()`, `headers()`, a live `fetch`) is ever called anywhere in the demo tree (§4 structurally guarantees no `getCurrentUser()`/DB call exists to force dynamic rendering in the first place), so this ISR configuration is additive on top of what would already be Next's own default static classification, not a fight against it. |

Dynamic detail routes (`[accountId]`, `[goalId]`, `[holdingId]`) don't need `generateStaticParams` to satisfy this design (the tiny, fixed set of fixture IDs would resolve correctly on first request either way, then cache under the same `revalidate` window) — pre-generating them at build time via `generateStaticParams` returning `features/demo/fixtures/ids.ts`'s own constants is a legitimate, cheap, optional implementation-time optimization for a marginally faster first paint, not a requirement this design depends on.

---

## 6. Demo nav/banner component boundary

### 6.1 `Sidebar`/`TopNav`: confirmed domain-agnostic and fetch-free by direct inspection — reused, with one small, additive, precedented change

Both files' own JSDoc states this plainly, and direct reading confirms it in the code, not just the comment: `sidebar.tsx` — *"Domain-agnostic: it only knows about `{ label, href, icon }` nav items... does not fetch data or know about the current user"*; `top-nav.tsx` — *"`notificationBell` has no default... because this component must stay domain-agnostic and fetch-free — it cannot import `features/notifications/.../notification-bell`."* Neither file imports `getCurrentUser`, a Server Action, or any Prisma-adjacent module. `NotificationBell` — the one genuinely auth-aware, data-fetching piece of the real app's shell — is injected as an external `ReactNode` slot from `(dashboard)/layout.tsx`, never owned by `TopNav` itself.

**The actual obstacle to reuse is data, not auth-awareness:** `NAV_SECTIONS` (Sidebar) and `BOTTOM_NAV_ITEMS` (`bottom-nav.tsx`) are hardcoded module-level constants pointing at the real app's own hrefs (`/accounts`, `/debt`, `/bills`, `/settings/*`, ...), including several out-of-scope-for-demo pages. Reusing `Sidebar`/`BottomNav` unmodified inside `/demo` would render working links straight into the real, authenticated app — a direct violation of Capability 5 AC4 ("nothing under `/demo` links out to... any authenticated route").

**Decision: add one small, optional prop to each — `Sidebar`'s `sections?: NavSection[]` (default `NAV_SECTIONS`) and `BottomNav`'s `items?: NavItem[]` (default `BOTTOM_NAV_ITEMS`) — rather than a wholesale parallel `DemoSidebar`/`DemoBottomNav` reimplementing ~370 lines of collapse/responsive/active-path rendering logic.** This is not a new pattern invented for this pass — it is the identical shape `phase-5a-technical-design.md` §2.2 already used for `TopNav`'s own `mobileNavOpen`/`onMobileNavOpenChange` controlled props: *"zero behavioral change for every existing render path that doesn't pass them."* `features/demo/nav/demo-nav-sections.ts` exports `DEMO_NAV_SECTIONS` (the ten in-scope items only, `/demo`-prefixed hrefs) and `demo-bottom-nav-items.ts` exports `DEMO_BOTTOM_NAV_ITEMS` — `/demo`'s own composition supplies these; the real app's every existing call site (`(dashboard)/layout.tsx` → `dashboard-shell.tsx`) is untouched and continues using the default. This keeps `components/shared/sidebar.tsx`/`bottom-nav.tsx` exactly as domain-agnostic as before — accepting an *externally supplied* nav-item list is, if anything, a strictly more reusable shape than hardcoding one constant internally, at zero cost to the existing caller.

`TopNav` needs **no code change at all**: `/demo`'s composition passes no `notificationBell` (nothing renders — matches its documented no-default behavior), a fixture `user` object (the demo household's own name, for the avatar), a no-op `onSearchChange` (Capability 5 AC3's explicitly-permitted inert control), and leaves `onSignOut` unwired — genuinely truthful, not misleading, since `/demo` has no session to end in the first place (Capability 1 AC2/AC3).

### 6.2 Demo composition root and banner: new, single-consumer, demo-owned components

- **`features/demo/components/demo-shell.tsx`** — mirrors `(dashboard)/dashboard-shell.tsx`'s exact precedent (a thin `"use client"` composition root owning the one lifted `mobileNavOpen` boolean `TopNav`'s hamburger `Sheet` and `BottomNav`'s "More" button share), composing `Sidebar` (with `sections={DEMO_NAV_SECTIONS}`), `TopNav` (fixture user, no bell), `BottomNav` (with `items={DEMO_BOTTOM_NAV_ITEMS}`), `DemoModeBanner`, and `children`. Mounted from `src/app/demo/layout.tsx` — a plain, synchronous Server Component with nothing to `await` (no `getCurrentUser()`, no `getUserPreference()` — `/demo` has no per-visitor preference to resolve), which is what makes Capability 1 AC3 true by construction rather than by omission-that-could-be-forgotten.
- **`features/demo/components/demo-mode-banner.tsx`** (Capability 4) — a new, small, demo-owned component, **not** promoted to `components/shared/`: it has exactly one consumer today, the same "genuinely cross-feature" bar `phase-5a-technical-design.md` §4 already applied to `day-entry-indicators.tsx` before declining to promote it. Mounted once in `demo-shell.tsx` (so it's structurally present on every reachable demo page — AC1 — without any individual page needing to remember to render it), a static, non-dismissible landmark (icon + text, never color alone, per AC4/WCAG 2.1 AA), with no `aria-live` re-announcement on navigation, matching AC4's own Edge Case guidance ("a static, always-present landmark is sufficient; it does not need to re-announce itself on every page change").

This mirrors `folder-tree.md`'s own standing "`components/shared/` holds domain-agnostic building blocks only; `features/<domain>/components/` holds domain-aware composed UI" split exactly — `features/demo/components/` is domain-aware (it knows about the demo's own nav/banner concept), built from `components/ui/*` primitives, the identical shape every other feature module already uses.

---

## 7. Detail-route strategy: stable, hand-picked fixture IDs, resolved and checked in memory

`features/demo/fixtures/ids.ts` (§2.4) is the single source every detail route resolves against. Each dynamic page (`accounts/[accountId]`, `goals/[goalId]`, `financial-goals/[goalId]`, `investments/[holdingId]`) does a plain, synchronous object/array lookup — never a query — against `DEMO_HOUSEHOLD`'s already-composed entities:

```ts
// Illustrative shape only — src/app/demo/goals/[goalId]/page.tsx
export default function DemoGoalDetailPage({ params }: { params: { goalId: string } }) {
  const goal = DEMO_HOUSEHOLD.savingsGoals.find((g) => g.id === params.goalId)
  if (!goal) notFound()               // → src/app/demo/not-found.tsx, §1
  return <DemoGoalDetailView goal={goal} contributions={/* same household */} />
}
```

Because the detail view is built from the **same** `DEMO_HOUSEHOLD` entity (and, where relevant, the same §2.1 derive functions) the parent list page's row already rendered, the detail page's numbers agree with the list row by the identical "shared computation, not independently authored" mechanism §2 established for cross-page consistency generally.

**Exceeding Capability 5 AC2's stated minimum, at no marginal design cost:** AC2 only requires "at least one working example" per detail-route kind. Because the lookup-plus-shared-derive mechanism scales to *every* fixture entity exactly as cheaply as to one, this design makes **every** listed account/goal/financial-goal/holding's detail route resolve correctly, not just one token example per kind — a list where some cards are clickable and others dead-end would itself read as broken, undermining Capability 2/4's entire "always populated, never mistaken for a broken shell" premise, for zero additional mechanism cost.

---

## 8. Follow-up corrections owed to sibling architecture documents (not made in this pass)

Matching `phase-5a-technical-design.md` §8's own precedent — this pass's deliverable is this one file; these pointer/correction edits belong to the same dispatch that begins implementation:

- **`folder-tree.md`**: gains a "Public Demo Mode" section documenting `src/app/demo/**` and `src/features/demo/**` per §1/§2/§6 above.
- **`Architecture.md`**: gains a short "Public Demo Mode status note" pointer to this document, plus a one-line addition to the module-boundary table for `features/demo/` (leaf, single-consumer, per the Reports precedent — §2) and the two new optional props on `components/shared/sidebar.tsx`/`bottom-nav.tsx` (§6.1, zero behavior change for existing callers).
- **`naming-standards.md`**: gains an entry recording the `demo-<name>.tsx` prefix convention for every read-only presentational twin (§3.3), so a future contributor doesn't invent a second, differently-named convention for "this is the demo-safe version of X."
- **`api-contracts.md`**: no new entry required — `/demo` introduces zero Server Actions, zero Route Handlers, and zero Server-Component-direct-call reads against the database (every "read" it performs is an in-memory fixture lookup). Worth stating explicitly, matching `phase-4c-technical-design.md`'s own "name what did *not* change" precedent.
- **`eslint.config.mjs`**: gains the block in §4.1 (Backend Engineer implementation) plus whichever dependency-graph tool is chosen for the transitive check.

---

## 9. Risks — new items to append to `docs/planning/risk-register.md`

- **The transitive-import gap (§4.1).** ESLint's `no-restricted-imports`, scoped to demo-owned files, cannot by itself catch a demo file importing an otherwise-permitted-looking component (e.g. a real feature's card component) that itself, several files deep, imports a Server Action or a Prisma-touching read. Closed today by §3.3's component-reuse design (never import the ~30 identified tangled components); durably closed only once the CI-enforced dependency-graph check (§4.1) ships alongside it — flagged explicitly so it isn't treated as closed by the ESLint rule alone.
- **Fixture-derive drift from real business rules (§2.2).** Every demo derive function is a hand-maintained reimplementation of a real service function's documented rule (month-to-date range resolution, split-parent exclusion, the null-vs-zero savings-rate convention, etc.), since the real, Prisma-fused aggregation functions cannot be imported into a database-free route. A future change to one of those real rules has no compiler-enforced link forcing the matching demo derive function to be updated — each derive function's own doc comment pointing at the real function it mirrors is the only guardrail today; a periodic manual audit (or a shared fixture-based unit test exercising both the real pure sub-rules and the demo derive function against the same inputs, where a real pure sub-rule exists to test against) is worth considering at implementation time, not designed further here.
- **Sidebar/BottomNav's new optional props (§6.1) are a shared-component change, however small.** Any regression in the default (no-`sections`/no-`items`-passed) path would affect every real, authenticated page in the app, not just `/demo` — flagged for extra scrutiny in review and worth explicit unit-test coverage of "unset `sections`/`items` renders identically to before this change," the same discipline `phase-5a-technical-design.md` §2.1 already recommended for `BottomNav`'s own href-drift risk against `NAV_SECTIONS`.
- **AI-widget omission (§3.5) is a deliberate scope narrowing beyond Capability 2 AC4's literal minimum**, not a spec violation (AC4 never names these widgets), but worth confirming with the Product Owner/CTO at review time that "the demo never shows the Budget Advisor/Spending Insights/Monthly Recap" reads as an acceptable interpretation of "every major section of the app," not an unstated scope cut.
