import { redirect } from "next/navigation"
import { TrendingUp } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import {
  getAllocation,
  getContainers,
  getGrowthHistory,
  getHoldingsForContainer,
  getPortfolioOverview,
} from "@/features/investments/server/service"
import type { Holding } from "@/features/investments/types"
import { AddHoldingButton } from "@/features/investments/components/holding-form"
import { ContainerHoldingsSection } from "@/features/investments/components/container-holdings-section"
import { PortfolioOverviewSection } from "@/features/investments/components/portfolio-overview-section"
import { AllocationChart } from "@/features/investments/components/allocation-chart"
import { GrowthChart } from "@/features/investments/components/growth-chart"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Investments — replaces the Phase 3 placeholder now that the Holding model
 * and its full Server Action/service surface exist
 * (docs/product/investments.md, docs/architecture/api-contracts.md's
 * Investments section).
 *
 * Server Component: fetches containers, portfolio overview, both allocation
 * dimensions, the portfolio-level growth series, and every container's
 * active + Closed holdings directly via `service.*` calls, per
 * api-contracts.md's "Server Component direct call" rows for every read in
 * this feature — never Server Actions for these, matching
 * accounts/page.tsx's and budgeting/page.tsx's identical read pattern.
 * Mutations happen in the Client Component pieces rendered below
 * (HoldingFormDialog, DividendFormDialog, HoldingRow's Close action) and
 * call `router.refresh()` afterward, which re-runs this Server Component and
 * every fetch below — see those components for details.
 */
export default async function InvestmentsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const [containers, portfolioOverview, assetAllocation, sectorAllocation, growthHistory] =
    await Promise.all([
      getContainers(user.id),
      getPortfolioOverview(user.id),
      getAllocation(user.id, { by: "assetType" }),
      getAllocation(user.id, { by: "sector" }),
      getGrowthHistory(user.id),
    ])

  const [activeHoldingsLists, closedHoldingsLists] = await Promise.all([
    Promise.all(
      containers.map((container) => getHoldingsForContainer(user.id, container.id)),
    ),
    Promise.all(
      containers.map((container) =>
        getHoldingsForContainer(user.id, container.id, { includeClosed: true }),
      ),
    ),
  ])

  const activeByContainerId = new Map<string, Holding[]>(
    containers.map((container, index) => [container.id, activeHoldingsLists[index]]),
  )
  const closedByContainerId = new Map<string, Holding[]>(
    containers.map((container, index) => [container.id, closedHoldingsLists[index]]),
  )

  const totalActiveHoldings = activeHoldingsLists.reduce(
    (sum, list) => sum + list.length,
    0,
  )
  const totalClosedHoldings = closedHoldingsLists.reduce(
    (sum, list) => sum + list.length,
    0,
  )
  const hasAnyHoldings = totalActiveHoldings + totalClosedHoldings > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Investments
          </h1>
          <p className="text-sm text-muted-foreground">
            What you actually own, broken down by holding — not just a
            single balance.
          </p>
        </div>
        {hasAnyHoldings && <AddHoldingButton containers={containers} />}
      </div>

      {!hasAnyHoldings ? (
        <EmptyInvestmentsState containers={containers} />
      ) : (
        <>
          <PortfolioOverviewSection overview={portfolioOverview} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AllocationChart
              title="Allocation by asset type"
              data={assetAllocation}
              emptyMessage="Add an active holding to see how your portfolio breaks down by asset type."
            />
            <AllocationChart
              title="Allocation by sector"
              data={sectorAllocation}
              emptyMessage="Add an active holding to see how your portfolio breaks down by sector."
            />
          </div>

          <GrowthChart title="Portfolio growth" data={growthHistory} />

          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">
                Active ({totalActiveHoldings})
              </TabsTrigger>
              <TabsTrigger value="closed">
                Closed ({totalClosedHoldings})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="mt-4">
              <ContainerHoldingsSection
                containers={containers}
                holdingsByContainerId={activeByContainerId}
                emptyMessage="No active holdings. Add one above to get started."
              />
            </TabsContent>

            <TabsContent value="closed" className="mt-4">
              <ContainerHoldingsSection
                containers={containers}
                holdingsByContainerId={closedByContainerId}
                isClosedView
                emptyMessage="No closed holdings."
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

/** Zero-holdings state — docs/product/investments.md's "Zero holdings in a
 * container, or zero containers at all" edge case. `AddHoldingButton` here
 * works even with zero containers, since its "+ Create a new account"
 * branch (AC1) never depends on one already existing. */
function EmptyInvestmentsState({
  containers,
}: {
  containers: Awaited<ReturnType<typeof getContainers>>
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <TrendingUp className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            No holdings yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your first holding to see gain/loss, allocation, and growth
            for what you actually own — you can create a new Investment,
            Retirement, or Crypto account for it right here, no need to set
            one up separately first.
          </p>
        </div>
        <AddHoldingButton
          containers={containers}
          label="Add your first holding"
        />
      </CardContent>
    </Card>
  )
}
