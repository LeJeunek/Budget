"use client"

/**
 * ReportingPeriodSelector — Analytics' shared reporting-period control
 * (analytics.md AC2, api-contracts.md's "?period=this-year|last-12-months|
 * year-to-date|all-time" searchParam). Drives every period-aware metric on
 * `app/(dashboard)/analytics/page.tsx` at once, the same "URL is the source
 * of truth for server-fetched data" pattern
 * `features/budgeting/components/budget-month-nav.tsx` established for
 * Budgeting's `?month=` control.
 *
 * `app/(dashboard)/analytics/page.tsx` is a Server Component (it resolves
 * the period and calls every metric's `server/*.ts` function directly), so
 * it can't own the Tabs' `onValueChange` state itself — this is the smallest
 * Client boundary needed to push a new `?period=` search param. Every
 * period-aware metric re-fetches together on navigation (a full Server
 * Component re-render), which is the correct behavior here: analytics.md AC2
 * is explicit that the control is shared across every metric with a time
 * dimension, not an independent per-card selector.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { ReportingPeriod } from "@/features/analytics/types"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** Kebab-case URL value <-> `ReportingPeriod` enum <-> display label, per
 * `server/validation.ts`'s `ReportingPeriodSchema` (the one parse boundary
 * this component's `param` values must exactly match). */
const PERIOD_OPTIONS: { value: ReportingPeriod; param: string; label: string }[] = [
  { value: "THIS_YEAR", param: "this-year", label: "This Year" },
  { value: "YEAR_TO_DATE", param: "year-to-date", label: "Year to Date" },
  { value: "LAST_12_MONTHS", param: "last-12-months", label: "Last 12 Months" },
  { value: "ALL_TIME", param: "all-time", label: "All Time" },
]

export interface ReportingPeriodSelectorProps {
  /** The already-resolved period, mirrored from `page.tsx`'s own parse of
   * the search param — this component never re-derives the default
   * independently of the page it's rendered in (same convention as
   * `BudgetMonthNav`'s `month` prop). */
  period: ReportingPeriod
}

export function ReportingPeriodSelector({ period }: ReportingPeriodSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handlePeriodChange(nextPeriod: ReportingPeriod) {
    const nextOption = PERIOD_OPTIONS.find((option) => option.value === nextPeriod)
    if (!nextOption) {
      return
    }

    // Preserves any other existing search params rather than overwriting the
    // whole query string, matching `BudgetMonthNav`'s identical rationale.
    const params = new URLSearchParams(searchParams.toString())
    params.set("period", nextOption.param)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Tabs value={period} onValueChange={(value) => handlePeriodChange(value as ReportingPeriod)}>
      <TabsList>
        {PERIOD_OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
