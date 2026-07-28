import { z } from "zod"

import type { FlexiblePeriodInput, GenerateReportRequest } from "../types"

/**
 * `GenerateReportRequestSchema` — validates `GET /api/reports`'s query
 * string, per docs/architecture/api-contracts.md's Phase 4b Reports row and
 * phase-4b-technical-design.md §3's `validation.ts` module doc. Every query
 * param arrives as a raw string (or `undefined`); this schema's job is
 * turning that into the strongly-typed `GenerateReportRequest` discriminated
 * union `server/period.ts` and `server/service.ts` consume, per this
 * codebase's "Zod at every boundary" convention.
 *
 * `type`'s wire values are `kebab-case` (naming-standards.md's URL-searchParam
 * convention, matching Analytics' `?period=this-year|...` precedent exactly)
 * — mapped to the internal `SCREAMING_CASE` `ReportType` union here, the same
 * `PARAM_TO_ENUM` map shape `features/analytics/server/validation.ts`'s
 * `ReportingPeriodSchema` already established.
 *
 * Unlike `ReportingPeriodSchema` (which defaults leniently for a stale/
 * missing URL param, since it backs a page's own searchParam), every branch
 * below **rejects** outright on a missing/malformed value — `GET /api/reports`
 * is a click-triggered fetch with a client that always supplies a complete,
 * well-formed query string (mirroring `NetWorthHistoryRangeSchema`'s "a
 * missing/invalid value here is always a genuine client bug" reasoning) —
 * never a page load that must render something anyway.
 */

// ---------------------------------------------------------------------------
// Shared param primitives
// ---------------------------------------------------------------------------

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `"YYYY-MM"` — reports.md's Monthly Report period selector. Deliberately a
 * small, standalone duplicate of `dashboard.server/validation.ts`'s
 * `MonthSchema` (identical regex) rather than a cross-import — per that
 * file's own JSDoc, "`features/<domain>/server` modules do not cross-import
 * each other's validation internals in this codebase; this small duplication
 * is the established, deliberate alternative." */
const MonthParamSchema = z
  .string({ error: "month is required for a monthly report" })
  .regex(MONTH_PATTERN, "month must be in YYYY-MM format")

/** `"YYYY"`, coerced to a number — reports.md's Yearly/Tax Summary Report
 * period selector. Bounded to a plausible range (not just "any positive
 * integer") as a defensive parse guard — the real "is this year in the
 * future" check is `server/period.ts`'s job (reports.md's own "this period
 * hasn't happened yet" edge case), not this schema's; this bound only
 * rejects obviously-malformed input (e.g. `year=99999999`) before it ever
 * reaches a `Date.UTC` call. */
const YearParamSchema = z.coerce
  .number({ error: "year is required for this report type" })
  .int("year must be a whole number")
  .min(1970, "year is out of range")
  .max(2999, "year is out of range")

/** `"YYYY-MM-DD"` — the Income/Expense/Cash Flow report types' custom
 * date-range extension. Parsed as a validated string first (not directly via
 * `z.coerce.date()`, which would also accept e.g. a bare `"2026"` or an
 * ISO-with-time string) and converted to a UTC-midnight `Date` in this
 * schema's own `.transform`, matching this codebase's established
 * `Date.UTC`-only calendar-date convention (risk-register.md #8) — never the
 * local-timezone `new Date(string)` constructor. */
const DateParamSchema = z
  .string()
  .regex(DATE_PATTERN, "date must be in YYYY-MM-DD format")
  .transform((value) => {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, day))
  })

// ---------------------------------------------------------------------------
// Income/Expense/Cash Flow's shared "preset OR custom range" period param
// ---------------------------------------------------------------------------

const PERIOD_PRESET_PARAM_TO_ENUM = {
  "this-year": "THIS_YEAR",
  "last-12-months": "LAST_12_MONTHS",
  "year-to-date": "YEAR_TO_DATE",
  "all-time": "ALL_TIME",
} as const

/**
 * Risk #22 (phase-4b-technical-design.md §8): the custom start/end range
 * "has no natural upper bound the way Analytics' four existing presets do
 * ... an adversarial or malformed request can't trigger an unbounded
 * aggregation query." Ten years is a generous bound for any real report a
 * user would actually request (reports.md's own Yearly/Tax Summary Report
 * types already cover the single-calendar-year case; a custom range wider
 * than a decade has no plausible "hand this to an accountant/archive this"
 * use case) while still being far larger than this codebase's own
 * "thousands, not millions of rows per user" scale assumption could turn
 * into a genuinely expensive query — a defensive ceiling, not a product
 * requirement, mirroring `features/analytics/server/validation.ts`'s
 * `MAX_TOP_N_LIMIT`'s identical "implementation-level safety rail" framing.
 */
const MAX_CUSTOM_RANGE_DAYS = 3653 // 10 years, inclusive of leap days
const MS_PER_DAY = 24 * 60 * 60 * 1000

