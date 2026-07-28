import {
  formatDateKey,
  resolveMonthKeyRange,
  resolveReportingPeriodRange,
} from "@/features/analytics/server/period"
import type { ReportingPeriod } from "@/features/analytics/types"

import type { GenerateReportRequest, ReportPeriodView, ResolvedReportPeriod } from "../types"

/**
 * Reports' own period resolver, per phase-4b-technical-design.md §3's
 * `period.ts` module doc: "Delegates to `features/analytics/server/period.ts`'s
 * existing `resolveReportingPeriodRange` for the four shared presets ...
 * reused verbatim, never reimplemented — and handles the two cases Analytics
 * has no equivalent of directly: a single calendar month (Monthly Report)
 * and a single calendar year (Yearly/Tax Summary), plus the custom start/end
 * range extension."
 *
 * PURE — no Prisma, no `getCurrentUser()`. `now` is always injectable
 * (defaulting to `new Date()`), matching every other period-resolution
 * function in this codebase (`resolveReportingPeriodRange`,
 * `resolveMonthKeyRange`, `resolveRangeStart`) for deterministic testing.
 */

/** UTC midnight for the given year/month(0-indexed)/day — matching every
 * other module's identical `utcDate`/`utcMonthStart` helper (risk-register.md
 * #8's UTC-calendar-date convention). */
function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

function utcToday(now: Date): Date {
  return utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

/** A resolved period plus its display `label`/`isPartial` flag — the shape
 * every data assembler (`server/data/*.ts`) receives as its `period`
 * parameter. */
export type ResolvedPeriod = ResolvedReportPeriod & { label: string; isPartial: boolean }

/**
 * Discriminates a resolved period from reports.md's own "a user requests a
 * future period that hasn't started yet" edge case: "not offered as a
 * selectable option in the period picker; if requested anyway ... the system
 * responds with a plain 'this period hasn't happened yet' message rather
 * than generating an empty or fabricated report." `server/service.ts` maps
 * `{ status: "future" }` to a plain `ApiResult` validation failure — never a
 * thrown error used for control flow, matching this codebase's established
 * Result-type convention (`AiFeatureResult`, `ReportPeriodResolution` here
 * following the identical shape).
 */
export type ReportPeriodResolution = { status: "ok"; period: ResolvedPeriod } | { status: "future" }

const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** `"June 2026"` — the Monthly Report's header label (before any "(Month to
 * Date)" suffix, which `pdf/document-shell.tsx` appends itself from
 * `isPartial`, keeping "what the label says" and "whether it's partial" two
 * independently-testable concerns rather than one string-formatting
 * function responsible for both). */
function monthLabel(monthDate: Date): string {
  return MONTH_NAME_FORMATTER.format(monthDate)
}

/** `"yyyy-MM"` for a UTC month-start `Date` — a small, local duplicate of
 * `features/analytics/server/period.ts`'s `formatMonthKey` (re-exported by
 * that file, but re-declaring this one-line UTC-getter formatter here avoids
 * a second import purely for a one-line date-string helper this file also
 * needs for its own `parseReportMonth` inverse). */
