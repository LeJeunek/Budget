"use client"

/**
 * BillsClient — client-side composition root for the Bills page: header
 * ("Add Bill"), the List/Calendar view toggle, and the Active/Archived bill
 * tabs within List view. Mirrors `transactions-client.tsx`'s split from its
 * Server Component `page.tsx`.
 *
 * The List/Calendar toggle and the calendar's month stepper are both driven
 * through the URL (`router.push` with updated `?view=`/`?month=` search
 * params) rather than local component state — `page.tsx` re-fetches
 * (`getBills`/`getUpcomingOccurrences`/`getCalendarMonth`) on every param
 * change, so this component only ever renders data it was handed as props,
 * never fetches anything itself.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarClock } from "lucide-react"

import type {
  BillWithNextOccurrence,
  CalendarDay,
  UpcomingOccurrence,
} from "@/features/bills/types"
import type { Category } from "@/features/categories/types"
import { AddBillButton } from "@/features/bills/components/bill-form"
import { BillList } from "@/features/bills/components/bill-list"
import { UpcomingBillsList } from "@/features/bills/components/upcoming-bills-list"
import { BillCalendar } from "@/features/bills/components/bill-calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface BillsClientProps {
  view: "list" | "calendar"
  month: string
  activeBills: BillWithNextOccurrence[]
  archivedBills: BillWithNextOccurrence[]
  upcoming: UpcomingOccurrence[]
  categories: Category[]
  calendarDays: CalendarDay[] | null
}

export function BillsClient({
  view,
  month,
  activeBills,
  archivedBills,
  upcoming,
  categories,
  calendarDays,
}: BillsClientProps) {
  const router = useRouter()
  const hasAnyBills = activeBills.length > 0 || archivedBills.length > 0

  function navigate(nextView: "list" | "calendar", nextMonth: string) {
    const params = new URLSearchParams({ view: nextView })
    if (nextView === "calendar") {
      params.set("month", nextMonth)
    }
    router.push(`/bills?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">Bills</h1>
          <p className="text-sm text-muted-foreground">
            Track recurring bills and never miss a due date.
          </p>
        </div>
        {hasAnyBills && <AddBillButton categories={categories} />}
      </div>

      {!hasAnyBills ? (
        <EmptyBillsState categories={categories} />
      ) : (
        <Tabs value={view} onValueChange={(value) => navigate(value as "list" | "calendar", month)}>
          <TabsList>
            <TabsTrigger value="list">Upcoming / List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4 flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-medium text-foreground">Upcoming</h2>
              <UpcomingBillsList occurrences={upcoming} />
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-medium text-foreground">All bills</h2>
              <Tabs defaultValue="active">
                <TabsList>
                  <TabsTrigger value="active">Active ({activeBills.length})</TabsTrigger>
                  <TabsTrigger value="archived">Archived ({archivedBills.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="mt-4">
                  <BillList
                    bills={activeBills}
                    categories={categories}
                    emptyMessage="No active bills. Unarchive one from the Archived tab, or add a new bill."
                  />
                </TabsContent>
                <TabsContent value="archived" className="mt-4">
                  <BillList bills={archivedBills} categories={categories} emptyMessage="No archived bills." />
                </TabsContent>
              </Tabs>
            </section>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <BillCalendar
              month={month}
              onMonthChange={(nextMonth) => navigate("calendar", nextMonth)}
              days={calendarDays ?? []}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

/** Zero-bills state — bills.md's "Zero bills" edge case ("a clear empty
 * state prompting them to add their first bill, not a blank screen"). */
function EmptyBillsState({ categories }: { categories: Category[] }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CalendarClock className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">No bills yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your first recurring bill — like rent, a utility, or a subscription — to start
            tracking its due dates and paid status.
          </p>
        </div>
        <AddBillButton categories={categories} label="Add your first bill" />
      </CardContent>
    </Card>
  )
}
