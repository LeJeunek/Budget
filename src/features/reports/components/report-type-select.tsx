"use client"

/**
 * <ReportTypeSelect> — the report generator's type + period picker
 * (docs/product/reports.md's "select a report type ... then select the
 * period that report type requires"). Fully controlled: the parent
 * (`app/(dashboard)/reports/reports-client.tsx`) owns the
 * `ReportSelectionState` this component reads/writes, so
 * `<ReportDownloadButton>` can consume the same resolved
 * `GenerateReportRequest` (via `resolveReportRequest`, below) without either
 * component needing to know about the other directly.
 *
 * Built entirely from already-installed primitives (`Select`, `Input`,
 * `Label`) plus native `<input type="month"|"date">` controls — no new
 * shadcn primitive was added, per the Frontend Lead's "assemble, never
 * build reusable components" mandate. A native month/date input was chosen
 * over a custom calendar widget deliberately: it already returns exactly
 * the `"yyyy-MM"`/`"yyyy-MM-dd"` string shapes `server/validation.ts`'s
 * `MonthParamSchema`/`DateParamSchema` expect, with zero additional
 * component surface to build or maintain.
 *
 * Per-type period control, mirroring reports.md's own per-type rule:
 * - MONTHLY: a single month input, capped at the current month (reports.md's
 *   "not offered as a selectable option" future-period edge case). The
 *   current month is itself a valid, explicitly-labeled "month to date"
 *   selection (reports.md §1) — the cap only excludes months that haven't
 *   started yet.
 * - YEARLY / TAX_SUMMARY: a single year input, capped at the current year,
 *   same "current period allowed, future not" rule.
 * - INCOME / EXPENSE / CASH_FLOW: reuses Analytics' four shared
 *   reporting-period presets (the same kebab-case vocabulary
 *   `features/analytics/components/reporting-period-selector.tsx`'s own
 *   `PERIOD_OPTIONS` already establishes — duplicated here per
 *   `server/validation.ts`'s own "small, deliberate duplication" convention
 *   for this exact param vocabulary, since components-level code can't
 *   import that Server-Component-only validation module) plus a "Custom
 *   range" option revealing two date inputs — reports.md's explicit "a
 *   deliberate, minor extension beyond Analytics' own period control."
 */

import type { ReportingPeriod } from "@/features/analytics/types"
import type {
  FlexiblePeriodInput,
  GenerateReportRequest,
  ReportType,
} from "@/features/reports/types"
import { currentMonthString } from "@/components/shared/month-utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "MONTHLY", label: "Monthly Report" },
  { value: "YEARLY", label: "Yearly Report" },
  { value: "TAX_SUMMARY", label: "Tax Summary Report" },
  { value: "INCOME", label: "Income Report" },
  { value: "EXPENSE", label: "Expense Report" },
  { value: "CASH_FLOW", label: "Cash Flow Report" },
]

/** reports.md's per-type period-selection rule: MONTHLY/YEARLY/TAX_SUMMARY
 * each take a single month/year; INCOME/EXPENSE/CASH_FLOW share the
 * flexible preset-or-custom-range control below. */
const FLEXIBLE_PERIOD_TYPES = new Set<ReportType>(["INCOME", "EXPENSE", "CASH_FLOW"])

/** Same kebab-case <-> `ReportingPeriod` vocabulary as
 * `reporting-period-selector.tsx`'s own `PERIOD_OPTIONS` — see this file's
 * top JSDoc for why it's duplicated here rather than imported. */
const PRESET_OPTIONS: { value: ReportingPeriod; label: string }[] = [
  { value: "THIS_YEAR", label: "This Year" },
  { value: "YEAR_TO_DATE", label: "Year to Date" },
  { value: "LAST_12_MONTHS", label: "Last 12 Months" },
  { value: "ALL_TIME", label: "All Time" },
]

const CUSTOM_RANGE_VALUE = "CUSTOM"

function currentYear(): number {
  return new Date().getUTCFullYear()
}

/** `"yyyy-MM-dd"` for "now," used only as the custom-range date inputs'
 * `max` — reports.md's "a future period ... not offered as a selectable
 * option" edge case, extended to the custom range's own end boundary. */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The type + period selection this component owns — deliberately a *UI*
 * shape (every date a plain `"yyyy-MM"`/`"yyyy-MM-dd"` string, matching what
 * native `<input type="month"|"date">` controls read/write) distinct from
 * `GenerateReportRequest` (the resolved, typed shape `resolveReportRequest`
 * below produces once the selection is complete and valid). A custom range
 * with only one of `customStart`/`customEnd` filled in is a legitimate,
 * common mid-edit state this type must represent, which
 * `GenerateReportRequest` itself has no room for — hence the two distinct
 * types rather than one.
 */
