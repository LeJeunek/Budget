# Phase 5a Performance Review — Accessibility & Responsive Foundation

**Reviewer:** Performance Engineer
**Scope:** the full Phase 5a shipped surface, read against
`docs/product/phase-5a-accessibility-responsive.md` and
`docs/architecture/phase-5a-technical-design.md` (§2 `BottomNav`, §3
mobile-treatment primitives, §4 Calendar v2's day-detail affordance) as the
intended design. Measured directly against the real, current source tree
(`git diff bc452a3..HEAD`, the last pre-5a commit, against `HEAD`) rather than
taken on the architecture doc's own reasoning on faith — the specific
instruction for this pass. Every number below is either a real `npm run
build` output, an actual `react-dom/server` static-markup render of the real
production components (`DataTable`, `DataTableCardList`,
`ResponsiveDataTable`, `BillEntry`, `PaydayEntry`, `BudgetResetMarker`,
`DayEntryIndicators`) with representative row/day data mirroring each
consumer's real shape, or a direct grep/read of the actual diff — never an
unverified estimate presented as measured.

**Recommendation: APPROVE, with two non-blocking follow-ups recommended**
(Findings 1–2 below). Nothing found is a correctness defect, a regression a
user would notice at this app's realistic, pagination-bounded data volumes,
or a reason to hold the release. Finding 1 is the one place this review's
own numbers diverge materially from the architecture doc's own stated
reasoning (`phase-5a-technical-design.md` §3.1's "a minor, bounded doubling
of DOM nodes per table") — the measured cost is real, structurally
permanent, and larger than "doubling," but it is still bounded, still
pagination-capped, and still cheap in absolute terms next to this app's
existing performance profile (e.g. `phase-4c-performance-review.md`'s own
Finding 3, Analytics' AI-narrative generation measured at 13–31s). Flagged as
a worth-fixing, cheap, opportunistic improvement — not a blocker.

---

## Findings

### 1. LOW-MEDIUM (non-blocking) — `ResponsiveDataTable`'s dual-render cost is real, structurally permanent, and larger than "a minor, bounded doubling" — the mobile card view costs *more* DOM nodes per row than the table it replaces, not less

**Method:** built a harness that renders the actual `DataTable` and
`DataTableCardList` components (not mocks) via `react-dom/server`, using
column definitions that mirror Transactions' real 8-column shape
(`date`, `merchant`, `category` [badge], `amount`, `account` [dot+text],
`tags` [badges], `notes`, `actions` [dropdown trigger]) and Transactions'
real toolbar (1 search `Input` + 2 `Select`s + 2 date `Input`s — the exact
control set `transaction-table.tsx`'s `toolbar` render-prop supplies).
Element counts are actual opening-tag counts from the rendered static HTML,
not estimated.

**Per-row cost (isolated from fixed chrome, linear-fit across n = 1, 10, 25, 50 rows):**

| View | Elements / row |
|---|---|
| `DataTable` (table, `<tr>`+`<td>`s) | **~25.7** |
| `DataTableCardList` (card, `<li>`+`Card`+label:value pairs) | **~40.7** |

The card view costs **~58% more DOM nodes per row than the table it's
replacing on mobile** — the *opposite* of what "reflowing a dense row into a
simpler mobile card" usually implies. The reason is structural, not
accidental: every `"secondary"`-priority column (the default —
`meta.cardDisplay` omitted) renders as a wrapper `<div>` + a label `<span>` +
a value `<span>` (3 nodes) in the card view, where the identical cell costs
only its own content inside one shared `<td>` in the table view. Confirmed
directly: **none of the 6 `ResponsiveDataTable` consumers currently use
`cardDisplay: "hidden"` anywhere** (grepped) — every column that isn't one of
the 1–2 `"primary"` columns falls through to `"secondary"` and is rendered
in full, with its label-wrapping overhead, on the card view.

**Realistic combined cost at Transactions' actual default page size (`DEFAULT_PAGE_SIZE = 25`, `transaction-table.tsx`):**

| | Elements | Static-HTML bytes |
|---|---|---|
| Table view alone | 690 | 60.6 KB |
| Card view alone | 1,051 | 81.9 KB |
| **Both mounted simultaneously (actual `ResponsiveDataTable` behavior)** | **1,741** | **142.5 KB** |

At the table's own max page size (50 rows, `pageSizeOptions`'s own ceiling),
combined mounted cost reaches **3,398 elements**. For reference, commonly
cited web-performance guidance (web.dev's "Avoid an excessive DOM size")
recommends keeping a page's *total* DOM under ~1,500 nodes — this single
component, at Transactions' own default page size, already exceeds that on
its own, before Sidebar/TopNav/BottomNav chrome, the page header, or any
dialog markup is counted.

**A second, previously-unquantified fixed cost: the toolbar and pagination
footer are also fully duplicated, independent of row count.** Measured at
n = 0 rows with Transactions' real 5-control toolbar: table-view chrome
alone = 52 elements, card-view chrome alone = 44 elements — **96 elements of
duplicated filter/pagination UI on every `ResponsiveDataTable` instance,
regardless of how many rows are on the page.** The architecture doc's own
§3.1 reasoning frames the cost entirely as "a minor, bounded doubling of DOM
nodes *per table*" (i.e., per row) — it does not account for this row-count-
independent toolbar/pagination duplication, which is a real, if small,
additional tax paid by all 6 consumers.

**Why this is still non-blocking:** every one of the 6 consumers is
pagination-bounded (10–50 rows per page, per `DataTable`'s own
`pageSizeOptions` ceiling) — this cost cannot grow unboundedly with a user's
total data volume the way an unpaginated list could. At the *default* (25
rows), 1,741 extra-or-not-depending-on-viewport DOM nodes is a real, one-time
render/hydration/memory cost per page visit, not a per-scroll or per-
interaction cost, and this app's own Analytics AI-narrative latency (13–31s,
per `phase-4c-performance-review.md` Finding 3 and this phase's own
`playwright.config.ts` comment) remains a larger, un-addressed performance
signal than this finding. Not a regression severe enough to block a release
built on a deliberate, already-reasoned architecture-stage tradeoff — but the
specific magnitude and direction (card costs *more*, not less, per row) is
worth correcting in the team's own understanding, and the fix is cheap.

**Recommendation:**
1. Annotate genuinely low-priority columns as `cardDisplay: "hidden"` on
   mobile for the 6 consumers where a column adds little value on a narrow
   card (e.g. Transactions' `notes`/`tags` — already visually
   de-emphasized/truncated in the table view; Admin's audit-log `outcome`
   detail columns) — this directly reduces the card view's own per-row node
   count below the table's, the outcome the architecture doc's reasoning
   implicitly assumed was already happening. This is a per-feature,
   low-risk, additive change (the mechanism already exists — §3.1's own
   `meta.cardDisplay` convention — this is a matter of *using* the `"hidden"`
   value at least once, not building anything new).
2. Consider (non-urgent, larger change) collapsing the toolbar/pagination
   footer to render once, positioned outside the `hidden sm:flex`/`sm:hidden`
   split — e.g. `ResponsiveDataTable` renders one shared toolbar/pagination
   row above both views, passing only the row-rendering markup through the
   CSS-only switch. This removes the fixed ~96-node duplication entirely,
   at the cost of `DataTableCardList`/`DataTable` no longer being fully
   self-contained — a real design tradeoff, not a drop-in fix, so scoped as
   a "worth evaluating," not "required," follow-up.

### 2. INFORMATIONAL (non-blocking, confirms the architecture doc's own framing was accurate here) — Calendar v2's day-cell dual-render is genuinely the "minor, bounded doubling" the architecture doc describes

**Method:** identical technique — real `BillEntry`/`PaydayEntry`/
`BudgetResetMarker`/`DayEntryIndicators` components rendered via
`react-dom/server`, in the exact desktop (`hidden sm:flex`) and mobile
(`sm:hidden`) markup shapes `calendar-grid.tsx` actually produces, across a
realistic 31-day month composition (1 budget-reset day, 8 days with one
bill, 4 days with a bill+payday, 18 empty days — a plausible mid-usage
FinanceOS month).

| | Elements |
|---|---|
| Desktop-only rendering (hypothetical single-render) | 195 |
| Dual-render (both mobile + desktop mounted, actual behavior) | 338 |
| **Extra cost from dual-render** | **143 (+73%)** |

Unlike Finding 1, this is a genuinely small, bounded absolute cost — 143
extra nodes for an entire month's grid — because the mobile condensed cell
(`DayEntryIndicators`: a handful of small `<svg>` glyphs) is deliberately
*lighter* than the desktop cell it sits alongside, not heavier, and
`DayDetailSheet` (the tap-to-expand overlay) renders nothing at all when
closed (confirmed: Radix `Dialog.Content`/`Sheet` unmounts its content when
`open={false}`, so it contributes zero baseline DOM cost per day cell — it
is mounted once per grid, not once per cell). The +73% relative figure looks
large in isolation but the absolute number (143 nodes across an entire
month) is trivial next to Finding 1's 1,051–1,741. **No action recommended**
— this is the one place the architecture doc's own risk-acceptance language
holds up exactly as claimed when checked against real numbers.

---

## Confirmed fine (checked directly, no issue found)

- **Bundle size impact is genuinely negligible — measured, not assumed.**
  Built both `HEAD` and the last pre-5a commit (`bc452a3`, via a separate
  `git worktree`) with `npm run build` and diffed the real Turbopack output:

  | Route | Pre-5a (`bc452a3`) | Post-5a (`HEAD`) | Δ route JS | Δ First Load JS |
  |---|---|---|---|---|
  | `/` | 7.45 kB / 352 kB | 7.48 kB / 353 kB | +0.03 kB | +1 kB |
  | `/transactions` | 28.0 kB / 330 kB | 29.1 kB / 331 kB | +1.1 kB | +1 kB |
  | `/calendar` | 3.25 kB / 215 kB | 3.94 kB / 216 kB | +0.69 kB | +1 kB |
  | `/analytics` | 10.5 kB / 355 kB | 11.0 kB / 356 kB | +0.5 kB | +1 kB |
  | `/admin/users` | 5.33 kB / 206 kB | 5.39 kB / 207 kB | +0.06 kB | +1 kB |
  | `/admin/audit-log` | 6.18 kB / 206 kB | 6.24 kB / 208 kB | +0.06 kB | +2 kB |
  | `/bills/[billId]` | 8.83 kB / 326 kB | 8.85 kB / 328 kB | +0.02 kB | +2 kB |
  | `/income/[streamId]` | 9.91 kB / 327 kB | 9.92 kB / 329 kB | +0.01 kB | +2 kB |
  | Shared JS (all routes) | 183 kB | 184 kB | — | +1 kB |
  | Shared CSS | 16.4 kB | 17.2 kB | — | +0.8 kB |

  Every affected route's own route-level JS grew by under 1.1 kB, and the
  shared First Load JS grew by 1 kB — the entire cost of `BottomNav`,
  `ResponsiveDataTable`/`DataTableCardList`, `ScrollAffordanceContainer`,
  `DayDetailSheet`/`DayEntryIndicators`, and every accessibility/contrast
  fix, combined, across the app's shared chunk. Not a measurable regression
  by any standard bundle-size bar.
- **`@axe-core/playwright` and `@playwright/test` contribute zero bytes to
  the production client bundle — confirmed, not assumed.** `git diff
  bc452a3..HEAD -- package.json` shows both were added to `devDependencies`
  only, with zero changes to `dependencies`. Cross-checked by grepping the
  actual compiled output (`.next/static/chunks/`) for `playwright`/
  `axe-core` strings — zero matches. Both are test-only tooling that never
  ships.
- **`ScrollAffordanceContainer` is exactly as cheap as designed.** Confirmed
  by direct read: no `useState`, no `useEffect`, no scroll-event listener —
  three static wrapper `<div>`s (`relative` positioning root, the
  `overflow-x-auto` scroll region, two `aria-hidden` gradient overlays) with
  no re-render-triggering state of its own. It re-renders only when its
  parent chart re-renders (ordinary prop-driven reconciliation, no
  additional cost it introduces), and contributes a fixed, tiny 3-node
  overhead regardless of the wrapped chart's own complexity. Confirmed
  exactly 6 consumers (`category-trends-chart.tsx`,
  `expense-distribution-chart.tsx`, `income-growth-chart.tsx`,
  `income-sources-chart.tsx`, `savings-growth-chart.tsx`,
  `yearly-spending-chart.tsx`), matching the architecture doc's own count,
  plus one incidental use in `dashboard-shell.tsx`'s `<main>` region (a
  `tabIndex`-only fix, not the full container — see below).
- **`Table`'s `wrapperTabIndex` fix and the ~13 contrast-token-swap files are
  genuinely zero-cost.** `wrapperTabIndex` is a single optional prop
  (`number`, default `0`, override `-1` for `TableSkeleton`'s
  `aria-hidden` case) controlling one `tabIndex` attribute on an
  already-rendered wrapper `<div>` — no new element, no new render path, no
  behavioral branch beyond the attribute value itself. The contrast fixes
  (grepped: 13 files match the `text-red-700 dark:text-red-400` /
  `text-emerald-700 dark:text-emerald-400` pattern directly, plus
  `avatar.tsx`/`progress.tsx`/`dropdown-menu.tsx`/`badge.tsx`/`button.tsx`
  from the same accessibility structural-fix commit) are pure Tailwind
  class-string substitutions — same element, same tree shape, different
  token. Zero measurable runtime cost.
- **Zero new database queries, zero new Server Actions/Route Handlers, zero
  schema changes.** `git diff bc452a3..HEAD --stat -- src/features/*/server
  prisma/schema.prisma` returns no changes at all — confirmed directly, not
  inferred from the architecture doc's own claim. This phase is entirely
  presentation-layer + test-infrastructure; there is no database-query or
  caching surface to review for this phase, matching
  `phase-5a-technical-design.md` §8's own "no `api-contracts.md` entry
  required" closing note.
- **No unmemoized expensive computation or N+1-shaped pattern in any new
  component.** `BottomNav`: a fixed 4-item array, one `usePathname()` call,
  one `O(1)` string-comparison (`isActivePath`) per item — negligible.
  `DataTableCardList`: two `Array.prototype.filter` passes over each row's
  already-small (~8) cell list — `O(columns)` per row, trivial at this
  scale. `DayDetailSheet`: renders `null` content when closed (confirmed via
  Radix `Dialog`'s own unmount-when-closed behavior), so it has no baseline
  per-day-cell cost at all — it is mounted once per `CalendarGrid`, not once
  per cell. `DayEntryIndicators`: a capped, `O(1)`-bounded (max 4 visible +
  overflow) icon row, no computation beyond array slicing.
- **`DashboardShell`'s lifted `mobileNavOpen` state does not leak
  re-renders into page content.** Confirmed by direct read: `children` is
  received as a prop (an already-constructed React element from the Server
  Component parent, `layout.tsx`), not re-invoked when `DashboardShell`'s
  own `useState` toggles — only `DashboardShell`'s own JSX
  (`Sidebar`/`TopNav`/`BottomNav`/the `<main>` wrapper) reconciles on a
  mobile-nav toggle, never the actual page/feature component tree beneath
  it. This is the correct, standard "lift state, pass children by
  reference" pattern — no fix needed.
- **One real, minor CPU note on `ResponsiveDataTable` (not a separate
  finding, folded in here since it's not itself blocking):** because
  `DataTable` and `DataTableCardList` share exactly one `useReactTable`
  instance (by design, per §3.1 — this is what keeps sort/filter/pagination
  state from drifting), any state change on that instance (a sort click, a
  filter keystroke, a page-size change) causes **both** subtrees to
  reconcile, including whichever one is currently `hidden` and not visually
  shown. At this app's pagination-bounded row counts (≤50 rows), this is a
  sub-frame-budget cost in React terms (well under the ~16 ms/frame budget)
  and not worth a dedicated finding — flagged here only so it's on record as
  the reasoned tradeoff it is (shared correctness > avoiding reconciling an
  invisible tree), consistent with the architecture doc's own "verified by
  construction, not convention" framing for why the two views can never
  drift out of sync.

---

## Disposition

Finding 1 is the one place this review's real numbers diverge from the
architecture doc's own stated reasoning — the dual-render cost for
`ResponsiveDataTable` is real, structurally permanent (not just per-row, but
also a fixed ~96-node toolbar/pagination duplication), and the mobile card
view is actually the *more* expensive of the two views per row, not the
lighter one intuition would suggest. None of that changes the release
disposition: the cost is still bounded by this app's own pagination ceiling
(never unbounded, never scales with a user's total data volume), still small
in absolute terms next to this app's actual largest measured performance
cost (Analytics' 13–31s AI-narrative generation, already on record from this
same phase's own Playwright config comments), and the fix (using the
already-built `cardDisplay: "hidden"` mechanism, which simply isn't being
used yet) is cheap, low-risk, and additive — reasonable to schedule
opportunistically, not to block release on, matching this project's own
standing "flag, estimate, recommend, don't block" disposition style
(`phase-4c-performance-review.md`'s identical framing). Finding 2 confirms
the architecture doc's Calendar-specific reasoning was accurate when checked
against real numbers — no action needed there. Bundle size, caching,
database queries, `ScrollAffordanceContainer`, and every zero-cost
accessibility fix are all confirmed clean by direct measurement.

**Verdict: APPROVE.**
