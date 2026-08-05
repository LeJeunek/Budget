import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { DemoAccountCard } from "@/features/demo/components/accounts/demo-account-card"
import { DemoTransactionTable } from "@/features/demo/components/transactions/demo-transaction-table"
import { getDemoHousehold } from "@/features/demo/fixtures/household"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * `/demo/accounts/[accountId]` — a new detail route with no direct real-app
 * equivalent (the authenticated app has no `/accounts/[accountId]` page;
 * `AccountCard` never links anywhere). Built per
 * docs/architecture/public-demo-technical-design.md §7's illustrative
 * lookup-plus-notFound() shape and public-demo.md Capability 5 AC2's "at
 * least one working example of [each] detail route" requirement — every
 * account resolves here, not just one token example (§7's "exceeding AC2's
 * stated minimum, at no marginal design cost").
 *
 * A plain, synchronous lookup against `getDemoHousehold()`'s own `accounts`
 * array by the fixture id in the URL — never a query. Shows the same
 * `DemoAccountCard` the list page renders (Capability 2 AC3's "detail page's
 * numbers agree with the list row" guarantee, by construction) plus that
 * account's own transactions, reusing `DemoTransactionTable` rather than a
 * new detail-scoped component.
 */
export default async function DemoAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const household = getDemoHousehold()
  const account = household.accounts.find((candidate) => candidate.id === accountId)

  if (!account) {
    notFound()
  }

  const accountTransactions = household.transactions.filter(
    (transaction) => transaction.accountId === account.id,
  )

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/demo/accounts"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Accounts
      </Link>

      <div className="max-w-sm">
        <DemoAccountCard account={account} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <DemoTransactionTable transactions={accountTransactions} />
        </CardContent>
      </Card>
    </div>
  )
}
