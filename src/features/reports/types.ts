// Client-safe(-ish) type definitions for the Reports feature, per
// docs/architecture/phase-4b-technical-design.md §3's directory layout and
// docs/product/reports.md's six report types. Reports is a pure server-side
// feature (no Client Component ever imports from `features/reports/` — see
// `server/service.ts`'s module doc), but this file follows every other
// feature's `types.ts` convention anyway: Prisma-`Decimal`-free, plain
// TypeScript shapes only, so the PDF template layer (`pdf/templates/*.tsx`)
// never has to know about Prisma at all.
//
// Every report-type DTO is deliberately a *thin composition* of other
// features' own already-client-safe types (`DebtWithProjection`,
// `AllocationEntry`, `IncomeGrowthPoint`, ...) — reports.md's binding
// constraint 2 ("never recomputes a metric with new logic") means this file
// adds no new derived-figure types, only assembly shapes around
// already-existing ones.

import type { ReportingPeriod } from "@/features/analytics/types"
import type {
  BudgetVsActualMonth,
  CategoryTrend,
  ExpenseDistributionEntry,
  IncomeGrowthPoint,
  IncomeSourceEntry,
  LargestPurchase,
  TopMerchant,
} from "@/features/analytics/types"
import type { BudgetMonthView } from "@/features/budgeting/types"
import type { DebtWithProjection } from "@/features/debt/types"
import type { AllocationEntry, DividendIncomeForPeriod } from "@/features/investments/types"

// ---------------------------------------------------------------------------
// Report type + period vocabulary
// ---------------------------------------------------------------------------

/** The six report types reports.md defines — `SCREAMING_CASE`, matching this
 * codebase's enum-naming convention (naming-standards.md), even though this
 * is a TS-only union with no Prisma-persisted counterpart (no `Report` model
 * exists — see phase-4b-technical-design.md §2's "no stored artifact to
 * leak" reasoning). */
export type ReportType =
  | "MONTHLY"
  | "YEARLY"
  | "TAX_SUMMARY"
  | "INCOME"
  | "EXPENSE"
  | "CASH_FLOW"

/**
 * The period-selection shape for the Income/Expense/Cash Flow report types
 * (reports.md's "reuses Analytics' existing shared reporting-period presets
 * ... plus a custom start/end date range"): either one of Analytics' four
 * shared presets, or an explicit custom `[start, end]` range — the "a
 * deliberate, minor extension beyond Analytics' own period control" reports.md
 * calls out explicitly.
 */
export type FlexiblePeriodInput =
  | { kind: "PRESET"; preset: ReportingPeriod }
  | { kind: "CUSTOM"; start: Date; end: Date }

/**
 * `GenerateReportRequestSchema`'s parsed output (`server/validation.ts`) —
 * one variant per `ReportType`, each carrying exactly that type's own valid
 * period shape, per api-contracts.md's Phase 4b Reports row. This same type
 * doubles as `server/period.ts`'s `resolveReportPeriod` input (per
 * phase-4b-technical-design.md §3's `ReportPeriodInput` — reused verbatim
 * rather than a second, parallel type, since every field `period.ts` needs is
 * already present here).
 */
export type GenerateReportRequest =
  | { type: "MONTHLY"; month: string }
  | { type: "YEARLY"; year: number }
  | { type: "TAX_SUMMARY"; year: number }
  | { type: "INCOME"; period: FlexiblePeriodInput }
  | { type: "EXPENSE"; period: FlexiblePeriodInput }
  | { type: "CASH_FLOW"; period: FlexiblePeriodInput }

