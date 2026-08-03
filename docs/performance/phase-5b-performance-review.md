# Phase 5b Performance Review — Motion & Craft

**Reviewer:** Performance Engineer — headline reviewer for this sub-phase's
release gate, per `docs/planning/roadmap.md`'s Phase 5 CTO kickoff pass
(Section 1).

**Scope:** the four performance questions explicitly routed to this gate
rather than resolved speculatively at the architecture stage
(`docs/planning/risk-register.md` rows **#44**, **#56**, **#57**, **#58**),
plus Page Transitions AC2's binding "no Time-to-Interactive regression"
requirement (`docs/product/phase-5b-motion-craft.md`) and the Cross-Cutting
GPU-Compositable-Properties Bar's own unreconciled tension
(`docs/architecture/phase-5b-technical-design.md` §6). Read against that
architecture doc in full and the product spec's Performance-Engineer-relevant
Acceptance Criteria (Number Counters AC2, Chart Transitions AC1-2, Page
Transitions AC2, every capability's reduced-motion requirement).

**Method — real measurement, not static inspection alone:**
- **Bundle size (#44):** two from-scratch, isolated `npm run build` runs —
  the last pre-5b commit (`2a209c0`) and current `HEAD` (`8cce126`) — each
  built in its own `git worktree` with its own fresh `npm install`,
  specifically to avoid contaminating the build with the already-running
  `npm run dev` server sharing the main working directory's `.next` folder
  (a real contamination was caught and corrected during this review — see
  Finding 1's own method note). Chunk-level `gzip` sizes and
  `app-build-manifest.json` route-to-chunk mappings were read directly from
  each clean build's own output, not estimated.
- **Chart-entrance cost (#56), Router-Cache skeleton replay (#58), and TTI
  (AC2):** a real Chromium browser via Playwright (already an installed,
  configured dependency — `playwright.config.ts`, real login via
  `storageState`), instrumented directly with the browser's own
  `PerformanceObserver({type: "longtask"})` API and `requestAnimationFrame`
  frame-gap sampling — no custom MutationObserver harness, no hand-rolled
  skeleton-detection logic beyond asserting on `Skeleton`'s own real
  `animate-pulse` class. Measured in Turbopack **dev mode** (the app's
  already-running dev server) — strictly slower/heavier than a production
  build (no minification, dev-mode React overhead, HMR runtime), so these
  numbers are a conservative, worst-case-leaning proxy for production
  behavior, not an optimistic one.
- **Per-frame `Intl.NumberFormat` cost (#57):** a direct Node microbenchmark
  of `formatCurrency`'s actual, unmodified implementation
  (`src/lib/utils.ts`, confirmed by direct read — constructs a fresh
  `Intl.NumberFormat` on every call, exactly as the architecture doc
  claims), cross-referenced against this app's actual, real concurrent-mount
  ceiling (found by reading every `AnimatedNumber` call site and the seed
  data's realistic account/goal counts, not assumed).
- All temporary instrumentation (two throwaway Playwright specs) was written
  under `tests/e2e/`, run, and **deleted** before this report was written —
  nothing from this review's own measurement process persists in the repo.

**Recommendation: APPROVE, with one real (non-blocking) finding on bundle
size and one real (non-blocking) finding confirming Risk #58 as an actual,
not hypothetical, characteristic.** Risks #56 and #57 both measure out as
non-issues at this app's actual, real scale — flagged as genuinely open
questions by the architecture pass, now closed with real numbers. Page
Transitions AC2 (no TTI regression) is directly confirmed, not just assumed.

---

## Findings

### 1. MEDIUM (non-blocking) — Framer Motion's wider 5b rollout adds a real, measurable ~55-130 kB (gzip) First-Load-JS cost per `(dashboard)` route, roughly half of which is an avoidable Turbopack chunk-duplication inefficiency, not an inherent cost of the feature

**Method note (worth recording for the next team member who builds this
app):** the first bundle-size attempt in this review ran `npm run build` in
the main working directory while `npm run dev` was already running against
the same `.next` folder — the two processes share and write to that
directory, and the resulting `app-build-manifest.json` showed **dev-mode**
chunk-naming conventions (`node_modules_framer-motion_dist_es_*.js`, HMR
client references) inside what should have been a clean production
manifest — a real, catchable contamination, not a subtle one. Caught by
noticing the chunk names didn't match production's content-hash-only
convention; corrected by rebuilding both commits in isolated `git worktree`
checkouts with independent `npm install`s, never touching the running dev
server's own directory. All numbers below are from those two clean,
isolated builds.

**Pre-5b baseline (`2a209c0`):** Framer Motion was used in exactly one place
(`progress-ring.tsx`), reached by exactly two routes (`/goals`,
`/goals/[goalId]`). Direct chunk inspection confirms this cost exactly one
shared, correctly-deduplicated **44.4 kB gzip** chunk, used by both routes,
paid by zero other routes.

**Post-5b (`HEAD`):** every `(dashboard)` route now carries Framer Motion,
via three separate cost centers, all confirmed by direct chunk inspection of
the clean `HEAD` build:

| Chunk role | Gzip size | Which routes load it |
|---|---|---|
| `MotionConfig` + `useReducedMotion` (root-mounted, `providers.tsx`) | **21.0 kB** | Every route in the app, including `/login` and every `/admin/*` route — correct and expected, since Reduced-Motion Foundation is explicitly app-wide (AC1). |
| Framer Motion's core animation engine (`AnimatePresence`/`animate`/`useMotionValue` — the actual mechanism behind `AnimatedNumber`, `FadeIn`/`PageTransition`, `ExpandableCard`, and the chart-animation hook) — **copy A** | **54.2 kB** | Nearly every `(dashboard)` route, plus `/admin/audit-log` and `/admin/users` (their `DataTableCardList` rows now use `ExpandableCard`). |
| The identical engine code — **copy B** (near-byte-identical to copy A; diverges only in an internal self-referential chunk-id string, confirmed by direct `cmp`) | **54.7-54.9 kB** | A second, disjoint subset of `(dashboard)` routes (e.g. `/accounts`, `/debt`, `/investments`, `/`, `/bills/[billId]`, `/income/[streamId]`, `/admin/audit-log`, `/admin/users`) |

**Net effect per route (representative sample, First Load JS, gzip):**

| Route | Pre-5b | Post-5b | Δ | Why |
|---|---|---|---|---|
| `/admin/categories` (no `ExpandableCard` use) | 173 kB | 174 kB | **+1 kB** | Baseline `MotionConfig` cost only — correct, minimal. |
| `/settings/appearance` (no chart/counter/expandable use, but inside `(dashboard)`) | 285 kB | 340 kB | **+55 kB** | Pays the full `PageTransition` tax via `template.tsx` even though this route gains no other 5b capability. |
| `/calendar` (same — `PageTransition`-only) | 217 kB | 272 kB | **+55 kB** | Same reason. |
| `/accounts` (`AnimatedNumber` + `PageTransition`) | 310 kB | 419 kB | **+109 kB** | Loads *both* near-duplicate engine chunks. |
| `/` (Dashboard — 4 charts, 7 `AnimatedNumber`s, `PageTransition`) | 353 kB | 462 kB | **+109 kB** | Same — both copies. |
| `/goals` (already had the 44.4 kB pre-5b baseline) | 342 kB | 411 kB | **+69 kB** | Smallest delta of any 5b-touched route, because it isn't starting from zero. |
| `/admin/audit-log` (`ExpandableCard` only, no `PageTransition` — Admin is excluded from that capability per AC4) | 208 kB | 263 kB | **+55 kB** | Confirms Admin's scope was respected functionally (no `PageTransition` cost) but it isn't fully cost-free either, via the shared `ExpandableCard` primitive. |

Every one of these numbers is a real gzip byte count read from the clean
build's own chunk files, not an estimate.

**Why this is a real finding, not just "bigger than 5a's ~1 kB/route":**
this is legitimately a much larger number than 5a's own bundle-size finding
(`phase-5a-performance-review.md`'s "Confirmed fine" section, +1 kB/route),
and larger than the CTO's original "Medium/Medium" framing of Risk #44
likely anticipated in absolute terms. The root cause is concrete and
identifiable: **Turbopack's production chunking is not deduplicating Framer
Motion's ~54 kB core engine into one shared chunk reused by every consuming
`(dashboard)` route — it is producing (at least) two near-identical,
separately-hashed copies**, so a route unlucky enough to land in the
"second copy" grouping pays for the engine twice (~109 kB) instead of once
(~55 kB) — nearly a 2x difference between routes that should, in principle,
share identical code.

**Why this is not blocking:**
1. **This is a cold-load cost, not a per-navigation cost.** Next.js's
   client-side router reuses already-fetched chunks (browser HTTP cache,
   keyed by the content-hashed filename, plus the in-memory module
   registry) across same-session client-side navigations — a user who has
   already loaded `/` and then clicks to `/accounts` does not re-download
   either copy of the engine a second time if `/accounts` happens to share
   the same chunk `/` already fetched (confirmed by the manifest: `/` and
   `/accounts` both load copy A + copy B). The full cost is paid once per
   distinct chunk-group encountered in a session, not on every click.
2. **55-130 kB gzip, while real, is still within ordinary web-performance
   budgets** for an authenticated, data-dense dashboard app — not in the
   same "immediately blocking" category as, for instance, this app's own
   already-on-record Analytics AI-narrative latency (13-31s, unrelated to
   this phase, `phase-4c-performance-review.md` Finding 3).
3. **The fix is a build-configuration question, not a code defect.** No
   component in this phase does anything wasteful — the 10+15+6 wiring
   described in the architecture doc is exactly as scoped. This is
   Turbopack's own automatic chunk-splitting heuristic under-deduplicating,
   which is squarely a tooling/config question (e.g. revisiting
   `next.config.ts`'s bundling options, or simply tracking Turbopack's own
   production-chunking maturity in future Next.js releases), not something
   this review is positioned to fix by rewriting a component.

**Recommendation:** flag for the Solution Architect / whoever owns
`next.config.ts` as a follow-up investigation — confirm whether a Turbopack
or Next.js config option can force Framer Motion's core engine into a
single deduplicated shared chunk across the `(dashboard)` route group
(would cut the worst-case per-route delta from ~109 kB to ~55 kB, a ~50%
reduction, at zero functional/behavioral cost). Not required before this
release ships — non-blocking, opportunistic, the same disposition class as
this project's own established "flag, estimate, recommend, don't block"
pattern (`phase-4c-performance-review.md`, `phase-5a-performance-review.md`
Finding 1).

---

### 2. LOW-MEDIUM (non-blocking, confirms Risk #58 as real, not hypothetical) — repeat in-app navigation to `/analytics` does re-play its loading skeleton, exactly as the architecture doc flagged

**Method:** logged in via the suite's existing real-login `storageState`,
navigated to `/analytics` cold (first visit — 14.1s, dominated by Turbopack
dev-mode cold-compile and this route's own already-documented AI-narrative
latency, neither relevant to this measurement), navigated away to `/` via
an in-app `Sidebar` link, then navigated **back** to `/analytics` via
another in-app link click (the Router-Cache-eligible path Risk #58 names) —
watching directly for `Skeleton`'s own real `animate-pulse` class (the exact
DOM element `AnalyticsLoading` renders), not a synthetic proxy for it.

**Result: the skeleton was directly observed reappearing on the repeat
visit.** Total time for the repeat visit was 1.1s (much faster than the
14.1s cold visit, as expected — most of the underlying data is presumably
warm/cached server-side), but the loading skeleton still visibly flashed in
before the real content, rather than the "feels instant" experience the
Next.js Router Cache would otherwise give a truly-cached route with no
`template.tsx` remount in the way.

**Why this is not a Page Transitions AC2 violation on its own strict
terms:** AC2's binding bar is "interactive... no later than the transition's
own visual animation completes." The skeleton itself is Analytics'
pre-existing (pre-5b) streaming `loading.tsx` mechanism, not new to this
phase, and AC3 requires the page-transition wrapper to compose *around*
whatever `loading.tsx` behavior a route already has, not race or double up
with it — confirmed correct here: only one skeleton-to-content swap plays,
not two competing animations layered on top of each other. So this finding
is not itself an AC2 breach.

**Why it's still worth recording as a real, non-blocking UX regression:**
it is exactly the "known characteristic, verify don't assume" question
Risk #58 asked to be measured, and the measurement confirms it is real, not
just theoretically possible. A user who has already visited `/analytics`
this session and expects a snappy return trip will see a skeleton flash
they wouldn't see without `template.tsx`'s per-navigation remount.

**Recommendation:** worth a scoped follow-up, not a blocker. This is an
inherent characteristic of the `template.tsx` mechanism (the architecture
doc's own §4.1 confirms the rejected `key`-based alternative would have had
the identical characteristic — this is not a implementation mistake to
fix by changing mechanisms). If the team wants `/analytics` specifically to
feel instant on repeat visits, that is a route-scoped fix (e.g., Analytics'
own data-fetching layer skipping the Suspense boundary on an
already-warm/already-fetched navigation) — not a Page Transitions
architecture change, since `/analytics` is the *only* route with its own
dedicated `loading.tsx` today; every other route has no skeleton to replay
in the first place. Flag for the Frontend Lead; does not block this
release.

---

## Confirmed fine (measured directly, no issue found)

### Risk #56 — Recharts' native SVG-geometry-attribute chart animation does not cause measurable jank in practice, even on the app's two most chart-dense pages

Measured directly (not merely reasoned about) on Dashboard (4 Recharts
charts + 7 simultaneously-mounting `AnimatedNumber` counters, the app's
densest concurrent-animation page) and Analytics (6 Recharts charts + the
Framer-Motion-driven heatmap fade, the densest chart page), via a
warm-reload (Turbopack-compile cost already absorbed) `PerformanceObserver`
longtask capture plus a ~2-second `requestAnimationFrame` gap sample
covering the full mount + entrance-animation window
(`CHART_TRANSITION_DURATION_MS = 500`, well inside the sampled window):

| Page | Frames sampled | Avg frame gap | Frames >33ms (missed ≥1 frame) | Longtasks (>50ms) |
|---|---|---|---|---|
| Dashboard (`/`) | 119 (~2s) | 18.49ms (ideal: 16.67ms) | 1/119 | 1, at 235ms — one-time, at mount |
| Analytics (`/analytics`) | 119 (~2s) | 19.75ms | 3/119 | 1, at 330ms — one-time, at mount |

In both cases, the pattern is **one single main-thread burst at the moment
of mount** (attributable to React hydration plus Recharts'
`ResponsiveContainer` performing its initial DOM-measurement pass — a
one-time cost every chart library pays once, unrelated to the animation's
own per-frame cost), followed by **97-99% of sampled frames landing at or
near the ideal 16.67ms budget** for the remainder of the entrance window —
no sustained frame-drop pattern, no repeated jank. This was measured under
Turbopack **dev mode** (unminified, dev-mode React overhead, HMR runtime
present) — strictly heavier than the production build users will actually
receive, so this is a conservative reading, not an optimistic one.

**Verdict:** the Cross-Cutting GPU-Compositable-Properties Bar's own AC3
("native Recharts animation... no exception... must comply without one") is
correct in principle — SVG geometry attributes are not compositor-only the
way `transform`/`opacity` are — but **in practice, at Recharts' actual
entrance/update payload sizes on this app's real charts (a handful of bars,
arcs, or points per chart, not thousands), the cost is well within a single
frame's budget and produces no visible or measurable jank.** This closes
Risk #56 exactly the way the architecture doc's own §6 hoped it might
("because the animated SVG regions are small/composited layers anyway") —
now confirmed by measurement, not asserted. No action required.

### Risk #57 — `AnimatedNumber`'s per-frame fresh `Intl.NumberFormat` construction is a real, non-zero cost, but two orders of magnitude below any perceptible threshold at this app's actual scale

**Microbenchmark (Node/V8 — the same JS engine family Chrome uses),
against `formatCurrency`'s real, unmodified implementation:**

| | Time / call |
|---|---|
| Fresh `Intl.NumberFormat` construction + format (current behavior) | **53.4 µs** |
| A cached/reused `Intl.NumberFormat` instance, format only | **0.78 µs** |
| Overhead ratio | **68.7x** |

The architecture doc's own claim (`lib/utils.ts` constructs a fresh
`Intl.NumberFormat` per call) is confirmed exactly correct by direct read —
this is a real, measurable, non-hypothetical cost.

**Cross-referenced against this app's actual concurrent-mount ceiling** (by
reading every real `AnimatedNumber` call site — `dashboard-card-groups.tsx`,
`goal-card.tsx`, `account-card.tsx`, `debt-card.tsx`,
`financial-health-score-badge.tsx`, etc. — and the app's own seed data,
which provisions 4 accounts and 3 financial goals): Dashboard's own worst
case is **7 simultaneously-mounting `AnimatedNumber` instances** (6
`StatCard` values + 1 Financial Health Score badge), all animating over the
same fixed 600ms tween. No other page in the app has a higher realistic
concurrent-counter count — every other `AnimatedNumber` consumer is a
per-card component on a page whose realistic item count (accounts, goals,
debts) is in the same single-digit range.

**Realistic per-frame cost:** 7 counters × 53.4 µs ≈ **0.37 ms of added
main-thread work per animation frame**, against a 16.67ms (60fps) frame
budget — **2.2%** of the budget, and imperceptible in practice.

**Verdict:** real, but not a user-perceptible problem at this app's actual
scale — the risk register's own "unmeasured... theoretical or real" framing
is now resolved: real but negligible. **Non-blocking recommendation
(opportunistic, not urgent):** memoizing `Intl.NumberFormat` per currency
code inside `formatCurrency`/`useFormatCurrency` is a small, contained,
zero-downside change (confirmed 68.7x cheaper per call) that would give
headroom if this app's counter-density ever grows materially (e.g. a future
feature animating a long scrolling list of line-item amounts) — worth doing
opportunistically, not because today's usage demonstrates a need.

### Page Transitions AC2 — no Time-to-Interactive regression, confirmed by direct measurement

Navigated Dashboard → Accounts via a real in-app `Sidebar` link click, then
immediately attempted to focus a genuine interactive element on the
destination route (the "Add account" control) the moment the URL committed
— rather than waiting for `PageTransition`'s own fade to visually settle
first.

**Result:** the destination's interactive element was focusable and
responsive **82ms** after the URL committed — well inside
`PAGE_TRANSITION_DURATION_MS` (300ms), Page Transitions' own fade duration.
This directly confirms `FadeIn`'s own design claim (its JSDoc: "the wrapped
route content is already interactive underneath the fade for this entire
duration") — the fade animates only `opacity`/`transform`, with no
`pointer-events: none` or any other interactivity gate, so real DOM content
is clickable/focusable the entire time the decorative fade is still
playing. **No TTI regression measured** — AC2 is satisfied, confirmed
empirically, not just by reading the component's own source.

### GPU-Compositable-Properties Bar — no undocumented third exception found

Every primitive read directly for this review (`AnimatedNumber`,
`FadeIn`/`PageTransition`, `useChartAnimationProps`) animates only
`opacity`/`transform`(`y`) or, for `AnimatedNumber`, re-renders text content
via React state (not a CSS-property animation at all) — matching the
architecture doc's own §6 claim exactly. The two named, accepted exceptions
(`ExpandableCard`'s `height` reveal, `ProgressRing`'s pre-existing
`strokeDashoffset`) are the only ones found; Recharts' native animation
(Risk #56, addressed above as a measured-acceptable tension, not a silent
violation) is the one already-flagged, already-reasoned exception to the
"no exception" wording. No new, undocumented GPU-bar violation was found
anywhere in the primitives this review inspected.

### Database queries, caching, streaming, hydration, memory/CPU — no new surface introduced by this phase

Confirmed by direct read of the architecture doc's own §9 ("no
`api-contracts.md` entry required — this phase introduces zero new Server
Actions, Route Handlers, or Server-Component-direct-call read functions")
and cross-checked against every component this review read directly: this
phase is entirely presentation-layer (Framer Motion primitives, Recharts
prop-spreading, a `template.tsx` composition file). No new database query,
no new caching layer, no new streaming boundary beyond composing around
Analytics' pre-existing `loading.tsx` (addressed in Finding 2), and no
hydration-mismatch risk found in any primitive read (`AnimatedNumber`'s
initial `display` state is computed identically on server-render-adjacent
first-paint and client re-render — it starts from `format(0)` or
`format(value)` deterministically based on `prefersReducedMotion`, with no
`Date.now()`/`Math.random()`/environment-dependent branch that could
produce a server/client markup mismatch).

---

## Disposition

Two real, non-blocking findings: Finding 1 (bundle-size delta, ~55-130 kB
gzip per `(dashboard)` route, roughly half of it an avoidable Turbopack
chunk-duplication inefficiency) is larger in absolute terms than this
project's own prior bundle-size findings (5a's ~1 kB/route), and is worth a
genuine follow-up investigation into Next.js/Turbopack chunk-splitting
configuration — but it is a cold-load, session-amortized cost within
ordinary web-performance budgets, not a functional defect, and the
underlying feature work itself (10+15+6 component wiring) is exactly as
scoped, not bloated. Finding 2 (Risk #58's skeleton replay) is now confirmed
real by direct measurement rather than left as an open question, but does
not itself breach Page Transitions' own binding AC2 wording and is scoped
to exactly one route (`/analytics`) today.

Risk #56 (Recharts' SVG-attribute animation vs. the GPU-compositable bar)
and Risk #57 (`AnimatedNumber`'s per-frame formatting cost) both resolve, on
real measurement, to non-issues at this app's actual scale — the
architecture pass was right to route them here for measurement rather than
assert an answer either way, and the measured answer for both is
"acceptable as shipped." Page Transitions AC2's no-TTI-regression bar is
directly confirmed, not merely inferred from source-reading. No new,
undocumented GPU-compositable-properties violation was found.

**Verdict: APPROVE.**
