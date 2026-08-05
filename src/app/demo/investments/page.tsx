import { PortfolioOverviewSection } from "@/features/investments/components/portfolio-overview-section"
import { AllocationChart } from "@/features/investments/components/allocation-chart"
import { CONTAINER_ACCOUNT_TYPE_LABELS } from "@/features/investments/components/investment-labels"
import { DemoHoldingRow } from "@/features/demo/components/investments/demo-holding-row"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { computeDemoPortfolioOverview, computeDemoAllocation } from "@/features/demo/fixtures/investments"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { Account } from "@/features/accounts/types"
import type { HoldingDetail } from "@/features/investments/types"

/**
 * `/demo/investments` — the demo equivalent of `app/(dashboard)/investments/
 * page.tsx`, per docs/architecture/public-demo-technical-design.md §3.2's
 * Investments row.
 *
 * `PortfolioOverviewSection`/`AllocationChart` are reused directly (props-only,
 * confirmed by direct read — `AllocationChart`'s `useFormatCurrency()` call
 * is satisfied by `layout.tsx`'s mounted `CurrencyPreferenceProvider`).
 *
 * The real page's `ContainerHoldingsSection` is **not** reused: verified by
 * direct read, it renders the real `HoldingRow` (which imports `closeHolding`
 * from `@/features/investments/server/actions`) and `AddHoldingButton` per
 * container. This page instead groups `household.holdings` by container
 * inline (`DemoContainerCard` below — page-local composition, mirroring
 * `ContainerHoldingsSection`'s own grouping shape, not a new shared
 * component) using `DemoHoldingRow` for each row and no "Add holding"
 * control.
 *
 * Every demo holding is active (`closedAt: null`), so the "Closed" tab is
 * always an accurate, empty state — the real page's Closed/Active toggle is
 * kept anyway for navigational parity (Capability 5 AC1).
 */
export default function DemoInvestmentsPage() {
  const household = getDemoHousehold()
  const { accounts, holdings } = household

  const containers = accounts.filter(
    (account) => account.type === "INVESTMENT" || account.type === "RETIREMENT",
  )

  const portfolioOverview = computeDemoPortfolioOverview(
    holdings,
    containers.map((container) => ({ id: container.id, name: container.name })),
  )
  const assetAllocation = computeDemoAllocation(holdings, "assetType")
  const sectorAllocation = computeDemoAllocation(holdings, "sector")

  const holdingsByContainerId = new Map<string, HoldingDetail[]>(
    containers.map((container) => [
      container.id,
      holdings.filter((holding) => holding.accountId === container.id),
    ]),
  )
  const totalHoldings = holdings.length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Investments
        </h1>
        <p className="text-sm text-muted-foreground">
          What this fictional household actually owns, broken down by
          holding.
        </p>
      </div>

      <PortfolioOverviewSection overview={portfolioOverview} currency="USD" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationChart
          title="Allocation by asset type"
          data={assetAllocation}
          emptyMessage="No active holdings yet."
        />
        <AllocationChart
          title="Allocation by sector"
          data={sectorAllocation}
          emptyMessage="No active holdings yet."
        />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({totalHoldings})</TabsTrigger>
          <TabsTrigger value="closed">Closed (0)</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 flex flex-col gap-4">
          {containers.map((container) => (
            <DemoContainerCard
              key={container.id}
              container={container}
              holdings={holdingsByContainerId.get(container.id) ?? []}
            />
          ))}
        </TabsContent>

        <TabsContent value="closed" className="mt-4">
          <p className="text-sm text-muted-foreground">No closed holdings.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Page-local grouping card — mirrors `ContainerHoldingsSection`'s visual
 * shape (container name/type badge/holding count header, rows below) without
 * pulling in that component's real `HoldingRow`/`AddHoldingButton` children.
 * Not exported: scoped to this one page, the same "local helper function,
 * not a new shared component" pattern `app/(dashboard)/accounts/page.tsx`'s
 * own `AccountGrid` already uses. */
function DemoContainerCard({
  container,
  holdings,
}: {
  container: Account
  holdings: HoldingDetail[]
}) {
  if (holdings.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{container.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {CONTAINER_ACCOUNT_TYPE_LABELS[
                container.type as keyof typeof CONTAINER_ACCOUNT_TYPE_LABELS
              ] ?? container.type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {holdings.length} holding{holdings.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          {holdings.map((holding) => (
            <DemoHoldingRow key={holding.id} holding={holding} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
