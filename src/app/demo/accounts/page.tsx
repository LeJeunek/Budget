import { DemoAccountCard } from "@/features/demo/components/accounts/demo-account-card"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * `/demo/accounts` — the demo equivalent of `app/(dashboard)/accounts/
 * page.tsx`, per docs/architecture/public-demo-technical-design.md §3.2's
 * Accounts row.
 *
 * `DemoAccountCard` (`features/demo/components/accounts/demo-account-card.tsx`)
 * replaces the real `AccountCard` — that file bundles its Edit dialog/
 * archive-actions menu (which call `archiveAccount`/`unarchiveAccount` from
 * `@/features/accounts/server/actions`) in the same file as its display
 * markup (design doc §3.3), so it is never imported here, even transitively.
 * "Add account" is omitted entirely (no working control wired to nothing,
 * per public-demo.md Capability 3 AC1).
 *
 * The fixture household has no archived accounts (every entity in
 * `features/demo/fixtures/accounts.ts` is `archivedAt: null`), so the
 * Archived tab is always empty — kept anyway (a real, accurate "Archived
 * (0)" state, not a fabricated one) so the demo's own navigation shape
 * mirrors the real page's, per Capability 5 AC1.
 */
export default function DemoAccountsPage() {
  const household = getDemoHousehold()
  const { accounts } = household
  const archivedAccounts = accounts.filter((account) => account.archivedAt !== null)
  const activeAccounts = accounts.filter((account) => account.archivedAt === null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Accounts
        </h1>
        <p className="text-sm text-muted-foreground">
          Every account this fictional household holds, in one place.
        </p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({activeAccounts.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedAccounts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeAccounts.map((account) => (
              <DemoAccountCard key={account.id} account={account} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <p className="text-sm text-muted-foreground">No archived accounts.</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
