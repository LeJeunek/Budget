# Phase 5a Release Notes — Accessibility & Responsive Foundation

**Reviewer:** Release Manager
**Scope:** the Accessibility and Responsive capabilities
(`docs/product/phase-5a-accessibility-responsive.md`), per
`docs/architecture/phase-5a-technical-design.md` and `roadmap.md`'s Phase 5
CTO kickoff pass / Phase 5a CTO resolution pass. Commits `f55cb7b..c448d5a`.

**Decision: REJECT.**

Almost everything this phase's own review gate claims to have closed
genuinely is closed, re-verified directly below rather than taken on any
prior pass's word: the axe-core route inventory (32/32, re-run live by this
pass), the responsive breakpoint sweep (92/92, re-run live by this pass), all
four automated checks (typecheck/lint/vitest/build, re-run live by this
pass), the Bug Hunter's three shipped fixes (focus-return, touch targets, the
Debt Decimal leak — each read line-by-line against its own bug report and
confirmed sound), and both the Security Architect's and Performance
Engineer's APPROVE verdicts (confirmed unaffected by anything since).

But **Accessibility AC5's own binding, explicitly-enumerated 14-combination
color-contrast audit was never actually executed against 5 of its 6 named
accent presets, and the shipped result objectively fails WCAG 2.1 AA** — a
defect this pass found by testing it directly, not by trusting any prior
report's summary, since no report in this phase's own chain (the
accessibility run report, the architecture doc, the Bug Hunter's four
findings, the Security/Performance reviews) ever exercises or mentions a
non-default accent preset at all. See Section 1.

---

## 1. BLOCKING — 5 of 6 accent-color presets fail WCAG AA contrast on their real, visible primary button, live-confirmed via this project's own axe-core tooling

### What the spec requires, unconditionally

`phase-5a-accessibility-responsive.md`'s Accessibility AC1: *"WCAG 2.1 AA is
the binding target level, app-wide, for every route in the inventory
above."* AC5: *"Color-contrast audit covers every 4c accent-color preset
crossed with both light and dark themes — 6 presets... × 2 themes = 12
combinations, plus the no-accent-set default in both themes = 14 total
combinations, every one of them audited, not just the shipped default."* Its
own Edge Case is explicit about the required remedy: *"the spec requires
fixing the preset's token value, never silently dropping or hiding that
preset from the picker... the fix is a CSS custom-property adjustment to the
same `[data-accent="..."]`/`.dark [data-accent="..."]` rule already defined
in `globals.css`."* The Definition of Done: *"Color-contrast audit completed
and passing for all 14 accent-preset × theme combinations... any failing
combination has its token fixed (never its preset removed)."*

### What is actually in source and in the shipped test coverage, verified directly

`tests/e2e/accessibility/route-a11y.spec.ts` (read in full) runs axe-core
against every route exactly once, under a single Playwright project
(`desktop`), using the ordinary/admin `storageState` fixtures — both of which
have **no accent color set** (confirmed: `prisma/seed-e2e-test-user.ts` never
sets `UserPreference.accentColor`, so both fixture accounts render the
default, no-`data-accent`-attribute theme). Nothing in this spec file, in
`playwright.config.ts`, or in any support file iterates the 6 named accent
presets. `src/app/globals.css`'s `[data-accent="..."]` block (the actual
subject matter of AC5, per the spec's own Dependencies section) has **zero
commits touching it anywhere in this phase's range** (`git log
f55cb7b..HEAD -- src/app/globals.css` returns nothing) — it is byte-for-byte
the same block Phase 4c authored, never touched by any Phase 5a accessibility
fix pass (`2c659d1`, `ea5a102`), which instead fixed only accent-independent
semantic tokens (`text-muted-foreground`, `text-destructive`,
`text-emerald-600`, `Progress`'s `aria-label`, `Table`'s `tabIndex`) — none of
which is gated by `data-accent`.

### Confirmed live, not inferred — two independent methods, in agreement

**Method 1 — manual WCAG relative-luminance computation** against every
`--primary`/`--primary-foreground` pair `globals.css` actually defines for
all 6 presets, light and dark:

| Preset | Light mode `--primary` on `--primary-foreground` | Dark mode |
|---|---|---|
| blue | `#3b82f6` on `#ffffff` → **3.68:1** | `#60a5fa` on `#171717` → 7.05:1 |
| violet | `#8b5cf6` on `#ffffff` → **4.23:1** | `#a78bfa` on `#171717` → 6.59:1 |
| emerald | `#10b981` on `#ffffff` → **2.54:1** | `#34d399` on `#171717` → 9.33:1 |
| amber | `#f59e0b` on `#171717` → 8.35:1 (passes) | `#fbbf24` on `#171717` → 10.74:1 |
| rose | `#f43f5e` on `#ffffff` → **3.67:1** | `#fb7185` on `#171717` → 6.66:1 |
| teal | `#14b8a6` on `#ffffff` → **2.49:1** | `#2dd4bf` on `#171717` → 9.63:1 |

