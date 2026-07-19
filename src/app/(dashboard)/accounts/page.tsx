import { redirect } from "next/navigation"
import { Wallet } from "lucide-react"

import { getCurrentUser } from "@/lib/auth"
import { getAccounts } from "@/features/accounts/server/service"
import { AccountCard } from "@/features/accounts/components/account-card"
import { AddAccountButton } from "@/features/accounts/components/account-form"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Accounts — replaces the Phase 0 placeholder now that the Account model
 * and its Server Actions exist (docs/planning/roadmap.md Phase 1).
 *
 * Server Component: fetches both account lists directly via
 * `service.getAccounts`, per docs/architecture/api-contracts.md ("List
 * accounts | Server Component direct call to service.getAccounts(userId)")
 * rather than going through `useAccounts()` — that hook exists for the
 * client-side refetch case, not this initial-render fetch. Mutations
 * (create/edit/archive/unarchive) happen in the Client Component pieces
 * below (AccountCard, AccountFormDialog) and call `router.refresh()`
 * afterward, which simply re-runs this Server Component and its two
 * `getAccounts` calls — see those components for details.
 *
 * `getCurrentUser()` is called again here even though
 * app/(dashboard)/layout.tsx already redirects unauthenticated visitors
 * before this page renders: this page still needs the resolved `user.id`
 * to scope its own `getAccounts` calls, and re-calling the cheap session
 * lookup here (rather than threading `user` down through layout props) is
 * the established pattern for authenticated FinanceOS pages.
 */
export default async function AccountsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const [activeAccounts, archivedAccounts] = await Promise.all([
    getAccounts(user.id),
    getAccounts(user.id, { includeArchived: true }),
  ])

  const hasAnyAccounts =
    activeAccounts.length > 0 || archivedAccounts.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Every account you hold, in one place.
          </p>
        </div>
        {hasAnyAccounts && <AddAccountButton />}
      </div>

      {!hasAnyAccounts ? (
        <EmptyAccountsState />
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">
              Active ({activeAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived ({archivedAccounts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {activeAccounts.length > 0 ? (
              <AccountGrid accounts={activeAccounts} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No active accounts. Unarchive one from the Archived tab, or
                add a new account.
              </p>
            )}
          </TabsContent>

          <TabsContent value="archived" className="mt-4">
            {archivedAccounts.length > 0 ? (
              <AccountGrid accounts={archivedAccounts} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No archived accounts.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function AccountGrid({
  accounts,
}: {
  accounts: Awaited<ReturnType<typeof getAccounts>>
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  )
}

/** Zero-accounts state — docs/product/accounts.md's "Zero accounts" edge case. */
function EmptyAccountsState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Wallet className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-medium text-foreground">
            No accounts yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your first account to get started — every other part of
            FinanceOS, from transactions to your dashboard, builds on the
            accounts you add here.
          </p>
        </div>
        <AddAccountButton label="Add your first account" />
      </CardContent>
    </Card>
  )
}
