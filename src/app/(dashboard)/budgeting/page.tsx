import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getCategories } from "@/features/categories/server/service"
import {
  getBudgetHealthScore,
  getBudgetMonth,
} from "@/features/budgeting/server/service"
import {
  currentMonthString,
  formatMonthLabel,
} from "@/components/shared/month-navigator"
import { BudgetMonthNav } from "@/features/budgeting/components/budget-month-nav"
import { BudgetSummaryCards } from "@/features/budgeting/components/budget-summary-cards"
import { BudgetHealthScoreBadge } from "@/features/budgeting/components/budget-health-score-badge"
import { BudgetCategoryRow } from "@/features/budgeting/components/budget-category-row"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Budgeting planner page (docs/product/budgeting.md) — replaces the Phase 0
 * placeholder now that Budgeting's schema/service/actions and every
 * component it needs (`BudgetCategoryRow`, `BudgetSummaryCards`,
 * `BudgetHealthScoreBadge`, `BudgetMonthNav`) exist.
 *
 * A Server Component: resolves the authenticated user and the target month,
 * then fetches `getBudgetMonth`/`getBudgetHealthScore` (both Server-
 * Component-callable per docs/architecture/api-contracts.md's Budgeting
 * section — no REST route/TanStack Query hook exists for these reads) in
 * parallel via `Promise.all`, alongside `getCategories` (needed only for its
 * `color` field — `BudgetCategoryLine` deliberately doesn't carry `color`
 * itself, per `types.ts`'s own comment and `BudgetCategoryRow`'s JSDoc).
 *
 * Next.js 15's `searchParams` page prop is a `Promise` (not a plain object)
 * — this must be `await`ed before reading `month` off it. Defaults to
 * `currentMonthString()` (this UTC-first-of-month convention is shared with
 * `MonthNavigator` and `server/validation.ts`'s own `currentMonthStart`, so
 * "today" never disagrees between server and client here) when the search
 * param is absent, e.g. a fresh visit to `/budgeting` with no `?month=`.
 */

export interface BudgetingPageProps {
  searchParams: Promise<{ month?: string }>
}

// Matches `Category.color`'s own DB default (prisma/schema.prisma) — used
// for the rare historical "Deleted category" line, whose id (a
// `service.ts`-internal sentinel, never exported) never appears in the live
// `categories` list this page fetches, so a plain "not found in the color
// map" fallback is used rather than coupling this file to that internal
// sentinel format.
const FALLBACK_CATEGORY_COLOR = "#94a3b8"

export default async function BudgetingPage({
  searchParams,
}: BudgetingPageProps) {
  const user = await getCurrentUser()

  // Defensive only: `app/(dashboard)/layout.tsx` already redirects
  // unauthenticated visitors before this route renders — see
  // `(dashboard)/page.tsx`'s identical guard for the same rationale.
  if (!user) {
    redirect("/login")
  }

  const resolvedSearchParams = await searchParams
  const month = resolvedSearchParams.month ?? currentMonthString()

  const [budgetMonth, healthScore, categories] = await Promise.all([
    getBudgetMonth(user.id, month),
    getBudgetHealthScore(user.id, month),
    getCategories(user.id),
  ])

  const colorByCategoryId = new Map(
    categories.map((category) => [category.id, category.color]),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Budgeting
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan and track your monthly spending, category by category.
          </p>
        </div>
        <BudgetMonthNav month={month} />
      </div>

      {/* AC3: past months are read-only history — a banner rather than a
          silent disabled state, so it's unmistakable why every input below
          (when there is data to show at all) is non-interactive. */}
      {!budgetMonth.isEditable && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Badge variant="secondary">Read-only</Badge>
          <span>
            Viewing {formatMonthLabel(month)} — past months show what was
            actually planned and spent, and can&apos;t be edited.
          </span>
        </div>
      )}

      {!budgetMonth.hasAnyBudgetData ? (
        // Edge Case: "Viewing a past month that has no budget history at
        // all" — an explicit empty state, never a blank/zeroed table that
        // could be misread as "the user allocated nothing on purpose."
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-base font-medium text-foreground">
              No budget was set for {formatMonthLabel(month)}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This past month has no budget history to show.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <BudgetSummaryCards
              totals={budgetMonth.totals}
              uncategorizedSpent={budgetMonth.uncategorizedSpent}
            />
            <BudgetHealthScoreBadge score={healthScore} />
          </div>

          <Card>
            <CardContent>
              {budgetMonth.categories.length === 0 ? (
                // Edge Cases: "A user with only system categories and no
                // custom ones" still always has 11 lines, so an empty
                // `categories` array here would mean the user has no
                // categories at all — not reachable in normal use (system
                // categories are seeded per-user), kept as a defensive
                // fallback rather than an assumed-unreachable crash.
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No categories to budget yet.
                </p>
              ) : (
                <div className="flex flex-col">
                  {budgetMonth.categories.map((line) => (
                    <BudgetCategoryRow
                      key={line.categoryId}
                      month={month}
                      line={line}
                      color={
                        colorByCategoryId.get(line.categoryId) ??
                        FALLBACK_CATEGORY_COLOR
                      }
                      isEditable={budgetMonth.isEditable}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