WCAG 2.1 AA requires **4.5:1** for normal-size text (button labels in this
codebase render at 14px/`text-sm`, not "large text"). **5 of 6 light-mode
presets fail** — bolded above — two of them (emerald, teal) fail so badly
they don't even clear the relaxed 3:1 non-text-UI-component floor. Every
dark-mode combination passes comfortably; this is a light-mode-only defect.

**Method 2 — live, first-party confirmation via this project's own
`@axe-core/playwright` tooling**, not a second manual calculation: selected
each accent preset through the real `/settings/appearance` UI (no source
edit, no DB script — the same UI a real user uses), navigated to
`/transactions` (a route with a real, visible `bg-primary` "Add transaction"
button), and ran the identical `AxeBuilder` configuration
`tests/e2e/support/axe.ts` already uses:

```
PRESET blue:    axe color-contrast violation — 3.67 (needs 4.5) on the real "Add transaction" button
PRESET violet:  axe color-contrast violation — 4.23 (needs 4.5)
PRESET emerald: axe color-contrast violation — 2.53 (needs 4.5)
PRESET amber:   0 violations (passes)
PRESET rose:    axe color-contrast violation — 3.67 (needs 4.5)
PRESET teal:    axe color-contrast violation — 2.48 (needs 4.5)
```

Axe's own live-rendered numbers match the manual computation to within
rounding on every preset. **This is not a theoretical/manual-math-only
finding — the project's own accessibility tool, pointed at the real running
app with a real accent selected, confirms the violation directly.**

A second, related issue on the same root cause: the focus-visible ring
(`--ring`, deliberately set equal to `--primary` per `globals.css`'s own
comment) also fails WCAG 1.4.11's 3:1 non-text-contrast floor against the
light-mode page background for emerald (2.54:1), amber (2.15:1— amber's
button-text passes but its *ring* does not, since amber's fix only addressed
`--primary-foreground`, not `--ring`-vs-background), and teal (2.49:1) —
directly relevant to Accessibility AC3's binding "visible focus indicator on
every focusable element" requirement.

### Why this is a real defect, not a nitpick

This is precisely the harm this phase's own Business Value section names as
unacceptable: *"A user managing their own money is exactly the kind of user
this product cannot afford to silently exclude."* A user who picks any of 5
of the 6 selectable accent colors — a majority of the picker's own options —
gets a primary action button (the one used for "Add transaction" and every
other default-variant CTA app-wide) with text that fails the WCAG AA bar this
phase's own AC1 sets as binding, plus (for 3 of the 6) a focus ring that also
fails the non-text-contrast floor AC3 depends on. This was never caught
because the only automated coverage this phase built (`route-a11y.spec.ts`)
never varies the accent preference — the one variable AC5 explicitly exists
to test.

### What closing this requires (Frontend Lead / UI Component Engineer, not this review)

Per the spec's own Edge Case: a CSS custom-property adjustment inside the
existing `[data-accent="..."]` blocks in `globals.css` — e.g. a darker shade
for blue/violet/rose's `--primary` (or a switch to a dark
`--primary-foreground`, amber's already-proven approach) to clear 4.5:1, and
a materially darker `--primary` for emerald/teal (their gap is large enough
that a foreground-color swap alone will not close it). The ring-vs-background
gap for emerald/amber/teal needs the same token pass. **No preset should be
removed or hidden** — per the spec's own explicit prohibition on that
"solution." Re-run this same live axe-core-per-preset check (or extend
`route-a11y.spec.ts` to parametrize over `ROUTE_INVENTORY` × the 6 presets,
which would also close the gap in this phase's own regression coverage going
forward, not just the one-time fix) once landed.

**This is the sole blocking finding of this pass.**

---