function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Asserts a resolved period has a concrete `start` — true by construction for
 * every Monthly/Yearly/Tax Summary period (`resolveMonthlyReportPeriod`/
 * `resolveYearlyReportPeriod` never produce a `null` start; only
 * `resolveFlexibleReportPeriod`'s "All Time" preset can). Data assemblers for
 * those three report types need a concrete `Date` to build their own
 * per-month loops — this is a defensive guard documenting that invariant,
 * not the primary validation path, mirroring `dashboard.server/validation.ts`'s
 * `parseMonthToDate` ("callers are expected to have already validated ...
 * this is a defensive guard, not the primary validation path").
 */
export function assertConcretePeriodStart(period: ResolvedReportPeriod): Date {
  if (period.start === null) {
    throw new Error("Expected a concrete period start (Monthly/Yearly/Tax Summary report)")
  }
  return period.start
}

/** Parses a `"YYYY-MM"` string (already validated by
 * `server/validation.ts`'s `MonthParamSchema`) into its UTC first-of-month
 * `Date`. */
export function parseReportMonth(month: string): Date {
  const [yearStr, monthStr] = month.split("-")
  return utcDate(Number(yearStr), Number(monthStr) - 1, 1)
}

/** Resolves the Monthly Report's period (reports.md §1: "a single calendar
 * month, past or current"). Reuses `resolveMonthKeyRange` for the exact same
 * "current month clamps its `end` to today" rule Dashboard/Analytics already
 * apply, so the Monthly Report's own MTD framing can never disagree with the
 * Dashboard's. */
export function resolveMonthlyReportPeriod(
  month: string,
  now: Date = new Date(),
): ReportPeriodResolution {
  const monthDate = parseReportMonth(month)
  const today = utcToday(now)
  const currentMonthStart = utcDate(today.getUTCFullYear(), today.getUTCMonth(), 1)

  if (monthDate.getTime() > currentMonthStart.getTime()) {
    return { status: "future" }
  }

  const isPartial = monthDate.getTime() === currentMonthStart.getTime()
  const { start, end } = resolveMonthKeyRange(formatMonthKey(monthDate), now)

  return {
    status: "ok",
    period: { start, end, label: monthLabel(monthDate), isPartial },
  }
}

/** Resolves a single calendar year's period — shared by the Yearly and Tax
 * Summary Report types (reports.md §2/§3 both select "a single calendar
 * year, past or current[-to-date]"). `end` clamps to today for the current
 * year (year-to-date), matching `resolveMonthKeyRange`'s identical
 * current-period clamping rule. */
export function resolveYearlyReportPeriod(
  year: number,
  now: Date = new Date(),
): ReportPeriodResolution {
  const today = utcToday(now)
  const currentYear = today.getUTCFullYear()

  if (year > currentYear) {
    return { status: "future" }
  }

  const isPartial = year === currentYear
  const start = utcDate(year, 0, 1)
  const lastDayOfYear = utcDate(year, 11, 31)
  const end = isPartial ? today : lastDayOfYear

  return {
    status: "ok",
    period: { start, end, label: String(year), isPartial },
  }
}

const PRESET_LABELS: Record<ReportingPeriod, string> = {
  THIS_YEAR: "This Year",
  LAST_12_MONTHS: "Last 12 Months",
  YEAR_TO_DATE: "Year to Date",
  ALL_TIME: "All Time",
}

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** Resolves the Income/Expense/Cash Flow report types' shared period control
 * — either one of Analytics' four presets (delegated to
 * `resolveReportingPeriodRange` verbatim, per this file's own module doc) or
 * a custom `[start, end]` range (reports.md's own explicit extension).
 *
 * A custom range's `start` in the future is the only reachable "future
 * period" case here (a preset's own `end` is always clamped to `now` by
 * `resolveReportingPeriodRange` itself, so no preset can ever resolve to a
 * wholly future period) — mirrors the Monthly/Yearly resolvers' identical
 * check.
 */
export function resolveFlexibleReportPeriod(
  input: { kind: "PRESET"; preset: ReportingPeriod } | { kind: "CUSTOM"; start: Date; end: Date },
  now: Date = new Date(),
): ReportPeriodResolution {
  if (input.kind === "PRESET") {
    const range = resolveReportingPeriodRange(input.preset, now)
    return {
      status: "ok",
      period: {
        start: range.start,
        end: range.end,
        label: PRESET_LABELS[input.preset],
        isPartial: input.preset === "YEAR_TO_DATE",
      },
    }
  }

  const today = utcToday(now)
  if (input.start.getTime() > today.getTime()) {
    return { status: "future" }
  }

  // A custom range's `end` may legitimately extend past today (e.g. a range
  // picked before the current month closed) — clamped the same way every
  // other "current period" resolution in this module is, so a report never
  // implies data exists for days that haven't happened yet.
  const end = input.end.getTime() > today.getTime() ? today : input.end

  return {
    status: "ok",
    period: {
      start: input.start,
      end,
      label: `${DATE_LABEL_FORMATTER.format(input.start)} – ${DATE_LABEL_FORMATTER.format(end)}`,
      isPartial: false,
    },
  }
}

/**
 * The single entry point `server/service.ts` calls — dispatches to the
 * matching resolver above by `request.type`, per
 * phase-4b-technical-design.md §3's `resolveReportPeriod(input:
 * ReportPeriodInput)` signature (this feature's `GenerateReportRequest`
 * doubles as that `ReportPeriodInput`, since every variant already carries
 * exactly its own period fields — see `../types.ts`'s doc on that type).
 */
export function resolveReportPeriod(
  request: GenerateReportRequest,
  now: Date = new Date(),
): ReportPeriodResolution {
  switch (request.type) {
    case "MONTHLY":
      return resolveMonthlyReportPeriod(request.month, now)
    case "YEARLY":
    case "TAX_SUMMARY":
      return resolveYearlyReportPeriod(request.year, now)
    case "INCOME":
    case "EXPENSE":
    case "CASH_FLOW":
      return resolveFlexibleReportPeriod(request.period, now)
    default: {
      const exhaustive: never = request
      throw new Error(`Unhandled report request type: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Converts a resolved period into the template-safe `ReportPeriodView`
 * (`"yyyy-MM-dd"` strings, never a raw `Date`) — `server/service.ts` calls
 * this once, after `resolveReportPeriod` and before building each report
 * type's `ReportMeta`. */
export function toReportPeriodView(
  period: ResolvedReportPeriod & { label: string; isPartial: boolean },
): ReportPeriodView {
  return {
    start: period.start ? formatDateKey(period.start) : null,
    end: formatDateKey(period.end),
    label: period.label,
    isPartial: period.isPartial,
  }
}
