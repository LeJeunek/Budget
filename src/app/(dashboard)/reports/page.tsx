import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"

import { ReportsClient } from "./reports-client"

/**
 * Reports — docs/product/reports.md's six on-demand PDF report types
 * (Monthly, Yearly, Tax Summary, Income, Expense, Cash Flow).
 *
 * A thin Server Component: only the standing auth guard (mirrors every
 * other dashboard `page.tsx`'s defensive `getCurrentUser`/`redirect` check —
 * `app/(dashboard)/layout.tsx` already redirects unauthenticated visitors
 * before this route renders, same rationale as e.g.
 * `financial-health-score/page.tsx`'s identical guard). Unlike every other
 * feature page in this codebase, this page fetches no data of its own: per
 * docs/architecture/api-contracts.md's Phase 4b Reports row, report
 * generation has no "list my past reports" read at all — Reports produces
 * no persisted row (reports.md Cross-Cutting Requirement #4's "a report
 * reflects a live snapshot at generation time, not a persisted, permanent
 * artifact"). The only read this feature ever performs is `GET
 * /api/reports` itself, triggered on demand by a click inside
 * `ReportsClient`, never by this page's own render.
 */
export default async function ReportsPage() {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  return <ReportsClient />
}
