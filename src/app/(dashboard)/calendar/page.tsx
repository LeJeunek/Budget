import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getCalendarMonth } from "@/features/calendar/server/service"
import { hasAnyBills } from "@/features/bills/server/service"
import { hasAnyIncomeStreams } from "@/features/recurring-income/server/service"
import { currentMonthString } from "@/components/shared/month-utils"
import { CalendarGrid } from "@/features/calendar/components/calendar-grid"

/**
 * Calendar v2 (docs/product/calendar-v2.md) — the combined bills/paydays/
 * budget-reset month view, a **new, first-class nav destination**
 * (`components/shared/sidebar.tsx`'s `NAV_SECTIONS`, see its own inline
 * comment for the placement decision) distinct from Bills' own existing
 * `?view=calendar` embedded tab, which this page does not touch or replace.
 *
 * A Server Component composing three already-existing,
 * already-reviewed reads, per docs/architecture/phase-4c-technical-design.md
 * §2.5:
 * 1. `calendar.service.getCalendarMonth` — itself pure composition over
 *    Bills' and Recurring Income's own calendar reads (see that file's own
 *    JSDoc); the sole source of every bill/payday/reset-marker entry this
 *    page renders.
 * 2. `bills.service.hasAnyBills` and
 * 3. `recurring-income.service.hasAnyIncomeStreams`
 * — used only to resolve the combined empty-state check below (calendar-v2.md's
 * Edge Case: "the user has genuinely never set up any bill or income stream
 * anywhere in the app"), never to render bill/payday data a second time
 * (that always comes from `getCalendarMonth` alone, per that design doc's
 * "page-level composition, not a `calendar.service` concern" framing).
 *
 * Phase 4c performance follow-up (phase-4c-performance-review.md Finding 2):
 * this page previously called `bills.service.getBills`/
 * `recurring-income.service.getIncomeStreams` FOUR times (active + archived,
 * for each domain) purely to compute `hasNoDataAnywhere` — each of those
 * calls also re-ran `ensureOccurrencesGenerated`'s own per-active-row loop, a
 * second time, for the exact same bills/streams `getCalendarMonth` had
 * already generated occurrences for one line above. `hasAnyBills`/
 * `hasAnyIncomeStreams` are narrow, no-generation existence probes that
 * answer the only question this page actually needs ("does at least one row
 * of either kind exist, active or archived") without any of that redundant
 * cost — see each function's own JSDoc.
 *
 * `?month=YYYY-MM` searchParam navigation — the same convention Budgeting's
 * `?month=` and Bills' own `?view=list|calendar&month=` already established
 * (naming-standards.md's searchParam section); no new convention introduced.
 * `getCalendarMonth` is a direct Server Component call, not a client hook —
 * this is a read-only, no-mutation feature, the same "no `hooks/` folder"
 * call already made for Reports in Phase 4b.
 *
 * Next.js 15's `searchParams` prop is a Promise (must be awaited) — see
 * `app/(dashboard)/bills/page.tsx`'s identical note.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const params = await searchParams
  const month =
    params.month && MONTH_PATTERN.test(params.month) ? params.month : currentMonthString()

  const [calendarMonth, anyBills, anyIncomeStreams] = await Promise.all([
    getCalendarMonth(user.id, month),
    hasAnyBills(user.id),
    hasAnyIncomeStreams(user.id),
  ])

  // calendar-v2.md's Edge Case: "genuinely never set up any bill or income
  // stream anywhere in the app" — `hasAnyBills`/`hasAnyIncomeStreams` both
  // already check across active AND archived rows (mirrors
  // `bills-client.tsx`'s/`income-client.tsx`'s own combined "hasAnyBills"/
  // "hasAnyStreams" checks), not just active ones: a user who archived every
  // bill they ever added has still "set up" Bills before and should not see
  // the never-used-this-feature prompt.
  const hasNoDataAnywhere = !anyBills && !anyIncomeStreams

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Every bill due, every payday expected, and when your monthly budget resets — all in one
          view.
        </p>
      </div>

      <CalendarGrid
        month={month}
        days={calendarMonth.days}
        budgetResetMonth={calendarMonth.budgetResetMonth}
        hasNoDataAnywhere={hasNoDataAnywhere}
      />
    </div>
  )
}
