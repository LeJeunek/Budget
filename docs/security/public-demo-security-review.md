# Public Demo Mode Security Review — `/demo`

**Reviewer:** Security Architect
**Scope:** The shipped implementation under `src/app/demo/**` and
`src/features/demo/**` (commits `d83a562` "Public Demo Mode: fixture data
layer + read-only demo components" and `e4121d5` "Public Demo Mode: wire up
the /demo route tree"), reviewed against `docs/product/public-demo.md`
(Capabilities 1 and 3 primarily) and
`docs/architecture/public-demo-technical-design.md` (§1, §4 especially).
Every file listed in the technical design's own file layout (§2.5, §1) was
read directly; every import chain reachable from a `/demo` page was traced by
hand, not taken on the design doc's or implementation's own comments.

**Recommendation: APPROVE**, with one Medium finding (a named, not-yet-closed
gap the design doc itself flags as a risk) and two Low/informational notes.
None of the three block release; the Medium finding should be tracked as
follow-up work, not treated as closed.

---

## 1. No auth/session dependency — CONFIRMED

Grepped every file under `src/app/demo/**` and `src/features/demo/**` for
`getCurrentUser`, `@/lib/auth`, `session`, and `cookies(`. Every match is
inside a comment/JSDoc explaining *why* the file deliberately does not call
these (e.g. `src/app/demo/layout.tsx`'s own doc: "this file never calls
`getCurrentUser()` and never reads a session cookie of any kind"). Zero
executable references to `getCurrentUser()`, Better Auth, or a session cookie
anywhere in either tree. `src/app/demo/layout.tsx` is a plain, synchronous
Server Component with no `await`, matching its own claim. `CurrencyPreferenceProvider`
(reused from `src/app/(dashboard)/currency-preference-provider.tsx`) is
mounted with a hardcoded `"USD"` value, not a fetched preference — it is a
pure client-side React Context with no session dependency of its own
(confirmed by reading the full file: its only import is `@/lib/utils`).

**Verdict: CONFIRMED. No file under either tree reads auth/session state.**

---

## 2. No transitive path to a Server Action, Prisma-touching read, or `@prisma/client` — CONFIRMED, and the Frontend Lead's specific claims independently verified

This was the headline item. Method: enumerated every `import` statement in
every file under `src/app/demo/**` (19 files) and `src/features/demo/**` (30
files), then followed every *real, non-demo* module each one imports one
level further, and continued until reaching either a leaf (types-only,
`lib/utils`, `components/ui/*`, a pure `-math.ts` file) or a `server/`
directory / `@prisma/client` import.

**Direct imports:** zero. Grepped both trees for `^import.*(server/actions|
server/service|@prisma/client|@/lib/db|@/lib/auth)` — no matches. Every
occurrence of those strings anywhere in the two trees is inside a comment.

**Transitive imports, traced by hand, file by file:**

- Every real component a `/demo` page imports directly (`TotalActiveDebtCard`,
  `BudgetSummaryCards`, `BudgetHealthScoreBadge`, all four Dashboard charts,
  all seven Analytics chart components, all five Financial Health Score
  components, `PortfolioOverviewSection`, `AllocationChart`,
  `HoldingDetailStatsCard`, `GrowthChart`, `investment-labels.tsx`,
  `components/shared/data-table/*`, `components/shared/stat-card.tsx`,
  `components/shared/motion/*`, `components/shared/sidebar.tsx`/`top-nav.tsx`/
  `bottom-nav.tsx`) was read in full. None imports a Server Action, `@/lib/db`,
  `@/lib/auth`, or `@prisma/client` as a **runtime** import, directly or one
  level further (`chart-format.ts`, `income-source-labels.ts`,
  `scroll-affordance-container.tsx`, `currency-preference-provider.tsx`,
  `account-form-schema.ts`, `debt-form-schema.ts`, `payoff-math.ts`,
  `default-categories.ts` — all clean).
- One exception, and it is inert: `financial-health-score-narrative.tsx`
  (reused directly, per the design doc's own §3.1/§3.2) contains
  `import type { AiFeatureResult } from "@/lib/ai/types"` at line 27 — a
  **type-only** import. This repo's `tsconfig.json` has
  `"isolatedModules": true`, which guarantees `import type` is fully erased at
  compile time with no runtime trace; it is not reachable code. The demo page
  that renders this component (`src/app/demo/financial-health-score/page.tsx`,
  line 118) passes a plain object literal (`{ status: "unavailable" }`) and
  does **not** import `@/lib/ai/types` itself — confirmed by reading that
  page's full import list. No live AI code path is reachable.
- Every `Account`/`Debt`/`Transaction`/`Holding`/`Goal`/`FinancialGoal` type
  reused from each domain's own `types.ts` (e.g.
  `import type { Debt as PrismaDebt } from "@prisma/client"` inside
  `features/debt/types.ts`) is likewise a type-only import, erased the same
  way. Confirmed for `accounts/types.ts`, `debt/types.ts`,
  `transactions/types.ts`, `analytics/types.ts`, `goals/types.ts`,
  `financial-goals/types.ts`, `investments/types.ts` — every one uses
  `import type`, none is a runtime import.
- `src/features/demo/fixtures/debts.ts` imports `computeAmortization` from
  `@/features/debt/payoff-math` as a genuine runtime import. Confirmed this
  file is exactly what the naming-standard/design doc claims: feature-root
  (not under `server/`), imports only `import type { ... }` from Prisma —
  zero runtime Prisma/db/auth import of its own. Legitimate, and correctly
  excluded from the `no-restricted-imports` block's `server/*` pattern.

**The two specific "found and fixed" transitive gaps the Frontend Lead's
implementation notes claim — independently re-verified, both hold:**

1. **`StrategyComparison` → `ExtraPaymentInput` → `debt/server/validation` →
   `@prisma/client`.** Read `strategy-comparison.tsx` (imports
   `ExtraPaymentInput`/`parseExtraPaymentInput` from
   `features/debt/components/extra-payment-input.tsx`), which imports
   `ExtraPaymentSchema` from `@/features/debt/server/validation`, whose first
   line is `import { DebtType } from "@prisma/client"` — used as a **runtime**
   value (`z.nativeEnum(DebtType, ...)`), not `import type`. This is a real,
   confirmed runtime import of `@prisma/client` three files deep from
   `StrategyComparison`. Confirmed `src/app/demo/debt/page.tsx` does **not**
   import `StrategyComparison` anywhere — only `TotalActiveDebtCard`,
   `DemoDebtCard`, `getDemoHousehold`, and `Tabs` primitives. Claim
   **confirmed accurate**.
2. **`GoalDetailProgressCard`/`FinancialGoalProgressBody` → Server-Action-bearing
   siblings.** Read `goal-detail-progress-card.tsx`: imports
   `EstimatedCompletionLine` from `features/goals/components/goal-card.tsx`,
   which imports `archiveGoal`/`unarchiveGoal` from
   `@/features/goals/server/actions` at module scope. Read
   `financial-goal-card.tsx` (the file `FinancialGoalProgressBody` is exported
   from): its own top-level imports include `archiveFinancialGoal`/
   `unarchiveFinancialGoal` from `@/features/financial-goals/server/actions` —
   importing *any* named export from that file, including the
   display-only `FinancialGoalProgressBody`, pulls the whole module (and its
   Server Action imports) into the bundle graph. Confirmed
   `src/app/demo/goals/[goalId]/page.tsx` and
   `src/app/demo/financial-goals/[goalId]/page.tsx` import neither component —
   both use `DemoGoalCard`/`DemoFinancialGoalCard` instead, each with its own
   code comment explicitly naming this exact substitution and reasoning.
   Claim **confirmed accurate** — and, notably, this is a case where the
   *implementation* caught a real error in the *design doc's own* §3.2
   component-reuse table (which had listed both as "reused directly"), and
   documented the correction in-place rather than silently deviating.

**A gap the design doc itself names as not yet closed — MEDIUM finding, see
Summary.** §4.1 states plainly that `no-restricted-imports` "cannot see a
forbidden import several files deep inside an otherwise-permitted-looking
component import," and that durable closure requires "a CI-enforced
transitive dependency-graph check (`dependency-cruiser` or equivalent)." I
verified this was never implemented: `package.json` has no `dependency-cruiser`
or `madge` dependency or script, and this repository has no `.github/workflows`
directory or any other CI configuration at all (`docker-compose.yml` is the
only top-level YAML file in the repo). The ESLint `no-restricted-imports`
rule itself **is** shipped exactly as designed
(`eslint.config.mjs` lines 140–187, scoped to both trees, blocking
`@/features/*/server/*`, `@/lib/db`/`@prisma/client`, `@/lib/auth`,
`@/lib/ai`/`@/lib/email`). What's missing is the second, transitive-aware
layer the design doc itself says is required for a *durable* (as opposed to
today's manual-discipline-dependent) guarantee. See Summary for severity
reasoning.

**Verdict: CONFIRMED for the code as it exists today** — no file under either
tree reaches a Server Action, a Prisma-touching read, or `@prisma/client` as a
runtime import, at any depth traced. **Not durably enforced going forward** —
the only thing preventing a regression (a future engineer adding a demo page
that imports one of the ~30 tangled real components) is code review, since no
automated transitive check or CI pipeline exists in this repository at all.

---

## 3. No write-shaped control reaches a Server Action — CONFIRMED

Every "card/row" component actually rendered by a `/demo` page was confirmed
to be one of the `Demo*` twins in `src/features/demo/components/**`, never
the real component:

| List page | Real component (never imported) | Demo twin actually used |
|---|---|---|
| Accounts | `AccountCard` | `DemoAccountCard` |
| Debt | `DebtCard` | `DemoDebtCard` |
| Savings Goals | `GoalCard`/`GoalDetailProgressCard` | `DemoGoalCard` |
| Financial Goals | `FinancialGoalCard`/`FinancialGoalProgressBody` | `DemoFinancialGoalCard` |
| Investments | `HoldingRow` | `DemoHoldingRow` |
| Investments detail | `ValueHistoryList`/`DividendHistoryList` (per-row delete) | `DemoValueHistoryList`/`DemoDividendHistoryList` |
| Budgeting | `BudgetCategoryRow` | `DemoBudgetCategoryRow` |
| Transactions | `TransactionTable` (Server-Action-wired row menu) | `DemoTransactionTable` |
| Savings Goals detail | `ContributionHistoryList` (delete button) | `DemoContributionHistoryList` |

Grepped every `.tsx` file in both trees for `Add `/`onClick=`/`onSubmit=` —
the only matches are code comments documenting a deliberate omission (e.g.
`accounts/page.tsx`: "'Add account' is omitted entirely," `investments/page.tsx`:
"no 'Add holding' [button]"). No working mutation handler exists anywhere.
`TopNav`'s search input is wired to a literal no-op function
(`demo-shell.tsx`'s `handleSearchChange`), and `onSignOut` is left entirely
unwired — both consistent with Capability 3 AC5's "inert control, never
silently swallowing a submission." `DemoTransactionTable`'s search/sort/
pagination is genuinely functional but entirely client-side/local (via
`ResponsiveDataTable`'s own built-in state) — confirmed no network call is
issued (`fetch`/`XMLHttpRequest` grepped across both trees: zero matches).

**Verdict: CONFIRMED. No write-shaped control anywhere under `/demo` reaches
a Server Action.**

---

## 4. `/demo` does not weaken any real route's auth — CONFIRMED

`git diff 5b4cae7..e4121d5 -- "src/app/(dashboard)/layout.tsx" "src/app/admin/layout.tsx"`
returns empty — both files are byte-for-byte untouched by either Public Demo
Mode commit.

`src/components/shared/sidebar.tsx`, `top-nav.tsx`, and `bottom-nav.tsx` **were**
modified (`git diff c9f6bae..e4121d5` — 3 files, +50/-4 total), but every
change is a new, optional prop with a default that reproduces the prior
behavior exactly:

- `Sidebar`: new `sections?: NavSection[]` prop, default parameter
  `sections = NAV_SECTIONS` — every existing call site that doesn't pass
  `sections` renders identically to before.
- `BottomNav`: new `items?: NavItem[]` prop, default parameter
  `items = BOTTOM_NAV_ITEMS` — same pattern.
- `TopNav`: new `sidebarSections?: NavSection[]` prop (not explicitly named in
  the design doc's §6.1, but the same additive shape — forwarded to the
  mobile-Sheet's own internal `Sidebar` instance; when omitted, that `Sidebar`
  falls back to its own default `NAV_SECTIONS` exactly as before). Neither
  `(dashboard)/layout.tsx` nor `dashboard-shell.tsx` (its only real-app
  caller) passes this prop, so the real app's mobile nav is unaffected.

None of these three files contains any auth/authorization logic of their own
(confirmed by direct read — they are `usePathname()`-based, purely
presentational nav components); the change is a pure data-source
parameterization, not a gate change. `src/features/demo/nav/demo-nav-sections.ts`
and `demo-bottom-nav-items.ts` were also read in full: every `href` is
`/demo`-prefixed (`/demo`, `/demo/accounts`, `/demo/transactions`, etc.) —
none references a real authenticated route, `/admin`, or any out-of-scope
page.

**Verdict: CONFIRMED. `/demo` is a purely additive sibling route; no real
route's auth gate was weakened, bypassed, or exception-carved.**

---

## 5. No real user data can leak into `/demo` — CONFIRMED

Every value rendered on every `/demo` page traces to a single call chain:
`getDemoHousehold()` (`src/features/demo/fixtures/household.ts`) → the static
`buildDemo*` constructors in `src/features/demo/fixtures/{accounts,
transactions,debts,investments,savings-goals,financial-goals,budget}.ts` →
`src/features/demo/fixtures/derive/*.ts`'s pure functions. None of these
files performs a `fetch`, a Prisma call, or reads any request-scoped value
(`cookies()`, `headers()`, `params` beyond the fixture-ID lookup already
covered in §6 below). `household.ts`'s own doc comment states the fixture is
deliberately a **function**, not a cached module-level constant, specifically
so each render recomputes its own `now` — this is a freshness mechanism (§5.1
of the design doc), not a data source that could vary by request identity;
every invocation of `getDemoHousehold()` for any visitor, at any time,
produces the same entities differing only in which "now" the relative date
offsets resolve against. There is no code path — no session, no cookie, no
per-request identity of any kind is ever read — by which a real user's row
could reach a `/demo` render.

**Verdict: CONFIRMED. No real user data can appear on `/demo`, by
construction — there is no code path that reads request-scoped or
database-sourced data at all.**

---

## 6. OWASP-relevant surface check for the new public route

- **XSS:** Grepped both trees for `dangerouslySetInnerHTML` — zero matches.
  All rendered text is either a hardcoded literal or a fixture-derived
  primitive (string/number) passed through React's default JSX escaping.
  `DemoTransactionTable`'s "search" box (`enableGlobalFilter`) filters an
  already-in-memory, hardcoded array client-side via
  `ResponsiveDataTable`'s own TanStack Table filtering — it never reflects
  its input back into the DOM as markup, only as a filter predicate; not an
  injection surface. No user-supplied value is ever accepted and rendered
  anywhere under `/demo` — every page is a zero-input, static-data render.
- **Dynamic segment (`[accountId]`/`[goalId]`/`[holdingId]`) handling:**
  confirmed for all four detail routes
  (`accounts/[accountId]`, `goals/[goalId]`, `financial-goals/[goalId]`,
  `investments/[holdingId]`) — each does a plain `Array.prototype.find()`
  against the fixture array and calls Next's `notFound()` if no match,
  never a thrown error or an unhandled exception. `notFound()` renders the
  shared `src/app/demo/not-found.tsx` (a plain, static "Not part of this
  demo" card with a link back to `/demo`) inside `layout.tsx`'s own chrome —
  no stack trace, no internal error detail, no default Next.js error overlay
  is ever exposed for an unresolved ID. `src/app/demo/[...catchAll]/page.tsx`
  unconditionally calls `notFound()` for any other unmatched `/demo/*` path,
  closing the same class of risk for mistyped top-level routes.
- **CSRF:** N/A — no Server Action, no form `action`, no state-changing
  request of any kind exists under `/demo` (§2, §3).
- **SQL Injection:** N/A — no database query of any kind is issued from
  `/demo` (§5); every "read" is an in-memory array lookup against a
  hardcoded, compile-time-typed fixture.
- **Secrets:** none introduced. No `.env` var, API key, or credential
  appears anywhere in either tree (grepped for the same auth/session
  patterns in §1 — no incidental secret exposure found either).
- **Rate limiting:** per the product spec's own explicit decision
  (Capability 1 AC5, "no rate limiting... consistent with the decided 'no
  credentials to share' framing"), `/demo` carries none, and — since it
  performs zero database reads or writes (§5) — a traffic spike against it
  costs only ordinary Next.js render/ISR-cache work, not the load or
  data-integrity risk a real authenticated route would carry. `revalidate =
  86400` (ISR, `src/app/demo/layout.tsx`) further bounds this to at most one
  full re-render per route per day between cache hits, which is a
  performance/cost consideration rather than a security one and is properly
  the Performance Engineer's review, not re-litigated here.
- **`robots.txt`/indexing:** left as an open question by the product spec
  itself (Open Question 2) and not decided by this implementation — no
  `robots.txt`/`noindex` handling exists in the diff. Not a security gap
  (nothing sensitive is indexable here — see §5), purely an SEO/discoverability
  call outside this review's remit.

**Verdict: CONFIRMED. No XSS, CSRF, SQLi, or unhandled-error/stack-trace
exposure surface introduced.**

---

## Summary of findings

| # | Severity | Area | Description | Status |
|---|---|---|---|---|
| 1 | **Medium** | `eslint.config.mjs` / repo CI | The design doc's own §4.1/§9 names a required second enforcement layer — a CI-enforced transitive dependency-graph check (`dependency-cruiser` or equivalent) — as necessary to *durably* close the "ESLint can't see a forbidden import several files deep" gap. This was never implemented, and this repository has no CI pipeline at all (no `.github/workflows`, no dependency-graph tool in `package.json`). Today's guarantee rests entirely on the shipped ESLint rule (catches direct imports only) plus the Frontend Lead's manual component-reuse discipline (§3.3) — both independently verified correct as of this review (§2), but with no automated regression protection if a future change reintroduces a tangled import several files deep. | **Not blocking this release** (the guarantee holds for the code as shipped, verified by hand). Recommend tracking as a required follow-up before further `/demo` pages are added, and flagging to whichever role owns CI infrastructure decisions — this repo currently has none, which is a broader gap than this feature alone. |
| 2 | Low / informational | `src/components/shared/top-nav.tsx` | The shipped `sidebarSections` prop is not the same name the design doc's §6.1 specified (only `Sidebar`'s `sections` and `BottomNav`'s `items` are named there) — a minor, undocumented-in-the-design-doc deviation. Verified functionally safe: optional, defaults to the prior behavior, and is only reached by `/demo`'s own composition. No security impact. | Not blocking; worth a one-line note in `folder-tree.md`/`Architecture.md`'s eventual §8 follow-up pass. |
| 3 | Low / informational | `src/features/financial-health-score/components/financial-health-score-narrative.tsx` | This real (non-demo) component carries a type-only `@/lib/ai/types` import, reused directly by `/demo`. Confirmed inert (`isolatedModules: true` erases `import type` at compile time; the demo page passes a literal, never imports the type itself) — flagged only so a future reviewer doesn't need to re-derive this from scratch. | No action needed. |

No High findings. Every one of the six verification items in scope for this
review is independently **CONFIRMED** against the actual shipped code, not
merely the design doc's or implementation's own claims about itself — including
the two specific transitive-import-avoidance claims the Frontend Lead's
implementation notes made, both of which held up under direct, file-by-file
tracing, and one of which (`GoalDetailProgressCard`) represents the
implementation correctly catching an error in the Solution Architect's own
design doc component-reuse table.

**Recommendation: APPROVE for release**, contingent on Finding #1 being
tracked as real follow-up work rather than treated as already closed — the
design doc's own risk register already lists it as open, and this review
independently confirms it remains open in the shipped code.