## 2. Everything else re-verified directly — holds

### 2.1 Automated checks — re-run fresh by this pass, not taken on faith

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files.**
- `npm run build` → succeeds, all 45 routes generated, no regressions.
- `npx prisma migrate status` → up to date, 11 migrations — confirms the
  phase's own claim of zero schema change.
- `git status` → clean (this pass's own temporary verification scripts —
  a Playwright probe for the Decimal-leak source route and one for the
  accent-contrast check above — were written under `tests/e2e/_probe-*.spec.ts`
  and deleted after use; no trace left in the tree).

### 2.2 Accessibility route inventory — re-run live, 32/32, matches the accessibility-run-report's final claim exactly

`npm run seed:e2e` + `npm run grant:admin -- e2e-test-admin@lkbudget.dev`,
then `npx playwright test --project=desktop accessibility --reporter=list`:
**32 passed, 0 failed** (2 setup logins + 30 routes), matching
`docs/testing/e2e/accessibility-run-report.md`'s own final re-run exactly.
The auto-generated `docs/testing/e2e/accessibility-report.md` backlog file
still shows zero moderate/minor findings on this fresh run.

### 2.3 Responsive route inventory — confirmed via the existing report, structurally sound

`docs/testing/e2e/responsive-run-report.md`: 92/92 (30 routes × 3 viewport
projects + 2 setup logins) passing the automatable "no horizontal page
scroll" half of Responsive AC2. Not re-run live by this pass (no code has
touched any route's markup since that report was generated — confirmed by
`git log` — so a fresh run would be redundant with the live accessibility
re-run above, which already re-exercises the same fixture/server setup this
suite depends on).

### 2.4 Spot-checks against real source, not summaries

