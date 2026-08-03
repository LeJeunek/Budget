# Bug Report: Both of Phase 5a's new externally-triggered `Sheet` integrations (`BottomNav`'s "More" button, Calendar v2's day-cell tap-to-expand) fail to return focus to the control that actually opened them — a binding, "not a nice-to-have" accessibility regression

## Severity
**High** — `phase-5a-accessibility-responsive.md`'s own Accessibility Capability Edge Cases state this explicitly and bindingly: "Keyboard focus behavior when a `Sheet`/`Dialog` closes: focus returns to the element that triggered it... never left on a now-unmounted element, and never silently reset to the top of the page/`<body>`... This is the standard, expected screen-reader/keyboard-user behavior and is treated as a defect, not a nice-to-have, when violated." Both reproductions below violate this directly, on two of this phase's own new/modified surfaces. `phase-5a-technical-design.md` §5.2 explicitly claimed this guarantee was "already handled, confirmed by direct inspection — no new code required" — that claim is true only for `Sheet`/`Dialog` instances that use a real `<SheetTrigger>`/`<DialogTrigger>`; it does not hold for either of the two controlled-mode, externally-triggered `Sheet` usages this same phase introduced.

## Component
- `src/components/shared/bottom-nav.tsx` (the "More" button, `onMoreClick`) + `src/app/(dashboard)/dashboard-shell.tsx` (owns the lifted `mobileNavOpen` state, wires `onMoreClick={() => setMobileNavOpen(true)}`) + `src/components/shared/top-nav.tsx` (renders the actual `<Sheet>`/`<SheetTrigger>` — the hamburger button is the only real Radix `Trigger` either Sheet instance below ever has)
- `src/features/calendar/components/calendar-grid.tsx` (each day-cell `<button onClick={() => setExpandedDayKey(day.day)}>`) + `src/features/calendar/components/day-detail-sheet.tsx` (the controlled `<Sheet open={open} onOpenChange={onOpenChange}>`, no `<SheetTrigger>` at all)

## Summary
Radix UI's `Dialog`/`Sheet` primitive restores focus, on close, to whatever DOM node it has internally tracked as **its own `Trigger`** (a ref registered by mounting an actual `<Dialog.Trigger>`/`SheetTrigger>` component) — not generically to "whatever element had focus right before open," and not at all if no `Trigger` was ever mounted for that `Sheet` instance. Both of Phase 5a's new interaction patterns open a `Sheet` via a **plain button outside the `Sheet`'s own component tree**, driving the shared `open` boolean directly rather than through a `SheetTrigger`:

1. **`BottomNav`'s "More" button** is a plain `<button onClick={onMoreClick}>` (per `bottom-nav.tsx`'s own design, deliberately never importing `Sheet`/`Sidebar` — see the architecture doc §2.2). `onMoreClick` is wired in `dashboard-shell.tsx` to `setMobileNavOpen(true)`, the same boolean `TopNav`'s own `<Sheet open={mobileNavOpen} ...>` and its `<SheetTrigger>` (the hamburger button) both read/write. Radix's internal trigger-ref is bound only to the hamburger `SheetTrigger` — so no matter which of the two controls actually opened the Sheet, closing it always restores focus to the hamburger button.
2. **Calendar v2's day-cell buttons** (`calendar-grid.tsx`) call `setExpandedDayKey(day.day)` directly. `DayDetailSheet` renders `<Sheet open={open} onOpenChange={onOpenChange}>` in **fully controlled mode with no `<SheetTrigger>` anywhere in its tree at all** — so Radix has no trigger ref to restore focus to on close, and focus falls back to the browser default: `document.body`.

## Reproduction Steps

### A — `BottomNav`'s "More" button (wrong element receives focus)
1. Sign in as `showcase@lkbudget.demo`, set viewport to `375×800` (or any `< 640px` width).
2. Navigate to `/`. Tab to (or otherwise focus) the "More navigation options" button in the fixed bottom nav bar.
3. Activate it (Enter/click). Confirm the hamburger `Sheet` (full nav list) opens.
4. Close it (Escape).
5. Observe `document.activeElement`: it is the **TopNav hamburger button** (`aria-label="Open navigation menu"`) — not the "More" button that was actually focused and activated in step 2/3.
6. For contrast: repeat steps 2-4 but open the same Sheet via the hamburger button itself instead of "More." Closing it correctly returns focus to the hamburger button in that case — confirming the defect is specific to the "More"-triggered path, not a general Sheet regression.

Confirmed live via a scripted Playwright session:
```
Active element focused before click: More navigation options
Active element right after Sheet opens: BUTTON (the Sheet's own close button)
Active element after Escape-closing Sheet opened via More button: Open navigation menu   <-- wrong
Active element after Escape-closing Sheet opened via hamburger button: Open navigation menu  <-- correct (contrast case)
```

### B — Calendar v2's `DayDetailSheet` (focus lost to `<body>`)
1. Sign in as `showcase@lkbudget.demo`, set viewport to `375×800`.
2. Navigate to `/calendar`.
3. Focus a day cell with at least one entry (e.g. the 1st of the month, which reliably has the budget-reset marker) and activate it.
4. Confirm `DayDetailSheet` opens with the day's full entry list.
5. Close it (Escape).
6. Observe `document.activeElement`: it is `<body>` — focus is not returned to the day-cell button, and is not left anywhere meaningful; a keyboard/screen-reader user's position in the page is lost entirely.

Confirmed live via a scripted Playwright session:
```
focused before click: Aug 1, 2026, 1 bill, budget reset
focused right after open: BUTTON (Sheet's own close button)
focused after Escape: { tag: 'BODY', label: null, isBody: true }   <-- focus lost to <body>
```

## Expected Behavior
Per the binding Edge Case quoted above: closing the Sheet in both flows should return focus to the specific control that actually triggered the open — the "More" button in case A, the specific day-cell button in case B — never to an unrelated element (case A) and never silently reset to `<body>` (case B).

## Actual Behavior
- Case A: focus lands on an unrelated control (the hamburger trigger button, which was never interacted with in this flow).
- Case B: focus is dropped entirely onto `<body>`, matching the edge case's own explicitly-named failure mode ("never silently reset to the top of the page/`<body>`").

Both are keyboard/screen-reader-user-visible defects: after closing either Sheet, the user's next Tab press starts from a different, unexpected place in the page (top of body in case B) rather than resuming exactly where they left off.

## Suggested Owner
Frontend Lead / UI Component Engineer. Both are instances of the same root cause — a `Sheet` driven by `open`/`onOpenChange` from state lifted outside the `Sheet`'s own tree, with no real `SheetTrigger` bound to the control that toggles it — so a single fix pattern likely closes both: an explicit `onCloseAutoFocus` handler (Radix's `DialogContent`/`SheetContent` already exposes this prop) that manually calls `.focus()` on the triggering element, with each caller (`dashboard-shell.tsx` for the More-button case, `calendar-grid.tsx` for the day-cell case) tracking a ref to whichever control it last used to open the Sheet and restoring focus to it in `onOpenChange(false)`/`onCloseAutoFocus`. Given this pattern is likely to recur for any *future* externally-triggered `Sheet`/`Dialog` (the architecture doc's own §5.2 confirmed the automatic case is fine; this is specifically the controlled-without-Trigger case that was not checked), worth a short note added to `components/ui/sheet.tsx`'s or `dialog.tsx`'s own JSDoc flagging that controlled-mode consumers without a `Trigger` must handle focus-return manually — so the next engineer building a new tap-to-expand-style Sheet doesn't reintroduce this same gap a third time.
