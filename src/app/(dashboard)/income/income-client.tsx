"use client"

/**
 * IncomeClient — client-side composition root for the Recurring Income
 * list page: header ("Add income stream"), the expected-upcoming-income
 * total (AC10), and the Active/Archived stream tabs. Mirrors
 * `app/(dashboard)/bills/bills-client.tsx`'s split from its Server Component
 * `page.tsx` exactly, minus the List/Calendar toggle (see `page.tsx`'s JSDoc
 * for why no calendar view applies here).
 */

import { Banknote } from "lucide-react"

import type {
  ExpectedUpcomingIncome,
  IncomeStreamSummary,
} from "@/features/recurring-income/types"
import { AddIncomeStreamButton } from "@/features/recurring-income/components/income-stream-form"
import { IncomeStreamList } from "@/features/recurring-income/components/income-stream-list"
import { ExpectedUpcomingIncomeCard } from "@/features/recurring-income/components/expected-upcoming-income-card"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface IncomeClientProps {
  activeStreams: IncomeStreamSummary[]
  archivedStreams: IncomeStreamSummary[]
  expectedUpcomingIncome: ExpectedUpcomingIncome
}

export function IncomeClient({
  activeStreams,
  archivedStreams,
  expectedUpcomingIncome,
}: IncomeClientProps) {
  const hasAnyStreams = activeStreams.length > 0 || archivedStreams.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">Income</h1>
          <p className="text-sm text-muted-foreground">
            Every source of income you expect to receive — salary, side hustles, dividends, rental,
            and bonuses.
          </p>
        </div>
        {hasAnyStreams && <AddIncomeStreamButton />}
      </div>

      {!hasAnyStreams ? (
        <EmptyIncomeState />
      ) : (
        <>
          {activeStreams.length > 0 && (
            <ExpectedUpcomingIncomeCard data={expectedUpcomingIncome} />
          )}

          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active ({activeStreams.length})</TabsTrigger>
              <TabsTrigger value="archived">Archived ({archivedStreams.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
              <IncomeStreamList
                streams={activeStreams}
                emptyMessage="No active income streams. Unarchive one from the Archived tab, or add a new stream."
              />
            </TabsContent>
            <TabsContent value="archived" className="mt-4">
              <IncomeStreamList streams={archivedStreams} emptyMessage="No archived income streams." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

/** Zero-streams state — recurring-income.md's "Zero income streams" edge
 * case ("a user with none sees a clear empty state prompting them to add
 * their first stream, not a blank screen"). */
function EmptyIncomeState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Banknote className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            No income streams yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your salary, a side hustle, dividends, rental income, or a bonus to start tracking
            what&apos;s expected to come in — and whether it has yet.
          </p>
        </div>
        <AddIncomeStreamButton label="Add your first income stream" />
      </CardContent>
    </Card>
  )
}