export interface ReportSelectionState {
  type: ReportType
  month: string
  year: number
  periodMode: "PRESET" | "CUSTOM"
  preset: ReportingPeriod
  customStart: string
  customEnd: string
}

/** A safe, always-valid starting selection: the current month-to-date
 * Monthly Report, with the flexible-period fields defaulted to "This Year"
 * so switching to Income/Expense/Cash Flow never starts on an empty custom
 * range. */
export function createDefaultReportSelection(): ReportSelectionState {
  return {
    type: "MONTHLY",
    month: currentMonthString(),
    year: currentYear(),
    periodMode: "PRESET",
    preset: "THIS_YEAR",
    customStart: "",
    customEnd: "",
  }
}

function resolveFlexiblePeriod(state: ReportSelectionState): FlexiblePeriodInput | null {
  if (state.periodMode === "PRESET") {
    return { kind: "PRESET", preset: state.preset }
  }
  if (!state.customStart || !state.customEnd) {
    return null
  }
  const start = new Date(`${state.customStart}T00:00:00.000Z`)
  const end = new Date(`${state.customEnd}T00:00:00.000Z`)
  if (end.getTime() < start.getTime()) {
    return null
  }
  return { kind: "CUSTOM", start, end }
}

/**
 * Resolves the current selection into a `GenerateReportRequest`, or `null`
 * when the selection is incomplete/invalid (e.g. "Custom range" chosen but
 * one or both dates not filled in yet, or an end date before the start) —
 * mirrors `server/validation.ts`'s own range checks so
 * `<ReportDownloadButton>` never gets handed a request the API would just
 * reject anyway.
 */
export function resolveReportRequest(state: ReportSelectionState): GenerateReportRequest | null {
  const { type } = state

  switch (type) {
    case "MONTHLY":
      return state.month ? { type, month: state.month } : null
    case "YEARLY":
      return { type, year: state.year }
    case "TAX_SUMMARY":
      return { type, year: state.year }
    case "INCOME":
    case "EXPENSE":
    case "CASH_FLOW": {
      const period = resolveFlexiblePeriod(state)
      return period ? { type, period } : null
    }
    default: {
      const exhaustive: never = type
      throw new Error(`Unhandled report type: ${String(exhaustive)}`)
    }
  }
}

export interface ReportTypeSelectProps {
  value: ReportSelectionState
  onChange: (next: ReportSelectionState) => void
}

export function ReportTypeSelect({ value, onChange }: ReportTypeSelectProps) {
  const isFlexible = FLEXIBLE_PERIOD_TYPES.has(value.type)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-type">Report type</Label>
        <Select
          value={value.type}
          onValueChange={(nextType) => onChange({ ...value, type: nextType as ReportType })}
        >
          <SelectTrigger id="report-type" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPORT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.type === "MONTHLY" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-month">Month</Label>
          <Input
            id="report-month"
            type="month"
            className="w-full sm:w-64"
            max={currentMonthString()}
            value={value.month}
            onChange={(event) => onChange({ ...value, month: event.target.value })}
          />
        </div>
      )}

      {(value.type === "YEARLY" || value.type === "TAX_SUMMARY") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-year">Year</Label>
          <Input
            id="report-year"
            type="number"
            className="w-full sm:w-64"
            min={1970}
            max={currentYear()}
            value={value.year}
            onChange={(event) => {
              const raw = event.target.value
              const parsed = Number(raw)
              if (raw !== "" && Number.isFinite(parsed)) {
                onChange({ ...value, year: parsed })
              }
            }}
          />
        </div>
      )}

      {isFlexible && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-period">Period</Label>
            <Select
              value={value.periodMode === "CUSTOM" ? CUSTOM_RANGE_VALUE : value.preset}
              onValueChange={(nextValue) => {
                if (nextValue === CUSTOM_RANGE_VALUE) {
                  onChange({ ...value, periodMode: "CUSTOM" })
                  return
                }
                onChange({
                  ...value,
                  periodMode: "PRESET",
                  preset: nextValue as ReportingPeriod,
                })
              }}
            >
              <SelectTrigger id="report-period" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_RANGE_VALUE}>Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.periodMode === "CUSTOM" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-start">Start date</Label>
                <Input
                  id="report-start"
                  type="date"
                  max={value.customEnd || todayDateString()}
                  value={value.customStart}
                  onChange={(event) => onChange({ ...value, customStart: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-end">End date</Label>
                <Input
                  id="report-end"
                  type="date"
                  min={value.customStart || undefined}
                  max={todayDateString()}
                  value={value.customEnd}
                  onChange={(event) => onChange({ ...value, customEnd: event.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
