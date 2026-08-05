import { DemoTransactionTable } from "@/features/demo/components/transactions/demo-transaction-table"
import { getDemoHousehold } from "@/features/demo/fixtures/household"

/**
 * `/demo/transactions` — the demo equivalent of `app/(dashboard)/
 * transactions/page.tsx`, per docs/architecture/public-demo-technical-design.md
 * §3.2's Transactions row.
 *
 * The real page delegates its entire body to `TransactionsClient` (a Client
 * Component wired to `useTransactions`/`useAccounts` TanStack Query hooks
 * against real, session-authenticated API routes, plus
 * `requestCategorySuggestion` from `@/features/transactions/server/actions`)
 * — none of that is reachable here. `DemoTransactionTable`
 * (`features/demo/components/transactions/demo-transaction-table.tsx`)
 * replaces it: the full, already-resolved fixture `transactions` array
 * handed to `ResponsiveDataTable`'s own built-in client-side sort/search/
 * pagination, so the search box is genuinely functional (Capability 5 AC3)
 * while issuing zero network calls. Add/Import/Split/Manage Categories and
 * the AI category-suggestion badge are all omitted (design doc §3.2/§3.5).
 */
export default function DemoTransactionsPage() {
  const household = getDemoHousehold()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Transactions
        </h1>
        <p className="text-sm text-muted-foreground">
          Several months of this fictional household&apos;s activity — every
          merchant, category, and account.
        </p>
      </div>

      <DemoTransactionTable transactions={household.transactions} />
    </div>
  )
}
