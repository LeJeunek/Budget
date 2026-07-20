import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getCategories } from "@/features/categories/server/service"
import {
  getBills,
  getCalendarMonth,
  getUpcomingOccurrences,
} from "@/features/bills/server/service"
import { currentMonthString } from "@/components/shared/month-navigator"

import { BillsClient } from "./bills-client"

/**
 * Bills — replaces the Phase 0 placeholder now that the Bill/BillOccurrence
 * models and their server module exist (docs/planning/roadmap.md Phase 2).
 *
 * A Server Component: fetches every list this page can show directly via
 * `service.*` per docs/architecture/api-contracts.md ("Server Component
 * direct call"), then hands the results to `BillsClient` (the Client
 * Component that owns the interactive Tabs/dialogs) — same split as
 * `app/(dashboard)/transactions/page.tsx` + `transactions-client.tsx`.
 *
 * `?view=list|calendar&month=YYYY-MM` (folder-tree.md's documented URL
 * shape) drives which data this fetches: the calendar view additionally
 * needs `getCalendarMonth` for the requested month, which the list view
 * never touches — avoiding an unconditional third query on every page load.
 * `BillsClient` updates these search params (via `router.push`) when the
 * user switches tabs or steps the calendar's month, which re-runs this
 * Server Component with the new params — there is no client-side calendar
 * data hook for this feature (mirrors `getBills`/`getUpcomingOccurrences`'s
 * own "Server Component direct call" convention).
 *
 * Next.js 15's `searchParams` prop is a Promise (must be awaited) — see
 * https://nextjs.org/docs/app/api-reference/file-conventions/page.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const params = await searchParams
  const view = params.view === "calendar" ? "calendar" : "list"
  const month = params.month && MONTH_PATTERN.test(params.month) ? params.month : currentMonthString()

  const [activeBills, archivedBills, upcoming, categories, calendarDays] = await Promise.all([
    getBills(user.id),
    getBills(user.id, { includeArchived: true }),
    getUpcomingOccurrences(user.id),
    getCategories(user.id),
    view === "calendar" ? getCalendarMonth(user.id, month) : Promise.resolve(null),
  ])

  return (
    <BillsClient
      view={view}
      month={month}
      activeBills={activeBills}
      archivedBills={archivedBills}
      upcoming={upcoming}
      categories={categories}
      calendarDays={calendarDays}
    />
  )
}
