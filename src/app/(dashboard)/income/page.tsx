import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getExpectedUpcomingIncome, getIncomeStreams } from "@/features/recurring-income/server/service"

import { IncomeClient } from "./income-client"

/**
 * Recurring Income — the list-view landing page for this feature
 * (docs/architecture/folder-tree.md's Phase 3a tree: `app/(dashboard)/
 * income/page.tsx`; nav placement decided in
 * `components/shared/sidebar.tsx`, see its inline comment).
 *
 * A Server Component: fetches every list this page can show directly via
 * `service.*` per docs/architecture/api-contracts.md's "Server Component
 * direct call" rows, then hands the results to `IncomeClient` (the Client
 * Component owning the Active/Archived tabs + dialogs) — same split as
 * `app/(dashboard)/bills/page.tsx` + `bills-client.tsx`.
 *
 * Unlike Bills, there is no `?view=list|calendar` toggle here —
 * api-contracts.md's Calendar v1 section explicitly confirms Recurring
 * Income's occurrences are out of scope for Calendar v1 this phase, and
 * recurring-income.md's own ACs never ask for a calendar view, only a list
 * (AC4) plus the separate expected-upcoming-income total (AC10) — so this
 * page is deliberately simpler than Bills' list/calendar split, not a
 * missing feature.
 */
export default async function IncomePage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const [activeStreams, archivedStreams, expectedUpcomingIncome] = await Promise.all([
    getIncomeStreams(user.id),
    getIncomeStreams(user.id, { includeArchived: true }),
    getExpectedUpcomingIncome(user.id, { period: "this-month" }),
  ])

  return (
    <IncomeClient
      activeStreams={activeStreams}
      archivedStreams={archivedStreams}
      expectedUpcomingIncome={expectedUpcomingIncome}
    />
  )
}
