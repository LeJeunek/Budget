# Bug Report: Yearly Report PDF's Investments section always says "Gain/Loss This Year," even when the report was generated for a past calendar year

## Severity
**Medium** — deterministic (no race/timing needed), reachable from the ordinary Yearly Report generation flow for any past year, and produces a factually mislabeled figure on a document reports.md explicitly frames as something a user might "hand to an accountant, or review outside the app" — the exact scenario where a wrong implied time period matters most, since there is no other on-screen context once the PDF is downloaded and shared/printed.

## Component
`src/features/reports/pdf/templates/yearly.tsx` lines 275-276 (`YearlyReportTemplate`'s Investments section)
`src/features/reports/server/data/yearly.ts` lines 126, 163-169 (`gainLossForYear` data assembly — correctly scoped, only the template's label is wrong)

## Summary
`assembleYearlyReportData` (`server/data/yearly.ts`) correctly computes `gainLossForYear` scoped to the requested year via `getGainLossForPeriod(userId, { start: yearStart, end: period.end })` (line 126) — this part is correct for any past, current, or year-to-date request. The Yearly Report's period selector (`reports.md` §2) explicitly allows "a single calendar year, past or current," e.g. a user can request the Yearly Report for `2023` while the current year is `2026`.

However, `YearlyReportTemplate` (`pdf/templates/yearly.tsx`) hardcodes the stat's label as the literal string `"Gain/Loss This Year"` (line 275) with no reference to `data.period` at all — unlike every other section of every report template in this feature, which either uses period-agnostic wording ("Cash Flow," "Savings Rate") or lets the shared header (`document-shell.tsx`'s `periodLabel`) carry the actual year. This one stat is the sole exception: it bakes in "This Year" regardless of which year was actually selected.

The report's own header (rendered once, at the top of the document via `<ReportDocument period={...}>`) does correctly show the selected year (e.g. "2023"), so a careful reader could reconcile the two — but a reader skimming just the Investments section, or an accountant/third party who only sees a screenshot or a later page of a multi-page PDF (a header that doesn't repeat on continuation pages, since `wrap` on `<Page>` only fixes the *footer*, not `styles.header`, across pages), sees an unqualified claim of "this year" attached to a figure that is actually for `2023`.

## Reproduction Steps
1. As a user with investment holdings and at least one full past calendar year of investment activity (e.g. it is currently `2026`, and the user held investments throughout `2023`), request a Yearly Report for `2023` (`GET /api/reports?type=yearly&year=2023`, or via the UI's Year input capped only at "not in the future," per `report-type-select.tsx`).
2. Open the generated PDF and locate the "Investments" section.
3. Observe the stat labeled "Gain/Loss This Year" showing the 2023 gain/loss figure (`investments.gainLossForYear`, correctly computed for 2023's window).
4. Compare against the document's own header/title, which correctly reads "2023" as the covered period — the Investments section's own label directly contradicts it.
5. Repeat for any other past year (e.g. `2022`) — the label never changes; it always reads "Gain/Loss This Year" verbatim regardless of `year`.

## Expected Behavior
Per Cross-Cutting Requirement #5 ("Every report clearly states its own type, its covered date range/period... so a user... can tell which copy is more current") and the Yearly Report's own explicit "past or current" period selection (reports.md §2), every figure's label should be accurate for the period actually requested — either a period-agnostic label ("Gain/Loss for the Year," with the year itself conveyed by the header) or a label that dynamically reflects the selected year (e.g. "Gain/Loss (2023)"), consistent with how every other report type/section in this feature avoids baking in an assumption about which period is current.

## Actual Behavior
The Investments section's Gain/Loss stat is permanently labeled "Gain/Loss This Year" in `pdf/templates/yearly.tsx`, independent of `data.period` — a Yearly Report generated for any past year misrepresents a stale figure as being for the current year, on a document explicitly designed to be shared or archived outside the app where there is no other context to correct the misreading.

## Suggested Owner
Frontend Lead / Feature owner of `src/features/reports/pdf/templates/yearly.tsx` — the fix boundary is this template's own stat label (either genericizing the wording or interpolating `data.period.label`); no change to `server/data/yearly.ts`'s already-correct data assembly is needed.
