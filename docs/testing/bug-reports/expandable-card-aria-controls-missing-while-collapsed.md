# Bug Report: `ExpandableCard`'s trigger carries `aria-controls` only while expanded — absent in the default, collapsed state, on all six Phase 5b consumers

## Severity
**Medium** — Expandable Cards AC2 exists specifically to close a named accessibility gap ("closing the exact gap found in the one existing ad hoc instance above... not `aria-expanded` alone"). The new shared primitive does add `aria-controls`, but only conditionally, in a way that means every card ships in the one state a page loads into — collapsed — without the very association AC2 was written to guarantee. Not a crash, and `aria-expanded` itself is always correct, but it is a real, reproducible, spec-contradicting gap across every one of this capability's six named consumers, not a single stray miss.

**Note:** `docs/testing/e2e/reduced-motion-report.md` (an E2E Test Engineer run report) independently noticed this exact same underlying behavior while adjusting a test's own timing, and correctly identified it as outside that dispatch's own scope to file ("worth flagging to whoever owns Expandable Cards AC2... though it is worth flagging"). This report is that flagging, filed from the Bug Hunter role that report itself pointed to.

## Component
- `node_modules/@radix-ui/react-collapsible/dist/index.mjs` line 64: `"aria-controls": context.open ? context.contentId : void 0` — Radix's own `Collapsible.Trigger` implementation, wrapped unmodified by `src/components/ui/collapsible.tsx`'s `CollapsibleTrigger`.
- `src/components/shared/motion/expandable-card.tsx` — composes `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` with `forceMount` (so the content region is genuinely present in the DOM, with a real, stable id, even while collapsed — see Summary), but does not itself add a fallback `aria-controls`.
- All six confirmed live consumers of `ExpandableCard`:
  - `src/features/transactions/components/transaction-table.tsx` (tags/notes columns, via `DataTableCardList`)
  - `src/features/admin/components/user-table.tsx`, `src/features/admin/components/audit-log-table.tsx`
  - `src/features/bills/components/occurrence-history-table.tsx`, `src/features/recurring-income/components/occurrence-history-table.tsx`
  - `src/features/analytics/components/subscriptions-list.tsx` (the migrated "Dismissed merchants" toggle)
  - `src/components/shared/data-table/data-table-card-list.tsx` (the shared `ExpandableCard` mount point for the five `DataTableCardList` consumers above)

## Summary
Radix's `Collapsible.Trigger` only emits `aria-controls` when `context.open` is `true`; while collapsed, the attribute is omitted entirely (`void 0`, not even an empty string). `ExpandableCard` renders `CollapsibleContent forceMount`, meaning the disclosed region is a real, present DOM node with a real, stable `id` (Radix's own generated `contentId`) at all times, whether expanded or not — confirmed live: the same three `id`s (one per Transactions row) were present in the DOM both before and after expanding. So the trigger-to-region relationship genuinely exists and is genuinely referenceable in the collapsed state too; Radix's own trigger implementation simply chooses not to advertise it via `aria-controls` until the state flips to open.

Since every card on every one of this capability's six consumers renders collapsed by default (no consumer passes `defaultOpen`), this means **the default, as-loaded state of every `ExpandableCard` instance in the app has a trigger with `aria-expanded="false"` and no `aria-controls` attribute at all** — a screen-reader user encountering any of these triggers on first page load (the overwhelmingly common case) gets exactly the same missing-linkage experience Expandable Cards AC2 was written to eliminate, until/unless they actually activate the trigger.

## Reproduction Steps
1. Sign in as the seeded e2e user, viewport `375×800`, navigate to `/transactions` (or any of the other five consumers listed above).
2. Inspect the first row's "Show more" trigger button before interacting with it:
   ```
   aria-expanded = "false"
   aria-controls = null   (attribute absent)
   ```
3. Click the trigger. Now:
   ```
   aria-expanded = "true"
   aria-controls = "radix-_r_1b_"   (a real id, referencing a real, already-in-DOM element)
   ```
4. Confirmed via direct DOM query that the disclosed region (`[data-slot="collapsible-content"]`) already had that same `id` present in the DOM *before* the click too (three ids present for three rows, matching the three "Show more" triggers) — the region and its id both exist while collapsed; only the trigger's advertisement of that id via `aria-controls` is withheld.
5. Reproduces identically on Analytics' migrated "Dismissed merchants" toggle and the other four `DataTableCardList` consumers, since all six route through the same shared `ExpandableCard`/`Collapsible` composition.

## Expected Behavior
Per Expandable Cards AC2: "the trigger element carries `aria-expanded` (reflecting live state) **and** `aria-controls` referencing the disclosed region's real DOM id... for every consumer old and new, not `aria-expanded` alone." Since `forceMount` already guarantees the disclosed region is a real, stable, present DOM node regardless of open state, the trigger should carry a correct `aria-controls` pointing at it at all times — including, and especially, the collapsed state every card loads into by default.

## Actual Behavior
`aria-controls` is present only once a card has been expanded at least once in the current session; every card's default, as-loaded, collapsed state — which is every card, on every page load, until a user happens to interact with it — has no `aria-controls` at all, leaving `aria-expanded="false"` as the only accessible-name-adjacent signal a screen-reader user gets about the trigger's relationship to its region.

## Suggested Owner
UI Component Engineer, `src/components/shared/motion/expandable-card.tsx`. Since `CollapsibleContent forceMount` already guarantees the content region is real and present at a stable id regardless of `isOpen`, the straightforward fix is for `ExpandableCard` to render its own `aria-controls` on the trigger unconditionally (reading Radix's generated content id off the same context Radix itself uses internally, or — more simply — generating and threading its own `React.useId()`-based id pair between `CollapsibleTrigger`'s wrapped child and `CollapsibleContent`, overriding Radix's own conditional value via an explicit `aria-controls` prop passed through `asChild`). Worth double-checking with axe-core specifically for this pattern, since `aria-controls` referencing a valid id is not one of axe-core's default `wcag2a`/`wcag2aa` rules (consistent with this project's own prior finding, `data-table-row-action-buttons-below-44px-touch-target.md`, that touch-target/ARIA-relationship gaps of this shape are not something the existing automated suite catches) — this is a manual-review finding, not a regression in `route-a11y.spec.ts`'s existing green run.
