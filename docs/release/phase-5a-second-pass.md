# Phase 5a Release Notes — Second Pass (Targeted Re-Check)

**Reviewer:** Release Manager
**Scope:** narrow re-check of the first pass's (`docs/release/phase-5a-notes.md`)
sole blocking finding (Section 1: accent-color contrast) and its two flagged
non-blocking secondary items (Section 2.5's Goals Decimal leak; Section 2.4's
"six" vs "five" `ResponsiveDataTable`-consumer documentation miscount), per
commit `3362fab` ("Phase 5a: Close Release Manager first-pass REJECT (accent
contrast + Decimal leak)"), already on `origin/master`. Security Architect,
Performance Engineer, and Bug Hunter sign-offs from the first pass are
unaffected by this commit (no code in their scope changed) and are not
re-litigated here, per this pass's own charter.

**Decision: APPROVE. Phase 5a is now fully closed**, with one residual,
non-blocking documentation loose end noted below (same disposition class as
the first pass's own "not blocking, worth a follow-up" items).

---

## 1. Accent-color contrast (the blocking item) — CONFIRMED FIXED, independently re-derived

Re-read `src/app/globals.css`'s `[data-accent="..."]` block in full. Every
light-mode preset's `--primary`/`--ring` value changed from the first pass's
failing shade to a darker one, each with an inline comment naming the old
value, the measured old contrast, the new value, and the new measured
contrast:

| Preset | New `--primary`/`--ring` (light) | Claimed contrast vs `#ffffff` |
|---|---|---|
| blue | `#2563eb` | ~5.17:1 |
| violet | `#7c3aed` | ~5.70:1 |
| emerald | `#047857` | ~5.49:1 |
| amber (`--ring` only; `--primary` unchanged, already passing) | `#b45309` | ~5.02:1 |
| rose | `#be123c` | ~6.28:1 |
| teal | `#0f766e` | ~5.48:1 |

**Independently recomputed WCAG 2.1 relative-luminance contrast** (not taken
on the comment's word) for blue, violet, emerald, teal, and amber's `--ring`
— five of the six changed values, chosen as the ones this pass was least
confident about (the two deepest shades, emerald/teal, plus the one
non-`--primary` token, amber's `--ring`, plus a directional spot-check on
blue/violet):

- blue `#2563eb` vs `#ffffff` → **5.167:1** (matches the comment's 5.17,
  clears 4.5)
- violet `#7c3aed` vs `#ffffff` → **5.700:1** (matches 5.70, clears 4.5)
- emerald `#047857` vs `#ffffff` → **5.480:1** (matches 5.49, clears 4.5)
- teal `#0f766e` vs `#ffffff` → **5.474:1** (matches 5.48, clears 4.5)
- amber `--ring` `#b45309` vs `#ffffff` → **5.023:1** (matches 5.02, clears
  the 3:1 ring/non-text floor with margin)

All five independently hand-computed values match the shipped comments to
within rounding. Rose (`#be123c`) was not independently recomputed by this
pass (time-boxed spot-check, not a full re-derivation of all six) but follows
the identical, now-twice-validated methodology and is a comfortably larger
jump (3.67 → ~6.28) than the smallest passing margin already confirmed
above, so it is accepted on the strength of the now-validated method plus the
live axe evidence below, not on the comment alone. Dark-mode values are
confirmed unchanged from the first pass (already passing, not part of this
fix) by direct diff review.

**The regression test is genuine, not a rubber stamp.**
`tests/e2e/accessibility/accent-contrast.spec.ts` (read in full):
parametrizes over the real `ACCENT_COLOR_OPTIONS` labels, and for each one:
clicks the actual swatch button on `/settings/appearance` (a real DOM
interaction, not a direct API/DB write), asserts `aria-pressed="true"` (so a
click that silently no-ops would fail the test before axe even runs),
reloads the page (required because `data-accent` is set by a Server
Component reading persisted preference — a client-only mutation-cache update
would not otherwise be picked up, so this reload is load-bearing, not
decorative), navigates to `/transactions`, asserts the real "Add transaction"
button is visible, then runs the project's real `checkAccessibility(page)`
axe helper and asserts zero critical/serious `color-contrast` violations.
This exercises the exact same code path (`globals.css`'s cascade → rendered
`bg-primary` button) the first pass's manual/axe methods both used — a CSS
value regression on any of the six presets would fail this suite, not just a
one-time manual check. The suite is `serial` and ends by toggling the last
preset off, leaving no cross-test state behind. This closes the actual
regression-coverage gap named in the first pass (no automated test ever
varied the accent preference), not merely re-confirming the one-time fix.

Corroborating evidence of a genuine live run (not just a static diff): the
auto-generated `docs/testing/e2e/accessibility-report.md` backlog file's
timestamp advanced from the first pass's run to a new one 9h47m later
(`2026-08-03T04:00:07Z` → `2026-08-03T13:47:25Z`), consistent with the commit
message's claim of a fresh 39/39 accessibility-gate re-run. This pass did not
re-run the Playwright suite itself (out of scope for this targeted re-check —
`npm run typecheck`/`lint`/`vitest` were re-run live instead, per the task's
own explicit instruction; see Section 4), so this item rests on the
independent WCAG math plus a genuine, non-trivial test file, not a live
re-execution by this pass.

**Verdict: holds.** The blocking finding is closed.

## 2. Goals `toGoal()` Decimal leak — CONFIRMED FIXED

Re-read `src/features/goals/server/service.ts` in full. `toGoal()` (lines
44–59) now returns an object literal naming every `Goal` field explicitly —
`id`, `userId`, `name`, `targetAmount` (converted via `.toNumber()`),
`targetDate`, `plannedMonthlyContribution` (converted, null-checked),
`archivedAt`, `createdAt`, `updatedAt` — with **no `...row` spread anywhere in
the function**. This matches the already-fixed `toDebt()` pattern exactly and
closes the excess-property-check gap a spread of a structurally-widened row
(via `getGoals`'/`getGoalById`'s `include: { contributions: ... }`) could
otherwise exploit.

Note: `toGoalContribution()` (lines 63–67) still does `{ ...row, amount:
row.amount.toNumber() }` — this was **not** flagged by the first pass and is
not part of this fix's scope: `GoalContribution` rows are never queried with
a widening `include`/`select` beyond their own columns in either caller, so
there is no joined data for that spread to leak. Confirmed this remains true
by re-reading both call sites (`getGoals`'s narrow `select: { amount, date
}`, `getGoalById`'s full-row `include`) — neither introduces a foreign-key
join on `GoalContribution` itself. Not a gap.

A bug report exists at
`docs/testing/bug-reports/goals-toGoal-leaks-raw-decimal-contributions-to-client.md`,
read in full: correctly documents root cause, reproduction (the exact console
warning shape), and resolution, and correctly notes `getGoalById` was never
actually tainted (its own final `{ ...goal, ...progress, contributions }`
spread already overwrote the leaked field by key order) — so only `getGoals`
(backing `/financial-goals`'s list view) was a live defect, consistent with
the first pass's own finding.

**Verdict: holds.**

## 3. "Six" vs "five" `ResponsiveDataTable`-consumer doc miscount — PARTIALLY FIXED, one instance remains

Checked all three flagged locations directly:

- **`docs/planning/roadmap.md`** — fixed. "five consumers total, not the four
  the original spec's Dependencies section named (corrected from an earlier
  'six' miscount by the Phase 5a Release Manager's own re-grep during the
  first-pass review)". Correct, attributed, sound.
- **`docs/planning/risk-register.md` rows #46/#51** — both fixed, same
  correction and attribution pattern, "five actual"/"five migrated
  consumers" in place of "six".
- **`docs/architecture/phase-5a-technical-design.md`** — **two of the
  document's three "six consumers" references were corrected** (§3.1's
  "Migration for the 5 existing consumers... corrected from an earlier '6'
  miscount" sentence, and §3.2's Reports paragraph, "confirmed by the
  resolution pass's own five-consumer count"/"the five DataTable consumers").
  **A third, uncorrected instance remains at line 187**, the opening sentence
  of the same §3.1 section, two paragraphs above the corrected one: *"Six
  consumers (Transactions, Admin's `UserTable`/`AuditLogTable`, Bills'/
  Recurring Income's `OccurrenceHistoryTable` — confirmed the full, correct
  count directly via the resolution pass's own grep...) is enough volume to
  justify a shared primitive..."* — the identical five-item list, still
  labeled "Six," directly contradicting the "5 existing consumers" sentence
  a few lines later **in the same section of the same file**.

This is the same non-blocking, cosmetic-paperwork severity class the first
pass itself assigned this finding ("a carried-forward arithmetic slip in the
paper trail, not a missing migration or a functional gap... worth a one-line
correction"), and it remains true here: no functional code, test, or shipped
behavior is affected — every real consumer is still correctly migrated and
annotated. But it means the fix commit's own message ("a 'six' vs 'five'
ResponsiveDataTable-consumer documentation miscount carried across the
architecture doc, roadmap, and risk register" — implying full correction) is
not fully accurate for the architecture doc specifically. **Recommended, not
performed by this review** (docs outside this role's edit authority, and the
gap is not blocking): a one-line fix to
`phase-5a-technical-design.md` line 187, changing "Six consumers" to "Five
consumers," the next time that document is touched.

**Verdict: holds in substance (no functional gap), but the stated "fully
corrected across all three locations" claim is incomplete by one instance —
flagged, not blocking.**

## 4. Automated checks — re-run fresh by this pass

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 errors/warnings.
- `npx vitest run` → **633/633 tests passing, 52 test files** — identical
  count to the first pass, consistent with the bug report's own note that no
  unit test previously covered the leaked-Decimal shape, so none needed
  updating, and the CSS/doc changes touch no unit-tested surface.
- `git log`/`git show 3362fab` — confirmed the commit is on `master`, working
  tree clean, branch up to date with `origin/master`.

Security Architect, Performance Engineer, and Bug Hunter's first-pass
sign-offs are unaffected: `3362fab` touches only `globals.css` (presentation
tokens), one server-side converter function (no new data-egress surface, a
strict subset/narrowing of what's returned, not a widening), a new
Playwright spec (test-only), and documentation — none of which changes
either team's prior review surface.

---

## Release Manager Decision (second pass)

**APPROVE. Phase 5a is now fully closed.**

The sole blocking finding from the first pass — 5 of 6 accent presets
failing WCAG 2.1 AA — is fixed with correct, independently-recomputed
contrast values and closed by a genuine, non-trivially-passing regression
test that exercises the real UI, not a one-time manual patch. The Goals
Decimal-leak fix is sound and matches the established Debt-fix pattern
exactly. The documentation miscount fix is substantively complete (no
functional/test/shipped-behavior gap) but leaves one line in
`phase-5a-technical-design.md` still reading "Six consumers" where it should
read "Five" — noted as a residual, non-blocking cleanup item for the next
pass to touch that document, not a reason to withhold approval, consistent
with this same item's own non-blocking disposition in the first pass.

Phase 5b's Product Owner spec pass may now begin.
