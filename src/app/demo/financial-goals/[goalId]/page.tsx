import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { DemoFinancialGoalCard } from "@/features/demo/components/financial-goals/demo-financial-goal-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"

/**
 * `/demo/financial-goals/[goalId]` — the demo equivalent of
 * `app/(dashboard)/financial-goals/[goalId]/page.tsx`, per
 * docs/architecture/public-demo-technical-design.md §7's lookup-plus-
 * `notFound()` shape.
 *
 * A plain, synchronous lookup against `getDemoHousehold()`'s own
 * `financialGoals` array — never a query.
 *
 * **Not** built from the real page's `FinancialGoalProgressBody` (imported
 * there from `features/financial-goals/components/financial-goal-card.tsx`)
 * — that same file also imports `archiveFinancialGoal`/
 * `unarchiveFinancialGoal` from `@/features/financial-goals/server/actions`
 * at module scope (design doc §3.3's tangled-file list), so importing
 * *any* named export from it — even the display-only progress body — would
 * transitively pull a Server Action into `/demo`'s bundle. `DemoFinancialGoalCard`
 * already reimplements the identical per-type progress body locally with
 * zero tangled imports (confirmed by direct read), so this page renders the
 * full card (name, badges, and progress body together) rather than trying
 * to split a title-less body out of it — `DemoFinancialGoalCard` exports no
 * such split (it is a finished, reviewed building block per this dispatch's
 * own scope; a `DemoFinancialGoalProgressBody`-only export would be a UI
 * Component Engineer addition, not made here).
 */
export default async function DemoFinancialGoalDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>
}) {
  const { goalId } = await params
  const household = getDemoHousehold()
  const goal = household.financialGoals.find((candidate) => candidate.id === goalId)

  if (!goal) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/demo/financial-goals"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Financial Goals
      </Link>

      <div className="max-w-md">
        <DemoFinancialGoalCard goal={goal} />
      </div>
    </div>
  )
}