/** `server/period.ts`'s resolved period shape. Deliberately mirrors
 * `features/analytics/types.ts`'s `ReportingPeriodRange` (`start: Date |
 * null`, `end: Date`) rather than forcing `start` to always be a concrete
 * `Date`: the Income/Expense/Cash Flow report types' "All Time" preset has no
 * concrete floor until an Analytics metric function resolves it against that
 * one user's own earliest transaction (the exact same "bounded by that
 * user's own data" pattern every Analytics metric already follows, per
 * Architecture.md's Risk #11 resolution) — inventing a concrete floor here
 * would mean either duplicating each metric's own "earliest activity" query
 * or resolving one metric's floor and reusing it for a differently-scoped
 * metric (e.g. using Expense's earliest-expense floor for an Income report),
 * which could silently disagree with that metric's own all-time boundary.
 * Every Analytics function this feature composes already accepts exactly
 * this `{ start: Date | null; end: Date }` shape directly — see
 * `phase-4b-technical-design.md` §3's "widen each period-aware function's
 * `period` parameter" note, which this design confirms is unnecessary (see
 * the Backend Engineer's final report). */
export interface ResolvedReportPeriod {
  start: Date | null
  end: Date
}

/** The client(-template)-safe rendering of a resolved report period —
 * `"yyyy-MM-dd"` date strings (never a raw `Date`, matching this codebase's
 * established date-string convention for anything crossing into a rendered
 * view), a human-readable `label` (e.g. `"June 2026"`, `"2026"`, `"This
 * Year"`, `"Jan 15, 2026 – Mar 20, 2026"`), and `isPartial` — the "month to
 * date" / "year to date" flag every report's header must show per
 * reports.md's own per-type "current period selected" edge case. `start` is
 * `null` only for an "All Time" period with zero activity at all (no
 * transaction ever recorded) — every other case resolves a concrete floor by
 * the time a report is actually rendered (an Analytics metric's own
 * "earliest activity" floor, surfaced back up by the data assembler that
 * called it). */
export interface ReportPeriodView {
  start: string | null
  end: string
  label: string
  isPartial: boolean
}

/**
 * Every report DTO's shared header fields — reports.md Cross-Cutting
 * Requirement #5: "Every report clearly states its own type, its covered
 * date range/period, and its generation date/time." `generatedAt` is an ISO
 * timestamp, set once in `server/service.ts` (a single `new Date()` call
 * shared by every template a given request renders), never independently
 * computed per section.
 *
 * Deliberately does **not** include `type` itself, even though every DTO
 * below also carries one: each DTO interface declares its own `type` as a
 * specific string literal (`"MONTHLY"`, `"YEARLY"`, ...), not the broad
 * `ReportType` union — that's what makes `ReportData` (the union of all six)
 * an actual TypeScript discriminated union `server/render.ts`'s `switch
 * (data.type)` can narrow on. If `type: ReportType` lived here instead,
 * every DTO would structurally share the same broad `type` field type and
 * TypeScript could never narrow `ReportData` down to one specific DTO from a
 * runtime check alone.
 */
