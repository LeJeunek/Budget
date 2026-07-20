"use client"

/**
 * BillCalendar — Calendar v1's month grid (docs/product/
 * calendar-and-notifications.md), a pure view over `service.getCalendarMonth`
 * (`CalendarDay[]`, one entry per day of the requested month — see
 * `features/bills/types.ts`). Reuses `components/shared/month-navigator.tsx`
 * directly for prev/current/next stepping (per this task's explicit
 * instruction not to rebuild it) rather than owning its own month state —
 * `month`/`onMonthChange` are controlled by the caller
 * (`app/(dashboard)/bills/bills-client.tsx`), which drives the URL's
 * `?month=` search param so navigating months re-runs the Server Component
 * page and fetches the new month's data (Bills has no client-side calendar
 * data hook — `getCalendarMonth` is a direct Server Component call per
 * api-contracts.md, the same convention `getBills`/`getUpcomingOccurrences`
 * follow elsewhere in this feature).
 *
 * Each due occurrence is rendered as a small clickable entry (bill name +
 * amount, colored by status) that navigates to that bill's detail page —
 * calendar-and-notifications.md AC4 ("selecting a calendar entry takes the
 * user to that bill's detail").
 */

import Link from "next/link"

import { MonthNavigator } from "@/components/shared/month-navigator"
import type { CalendarDay } from "@/features/bills/types"
import { cn, formatCurrency } from "@/lib/utils"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const STATUS_ENTRY_CLASSNAME: Record<CalendarDay["occurrences"][number]["status"], string> = {
  UPCOMING: "border-border bg-muted/50 text-foreground",
  DUE_TODAY:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  LATE: "border-destructive/40 bg-destructive/10 text-destructive",
  PAID: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
}

/** UTC day-of-week (0 = Sunday) for a `"YYYY-MM-DD"` day key — used to pad
 * the grid so the 1st of the month lands in its correct weekday column. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

function dayNumber(day: string): number {
  return Number(day.split("-")[2])
}

export interface BillCalendarProps {
  month: string
  onMonthChange: (month: string) => void
  days: CalendarDay[]
}

export function BillCalendar({ month, onMonthChange, days }: BillCalendarProps) {
  const leadingBlanks = days.length > 0 ? weekdayOf(days[0].day) : 0
  const trailingBlanks = days.length > 0 ? (7 - ((leadingBlanks + days.length) % 7)) % 7 : 0

  return (
    <div className="flex flex-col gap-4">
      <MonthNavigator month={month} onMonthChange={onMonthChange} />

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }).map((_, index) => (
            <div key={`lead-${index}`} className="min-h-24 border-b border-r bg-muted/10" />
          ))}

          {days.map((day) => (
            <div
              key={day.day}
              className="flex min-h-24 flex-col gap-1 border-r border-b p-1.5 last:border-r-0"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {dayNumber(day.day)}
              </span>
              <div className="flex flex-col gap-1">
                {day.occurrences.map((occurrence) => (
                  <Link
                    key={occurrence.billOccurrenceId}
                    href={`/bills/${occurrence.billId}`}
                    className={cn(
                      "truncate rounded border px-1.5 py-0.5 text-[0.7rem] leading-tight hover:opacity-80",
                      STATUS_ENTRY_CLASSNAME[occurrence.status],
                    )}
                    title={`${occurrence.billName} — ${formatCurrency(occurrence.amount)}`}
                  >
                    {occurrence.billName} · {formatCurrency(occurrence.amount)}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {Array.from({ length: trailingBlanks }).map((_, index) => (
            <div key={`trail-${index}`} className="min-h-24 border-b border-r bg-muted/10 last:border-r-0" />
          ))}
        </div>
      </div>
    </div>
  )
}