const FlexiblePeriodParamsSchema = z
  .object({
    period: z.enum(Object.keys(PERIOD_PRESET_PARAM_TO_ENUM) as [string, ...string[]]).optional(),
    start: DateParamSchema.optional(),
    end: DateParamSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasPreset = value.period !== undefined
    const hasRange = value.start !== undefined || value.end !== undefined

    if (hasPreset && hasRange) {
      ctx.addIssue({
        code: "custom",
        message: "Supply either ?period= or ?start=/&end=, never both",
      })
      return
    }

    if (!hasPreset && !hasRange) {
      ctx.addIssue({
        code: "custom",
        message: "A period preset or a custom start/end range is required",
      })
      return
    }

    if (hasRange) {
      if (value.start === undefined || value.end === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "A custom range requires both start and end",
        })
        return
      }
      if (value.end.getTime() < value.start.getTime()) {
        ctx.addIssue({ code: "custom", message: "end must be on or after start" })
        return
      }
      const rangeDays = (value.end.getTime() - value.start.getTime()) / MS_PER_DAY
      if (rangeDays > MAX_CUSTOM_RANGE_DAYS) {
        ctx.addIssue({
          code: "custom",
          message: `Custom range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days`,
        })
      }
    }
  })
  .transform((value): FlexiblePeriodInput => {
    if (value.period) {
      return {
        kind: "PRESET",
        preset:
          PERIOD_PRESET_PARAM_TO_ENUM[value.period as keyof typeof PERIOD_PRESET_PARAM_TO_ENUM],
      }
    }
    // `superRefine` above already guarantees both are set on this branch.
    return { kind: "CUSTOM", start: value.start as Date, end: value.end as Date }
  })

// ---------------------------------------------------------------------------
// The full discriminated union, keyed on the raw `?type=` kebab-case value
// ---------------------------------------------------------------------------

const REPORT_TYPE_PARAMS = [
  "monthly",
  "yearly",
  "tax-summary",
  "income",
  "expense",
  "cash-flow",
] as const

/** The raw shape every query param arrives in — every field a plain,
 * possibly-`undefined` string, since `URLSearchParams.get` never returns
 * anything else. `server/validation.ts`'s own `parseGenerateReportRequest`
 * (below) is the one place a Route Handler ever needs to touch. */
export interface RawReportQueryParams {
  type?: string
  month?: string
  year?: string
  period?: string
  start?: string
  end?: string
}

const GenerateReportRequestObjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("monthly"), month: MonthParamSchema }),
  z.object({ type: z.literal("yearly"), year: YearParamSchema }),
  z.object({ type: z.literal("tax-summary"), year: YearParamSchema }),
  z.object({
    type: z.literal("income"),
    period: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  z.object({
    type: z.literal("expense"),
    period: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  z.object({
    type: z.literal("cash-flow"),
    period: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
])

/**
 * Parses `GET /api/reports`'s raw query params into a `GenerateReportRequest`,
 * per api-contracts.md's `?type=monthly&month=YYYY-MM` / `?type=yearly&year=YYYY`
 * / `?type=income|expense|cash-flow&period=...` / `?type=income|expense|
 * cash-flow&start=...&end=...` contract. Returns a Zod `SafeParseReturnType`
 * so `app/api/reports/route.ts` can surface the first validation issue as an
 * ordinary `ApiResult<never>` 400, matching every other Route Handler's
 * "safeParse, map the first issue to a plain string" convention.
 *
 * The three flexible-period types (`income`/`expense`/`cash-flow`) re-parse
 * their own `period`/`start`/`end` fields through `FlexiblePeriodParamsSchema`
 * in a second pass (rather than inlining that schema three times in
 * `GenerateReportRequestObjectSchema`'s discriminated union) — `z.
 * discriminatedUnion` requires every member to be a plain `z.object`, not a
 * `.superRefine`-wrapped one, so the shared preset-vs-range validation/
 * transform logic lives in exactly one place and is applied identically to
 * all three types after the outer discriminant has already resolved which
 * type-specific object shape applies.
 */
export function parseGenerateReportRequest(
  params: RawReportQueryParams,
): { success: true; data: GenerateReportRequest } | { success: false; error: string } {
  const parsedType = z.enum(REPORT_TYPE_PARAMS).safeParse(params.type)
  if (!parsedType.success) {
    return {
      success: false,
      error: `type must be one of: ${REPORT_TYPE_PARAMS.join(", ")}`,
    }
  }

  const outer = GenerateReportRequestObjectSchema.safeParse(params)
  if (!outer.success) {
    return { success: false, error: outer.error.issues[0]?.message ?? "Invalid report request" }
  }

  const value = outer.data

  switch (value.type) {
    case "monthly":
      return { success: true, data: { type: "MONTHLY", month: value.month } }
    case "yearly":
      return { success: true, data: { type: "YEARLY", year: value.year } }
    case "tax-summary":
      return { success: true, data: { type: "TAX_SUMMARY", year: value.year } }
    case "income":
    case "expense":
    case "cash-flow": {
      const flexible = FlexiblePeriodParamsSchema.safeParse({
        period: value.period,
        start: value.start,
        end: value.end,
      })
      if (!flexible.success) {
        return {
          success: false,
          error: flexible.error.issues[0]?.message ?? "Invalid report period",
        }
      }
      const reportType = value.type === "cash-flow" ? "CASH_FLOW" : value.type.toUpperCase()
      return {
        success: true,
        data: { type: reportType as "INCOME" | "EXPENSE" | "CASH_FLOW", period: flexible.data },
      }
    }
    default: {
      const exhaustive: never = value
      throw new Error(`Unhandled report type param: ${String(exhaustive)}`)
    }
  }
}