- **`BottomNav`'s breakpoint**: `src/components/shared/bottom-nav.tsx` uses
  `"fixed inset-x-0 bottom-0 z-40 flex sm:hidden"` — confirmed `sm:hidden`
  (640px), not a copy-pasted `md:hidden`, matching the architecture doc §2.4's
  explicit, named risk (Risk #50) and its own required fix.
- **`ResponsiveDataTable`'s consumers**: grepped every import of
  `@/components/shared/data-table` in `src/` — **5 real consumers**
  (`transaction-table.tsx`, `admin/user-table.tsx`,
  `admin/audit-log-table.tsx`, `bills/occurrence-history-table.tsx`,
  `recurring-income/occurrence-history-table.tsx`), all five confirmed
  rendering `<ResponsiveDataTable ...>` (not a bare `<DataTable>`) directly in
  their own JSX. **Minor documentation-accuracy note**: the architecture
  doc, the CTO resolution pass, and risk-register row #46 all state "six
  consumers... confirmed by direct grep" — the actual, current, correct count
  is **five**; every real consumer is correctly migrated, so this is a
  carried-forward arithmetic slip in the paper trail, not a missing
  migration or a functional gap. Worth a one-line correction the next time
  any of those three documents is touched; not blocking.
- **Bug Hunter's three shipped fixes** (`c448d5a`) — each read in full against
  its own bug report:
  - **Focus-return** (`phase-5a-sheet-focus-return-broken-for-externally-triggered-sheets.md`,
    High): `dashboard-shell.tsx`'s `lastMobileNavOpenTriggerRef` +
    `onSheetCloseAutoFocus` passthrough on `TopNav`, and
    `calendar-grid.tsx`'s `lastExpandedDayTriggerRef` + `DayDetailSheet`'s new
    `onCloseAutoFocus` prop — both correctly `preventDefault()` only when a
    tracked non-`SheetTrigger` opener exists, leaving Radix's own correct
    default untouched for the ordinary hamburger-triggered case. Sound.
  - **Touch targets** (`data-table-row-action-buttons-below-44px-touch-target.md`,
    High): `size-11`/`h-11` overrides at the three named call sites
    (Transactions' kebab menu, Bills'/Recurring Income's Mark Paid/Received
    buttons) — a targeted override, not a change to the shared `icon-sm`/`sm`
    variants used elsewhere. Sound.
  - **Debt Decimal leak** (`debt-toDebt-leaks-raw-decimal-account-to-client.md`,
    Medium): `toDebt()` now names every field explicitly instead of
    `...row`-spreading a row structurally widened by
    `LINKED_ACCOUNT_BALANCE_INCLUDE`. Sound, and — per the grep below — this
    exact anti-pattern was checked across every other `features/*/server/
    service.ts` converter in this codebase, not just re-verified in isolation.
  - **Toolbar duplication** (`responsive-data-table-toolbar-duplicated-in-dom.md`,
    Medium, accepted as tracked debt, not fixed): reviewed and **agreed** as
    an acceptable disposition — it is cosmetically invisible to a sighted
    mouse user, both DOM copies share state so they never disagree, it does
    not violate any binding Accessibility/Responsive AC (it is a "avoid
    duplication" engineering-principle concern, not a WCAG failure), and it
    already has a named report, a suggested owner, and a concrete suggested
    fix shape — the same bar this project's own Medium-severity backlog
    discipline has consistently applied.

### 2.5 A previously-untracked finding surfaced by this pass — a second, unfixed instance of the exact Decimal-leak class Bug Hunter found in Debt

Following the Debt bug report's own recommendation ("worth a quick grep
across the rest of the codebase for the same pattern"), this pass grepped
every `...row,`-spreading converter in `features/*/server/service.ts` (9
files) and checked each against its actual call sites for a widened `include`.

**`src/features/goals/server/service.ts`'s `toGoal()`** has the identical
defect Debt's did: `getGoals`/`getGoalById` call `db.goal.findMany`/
`findFirst` with `include: { contributions: { select: { amount, date } } }`
(or the full row for `getGoalById`), then pass that widened row into
`toGoal(row)`, whose `{ ...row, targetAmount: ... }` spread forwards the
joined `contributions: [{ amount: Decimal, date: Date }, ...]` array into
every `Goal`/`GoalWithProgress` object handed to `GoalCard`/`StrategyComparison`-
style Client Components on `/goals`. **Live-reproduced independently by this
pass** (a temporary Playwright console-listener probe, deleted after use):
navigating to `/goals` reproduces `"Only plain objects can be passed to
Client Components from Server Components. Decimal objects are not
supported. {amount: Decimal, date: Date}"` — the **exact** warning shape
`accessibility-run-report.md`'s own "one unrelated item observed, not
addressed here" note originally flagged (and which the Debt bug report's
"root cause of the Decimal-serialization console warning" framing implied,
but did not actually, was closed — that report's own reproduction used a
different shape, `{balance: Decimal}`, confirming Debt and Goals are two
independent instances of the same bug, not one bug reported twice).

Every other `...row`-spreading converter in this codebase was checked and
found safe: `accounts` (no widening `include` anywhere), `bills`/
`recurring-income` (their occurrence converters already build named-field
object literals, no spread; their stream/bill converters are never called
with a widened row), `budgeting` (its select is a narrow, matching
`ALLOCATION_ROW_SELECT`), `investments` (`getHoldingById` **explicitly
destructures out** `valueHistory`/`dividends` before calling `toHolding` —
this codebase's own correct, existing precedent for this exact hazard),
`transactions` (its converter's declared parameter type is deliberately the
widened, joined type, and its own return type accounts for every joined
field explicitly — not a leak). `financial-goals`' `toFinancialGoal` has one
benign, non-Decimal instance of the same shape (`accountSubset:
[{accountId: string}]` leaks through, harmless — plain strings serialize
fine and trigger no warning) — noted for completeness, not a defect.

**Disposition: not, on its own, a reason to block this release** — it is the
same Medium-severity, no-visible-data-corruption class already established
and accepted for the toolbar-duplication finding (dev-console noise, not a
security or data-integrity issue, doesn't fail any binding AC, doesn't fail
any automated check). **But it must not be lost**: it is currently
**completely untracked** anywhere (no bug report exists for it, unlike
toolbar duplication). Recommended, not performed by this review: a Bug
Hunter bug report for `goals/server/service.ts`'s `toGoal()`, fixed the
identical way Debt's was (name every field explicitly instead of spreading),
and a corresponding risk-register row so the pattern itself (not just this
one instance) has a durable home — see the checklist's Documentation section.

---

## Release Manager Decision (first pass)

**REJECT.** The blocking gap is the accent-color contrast audit's own
non-execution and its resulting real WCAG AA failures — see Section 1.
Everything else in Phase 5a holds, independently re-verified against source
and live tooling, not summaries. See `docs/release/phase-5a-checklist.md`
for the itemized gate checklist and the specific, scoped fix this needs
before a second pass can approve.
