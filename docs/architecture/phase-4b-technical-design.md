# FinanceOS — Phase 4b Technical Design: PDF Statements & Notifications v2

**Author:** Solution Architect, joint architecture pass with Database Architect, per `roadmap.md`'s Phase 4b milestone 3.
**Status:** design-stage. No production code has been written against this document yet. Database Architect's schema/migration pass (§6) is the next dispatch; backend implementation is gated on both this document and that schema being finalized.
**Scope:** the two cross-cutting technical decisions the CTO left open at Phase 4b kickoff — the PDF generation library (§1–§3) and the email delivery provider (§4–§5) — plus the module boundaries, data-flow, and API surface both features need, and the precise `Notification` model/enum extension specification handed off to the Database Architect (§6). Does not cover: report/notification UI (Frontend Lead, UI Component Engineer), the exact visual template design of either the PDFs or the emails (UI Component Engineer), or the deployment scheduler's cron cadence configuration (a DevOps/deployment-target decision, same framing already used for `net-worth-snapshot`'s own cadence in `api-contracts.md`).

This document is written as a new, dedicated file rather than folded into `Architecture.md` — same reasoning `ai-features-design.md` gave for its own existence: both companion documents are already substantial, and a cross-cutting technical-foundation decision like this one (two net-new external dependencies, a schema handoff, a six-document-type data-assembly map) doesn't have a natural slot in either file's existing per-phase section structure. Short pointers are added to `Architecture.md`, `folder-tree.md`, `api-contracts.md`, and `naming-standards.md` (this Architect's own follow-up pass, done in the same dispatch as this document) — this document remains the source of truth for the Reports/Notifications-v2-specific decisions below.

---

## 1. Do any of the six report types actually need chart rendering?

This question, per the CTO's own framing, materially changes which PDF libraries are viable — so it's resolved first, explicitly, before any library comparison.

**No. Zero of the six report types require rendering an actual chart/graphic inside the PDF.** `reports.md` states this as a binding, repeated design constraint, not an implementation detail this Architect is inferring:

- Cross-Cutting Requirement #3: "every other report type is exclusively numeric and tabular, by design."
- The Yearly Report's "monthly trend of Income vs. Expense... mirroring the Dashboard's Monthly Trends chart" describes **data equivalence** (the same figures the Dashboard's chart is built from), not a requirement to reproduce that chart as a rendered graphic — nothing in the Contents list or Definition of Done asks for a line/bar chart image, and the Definition of Done's own verification bar ("every numeric figure... verified... to match the equivalent figure already shown elsewhere") is phrased entirely in terms of **figures**, never pixels or chart fidelity.
- Every report's Contents section, read literally, is a list of totals, breakdowns, and month-by-month/category-by-category tables — a "monthly trend" table (`Month | Income | Expenses`) satisfies this identically to a line chart image, and is in fact *more* directly checkable against the Definition of Done's own "match the equivalent figure" bar (a reviewer can read exact numbers off a table; a reviewer cannot easily verify exact numbers off a rendered line chart).

**Conclusion: every report is rendered as headers, section text, and tables only.** This resolves the library choice decisively toward a text/table-layout renderer rather than a canvas/graphics-capable one — no library evaluated below needs to support chart drawing, and none of the options considered in §2 were excluded or included on that basis.

## 2. PDF generation library decision

**Decision: [`@react-pdf/renderer`](https://react-pdf.org/), a pure-JavaScript, non-browser PDF layout/rendering library that renders React-component trees directly to PDF bytes via its own internal layout engine (no DOM, no headless browser, no native binary dependency).**

### Options considered

| Option | Rejected / accepted because |
|---|---|
| **Headless-browser rendering** (Puppeteer/Playwright + `@sparticuz/chromium` for serverless) | **Rejected**, per the CTO's own steer, confirmed correct by this evaluation: a bundled Chromium binary adds real cold-start latency (a browser process must launch before any rendering begins — commonly a low-single-digit-seconds tax on a cold serverless invocation, before the actual render even starts) and real function-package-size pressure (a Chromium binary is tens of MB, competing against Vercel's function size ceiling alongside this app's own dependencies). Given §1's conclusion that **no report needs a browser's CSS/graphics rendering fidelity at all** — every report is text and tables — paying Chromium's cold-start/size tax buys nothing this feature actually needs. This is the textbook case the CTO's kickoff-pass framing anticipated: "weigh this deployment constraint explicitly against rendering fidelity needs" — the fidelity need turns out to be zero, so the constraint wins outright, not narrowly. |
| **`pdfkit`** | **Considered, not chosen.** Pure JS/Node, no browser, mature, genuinely serverless-safe — passes the deployment-fit test the rejected option above fails. Rejected in favor of `@react-pdf/renderer` for a maintainability reason specific to this codebase's own standing rules ("favor maintainability over cleverness," "every feature should be modular"): `pdfkit`'s API is imperative (`doc.text(...)`, manual `x`/`y` cursor positioning, hand-rolled column/row math for every table), which means six distinct report templates, each with several tables, would each independently reimplement layout/pagination bookkeeping — a real, concrete duplication risk for a six-report-type feature, not a hypothetical one. |
| **`pdf-lib`** | **Considered, not chosen.** Lower-level than `pdfkit` (primarily aimed at *editing*/composing existing PDFs), with no built-in flowing-text/automatic-pagination layer at all — building six multi-page, multi-table report templates on top of it would mean writing a bespoke layout engine first. Strictly more implementation work than `pdfkit` for this feature's actual shape, for no fidelity benefit `pdfkit` doesn't already provide. |
| **`@react-pdf/renderer`** | **Chosen.** Same deployment-safety profile as `pdfkit`/`pdf-lib` (pure JS, its own internal layout engine, no browser process, no native binary) — but its authoring model is **declarative React components** (`<Document>`, `<Page>`, `<View>`, `<Text>`), styled with a Flexbox-like API, with automatic pagination/page-break handling built in. This is the decisive factor: it lets six report templates be built the same way every other structured UI in this codebase already is — small, composable, reusable components (`<ReportHeader>`, `<ReportTable>`, `<ReportSection>`, `<NoDataState>`) shared across all six templates, mirroring how `components/shared/data-table/` is one reusable primitive every list screen composes, rather than five/six near-duplicate imperative layout routines. This is a genuine, concrete "avoid duplication"/"modular"/"maintainability over cleverness" win specific to this library, not a generic preference — see §8's flagged risk on manual pagination, which this library does *not* eliminate entirely (component-level `wrap`/overflow behavior still needs deliberate configuration per table), but which is meaningfully lower-risk here than `pdfkit`'s fully manual cursor math. |
| **A raw HTML-to-PDF conversion binary/service** (e.g. `wkhtmltopdf`, a hosted conversion API) | **Rejected outright.** A hosted third-party conversion API introduces a second network dependency and a second data-egress surface for the exact same financial content this phase is already scoping one new egress surface for (email) — needless duplication of Risk #4's surface area. A bundled native binary (`wkhtmltopdf`) reintroduces the same binary-size/cold-start category of concern the headless-browser option was rejected for, for a fidelity need (browser-grade CSS/HTML rendering) this feature doesn't have. |

### Synchronous, on-demand generation — confirmed as the correct default, not just the preferred one

The roadmap's kickoff-pass note flagged 4a's cron pattern as an available fallback shape if synchronous generation couldn't fit Vercel's execution-time limit with a light-enough renderer. Two independent reasons converge on **not** needing that fallback:

1. **Render cost is bounded and small at this feature's actual data scale.** `@react-pdf/renderer` renders entirely in-process — no browser launch, no second network hop — so render time scales with content volume (rows/pages), not with a fixed per-request startup tax. Every report's inputs are already bounded by this codebase's own standing "thousands, not millions, of rows per user" scale assumption (`docs/database/performance-considerations.md`, reaffirmed at every subsequent phase including Analytics' Risk #11 resolution) — the heaviest report (Yearly, ~12 months of trend rows plus several breakdown tables) is a small fraction of the row counts Analytics' own on-read aggregation queries already handle live, today, in production. Rendering that into a PDF is comparably cheap to computing it in the first place.
2. **The product spec itself forecloses the pre-generation/caching shape for normal use.** `reports.md` Cross-Cutting Requirement #4 is explicit and binding: "A report reflects a live snapshot at generation time... there is no product requirement to cache or reuse a prior generation's output." A cron-pregenerated report would, by construction, be a cached snapshot from whenever the cron last ran — directly contradicting this requirement outside of a genuine execution-time emergency. This is independent, product-level confirmation (not just this Architect's performance judgment) that synchronous, on-demand generation is the only shape actually compatible with the spec as written, absent a real technical blocker — and §2's library choice removes that blocker.

**Decision: every report is generated synchronously, inside the request that asks for it, and streamed directly back as the HTTP response body. Nothing is pre-generated, scheduled, or cached.** See §3's route design for the concrete mechanism, and Risk #23 (§8) for the one new risk this rendering approach introduces (manual pagination/truncation) and its mitigation.

**A direct, structural security consequence of this choice, worth stating explicitly (feeds Security Architect's later review, not decided by this Architect):** because no report is ever persisted or given a fetchable ID, `reports.md`'s AC5 concern — "a user can never request or retrieve a report scoped to another user's data... including guessing an identifier for a previously generated report file" — has **no stored artifact to leak in the first place**. There is no `Report` table, no report ID, no download-by-ID endpoint. The only cross-user-leakage surface that exists is the ordinary one every endpoint in this codebase already has (a Route Handler must scope every read by `getCurrentUser().id`, never a client-supplied ID) — not a new, report-specific one. This is flagged here as a design property, not a substitute for the Security Architect's own required review at the 4b gate.

## 3. Reports module design (`features/reports/`)

Per the Guiding Pattern's own placement test (Architecture.md: "genuinely cross-feature, needed by more than one domain" → `lib/`; otherwise → `features/`), **Reports is a feature module, not `lib/` infrastructure** — the same call already made three times for structurally identical cases (Financial Goals, Financial Health Score, and Notifications' own extension below): reading from many other domains does not make a module cross-feature infrastructure. Nothing outside Reports itself will ever import from `features/reports/` — it is a pure "leaf" consumer, same shape as Financial Goals/Financial Health Score in the dependency graph (§7 of `Architecture.md`'s Phase 4a section, extended here).

### Directory layout

```
features/reports/
├── types.ts                     # ReportType ("MONTHLY" | "YEARLY" | "TAX_SUMMARY" | "INCOME"
│                                 #   | "EXPENSE" | "CASH_FLOW"), ReportPeriodInput (discriminated
│                                 #   union — see below), and one plain data-DTO type per report
│                                 #   type (MonthlyReportData, YearlyReportData, ...)
├── server/
│   ├── validation.ts             # GenerateReportRequestSchema — a Zod discriminated union on
│   │                             #   `type`, one variant per report type, each with its own valid
│   │                             #   period shape (see period.ts below); enforces the custom-range
│   │                             #   upper bound flagged as Risk #22 (§8)
│   ├── period.ts                 # resolveReportPeriod(input: ReportPeriodInput): { start: Date;
│   │                             #   end: Date; label: string; isPartial: boolean } — Reports' own
│   │                             #   period resolver. Delegates to
│   │                             #   features/analytics/server/period.ts's existing
│   │                             #   resolveReportingPeriodRange for the four shared presets
│   │                             #   (This Year / Last 12 Months / Year-to-Date / All Time, reused
│   │                             #   verbatim, never reimplemented — Income/Expense/Cash Flow
│   │                             #   Reports), and handles the two cases Analytics has no
│   │                             #   equivalent of directly: a single calendar month (Monthly
│   │                             #   Report) and a single calendar year (Yearly/Tax Summary), plus
│   │                             #   the custom start/end range extension (Income/Expense/Cash Flow
│   │                             #   Reports only, per reports.md's own explicit "a deliberate,
│   │                             #   minor extension beyond Analytics' own period control")
│   ├── data/                     # Pure data-assembly — one file per report type. Each file's one
│   │  │                         #   exported function ONLY calls other domains' already-existing,
│   │  │                         #   already-reviewed read functions (per reports.md's binding
│   │  │                         #   constraint 2) and reshapes their results into that report
│   │  │                         #   type's own DTO — no new aggregation logic, no new Prisma
│   │  │                         #   queries against any table another domain already owns.
│   │  ├── monthly-report-data.ts       # assembleMonthlyReportData(userId, month)
│   │  ├── yearly-report-data.ts        # assembleYearlyReportData(userId, year)
│   │  ├── tax-summary-report-data.ts   # assembleTaxSummaryReportData(userId, year)
│   │  ├── income-report-data.ts        # assembleIncomeReportData(userId, range)
│   │  ├── expense-report-data.ts       # assembleExpenseReportData(userId, range)
│   │  └── cash-flow-report-data.ts     # assembleCashFlowReportData(userId, range)
│   ├── pdf/                      # React-PDF layout primitives + per-report templates. Every file
│   │  │                         #   here is a plain .tsx component tree, but — like every other
│   │  │                         #   file under server/ in this codebase — it is server-only by
│   │  │                         #   convention: rendered exclusively by render.ts, inside a Route
│   │  │                         #   Handler's request lifecycle, NEVER imported by app/, a Client
│   │  │                         #   Component, or shipped to the client bundle. No new naming
│   │  │                         #   convention is needed for this distinction — `server/`'s
│   │  │                         #   existing "server-only by convention" rule already covers it.
│   │  ├── document-shell.tsx     # <ReportDocument> — shared page frame: type/period/generatedAt
│   │  │                         #   header (Cross-Cutting Requirement #5), footer, and the
│   │  │                         #   disclaimer-banner slot the Tax Summary Report always renders
│   │  │                         #   into (never conditionally hidden, per its own AC)
│   │  ├── report-table.tsx       # <ReportTable> — shared, reusable table primitive (column defs +
│   │  │                         #   rows), used by every one of the six templates below
│   │  ├── report-section.tsx     # <ReportSection> — a titled block wrapping either a table, a
│   │  │                         #   figure list, or a <NoDataState>
│   │  ├── no-data-state.tsx      # <NoDataState> — the shared "no data for this period" /
│   │  │                         #   "this section doesn't apply" renderer (reports.md's Edge
│   │  │                         #   Cases, applied identically across all six report types —
│   │  │                         #   one component, not six independent empty-state strings)
│   │  └── templates/             # One file per report type: pure `data → JSX` mapping, zero
│   │      ├── monthly-report-template.tsx    #   Prisma access, zero cross-domain calls — every
│   │      ├── yearly-report-template.tsx     #   number a template renders was already computed
│   │      ├── tax-summary-report-template.tsx#   by that report type's own data/*.ts assembler.
│   │      ├── income-report-template.tsx     #   The Monthly template is the only one with a
│   │      ├── expense-report-template.tsx    #   conditional narrative <Text> block, rendering
│   │      └── cash-flow-report-template.tsx  #   MonthlyReportData.narrative verbatim, omitted
│   │                                         #   entirely (no placeholder) when null.
│   ├── render.ts                 # renderReportPdf(type, data): Promise<Buffer> — the one function
│   │                             #   that calls @react-pdf/renderer's `renderToBuffer`, dispatching
│   │                             #   to the matching template by `type`. THE ONLY file in this
│   │                             #   module that imports `@react-pdf/renderer` directly (mirrors
│   │                             #   `lib/ai/client.ts`'s "one file owns the third-party import"
│   │                             #   convention, applied here even though this stays inside a
│   │                             #   feature module rather than `lib/`, since it's still good
│   │                             #   practice for a future library swap to touch one file).
│   └── service.ts                # generateReport(userId, request: GenerateReportRequest):
│                                 #   Promise<{ buffer: Buffer; filename: string }> — orchestrates:
│                                 #   validate (validation.ts) → resolve period (period.ts) → reject
│                                 #   a not-yet-started future period (reports.md's own Edge Case,
│                                 #   a plain validation failure, never a generated empty report) →
│                                 #   dispatch to the matching data/*.ts assembler → render.ts →
│                                 #   return. This is the ONLY function app/api/reports/route.ts
│                                 #   calls.
└── components/
    ├── report-type-select.tsx    # Client Component — report type + period picker, submits to
    │                             #   the download route (see below)
    └── report-download-button.tsx # Client Component — in-progress state (AC2), triggers the
                                    #   fetch + Blob download, and the honest-failure toast
                                    #   (Cross-Cutting Requirement #6) on a non-2xx response
```

**No `hooks/` folder.** Report generation is a one-shot fetch-and-download per user click, not a client-cached, refetchable list — no TanStack Query need, consistent with this codebase's existing rule for exactly this shape (see Architecture.md's Phase 4a Server/client boundary notes for the identical reasoning applied to the five AI features' on-demand actions).

### Required new read functions in other domains (all read-only, no schema change, per reports.md's binding constraint 2)

Reports must assemble every number from existing services, never new Prisma queries of its own against another domain's tables. Three genuinely new, narrow read functions are required — each a small, additive function alongside an existing one, not new business logic:

1. **`features/dashboard/server/net-worth-history.ts` needs a point-in-time lookup**, e.g. `getNetWorthAsOf(userId, date): Promise<{ date: string; netWorth: number } | null>` — the closest `NetWorthSnapshot` row at or before the given date. Needed by the Monthly Report ("Net Worth at the start and end of the month") and the Yearly Report (start/end of year). `getNetWorthHistory`'s existing range-query shape doesn't return a single point-in-time value directly; this is a small, single-row variant of the same already-approved query pattern over the same, already-existing table (no schema change).
2. **`features/dashboard/server/monthly-summary.ts` needs a lookup by a specific month**, e.g. `getSummaryForMonth(userId, month): Promise<MonthlySummary | null>` — the existing `getMostRecentSummary`/`getSummaryHistory` functions don't expose "give me exactly this month's row." Needed by the Monthly Report's narrative section, per its own read-only, verbatim-reuse requirement.
3. **`features/investments/server/service.ts` needs a period-scoped dividend aggregate**, e.g. `getDividendIncomeForPeriod(userId, { start, end }): Promise<{ total: number; byHolding: { holdingId: string; holdingName: string; amount: number }[] }>` — every existing Investments read function exposes dividends only per-holding (`getHoldingById`) or as a lifetime portfolio total, never a period-scoped, portfolio-wide sum. Needed by the Yearly Report and the Tax Summary Report, both of which need "dividend income received during the year" (an existing table, `DividendEntry`, already carries `date`/`amount` — this is a new query, not a new fact).

**One additive, backward-compatible signature widening, required for Income/Expense/Cash Flow Reports' custom date-range extension:** every period-aware Analytics function (`spending-trends.ts`, `expense-breakdown.ts`, `income-analytics.ts`, `budget-comparison.ts`, `savings-growth.ts`, `spending-heatmap.ts`) currently accepts Analytics' own `ReportingPeriod` enum and resolves it internally via `period.ts`'s `resolveReportingPeriodRange`. Reports' custom start/end range (reports.md's own explicit, called-out extension for the Income/Expense/Cash Flow report types) has no equivalent enum value. **Recommendation: widen each period-aware function's `period` parameter type to `ReportingPeriod | { start: Date; end: Date }`**, with each function internally branching — enum → resolve via the existing resolver (unchanged behavior for every existing Analytics caller); already-resolved range object → use it directly. This is a minimal, additive, non-breaking widening of an accepted input **shape**, not a change to any function's aggregation logic — it satisfies reports.md's binding constraint 2 ("never recomputes a metric with new logic") exactly, since the query/grouping logic itself is untouched. Flagged here as a required, scoped touch for the Backend Engineer implementing Reports, not a redesign of Analytics.

Everything else each report type needs (monthly Income/Expense/Cash Flow/Savings Rate trends, annual totals, Budget vs. Actual across a period, Debt/Investment current-state snapshots, Recurring Income summaries) is assembled by **looping the resolved period's months and calling already-existing per-month functions** (`dashboard.service.getMonthlySummary(userId, month)`, `budgeting.service.getBudgetMonth(userId, month)`) — the exact same bounded per-month-loop shape Analytics' own `budget-comparison.ts` and `savings-growth.ts` already established in Phase 3b, reused here rather than reinvented. Cumulative/annual totals are plain arithmetic sums over those already-correct per-month figures, computed inside Reports' own `data/*.ts` files — this is presentation-layer aggregation of already-official numbers, not a new metric, the same distinction Analytics' own totals already rely on.

### Report type → data source map

| Report type | Primary sources (all existing, read-only) |
|---|---|
| Monthly | `dashboard.service.getMonthlySummary`, `dashboard.server/net-worth-history.getNetWorthAsOf` (×2, new §3.1), `dashboard.service.getSpendingByCategory`, `budgeting.service.getBudgetMonth`, `dashboard.server/monthly-summary.getSummaryForMonth` (new §3.2, narrative only) |
| Yearly | `dashboard.service.getMonthlySummary` (×12, looped), `dashboard.server/net-worth-history.getNetWorthAsOf` (×2), `analytics.spending-trends`/`expense-breakdown` (category trends, top merchants, largest purchases, period override = the year), `analytics.budget-comparison.getBudgetVsActual`, `debt.service.getDebts` (current-state snapshot, per the spec's own explicit "not a paid-this-year figure" framing — no new function), `investments.service.getPortfolioOverview` + `getAllocation` + `getGainLossForPeriod` (existing, Phase 3b) + `getDividendIncomeForPeriod` (new §3.3), `recurring-income.service.getIncomeStreams` + per-stream occurrence reads (existing) |
| Tax Summary | `analytics.income-analytics.getIncomeSources` (period = year, includes Untracked/Other), `analytics.expense-breakdown.getExpenseDistribution` (period = year), `investments.service.getDividendIncomeForPeriod` (new §3.3) + `getPortfolioOverview` (lifetime cumulative gain/loss, explicitly the **lifetime** figure per the spec's own "cumulative since acquisition" labeling requirement — deliberately not `getGainLossForPeriod`) |
| Income | `analytics.income-analytics.getIncomeGrowth` + `getIncomeSources` (widened period param, above), a new per-stream occurrence listing composed from existing `recurring-income.service.getIncomeStreams`/`getStreamById` reads (no new function required — bounded loop over the user's own stream count) |
| Expense | `analytics.spending-trends`/`expense-breakdown` (`getCategoryTrends`, `getExpenseDistribution`, `getTopMerchants`, `getLargestPurchases` — all widened period param, above), plus the per-month `getMonthlySummary` loop for the total-expense trend line |
| Cash Flow | The per-month `getMonthlySummary` loop (income/expense/cash-flow/savings-rate trend, cumulative sum computed in `data/cash-flow-report-data.ts`), reusing `dashboard.service.computeSavingsRate`'s existing null-on-zero-income convention for the excluded-month rule |

### Route design

`app/api/reports/route.ts`, `GET`, session-authenticated (the ordinary rule — no cron-style exception here; this is a real, user-facing, client-triggered endpoint), query-string driven: `?type=monthly&month=2026-06`, `?type=yearly&year=2026`, `?type=income&period=last-12-months`, `?type=income&start=2026-01-15&end=2026-03-20`, etc. — exact param shape validated by `validation.ts`'s `GenerateReportRequestSchema`.

**One narrow, explicit exception to the standing `ApiResult<T>` convention, on the success path only** — the same category of exception `app/api/uploadthing/route.ts` and the cron routes already are, for the same reason: the response body **is** the deliverable (raw PDF bytes), not a JSON envelope wrapping one.

- **Success (200):** raw `application/pdf` bytes, `Content-Disposition: attachment; filename="<type>-<period>.pdf"`.
- **Failure (400/401/500):** an ordinary `ApiResult<never>`-shaped JSON error body — bad input, an unauthenticated session, a not-yet-started future period (reports.md's own Edge Case, a plain validation rejection, never a generated empty file), or a genuine generation failure. This keeps Cross-Cutting Requirement #6 ("a generation failure is honest and recoverable... never a silently corrupted file") mechanically enforceable: the client's `fetch` call checks the response's `Content-Type`/status before ever attempting to trigger a Blob download, so a failure can never be mistaken for a truncated/corrupted PDF — it's a distinguishable, typed JSON error the UI reads and shows as a plain retry-able message.

`export const runtime = "nodejs"` (this codebase's implicit default wherever Prisma is touched, stated explicitly here since PDF rendering is also Node-only, never edge-compatible).

---

## 4. Email delivery provider decision

**Decision: [Resend](https://resend.com) as the transactional email provider, with [React Email](https://react.email) (`@react-email/components` + `@react-email/render`) for template authoring.**

### Options considered

| Option | Rejected / accepted because |
|---|---|
| **AWS SES** | **Rejected.** Requires a full AWS account plus a sandbox-exit approval process before it can send to unverified recipients at all — a meaningfully heavier setup cost for a codebase with zero existing AWS footprint (Phase 0 chose Vercel + a managed Postgres, no AWS anywhere in this stack today), for no deliverability or feature advantage this project's actual scale needs. |
| **SendGrid** | **Considered, not chosen.** Mature, capable, viable — but its template-authoring model is its own proprietary dynamic-template DSL (or hand-built HTML strings), not a fit for this codebase's React-first authoring convention every other UI-adjacent surface already uses. |
| **Postmark** | **Considered, not chosen.** Strong deliverability reputation for transactional email specifically (this feature's exact use case) — a reasonable alternative choice, rejected only in favor of Resend's closer ecosystem/tooling fit (below), not for any deliverability or reliability deficiency. |
| **Resend** | **Chosen.** Built by and for the Vercel/Next.js ecosystem this codebase already deploys to; single API-key auth (one secret, matching this codebase's existing `UPLOADTHING_TOKEN`/`GOOGLE_GENERATIVE_AI_API_KEY` single-secret convention); official first-party pairing with **React Email**, meaning every notification email is authored as a typed React component exactly the way `@react-pdf/renderer` (§2) already lets every report be authored as a typed React component — one consistent "structured content as React components, rendered server-side to a non-HTML-page output format" authoring philosophy across both of this phase's new external-egress surfaces, not two unrelated template systems to learn/maintain. Generous free tier fits this project's already-established "personal/small-scale deployment, not a production SaaS" cost posture (the same framing `ai-features-design.md` §1 used to justify Gemini's free tier over Anthropic's paid-only API). |

### Module boundary: `lib/email/`

Cross-feature infrastructure, not a feature module — the exact same placement test `lib/ai/` was held to, and the exact same conclusion: multiple call sites need it (every one of the six trigger types, per notifications-v2.md's own "email as a delivery channel available across every trigger type"), and it is framework-agnostic aside from one isolated third-party import.

**Kept fully independent of `lib/ai/` and of `features/reports/server/pdf/`** — three genuinely separate concerns, per the roadmap's own explicit instruction: `lib/ai/` talks to an LLM provider and returns validated structured data; `features/reports/server/pdf/` renders React components to PDF bytes returned directly in an HTTP response; `lib/email/` renders React components to HTML/text and hands them to a third-party delivery API. No file in any of the three imports from either of the other two.

```
lib/email/
├── client.ts                     # THE ONLY file that imports the `resend` package / reads
│                                 #   RESEND_API_KEY. Exports a singleton `resend` client
│                                 #   instance — mirrors lib/db.ts / lib/uploadthing.ts's
│                                 #   existing singleton-export convention exactly.
├── send-notification-email.ts    # sendNotificationEmail(params: { to: string; subject: string;
│                                 #   template: ReactElement }): Promise<{ sent: boolean }> — THE
│                                 #   one function every trigger-evaluation file calls. Never
│                                 #   throws — catches every failure internally, logs it, and
│                                 #   returns { sent: false }, the exact same "Result, not a
│                                 #   thrown error" philosophy lib/ai/generate-structured-output.ts
│                                 #   already established for a different third-party dependency —
│                                 #   this is what mechanically guarantees notifications-v2.md
│                                 #   AC7 ("a failure to deliver an email never affects or blocks
│                                 #   the in-app notification for that same event"): the caller
│                                 #   literally cannot have an unhandled exception propagate back
│                                 #   out of this function into the in-app-notification code path.
├── templates/                    # One React Email component per trigger type — see §4's template
│  ├── goal-achieved-email.tsx    #   approach below. Every template's props type contains ONLY
│  ├── large-purchase-email.tsx   #   the same fields the equivalent in-app Notification already
│  ├── low-balance-email.tsx      #   displays, plus the two links from §5 (unsubscribe +
│  ├── monthly-summary-email.tsx  #   preferences) — per AC6's data-minimization requirement.
│  ├── budget-exceeded-email.tsx  #   Monthly Summary's template is the only one with a narrative
│  └── bill-due-email.tsx         #   block, rendering MonthlySummary.narrative verbatim.
└── unsubscribe-token.ts          # generateUnsubscribeToken({ userId, type }): string /
                                  #   verifyUnsubscribeToken(token): { userId, type } | null — see
                                  #   §5's full design.
```

**Secrets** (added to `.env.example`, following the exact documented-with-comment convention already used for every existing third-party key):

```
# Resend (https://resend.com/api-keys) — powers Phase 4b's outbound notification email
# (Notifications v2's email delivery channel). This is FinanceOS's first email-sending
# infrastructure of any kind. Never send from an unverified domain in production — see
# Resend's domain-verification docs.
RESEND_API_KEY=""
EMAIL_FROM_ADDRESS=""

# Signing secret for one-click email unsubscribe tokens (see lib/email/unsubscribe-token.ts).
# Deliberately a DEDICATED secret, not a reuse of BETTER_AUTH_SECRET — rotating one must never
# require rotating the other, and reusing an auth-session-signing secret for an unrelated
# purpose is an avoidable cross-purpose secret-reuse smell. Generate with, e.g.,
# `openssl rand -hex 32`.
EMAIL_UNSUBSCRIBE_SECRET=""
```

### Template approach: HTML (via React Email), with an auto-generated plain-text fallback — not plain-text-only

**Decision: every notification email is authored as a React Email component and sent as multipart (HTML + a plain-text fallback), not plain-text-only.** Reasoning against the "plain text only, simplest possible" alternative: React Email's `render()` function produces a matching plain-text version from the same component tree automatically (no second template to author/maintain), so choosing HTML costs nothing in duplicated authoring effort — the "simpler" plain-text-only option isn't actually simpler here, it's strictly a subset of what the chosen approach already produces for free. HTML email is also the deliverability-conventional choice for transactional email at every provider evaluated in §4 (better inbox rendering, clearer visual distinction between the notification's own content and the required unsubscribe/preferences links below) — with React Email specifically, the HTML output is generated from simple, constrained components (not hand-written arbitrary HTML/CSS), keeping the "no data beyond the in-app notification" minimization constraint (AC6) just as enforceable as it would be for a plain-text template: a template's props type is the only thing that can ever appear in its output, in both cases.

**Rendering discipline carried over from `ai-features-design.md`'s own established rule, applied here for the same reason:** any narrative text an email surfaces (Monthly Summary's linked recap wrapper line, never the full narrative body itself per notifications-v2.md AC4's "a generic wrapper line... plus a link satisfies this trigger on its own") renders as a plain text node inside the React Email component — never `dangerouslySetInnerHTML`, never a markdown-to-HTML pipeline. This is the same defense-in-depth rule already applied to every AI-narrative-adjacent surface in this codebase, extended here even though Reports/Notifications v2 introduce zero new AI-generated text of their own (§8) — the discipline is about safely rendering *any* text sourced from data, not specifically about AI provenance.

---

## 5. Unsubscribe / preference management — end-to-end design (AC5)

Every notification email includes **both** a one-click unsubscribe link and a link to the full in-app preferences screen — not one or the other, per the task's own framing of the choice:

- **One-click unsubscribe link** (`GET /api/notifications/unsubscribe?token=...`): the fastest-possible, friction-free, no-login-required opt-out for **exactly the one trigger type that email was for** — the deliverability-conventional expectation for transactional email, and directly satisfies AC5's "clear, working way to manage or disable **that email type**."
- **"Manage all notification preferences" link** (`/settings/notifications`, requires an active session): for a user who wants to fine-tune rather than fully opt out of one type — the full six-trigger-type, two-channel-each screen AC2 requires anyway.

Both cost the same underlying mechanism (below); offering both is a small, natural consequence of building the token-based unsubscribe link at all, not two separate implementations.

### The unsubscribe token

`lib/email/unsubscribe-token.ts` exports a signed, single-purpose token embedding exactly `{ userId, type }` — HMAC-signed with the dedicated `EMAIL_UNSUBSCRIBE_SECRET` (§4), **not** `BETTER_AUTH_SECRET` (kept separate per that secret's own comment). The token is generated once per email send (inside `send-notification-email.ts`'s call site for that trigger type) and embedded in the email's unsubscribe link.

`GET /api/notifications/unsubscribe?token=...` — a new, deliberately **narrow, token-authenticated exception to the ordinary session-authenticated rule**, structurally analogous to the shared-secret cron exception already documented in `api-contracts.md`, but scoped to one specific `(userId, type)` pair instead of "any request from the trusted scheduler": verifies the token server-side, and if valid, sets that user's `NotificationPreference` row for that exact `type` to `emailEnabled: false` (never touches `inAppEnabled`, never touches any other trigger type). Returns a plain confirmation page — no session required, matching the real-world expectation that an unsubscribe link must work even for a user who isn't currently logged in.

### Why this satisfies Risk #4's "no cross-user leakage" for this specific new surface

The token is the **only** credential this endpoint accepts — no session, no other identifier — and it is cryptographically bound to exactly one `(userId, type)` pair at generation time. A tampered or guessed token fails signature verification and the request is rejected outright; there is no way to construct a token that resolves to a different `userId` or a different `type` than the one it was originally signed for, so this endpoint cannot be used to alter another user's preferences or a different trigger type's preference than the email's own, even by a user who has the email address/token format figured out.

### The deeper cross-user-leakage question the task asked about: could a templating bug leak user A's data into user B's email?

This is a real, distinct risk class from "wrong preference toggled" above, and the mitigation is structural, not just careful coding:

**Rule: every trigger's evaluation constructs exactly one data object per user per event, and that same object is used for both the in-app `Notification` row's fields and the email template's props — never two independently-scoped reads.** Concretely, §6's per-user trigger-evaluation loop (whether driven by a user's own request or the cron route) resolves `userId` once at the top of that iteration, fetches that iteration's own data (the goal, the transaction, the account, the summary) scoped to that same `userId`, and passes that exact in-memory object into both `db.notification.create(...)` and `sendNotificationEmail(...)` within the same iteration — there is no second, separate "look up today's large purchase for a user" query anywhere that could theoretically resolve to a different user's row than the one currently being processed.

**A second, explicit rejection: no batch/merge-variable email API is ever used.** Resend (like most transactional providers) supports a batch-send API accepting multiple recipients with per-recipient merge variables in a single call — this is deliberately **not** used anywhere in this design, precisely because that shape is the classic root cause of the exact cross-user leakage bug class described above (a merge-variable indexing bug sends recipient B's content to recipient A). Every email send in this codebase is one `sendNotificationEmail` call per user per event — a plain, sequential per-user loop (§6), never a single provider call handling multiple users' content and recipients at once. This is stated here explicitly as a "considered and rejected" design choice, not an oversight of an available optimization — the batch API's theoretical latency/cost advantage is not worth reintroducing this specific risk class into this codebase's first outbound-email surface.

---

## 6. Notification evaluation architecture (Notifications v2's four new triggers)

### Where evaluation happens: extending v1's existing lazy pattern, plus one new cron route

Notifications v1 already established the mechanism this phase extends, not replaces: `ensureNotifications(userId)`, called on every `GET /api/notifications` request (i.e., lazily, scoped to whichever user's own session polls their notification inbox), reads over other domains and upserts `Notification` rows, deduped by a database unique constraint. Three of the four new triggers (Goal Achieved, Low Balance, Monthly Summary) fit this exact shape unchanged — cheap, bounded, per-user, read-only evaluation. Large Purchase also fits it, with one addition (a recency window, below).

**The one genuine gap the lazy-only pattern leaves: a user who never opens the app never gets evaluated, which defeats email's entire stated purpose** ("reaching a user even when they aren't in the app at all," notifications-v2.md's own Business Value). **Fix: a new cron route, `app/api/cron/evaluate-notifications/route.ts`, shared-secret authenticated (the fourth instance of the exact same exception `net-worth-snapshot`/`categorize-transactions`/`monthly-summary`/`financial-health-score-snapshot` already established — not a new pattern), looping every user and calling the same `ensureNotifications(userId)` function a user's own request would call.** Evaluation logic is written exactly once; it simply has two callers now (an authenticated user's own request, and the scheduler). This is safe by construction, not by convention: every dedup mechanism below (§6's per-trigger design) is a database-level unique constraint or an atomic conditional update, not an in-process "have I already checked this" flag — so the cron and a concurrent user-driven request racing each other can never double-fire or double-send (see the atomicity note at the end of this section).

### File layout (`features/notifications/`)

```
features/notifications/server/
├── service.ts                    # ensureNotifications(userId) — UPDATED: now a thin orchestrator.
│                                 #   Calls each trigger file's own evaluate function in sequence,
│                                 #   collects newly-created Notification rows across all six
│                                 #   trigger types, then performs the ONE shared email-dispatch
│                                 #   step (below) once per newly-created row — not duplicated
│                                 #   six times across six trigger files.
├── triggers/
│  ├── budget-bill-triggers.ts    # v1's existing BUDGET_OVER / BILL_DUE_SOON / BILL_LATE logic,
│  │                             #   extracted as-is (unchanged behavior) into its own file for
│  │                             #   the same file-size/SRP reason every other multi-concern
│  │                             #   module in this codebase has already been split this way
│  │                             #   (Analytics' per-metric-family files, per Architecture.md)
│  ├── goal-achieved-trigger.ts   # NEW — reads financial-goals.service.getFinancialGoals(userId)
│  │                             #   (non-archived), checks each goal's read-time isCompleted;
│  │                             #   for any goal where isCompleted && completionNotifiedAt is
│  │                             #   null, creates the Notification row AND atomically sets
│  │                             #   completionNotifiedAt in the same operation (§6's atomicity
│  │                             #   note)
│  ├── large-purchase-trigger.ts  # NEW — reads transactions.service (expense transactions +
│  │                             #   split line items, EXCLUDE_SPLIT_PARENTS reused from its
│  │                             #   canonical home per the existing convention) dated within
│  │                             #   the last 7 days (proposed default recency window — see the
│  │                             #   note below), amount ≥ that user's largePurchaseThreshold;
│  │                             #   creates a Notification per qualifying transaction not
│  │                             #   already notified (dedup: DB unique constraint on
│  │                             #   (transactionId, type), §7)
│  ├── low-balance-trigger.ts     # NEW — reads accounts.service.getAccounts(userId) filtered to
│  │                             #   non-archived CHECKING/SAVINGS/CASH; per account, compares
│  │                             #   current balance against
│  │                             #   (account.lowBalanceThresholdOverride ??
│  │                             #   userThresholdSettings.lowBalanceThreshold ?? systemDefault);
│  │                             #   fires + sets Account.lowBalanceNotifiedAt on a crossing
│  │                             #   below, clears it on a recovery back to at-or-above (§7's
│  │                             #   latch — see the atomicity note)
│  └── monthly-summary-trigger.ts # NEW — reads
│                                 #   dashboard.server/monthly-summary.getMostRecentSummary(userId)
│                                 #   ONLY (never the full history — see the flagged flood-
│                                 #   avoidance note below); if narrative is non-null, creates a
│                                 #   Notification (dedup: DB unique constraint on
│                                 #   (monthlySummaryId, type), §7)
├── email-dispatch.ts             # NEW — dispatchNotificationEmail(userId, notification): the
│                                 #   ONE shared step service.ts calls once per newly-created row,
│                                 #   regardless of trigger type: reads that user's
│                                 #   NotificationPreference row for this notification's `type`;
│                                 #   if emailEnabled, resolves the right template from
│                                 #   lib/email/templates/ by `type`, calls
│                                 #   lib/email/send-notification-email.ts, and records the
│                                 #   outcome onto Notification.emailSentAt/emailSendError (§7).
│                                 #   Single responsibility: this file's only job is "given an
│                                 #   already-created notification, maybe email it" — it never
│                                 #   evaluates trigger conditions itself.
├── preferences.ts                # NEW — getNotificationPreferences(userId) (materializes all 6
│                                 #   trigger types' defaults for any missing row — row absence =
│                                 #   default, same "unset vs. explicit" row-presence convention
│                                 #   Budgeting already established), getNotificationThresholdSettings
│                                 #   (userId) (materializes the two system defaults when unset)
├── actions.ts                    # UPDATED: adds updateNotificationPreference,
│                                 #   updateNotificationThresholdSettings
└── validation.ts                 # UPDATED: adds UpdateNotificationPreferenceSchema,
                                  #   UpdateNotificationThresholdSettingsSchema
```

**Why Large Purchase's recency window is evaluated against `date`, not `createdAt`:** notifications-v2.md's own Edge Case is explicit — "this trigger fires only for transactions **dated** within a recent window of when they are recorded" — filtering on the transaction's own `date` field (not when the row happened to be inserted) is what makes a bulk CSV import of old, historically-dated transactions naturally excluded regardless of when it's imported, satisfying the edge case's "does not flood the user with a burst of notifications for purchases from months or years ago" requirement as a direct consequence of the filter, not a special case bolted on top of it. **Proposed default: 7 days.** Flagged, per notifications-v2.md's own wording, as "an architecture-pass detail" — a proposed, non-binding starting point for the Backend Engineer, the same non-binding-default framing already used for the two dollar thresholds below.

**Why Monthly Summary only ever checks the single most-recent `MonthlySummary` row, never the full history:** unlike Large Purchase (whose flood-avoidance rule is explicit in the spec), the spec doesn't directly address what happens on this feature's first-ever evaluation pass for a long-tenured user with many past months of already-generated summaries. Checking only the most-recent row is this Architect's explicit design decision to avoid the same class of launch-day notification flood Large Purchase's own edge case already warns against, applying that same principle by extension rather than leaving it for an implementer to discover mid-build. A user's historical summaries remain fully browsable via the existing `getSummaryHistory` view either way — this only bounds which months are eligible to ever generate a *notification*.

**Proposed default dollar thresholds** (flagged exactly as notifications-v2.md itself frames both: "a proposed starting point for the architecture/backend pass, not a fixed product mandate," user-adjustable at any time): **Large Purchase: $500. Low Balance: $100.** Both are ordinary, user-editable `NotificationThresholdSettings` values (§7) — not baked into any formula or banding logic the way the Financial Health Score's bands were, so they carry none of that feature's "get it right up front" rigor requirement.

### Atomicity — the one concurrency lesson explicitly reused from Phase 4a

`ai-features-design.md`'s Security Architect review (Finding 6b) already established, for this exact codebase, that a rate-limit/dedup check must be an **atomic conditional update, not a read-then-write** — because two near-simultaneous callers (here: a user's own request and the new cron route, both able to call `ensureNotifications(userId)` for the same user in close succession) can otherwise both pass a plain read-based check before either has written its result, double-firing. This lesson is reused directly, for a different feature, rather than relearned: every dedup/latch write in this design (`FinancialGoal.completionNotifiedAt`, `Account.lowBalanceNotifiedAt`, and the three new `Notification` unique constraints in §7) must be written via a single atomic operation — a conditional `UPDATE ... WHERE <latch column> IS NULL` (or the equivalent Prisma conditional-update pattern), or reliance on the database's own unique-constraint rejection (catch-and-ignore a unique-violation on `create`) — never a separate `SELECT` followed by a later `UPDATE`/`INSERT`. Flagged here explicitly for the Backend Engineer implementing `triggers/*.ts`, since it is the one concrete implementation detail this design borrows wholesale from an already-reviewed precedent rather than re-deriving.

---

## 7. `Notification` model/enum extension — specification for the Database Architect

This section specifies exactly what schema changes are needed. **The Database Architect makes the final column-level/index/migration-shape call**, per this project's standing "flag the requirement precisely, Database Architect decides the final shape" convention (identical framing already used for every prior schema handoff in `Architecture.md` — FinancialGoal, DismissedSubscriptionMerchant, the Phase 4a suggestion/cache tables). Nothing below is a Prisma schema diff to be applied verbatim without that review.

### 7.1 `NotificationType` enum — four new members

```
enum NotificationType {
  BUDGET_OVER            // existing
  BILL_DUE_SOON          // existing
  BILL_LATE               // existing
  GOAL_ACHIEVED           // NEW
  LARGE_PURCHASE          // NEW
  LOW_BALANCE             // NEW
  MONTHLY_SUMMARY_READY   // NEW
}
```

### 7.2 `Notification` model — four new nullable FKs, plus email-observability fields

Extends the model's existing "exactly one of these nullable FKs is set, matching `type`" convention (already established for `budgetCategoryId`/`billOccurrenceId`) — four more FKs join that same pattern, not a new one:

```
financialGoalId  String?
financialGoal    FinancialGoal?  @relation(fields: [financialGoalId], references: [id], onDelete: Cascade)
transactionId    String?          // Large Purchase — points at either a normal Transaction row or
transaction      Transaction?     //   a split child row; both are ordinary Transaction rows already
                                  //   (@relation fields: [transactionId], references: [id], onDelete: Cascade)
accountId        String?          // Low Balance
account          Account?         // (@relation fields: [accountId], references: [id], onDelete: Cascade)
monthlySummaryId String?
monthlySummary   MonthlySummary?  // (@relation fields: [monthlySummaryId], references: [id], onDelete: Cascade)

// Email-delivery observability — independent of the in-app fields above (readAt/dismissedAt),
// per AC7's "email failure never affects in-app delivery": these two columns record what
// happened on the email side ONLY, never gate or affect anything else on this row.
emailSentAt      DateTime?        // null = email not enabled for this type, or not yet attempted
emailSendError   String?  @db.Text // last failure reason, observability only, never surfaced to
                                  //   the user — the in-app notification is unaffected either way

@@unique([financialGoalId, type])   // NEW — the "fires exactly once, ever, per goal" guarantee
                                    //   (Goal Achieved AC1) — enforced at the DB level, not
                                    //   application-level, mirroring the existing
                                    //   budgetCategoryId/billOccurrenceId dedup precedent exactly
@@unique([transactionId, type])     // NEW — "fires once per qualifying transaction" (Large
                                    //   Purchase AC2) — same pattern
@@unique([monthlySummaryId, type])  // NEW — "fires once per calendar month" (Monthly Summary
                                    //   AC1), and doubles as the "regeneration doesn't re-fire"
                                    //   guarantee (Edge Cases) for free, since a regenerated
                                    //   summary reuses the same MonthlySummary row id
@@index([accountId])                // NEW — deliberately NOT a unique constraint: Low Balance
                                    //   legitimately fires more than once per account over time
                                    //   (once per crossing, per AC3/AC4) — its "don't re-fire
                                    //   while still below threshold" guarantee lives entirely on
                                    //   Account.lowBalanceNotifiedAt (§7.3), not here
```

**Why four more nullable FKs rather than a generic polymorphic `entityId`/`entityType` pair:** considered and rejected, for the same reason this schema has already rejected generic polymorphism twice before (`FinancialGoalAccount` as an explicit join table, `DismissedSubscriptionMerchant` as its own small model rather than a JSON blob) — a real FK gets referential integrity and `onDelete: Cascade` "for free" at the database level (a notification can never outlive the row it refers to, enforced by Postgres itself, not application code remembering to clean it up), which a generic string `entityId` column cannot provide. Six nullable FKs on one row is wider than this model's Phase 2 shape, but it's the same shape scaled up, not a new one — flagged for the Database Architect's own judgment on whether the row is getting wide enough to warrant a different normalization (their call, not overridden here).

**Required back-relations** (Prisma requires both sides of every relation declared, and this schema's existing convention — see `BudgetCategory.notifications`/`BillOccurrence.notifications`, already present — is a plain `Notification[]` array on the referenced side): `FinancialGoal.notifications`, `Transaction.notifications`, `Account.notifications`, `MonthlySummary.notifications` all need this same one-line addition.

### 7.3 `FinancialGoal` — one new latch field, plus a required one-time data migration

```
completionNotifiedAt DateTime?   // NEW. Non-null = a GOAL_ACHIEVED notification has already been
                                  // created for this goal (or the goal was already Completed at
                                  // the moment the one-time backfill below ran). Null = eligible
                                  // to fire the next time goal-achieved-trigger.ts observes
                                  // isCompleted transition to true. This is genuinely new
                                  // persisted state — FinancialGoal's completion itself is, and
                                  // remains, entirely read-time-computed (unchanged, per its own
                                  // existing "never store what's derived" rule) — this column
                                  // stores only "has this already been notified," never the
                                  // completion state itself.
```

**Why this needs new persisted state, not just a read-time check (the task's own explicit question):** `FinancialGoal`'s completion is deliberately never stored (Architecture.md's Phase 3b section: "every progress/completion field computed at read time... never stored"). But "fires exactly once, at the moment of transition" (AC1) requires knowing whether *this specific completion* has already produced a notification — a fact no read-time formula over live Debt/Net-Worth/Savings-Rate data can answer, since none of those tables know anything about a notification ever having fired. This is exactly the same category of gap `DismissedSubscriptionMerchant` was built to close in Phase 3b ("a durable exclusion rule over a computed, never-persisted concept," per Architecture.md's own framing) — this is that same pattern's mirror image, a durable **inclusion**/already-fired latch over a computed, never-persisted concept.

**Required one-time data migration (not schema-only):** a script that sets `completionNotifiedAt = now()` for every `FinancialGoal` row that is **already** Completed (evaluated once, at migration time, via each type's existing read-time completion formula) as of the moment this feature deploys. This is what implements the edge case "a goal already Completed before this feature ships does **not** retroactively fire" — without it, the very first evaluation pass after deploy would see every already-completed goal as newly transitioning and fire a burst of stale "you achieved this months ago" notifications, which is the exact outcome the spec explicitly rules out. Flagged here explicitly as a required deployment step, distinct from the DDL migration itself — the Database Architect's/whichever role owns running one-time data-backfill scripts in this codebase's existing convention should confirm ownership of executing it once, at deploy time, before the new trigger code path goes live.

**No equivalent backfill is needed for Low Balance** — the opposite edge case applies there (an account already below threshold at launch **does** fire, per its own explicit, opposite AC) — the field's own default `null` state already produces exactly that "armed to fire" behavior with zero migration-time intervention, which is worth stating explicitly so no one adds an unneeded backfill for it by false symmetry with Goal Achieved.

### 7.4 `Account` — two new nullable fields

```
lowBalanceThresholdOverride Decimal?  @db.Decimal(14, 2)  // NEW. Null = use the user's global
                                       // NotificationThresholdSettings.lowBalanceThreshold (or
                                       // the system default if that's unset too). Meaningful only
                                       // for CHECKING/SAVINGS/CASH accounts — not enforced at the
                                       // DB level, same "nullable, meaningless for some types"
                                       // precedent already established by Account.interestRate.
lowBalanceNotifiedAt        DateTime?  // NEW. The crossing latch (§6): non-null = balance is
                                       // currently below threshold and already notified (armed to
                                       // clear on recovery); null = armed to fire on the next
                                       // crossing below threshold. This is the field whose default
                                       // null state, on every existing and newly-created account,
                                       // already produces the "already below threshold at launch
                                       // or creation still fires" edge case correctly, with no
                                       // backfill needed (contrast with §7.3).
```

### 7.5 Two new small models

```
model NotificationPreference {
  id           String            @id @default(cuid())
  userId       String
  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  type         NotificationType
  inAppEnabled Boolean           @default(true)
  emailEnabled Boolean           @default(false)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  @@unique([userId, type])
  @@index([userId])
  @@map("notification_preference")
}
```
Row **absence** for a given `(userId, type)` = the documented defaults (`inAppEnabled: true`, `emailEnabled: false`) — `preferences.ts`'s `getNotificationPreferences` materializes all six trigger types at read time regardless of which rows actually exist, the identical "row presence encodes unset vs. explicit" convention Budgeting already established for `BudgetCategory`, reused here rather than a sixth per-user seed-at-signup step.

```
model NotificationThresholdSettings {
  id                     String   @id @default(cuid())
  userId                 String   @unique
  user                   User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  largePurchaseThreshold Decimal? @db.Decimal(14, 2)   // null = use the system default ($500, §6)
  lowBalanceThreshold    Decimal? @db.Decimal(14, 2)   // null = use the system default ($100, §6)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@map("notification_threshold_settings")
}
```
One row per user, created lazily on first customization (same lazy-materialization convention as above) — both columns independently nullable so a user can customize one threshold without being forced to also supply an explicit value for the other.

**`User` gains three new relation arrays/fields**, following the existing per-phase pattern already visible in the model today (`// FinanceOS domain data (Phase 4a)`, etc.): `notificationPreferences NotificationPreference[]`, `notificationThresholdSettings NotificationThresholdSettings?` (one-to-one, per `@@unique userId`).

### 7.6 Summary — what's genuinely new persisted state vs. what's derived

| Requirement | New persisted state? |
|---|---|
| Goal Achieved fires once, ever, per goal | **Yes** — `FinancialGoal.completionNotifiedAt` (§7.3), plus the `Notification` unique constraint (§7.2) as a second, redundant guarantee |
| Goal Achieved doesn't retroactively fire for pre-existing Completed goals | **Yes** — the one-time data migration (§7.3) is what encodes this; the schema field alone doesn't, without it |
| Large Purchase fires once per qualifying transaction | **No new latch field** — the `Notification` unique constraint on `(transactionId, type)` (§7.2) is sufficient on its own |
| Large Purchase doesn't flood on bulk historical CSV import | **No new persisted state** — a pure read-time filter (recency window on `Transaction.date`, §6), not a stored fact |
| Low Balance fires once per crossing, re-arms on recovery | **Yes** — `Account.lowBalanceNotifiedAt` (§7.4); this is the one trigger whose core semantics genuinely cannot be expressed by a `Notification`-table unique constraint alone, since it must legitimately fire more than once over an account's lifetime |
| Low Balance fires for an already-below-threshold account at launch/creation | **No migration needed** — the new field's own default `null` state already produces this correctly |
| Monthly Summary fires once per user per month, doesn't re-fire on regeneration | **No new latch field** — the `Notification` unique constraint on `(monthlySummaryId, type)` (§7.2) covers both requirements at once, since a regenerated summary reuses the same row id |
| Per-trigger-type in-app/email preference | **Yes** — `NotificationPreference` (§7.5), new model |
| Large Purchase / Low Balance threshold values (global + per-account override) | **Yes** — `NotificationThresholdSettings` (§7.5) + `Account.lowBalanceThresholdOverride` (§7.4) |

---

## 8. Confirmations and cross-cutting closeout

**Zero `lib/ai/` call sites, confirmed by construction, not just by this document's own prose.** No file described anywhere above imports from `lib/ai/` — Reports' only narrative content is a direct Prisma-backed field read (`MonthlySummary.narrative`, via `dashboard.server/monthly-summary.getSummaryForMonth`, §3), and Notifications v2's Monthly Summary trigger reads the same already-persisted field the same way. **Recommendation for the Backend Engineer implementing this design: add an ESLint `no-restricted-imports` rule scoped to `features/reports/**` and `features/notifications/**` that disallows any import from `@/lib/ai/*`.** This turns reports.md's and notifications-v2.md's own Definition of Done requirement ("a test verifies there is no code path... capable of calling `lib/ai/`... verified by construction, not convention") into a build-time-enforced guarantee rather than a test someone has to remember to write and keep passing — stronger than a runtime test, and it fails fast (at lint/CI time) if anyone ever tries to add one.

**Large Purchase and Low Balance are plain deterministic checks, confirmed with no path through Spending Insights or any AI-adjacent code.** Both triggers (§6) read only `Transaction`/`Account` data directly through `transactions.service`/`accounts.service` — neither ever imports from `features/analytics/server/insights.ts` (Spending Insights, 4a) or any other AI-owned file. The same ESLint rule above additionally makes this unenforceable-by-accident: `features/analytics/server/insights.ts` and `features/notifications/server/triggers/large-purchase-trigger.ts`/`low-balance-trigger.ts` share no import edge in either direction.

**No new caching-layer precedent is introduced.** Every new read in this design (Reports' data assemblers, Notifications' new trigger files) is on-read, uncached Prisma aggregation over already-bounded, per-user data — consistent with this codebase's standing default (`docs/database/performance-considerations.md`, reaffirmed at Risk #11's resolution and again at Phase 4a's own closing risk note) and not revisited here, since nothing in this design's actual read patterns differs materially from what Analytics/Financial-Health-Score already do at the same "thousands, not millions, of rows per user" scale.

## Risks — new items surfaced by this pass

Three genuinely new risks are surfaced by the specific choices in this document (not restatements of the already-tracked #4/#5/#17/#19/#20) — added to `docs/planning/risk-register.md` as #21–#23 in the same dispatch as this document:

- **#21** — the new all-user cron loop (`evaluate-notifications`) is this codebase's first batch job whose per-iteration failure mode is externally visible and irreversible (a misdirected or cross-user-mixed email cannot be recalled the way a bad database write can be corrected) — mitigated by the single-data-construction-point rule and the no-batch-API rule, both specified in §5, but flagged as a standing risk to verify at the Security Architect's review gate, not something this design alone can fully close out.
- **#22** — Reports' custom start/end date-range extension (§3, needed for Income/Expense/Cash Flow Reports) has no natural upper bound the way Analytics' four existing presets do — `validation.ts`'s `GenerateReportRequestSchema` (§3) must enforce an explicit maximum range length (e.g., clamped to some number of years, or to the user's own account-creation date) so an adversarial or malformed request can't trigger an unbounded aggregation query.
- **#23** — `@react-pdf/renderer`'s automatic pagination (§2) still requires deliberate per-table `wrap`/overflow configuration; a misconfigured table could silently truncate a long list (Largest Purchases, Top Merchants, a full year's monthly trend rows) rather than erroring, producing a PDF that looks complete but isn't — a direct violation of Cross-Cutting Requirement #6 if it happened. Mitigated by testing every `<ReportTable>`-composing template against a high-row-count fixture account as part of this feature's own test suite, and flagged explicitly for the Bug Hunter/Performance Engineer's review at the 4b gate.
