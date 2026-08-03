# Bug Report: `ResponsiveDataTable`'s shared row-action cell renders a 28×28px button — well under Responsive AC5's binding 44×44px touch-target minimum — reused verbatim (unfixed) at both the mobile card-list view and the tablet-width table view

## Severity
**High** — `phase-5a-accessibility-responsive.md`'s Responsive AC5 is explicit and binding: "Touch targets meet a 44×44px minimum... on every interactive control across the inventory — every button, table row-action trigger, form control, and nav item, at every breakpoint where touch is the plausible input method (mobile and tablet...)." This is named as one of the phase's own Definition of Done bullets ("44×44px minimum touch targets verified across every interactive control at mobile and tablet breakpoints"). The finding below is a direct, measured, reproducible violation, and — because the offending cell renderer is shared verbatim between `DataTable` and `DataTableCardList` by design (`phase-5a-technical-design.md` §3.1: "needs no special handling at all... `flexRender`... the identical call `data-table.tsx` already uses") — it affects every row-action control across all `ResponsiveDataTable`/`DataTableCardList` consumers that ship a per-row action button, at both the mobile card view and the entire 640–1024px tablet range (table view, still touch-plausible per AC5's own text), not just one screen.

## Component
- `src/features/transactions/components/transaction-table.tsx` lines 438-465 (row-actions `id: "actions"` column, `<Button variant="ghost" size="icon-sm">`)
- `src/features/bills/components/mark-paid-dialog.tsx` / `src/features/bills/components/occurrence-history-table.tsx` (Mark Paid/Unmark Paid row-action button)
- `src/features/recurring-income/components/occurrence-history-table.tsx` (Mark Received/Unmark Received row-action button, same shape)
- `src/components/ui/button.tsx` lines 46-58 (`size` variants: `"icon-sm"` = `size-7` = 28×28px; `"sm"` = `h-7` = 28px tall)
- `src/components/shared/data-table/data-table-card-list.tsx` (renders the identical `cell` via `flexRender` — confirmed no independent sizing applied for the mobile card context)

## Summary
Transactions' row-action cell uses `<Button variant="ghost" size="icon-sm">` for its kebab (`MoreHorizontal`) menu trigger. `icon-sm` resolves to Tailwind's `size-7` utility class — a 28×28px box (well under the 44px minimum). Bills'/Recurring Income's occurrence-history "Mark Paid"/"Unmark Paid" row-action buttons use the `sm`/default small button sizing, which is `h-7` (28px tall).

Because `ResponsiveDataTable`'s design deliberately reuses each column's `cell` renderer unchanged between `DataTable` (table view) and `DataTableCardList` (mobile card view) — the architecture doc's own stated rationale for why the per-row action column "needs no special handling at all" — this same undersized button renders in **both** contexts: the mobile (`< 640px`) card-list view (where AC5 unambiguously applies) *and* the ordinary table view shown throughout the entire tablet range (`640–1024px`, still explicitly named as touch-plausible by AC5's own text, not just mobile).

## Reproduction Steps
1. Sign in as `showcase@lkbudget.demo`.
2. Set viewport to `375×900` (mobile) and navigate to `/transactions`.
3. Measure the row-action ("Actions for `<merchant>`") button in the card-list view via DevTools (or `getBoundingClientRect()`): **28×28px**.
4. Navigate to any Bill's detail page (`/bills/[billId]`) at the same viewport; measure the "Mark paid"/"Unmark paid" row-action button in its occurrence-history card list: **width ~75–89px, height 28px** (height is the binding failing dimension; WCAG/iOS/Android touch-target guidance requires both dimensions ≥ 44px, or an equivalent 44px hit area).
5. Widen the viewport into the tablet range (e.g. `820×900`) — `ResponsiveDataTable` now renders the ordinary `<table>` view. Measure the same kebab/Mark Paid buttons in the table rows: still 28px tall — the identical `cell` renderer, unchanged.

Measured live (Playwright `boundingBox()`):
```
Transactions card row action button size (375px): {"x":315,"y":558,"width":28,"height":28}
Bill detail occurrence history: card-list row action buttons (375px):
  Mark paid:   {"width":74.97,"height":28}  (x4)
  Unmark paid: {"width":89.19,"height":28}  (x6)
```

## Expected Behavior
Every row-action trigger (Transactions' kebab menu, Bills'/Recurring Income's Mark Paid/Unmark Paid button, and any other per-row action button reused via the same `ResponsiveDataTable`/`DataTableCardList` mechanism) should present at least a 44×44px hit area at every breakpoint where touch is the plausible input method — i.e. throughout the mobile card-list view and throughout the 640–1024px tablet range's table view, per Responsive AC5 and this phase's own Definition of Done.

## Actual Behavior
The shared row-action button renders at 28px tall (and, for icon-only triggers, 28×28px total) in every context it appears — mobile card view and tablet-width table view alike — roughly 40% short of the required 44px minimum in each dimension. This was not caught by the axe-core accessibility suite (`tests/e2e/accessibility/route-a11y.spec.ts`), since touch-target sizing is not a rule axe-core's default `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` tag set enforces — this is exactly the class of "manual surface" gap the Responsive AC2 automated check was scoped to narrow but not eliminate, per this phase's own Definition of Done.

## Suggested Owner
UI Component Engineer / Frontend Lead. The fix is most naturally a `size` bump on the specific row-action `<Button>` instances (e.g. `icon-sm` → `icon` (`size-8`, still short) or a dedicated touch-friendly size/padding wrapper used specifically for `ResponsiveDataTable` row-action cells) rather than a global change to `icon-sm`/`sm`'s definition in `components/ui/button.tsx` (those sizes are almost certainly intentional for compact desktop-mouse contexts elsewhere in the app, which AC5 explicitly exempts). Since the same `cell` renderer is shared between table and card view by design, any fix must either (a) increase the actual button box while keeping it visually compact in the dense desktop table (e.g. a larger invisible hit-area via padding/negative-margin rather than a visually larger button), or (b) give `DataTableCardList` its own, larger row-action treatment distinct from the desktop table's — the latter would be a deliberate exception to the architecture's current "identical `cell`, zero special-casing" design, so worth a quick Frontend Lead call on which approach to take before implementing. Worth an audit of every `ResponsiveDataTable`/`DataTable` consumer with a row-action column (this report confirms Transactions and both occurrence-history tables; Admin's `UserTable`/`AuditLogTable` were confirmed via code review to have no per-row action column at all, so they are not affected).
