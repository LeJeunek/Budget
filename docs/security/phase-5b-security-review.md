# Phase 5b Security Review — Motion & Craft

**Reviewer:** Security Architect
**Scope:** Standing per-phase review, lighter-touch per this phase's own
Product Owner spec Definition of Done ("Security Architect standing review
(lighter-touch, per this phase introducing no new data-egress/auth
surface — it is presentation-layer only)") and the CTO kickoff pass's
own framing of Phase 5b as presentation-layer only. Scoped to what Phase
5b actually changed — commits `2a209c0..HEAD` (`ede64b1` Product Owner
spec/CTO resolution, `82480f8` Solution Architect pass, `87161be` UI
Component Engineer primitives, `da67725` reduced-motion/page-transition/
number-counter wiring, `a783bd6` chart-transition/expandable-card wiring):

- The shared reduced-motion mechanism (`components/shared/motion/
  use-reduced-motion.ts`, `MotionConfig` in `src/app/providers.tsx`).
- The `AnimatedNumber` primitive (`components/shared/motion/
  animated-number.tsx`) and its ten wired-up consumers, including the new
  Server↔Client boundary file `src/app/(dashboard)/_lib/
  dashboard-animated-stat-value.tsx`.
- Chart-entrance wiring across the 14 Recharts consumers plus the
  Analytics heatmap (`useChartAnimationProps()`, `FadeIn`).
- The page-transition wrapper (`src/app/(dashboard)/template.tsx`,
  `components/shared/motion/page-transition.tsx`).
- The `ExpandableCard`/`components/ui/collapsible.tsx` disclosure
  primitive and its wiring into `DataTableCardList` (Transactions,
  Admin's `UserTable`/`AuditLogTable`, Bills'/Recurring Income's
  `OccurrenceHistoryTable`) and Analytics' dismissed-merchants toggle.
- `package.json`'s dependency surface across the same commit range.
- Whether any new E2E test-credential handling was introduced this
  phase (none found — see §4).

Reviewed against `docs/product/phase-5b-motion-craft.md`,
`docs/architecture/phase-5b-technical-design.md`, and this codebase's
standing review bar (`docs/security/phase-5a-security-review.md` most
recently), verified directly against the actual diffs and current
source rather than the docs' own claims.

**Recommendation: APPROVE.**

No High, Medium, or Low findings. This phase's own scope claim (a purely
presentational layer, no new data model or auth surface) holds up under
direct inspection.

---

## 1. No new data-egress path — verified directly, not assumed

`git diff --stat 2a209c0..HEAD -- src/app/api/` returns empty — zero
changes anywhere under `src/app/api/`. Grepped the full diff
(`git diff 2a209c0..HEAD`) for `"use server"` — zero matches. No file
under any `*/server/actions.ts`/`*-actions.ts` path appears in the
54-file changed-file list at all. This independently confirms both the
architecture doc's own §9 claim ("no new entry is required... this
phase introduces zero new Server Actions, Route Handlers... or
Server-Component-direct-call read functions") and the product spec's
own Definition of Done line, rather than taking either on faith.