export interface ReportMeta {
  period: ReportPeriodView
  /** ISO-8601 timestamp string. */
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Shared sub-shapes
// ---------------------------------------------------------------------------

/** Net Worth at the start/end of a period, plus the change between them —
 * reused by the Monthly and Yearly report types. `null` fields mean "no
 * `NetWorthSnapshot` exists at or before that boundary yet" (a brand-new
 * user, or a period predating the user's account) — reports.md's own
 * "renders from whatever account data exists" edge case, never a fabricated
 * $0. */
export interface ReportNetWorthChange {
  start: { date: string; netWorth: number } | null
  end: { date: string; netWorth: number } | null
  /** `end.netWorth - start.netWorth`, or `null` when either boundary is
   * unavailable — mirrors `dashboard.server/monthly-summary.ts`'s
   * `computeNetWorthChange` convention exactly (reused as this file's own
   * tiny, pure re-derivation, not a new formula — see
   * `server/data/monthly.ts`'s JSDoc). */
  change: number | null
}

/** One calendar month's Income/Expenses/Cash Flow/Savings Rate — the Yearly
 * and Cash Flow report types' month-by-month trend row, sourced entirely from
 * `dashboard.service.getMonthlySummary`'s own already-correct per-month
 * figures (never re-derived). */
export interface ReportMonthlyTrendPoint {
  /** `"yyyy-MM"`. */
  month: string
  income: number
  expenses: number
  cashFlow: number
  /** `null` for a $0-income month, mirroring
   * `dashboard.service`'s own `computeSavingsRate` convention exactly (the
   * same figure this field is sourced from, unmodified). */
  savingsRate: number | null
}

/** One active Recurring Income stream's received-vs-expected activity within
 * a report's period — the Yearly and Income report types' "individual
 * received income occurrences" / "recurring income summary" sections,
 * composed from `recurring-income.service.getIncomeStreams`/`getStreamById`
 * (a bounded loop over the user's own stream count, per
 * phase-4b-technical-design.md §3 — no new function). */
export interface ReportIncomeStreamActivity {
  streamId: string
  streamName: string
  /** The stream's own `IncomeType` (or `"IRREGULAR"` schedule has no type
   * distinction beyond its own `IncomeType`, same as every other stream). */
  type: string
  /** Number of occurrences/events whose effective date falls within the
   * report's period. */
  occurrenceCount: number
  /** Number of those occurrences already received (status `"RECEIVED"`) —
   * always equal to `occurrenceCount` for `IRREGULAR` streams, since every
   * logged `IrregularIncomeEvent` is, by construction, already-received
   * activity. */
  receivedCount: number
  /** Sum of the *effective* received amount across every received
   * occurrence/event in range. */
  receivedTotal: number
}

// ---------------------------------------------------------------------------
// Report-type DTOs — `ReportMeta & { ...report-specific fields }`, per
// `server/service.ts`'s "meta + assembler content" composition (see that
// file's own JSDoc for exactly how the two halves are merged).
// ---------------------------------------------------------------------------

/** Report 1 — Monthly Report (reports.md §1). */
export interface MonthlyReportData extends ReportMeta {
  type: "MONTHLY"
  summary: {
    income: number
    expenses: number
    cashFlow: number
    savingsRate: number | null
    /** `true` when the month had any recorded income or expense activity at
     * all — reports.md's "a month with zero transactions recorded" edge case
     * ("the income/expense/spending sections state plainly that no activity
     * was recorded"). */
    hasActivity: boolean
  }
  netWorth: ReportNetWorthChange
  spendingByCategory: { categoryId: string; categoryName: string; amount: number }[]
  /** `null` when the user had no category allocation set for this month at
   * all — reports.md's "this section is omitted entirely ... for a month
   * with no budget set" requirement. */
  budgetVsActual: BudgetMonthView | null
  /** Verbatim `MonthlySummary.narrative`, or `null` when it doesn't exist
   * (not yet generated, generation failed, or the current in-progress month
   * was selected) — reports.md §1's own "never distinguishes 'failed' from
   * 'not yet run'" rule. Never independently generated or altered by this
   * feature — see `server/data/monthly.ts`'s JSDoc. */
  narrative: string | null
}

/** Report 2 — Yearly Report (reports.md §2). */
export interface YearlyReportData extends ReportMeta {
  type: "YEARLY"
  annualTotals: {
    income: number
    expenses: number
    cashFlow: number
    savingsRate: number | null
  }
  netWorth: ReportNetWorthChange
  monthlyTrend: ReportMonthlyTrendPoint[]
  categoryTrends: CategoryTrend[]
  topMerchants: TopMerchant[]
  largestPurchases: LargestPurchase[]
  /** Only months with at least one allocation set — a month with none is
   * simply absent from this array (reports.md: "not shown as zeroed rows"). */
  budgetVsActual: BudgetVsActualMonth[]
  /** Every active (non-archived) debt's current-state snapshot, as of report
   * generation — explicitly not a "paid this year" historical figure (see
   * `server/data/yearly.ts`'s JSDoc). Empty array = "No debts tracked" (the
   * template's job, per the shared `<NoDataState>` primitive). */
  debts: DebtWithProjection[]
  investments: {
    totalCurrentValue: number
    /** This year's gain/loss delta (`investments.service.getGainLossForPeriod`),
     * NOT the lifetime cumulative figure — see the Tax Summary DTO below for
     * the deliberately different lifetime figure it uses instead. */
    gainLossForYear: number
    dividendIncome: DividendIncomeForPeriod
    allocation: AllocationEntry[]
    /** `true` when the user has zero Investment/Retirement/Crypto containers
     * at all — drives the "No investments tracked" no-data note rather than
     * a zeroed table (reports.md's own "a section with nothing applicable"
     * edge case). */
    hasInvestments: boolean
  }
  recurringIncome: {
    streams: ReportIncomeStreamActivity[]
    /** `true` when the user has zero active Recurring Income streams at all
     * — drives the "no recurring income set up" no-data note. */
    hasStreams: boolean
  }
}

/** Report 3 — Tax Summary Report (reports.md §3). */
export interface TaxSummaryReportData extends ReportMeta {
  type: "TAX_SUMMARY"
  incomeBySource: IncomeSourceEntry[]
  expenseByCategory: ExpenseDistributionEntry[]
  /** `null` when the user has zero investment containers at all — reports.md:
   * "the dividend/gain-loss section is omitted with a plain note, not a
   * zeroed table." */
  investments: {
    dividendIncome: DividendIncomeForPeriod
    /** Lifetime cumulative gain/loss (`investments.service.getPortfolioOverview`'s
     * `totalGainLoss`) — deliberately labeled "cumulative since acquisition,"
     * never a "this year"/"realized" figure, per reports.md's own explicit
     * framing (this product tracks no tax-lot/realized-gain detail). */
    cumulativeGainLoss: number
  } | null
}

/** Report 4 — Income Report (reports.md §4). */
export interface IncomeReportData extends ReportMeta {
  type: "INCOME"
  monthlyTrend: IncomeGrowthPoint[]
  bySource: IncomeSourceEntry[]
  streams: ReportIncomeStreamActivity[]
  /** `true` when the user has zero active Recurring Income streams — drives
   * reports.md's own "a plain note that no income sources are individually
   * tracked yet" edge case (the total/by-source sections still render in
   * full via the `"UNTRACKED"` bucket regardless). */
  hasStreams: boolean
}

/** Report 5 — Expense Report (reports.md §5). */
export interface ExpenseReportData extends ReportMeta {
  type: "EXPENSE"
  monthlyTrend: { month: string; expenses: number }[]
  byCategory: ExpenseDistributionEntry[]
  topMerchants: TopMerchant[]
  largestPurchases: LargestPurchase[]
}

/** Report 6 — Cash Flow Report (reports.md §6). */
export interface CashFlowReportData extends ReportMeta {
  type: "CASH_FLOW"
  monthlyTrend: ReportMonthlyTrendPoint[]
  /** Running sum of `monthlyTrend[i].cashFlow` across the period, one entry
   * per month, in the same chronological order as `monthlyTrend`. */
  cumulativeCashFlow: number[]
  /** The average of every non-`null` `monthlyTrend[i].savingsRate` value —
   * `null` when every month in the period had `$0` income (nothing to
   * average), mirroring the same "excluded, not zeroed" rule the per-month
   * values themselves already follow (reports.md's own explicit restatement
   * of `dashboard-overview.md` AC6 / `analytics.md`'s edge cases). */
  averageSavingsRate: number | null
}

/** The full discriminated union of every report type's assembled data —
 * `server/render.ts`'s single dispatch parameter. */
export type ReportData =
  | MonthlyReportData
  | YearlyReportData
  | TaxSummaryReportData
  | IncomeReportData
  | ExpenseReportData
  | CashFlowReportData
