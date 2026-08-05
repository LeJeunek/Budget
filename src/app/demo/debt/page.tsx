import { TotalActiveDebtCard } from "@/features/debt/components/total-active-debt-card"
import { DemoDebtCard } from "@/features/demo/components/debt/demo-debt-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * `/demo/debt` — the demo equivalent of `app/(dashboard)/debt/page.tsx`, per
 * docs/architecture/public-demo-technical-design.md §3.2's Debt row.
 *
 * `DemoDebtCard` replaces the real `DebtCard` — that file imports
 * `archiveDebt`/`unarchiveDebt`/`unlinkDebtFromAccount` from
 * `@/features/debt/server/actions` in the same file as its display markup
 * (design doc §3.3). `TotalActiveDebtCard` is reused directly (props-only,
 * confirmed by direct read: no Server Action import, no Context dependency).
 *
 * **`StrategyComparison` is deliberately NOT reused here**, contradicting
 * the design doc's own §3.1/§3.2 listing of it as safely reusable
 * ("client-side-only recompute over payoff-math.ts — no server call"). Verified
 * by direct read: `StrategyComparison` renders `ExtraPaymentInput`
 * (`features/debt/components/extra-payment-input.tsx`), which imports
 * `ExtraPaymentSchema` from `@/features/debt/server/validation` — a file
 * that itself imports `DebtType` from `@prisma/client`. That is a real,
 * transitive "any feature's server/ directory" / `@prisma/client` import reaching
 * `/demo`'s bundle through a permitted-looking component import — exactly
 * the class of mistake public-demo-technical-design.md §4.1 names as the one
 * an ESLint rule scoped to demo-owned files structurally cannot catch on its
 * own (no dependency-cruiser check exists yet in this repo to catch it
 * either). Flagged here rather than silently worked around: closing this
 * gap durably needs either a `payoff-math.ts`-only demo-owned twin of the
 * comparison view, or `extra-payment-input.tsx`'s own validation import
 * moved to a Prisma-free, feature-root file — both are UI Component
 * Engineer / Debt feature-owner artifacts, not made here. The Snowball vs.
 * Avalanche comparison is simply omitted from this page in the meantime.
 *
 * The fixture household has no archived debts, so the Archived tab is
 * always an accurate, empty state.
 */
export default function DemoDebtPage() {
  const household = getDemoHousehold()
  const { debts } = household
  const archivedDebts = debts.filter((debt) => debt.archivedAt !== null)
  const activeDebts = debts.filter((debt) => debt.archivedAt === null)
  const totalActiveBalance = activeDebts.reduce((sum, debt) => sum + debt.effectiveBalance, 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Debt
        </h1>
        <p className="text-sm text-muted-foreground">
          Every credit card and loan this fictional household owes — balance,
          interest rate, and payoff projection.
        </p>
      </div>

      {activeDebts.length > 0 && (
        <TotalActiveDebtCard
          totalActiveBalance={totalActiveBalance}
          currencyDisplay="USD"
        />
      )}

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({activeDebts.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedDebts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeDebts.map((debt) => (
              <DemoDebtCard key={debt.id} debt={debt} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <p className="text-sm text-muted-foreground">No archived debts.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