Every `AnimatedNumber`/chart-animation call site inspected (`dashboard-
card-groups.tsx`, `account-card.tsx`, `debt-card.tsx`, `goal-card.tsx`,
`financial-goal-card.tsx`, `portfolio-overview-section.tsx`,
`financial-health-score-badge.tsx`, `financial-health-score-
breakdown.tsx`, `budget-summary-cards.tsx`, `expected-upcoming-income-
card.tsx`, all 14 chart components, `spending-heatmap.tsx`) passes only
a numeric value the surrounding component already had in scope and
already rendered (as a `formatCurrency`-produced string) before this
phase — confirmed by reading the actual diffs, not the pre-existing
`data`/props objects those components receive. No new prop threads a
previously-unrendered field from a query result to the client; the
underlying `DashboardCardData`/`AdminUserSummary`/`AuditLogEntry`/etc.
types are unchanged by this phase's diff (`git diff --stat
2a209c0..HEAD` contains no `types.ts`/`server/*.ts` file for any
feature). Recharts' `useChartAnimationProps()` and the Analytics
heatmap's `FadeIn` wrapper touch only how already-fetched `data` is
drawn, never what `data` is fetched — confirmed by reading each
component's diff, which is scoped to spreading three animation props
onto an already-existing Recharts primitive or wrapping already-
existing JSX.

## 2. `dashboard-animated-stat-value.tsx` — the one new Server↔Client boundary

Read in full. Exports two components, both accepting only plain,
JSON-serializable props:

```ts
export function AnimatedCurrencyStatValue({
  value,
  currency,
}: {
  value: number
  currency: string
}) { ... }

export function AnimatedPercentStatValue({ value }: { value: number }) { ... }
```

Neither accepts a function, a class instance, or any non-plain object —
exactly the constraint the RSC serialization boundary already enforces
mechanically (a function prop would fail at build/runtime, which the
file's own JSDoc documents as the exact error that motivated its
creation). Diffed `dashboard-card-groups.tsx` directly: every one of its
five `StatCard` call sites that adopts this new boundary passes the
identical `data.<field>` value and `data.currency` it already computed
and would already have rendered (as a `formatCurrency(...)` string)
before this phase — `data.netWorth.total`, `data.monthlySummary.income`,
`.expenses`, `.cashFlow`, `data.budgetSummary.totalRemaining`,
`data.monthlySummary.savingsRate`. No new field of `DashboardCardData`
is read, and the file threads no additional data beyond what already
crossed this exact Server→Client boundary in its pre-5b form (a
formatted string is not less informative than the raw number it was
derived from — the same figure, differently serialized). `currency` is
a short ISO-4217-shaped preference string, not a secret. This file
introduces no new data exposure.

## 3. Admin's expandable-card additions — client-rendering change only

Read `features/admin/components/user-table.tsx` and `audit-log-table.tsx`
in full, and diffed both against `2a209c0`. In each file, the only
change is a `meta: { cardDisplay: "expandable" }` annotation added to a
`ColumnDef` that **already existed** before this phase (`signedUp` on
`UserTable`, `user` on `AuditLogTable`) — the column's `cell` render
function, and the `AdminUserSummary`/`AuditLogEntry` data it reads, are
byte-for-byte unchanged. `git diff --stat 2a209c0..HEAD` contains no
change to `features/admin/server/*` (the actual `getUsers`/`getAuditLog`
query functions) — confirmed no new field is fetched, and the set of
data reaching the client for these two tables is identical to before
this phase.

The only behavioral change is where TanStack Table's mobile
`DataTableCardList` renders that already-fetched cell: previously every
non-`"hidden"` column rendered inline in the card body (`"secondary"`'s
default); now these two specific columns render inside a per-row
`ExpandableCard` disclosure region, reusing the identical
`flexRender(cell.column.columnDef.cell, cell.getContext())` call every
`"primary"`/`"secondary"` cell already uses (confirmed by reading
`data-table-card-list.tsx`'s diff — the new `expandableCells` branch is
a direct copy of the existing cell-rendering pattern, not a new render
path). This is purely a client-side layout/disclosure change (inline
vs. behind a toggle) on desktop-visible, already-admin-authorized data —
not a new query, not a widening of which admin-authorized data is
queried, and not a change to the `getCurrentAdminUser()` gate governing
`/admin/*` reachability (untouched by this phase's diff, confirmed by
`git diff --stat 2a209c0..HEAD -- src/app/admin/` returning empty).

## 4. New E2E test-credential handling — none introduced this phase

`git diff --stat 2a209c0..HEAD -- tests/ playwright.config.ts
.env.example .gitignore prisma/` returns empty — this phase's diff
touches none of Phase 5a's E2E test infrastructure at all. Grepped
`tests/` for `reducedMotion`/`emulateMedia`/`prefers-reduced-motion` —
zero matches anywhere in the repo currently. The product spec's own
Definition of Done calls for Playwright coverage of the reduced-motion
path (`page.emulateMedia({ reducedMotion: "reduce" })`) as part of this
sub-phase, but per the commit range inspected, the E2E Test Engineer's
dispatch for this capability has not yet landed — there is no new
test-credential handling to review in this pass. Phase 5a's own
already-reviewed credential handling (`docs/security/
phase-5a-security-review.md` §1) is unchanged by this phase's diff and
that review's conclusions still hold. **Flagged only as a forward
note, not a finding:** when the reduced-motion E2E coverage is added,
it should be re-checked for the same "no committed password literal"
standard as a follow-up, since it falls outside this pass's diff range.

## 5. Dependency surface — no new package added

```
$ git diff 2a209c0..HEAD -- package.json
(no output)
```

`package.json` is byte-for-byte unchanged across every Phase 5b commit.
Framer Motion remains at its pre-existing `^12.42.2`, and the Radix
`Collapsible` primitive used by `components/ui/collapsible.tsx` is
imported from the already-installed `radix-ui` package (confirmed by
that file's own `import { Collapsible as CollapsiblePrimitive } from
"radix-ui"`, the same aggregate-package import convention `dialog.tsx`/
`sheet.tsx` already use). No new npm package, no new transitive
dependency declaration, no supply-chain surface added this phase.

## 6. XSS / injection surface — no new sink introduced

Grepped the full 54-file changed-file set for `dangerouslySetInnerHTML` —
zero matches. Every new primitive (`AnimatedNumber`, `FadeIn`,
`PageTransition`, `ExpandableCard`, `Collapsible`) renders its
`children`/`format(...)` return value as ordinary React children/props —
React's default escaping applies uniformly regardless of content, and
none of these primitives introduces a raw-HTML sink. `AnimatedNumber`'s
`format` callback is always the caller's own existing `formatCurrency`/
`useFormatCurrency` function (confirmed by reading every call site in
§1) — no new string-interpolation-into-markup path exists. Chart
components' new `useChartAnimationProps()` spread is three numeric/
enum-typed props (`isAnimationActive: boolean`,
`animationDuration: number`, `animationEasing: "ease-out"` — a fixed
literal, not user- or request-derived) onto Recharts' own already-
trusted primitives — no attacker-controlled string reaches any of the
three.

## 7. General OWASP sweep (scoped to this phase's actual diff)

- **Authentication:** no change to `src/lib/auth.ts`, `getCurrentUser()`,
  or `getCurrentAdminUser()` this phase (none appear in the changed-file
  list).
- **Authorization:** no change to any admin-gate or per-user-scoping
  check; Admin's `UserTable`/`AuditLogTable` changes are confirmed
  client-rendering-only (§3), not a widening of queried data.
- **Rate limiting:** no new mutation/Server Action/Route Handler this
  phase (§1) — nothing new to rate-limit.
- **Secrets:** no new secret, env var, or credential-handling code
  introduced this phase (§4) — `package.json`/`.env.example` both
  unchanged.
- **CSRF:** no new Server Action or form-based mutation this phase;
  nothing new inherits or bypasses Next.js's existing CSRF protection.
- **XSS:** no `dangerouslySetInnerHTML` anywhere in this phase's diff
  (§6); every new primitive relies on React's default escaping.
- **SQL Injection:** no query-layer file (`*/server/*.ts`,
  `prisma/schema.prisma`) appears anywhere in this phase's 54-file
  changed-file list — no new query of any kind was introduced.
- **Insecure Design / Component Boundary:** the one new Server↔Client
  boundary (`dashboard-animated-stat-value.tsx`) is scoped correctly to
  plain serializable props only, confirmed directly (§2) — the RSC
  serialization constraint that motivated the file's existence is also
  the mechanism that structurally prevents a function/closure (and by
  extension, anything more complex than a number/string) from ever
  crossing it.

---

## Summary of findings

No High, Medium, or Low findings. This phase's diff (`2a209c0..HEAD`)
introduces zero new Server Actions, Route Handlers, API routes, or
query-layer changes (verified directly via `git diff --stat`, not taken
on the architecture/product docs' own word); the one new Server↔Client
boundary (`dashboard-animated-stat-value.tsx`) is confirmed to accept
only plain, serializable props and to expose no data beyond what
`dashboard-card-groups.tsx` already computed and rendered pre-5b;
Admin's two expandable-card column additions (`user-table.tsx`,
`audit-log-table.tsx`) are confirmed to be a client-side disclosure/
layout change over already-fetched, already-authorized column data, not
a new query; no new E2E test-credential handling was added this phase
(nothing to review beyond Phase 5a's already-approved handling, which
is unchanged); and `package.json` is byte-for-byte unchanged across
every Phase 5b commit, confirming no new dependency (including no
change to Framer Motion's already-installed `^12.42.2` or the
already-installed Radix primitives) was introduced.

**Recommendation: APPROVE for release.**
