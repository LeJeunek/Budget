# Bug Report: `ResponsiveDataTable`'s `toolbar`/`enableGlobalFilter` content is mounted twice — once inside `DataTable`'s `hidden sm:flex` tree and once inside `DataTableCardList`'s `sm:hidden` tree — producing two live, simultaneously-mounted controls with identical accessible names for every filter input

## Severity
**Medium** — not visibly broken for an ordinary sighted mouse user (CSS correctly shows only one copy at a time, and both copies share the same underlying state so they never visually disagree), but it is a real, confirmed structural defect: two separate, real DOM elements with identical accessible names/placeholders exist simultaneously at every breakpoint, doubling the actual number of mounted interactive controls (search inputs, `Select` dropdowns, date pickers) for every `ResponsiveDataTable` consumer that supplies a `toolbar` or uses `enableGlobalFilter`. This directly reproduces the class of defect this project's own stated engineering principle ("avoid duplication") exists to prevent, and is concrete, measurable evidence (not speculative) that a future accessibility/tooling pass could easily surface as a false "duplicate landmark/control" finding, and that already breaks any test (this pass's own included) that queries the page by accessible name/placeholder without knowing to expect two matches.

## Component
- `src/components/shared/data-table/responsive-data-table.tsx` (mounts both `<DataTable table={table} toolbar={toolbar} className="hidden sm:flex" />` and `<DataTableCardList table={table} toolbar={toolbar} className="sm:hidden" />` — the same `toolbar` function reference invoked from two separate places in the render tree)
- `src/components/shared/data-table/data-table.tsx` (its own internal `enableGlobalFilter`/`toolbar` rendering, lines ~211-228)
- `src/components/shared/data-table/data-table-card-list.tsx` (its own, separately-written, internal `enableGlobalFilter`/`toolbar` rendering, lines ~151-169)
- Currently manifests concretely in `src/features/transactions/components/transaction-table.tsx` lines 553-612 (the `toolbar` prop: merchant/notes search `Input`, account `Select`, category `Select`, two date `Input`s) — the only current consumer of the `toolbar` prop, though the same duplication would apply to any consumer using `enableGlobalFilter` too, since that flows through the identical dual-mount mechanism.

## Summary
`ResponsiveDataTable`'s design (`phase-5a-technical-design.md` §3.1) deliberately keeps both `DataTable` and `DataTableCardList` mounted in the DOM simultaneously at all times, CSS-toggled (`hidden sm:flex` / `sm:hidden`), specifically to avoid a JS media-query hydration mismatch. This is a reasonable, working strategy for the `<table>`/card-list row markup itself, since each row's markup differs meaningfully between the two views.

However, `toolbar` (a caller-supplied render **function**, `(table) => ReactNode`) and the built-in `enableGlobalFilter` input are **identical, breakpoint-independent** content — there is no reason for either view to render its own separate copy — yet both `DataTable` and `DataTableCardList` independently render `{enableGlobalFilter && <Input .../>}` and `{toolbar?.(table)}` inside their own always-mounted trees. Since `toolbar` is a function invoked twice (once per parent), each invocation produces its own distinct React element tree and therefore its own distinct, real DOM subtree — not one shared node moved around by CSS. For Transactions, this means its entire custom filter toolbar (a merchant/notes search `Input`, two `Select`s, and two date `Input`s) is mounted **twice**, simultaneously, at every viewport width — one copy inside the `hidden sm:flex` (table) tree, one inside the `sm:hidden` (card-list) tree.

Both copies are driven by the same lifted state (`searchInput`, `accountId`, etc., owned by the outer `TransactionTable` component and closed over by the `toolbar` function), so they never visually disagree and typing in the visible one correctly updates state and re-renders both — this is why the defect is not observable to an ordinary user via normal interaction. It is, however, directly observable and load-bearing for anything that queries the DOM by accessible name/role (assistive technology APIs, browser extensions, this project's own future Playwright suite, `Ctrl+F` "find in page" behavior for any content not suppressed by `display:none`).

## Reproduction Steps
1. Sign in as `showcase@lkbudget.demo`, navigate to `/transactions`, viewport `375×900`.
2. In a DevTools console (or a Playwright script), run: `document.querySelectorAll('input[placeholder="Search merchant or notes..."]').length`.
3. Observe: **2** — not 1.
4. Confirm one is hidden and one is visible: iterate both and check `offsetParent`/computed `display` — one resolves to `display: none` (inside the `hidden sm:flex` table tree, since viewport is `< 640px`), the other is visible (inside the `sm:hidden` card-list tree).
5. Confirm this is the same underlying issue Playwright itself surfaces unprompted: `page.getByPlaceholder("Search merchant or notes...")` throws a **strict-mode violation**, reporting exactly two matching elements, both with identical `aria-label="Search transactions"`.
6. Widen the viewport to `1024px` (table view) — the count is still 2; only which one is hidden/visible swaps.
7. Repeat for the `Select` "Filter by account"/"Filter by category" triggers and the two date `Input`s in the same toolbar — same duplication, confirmed by the identical mechanism (all rendered from the same `toolbar` function).

Measured live:
```
count of duplicate search inputs in DOM: 2
visibility of each: [ false, true ]
```
(Functional filtering itself still works correctly through either instance — `before: 25 rows, afterNoMatch: 0 rows` when filling the visible input with a non-matching query — confirming this is a structural/duplication defect, not a functional filtering regression.)

## Expected Behavior
Breakpoint-independent toolbar content (a search input, column-filter `Select`s, date-range pickers) supplied once by a consumer via `toolbar`/`enableGlobalFilter` should exist as a single, shared DOM subtree — rendered once, positioned appropriately for whichever view is currently visible via CSS/layout, not re-invoked and re-mounted separately inside each of `DataTable`'s and `DataTableCardList`'s own independently-toggled trees. Matches this project's own explicit "avoid duplication" engineering principle, which the `toolbar` render-prop mechanism was originally designed to uphold (`data-table.tsx`'s own JSDoc: "a feature module can drive column filters without DataTable knowing about the domain") — the duplication here is a side effect of the *dual-mount* composition added on top of that pre-existing mechanism in Phase 5a, not a flaw in the original `toolbar` design itself.

## Actual Behavior
`toolbar` is invoked once per always-mounted child (`DataTable` and `DataTableCardList`), producing two separate, real DOM element trees for the same logical toolbar content at every breakpoint — confirmed via direct DOM query and via Playwright's own strict-mode duplicate-match error. One copy is always `display: none`; the count and duplicate accessible names are nonetheless real and measurable at all times, not just a transient hydration artifact.

## Suggested Owner
Frontend Lead / UI Component Engineer, `src/components/shared/data-table/responsive-data-table.tsx`. The cleanest fix is likely to lift the toolbar row (both `enableGlobalFilter`'s built-in input and the caller's `toolbar` render-prop output) one level up into `ResponsiveDataTable` itself — rendered exactly once, positioned above the CSS-toggled `DataTable`/`DataTableCardList` pair — rather than delegating it separately into each. This would also require `DataTable`'s and `DataTableCardList`'s own standalone-usage paths (either component used directly, without `ResponsiveDataTable`) to keep their current individual toolbar rendering for backward compatibility, so the extraction should be additive (a new shared toolbar-rendering path in `ResponsiveDataTable` specifically), not a breaking change to either lower-level component's existing public contract.
