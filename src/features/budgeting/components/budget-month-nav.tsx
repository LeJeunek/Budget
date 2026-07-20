"use client"

/**
 * BudgetMonthNav — thin Client Component wrapper that drives the
 * domain-agnostic `MonthNavigator` (`components/shared/month-navigator.tsx`)
 * from this page's `?month=YYYY-MM` search param, per that component's own
 * JSDoc ("Budgeting drives it from a `?month=YYYY-MM` search param...").
 *
 * `app/(dashboard)/budgeting/page.tsx` is a Server Component (it needs to
 * call `getBudgetMonth`/`getBudgetHealthScore` directly), so it cannot own
 * `onMonthChange` state itself — this wrapper is the smallest possible
 * Client boundary needed to bridge `MonthNavigator`'s controlled-component
 * API to a URL update. Pushing a new `?month=` search param (rather than
 * lifting local state) re-runs the Server Component page with the new
 * month, matching this app's existing "URL is the source of truth for
 * server-fetched data" convention (see e.g. `transactions-client.tsx`'s
 * `router.refresh()` pattern for the same "let the server re-fetch" idea).
 *
 * Preserves any other existing search params rather than overwriting the
 * whole query string, so this stays safe to reuse if this page ever grows
 * additional URL-driven state later.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { MonthNavigator } from "@/components/shared/month-navigator"

export interface BudgetMonthNavProps {
  /** Currently displayed month, `"YYYY-MM"` — mirrors the server-resolved
   * value `page.tsx` already parsed from `searchParams`, so this component
   * never re-derives "today" independently of the page it's rendered in. */
  month: string
}

export function BudgetMonthNav({ month }: BudgetMonthNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleMonthChange(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("month", nextMonth)
    router.push(`${pathname}?${params.toString()}`)
  }

  return <MonthNavigator month={month} onMonthChange={handleMonthChange} />
}
