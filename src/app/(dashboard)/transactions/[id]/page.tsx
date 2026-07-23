import { notFound, redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getTransactionDetail } from "@/features/transactions/server/service"
import { getPendingSuggestions } from "@/features/transactions/server/categorization"

import { TransactionDetailClient } from "./transaction-detail-client"

/**
 * Transaction detail page — new in Phase 2, added solely to host the Receipt
 * Attachment addendum (docs/product/transactions.md's "Phase 2 Addendum:
 * Receipt Attachment"; docs/architecture/api-contracts.md's Receipts
 * section). AC2 requires viewing/downloading a transaction's receipts "from
 * the transaction's detail view" — this route is that view.
 *
 * Integration-point decision: a dedicated `[id]/page.tsx` route was chosen
 * over adding a receipts section to the existing edit dialog
 * (`transaction-form.tsx`), because `getTransactionDetail`
 * (server/service.ts) is a plain Server-Component-callable function — not a
 * Server Action and not backed by a fetchable Route Handler — per its own
 * JSDoc ("used solely by the transaction detail Server Component"). The
 * existing edit dialog is a single long-lived Client Component
 * (`transactions-client.tsx` renders one instance, reused for every row's
 * "Edit" action) with no Server Component boundary at the moment it opens,
 * so it has no way to call a Server-Component-only function; building a new
 * client-fetchable endpoint for it would mean introducing new backend API
 * surface — outside this role's scope, and unnecessary when a
 * Server-Component-callable function already exists and only needs a route
 * to be used as designed. This exactly mirrors the existing
 * `bills/[billId]/page.tsx` + `bill-detail-client.tsx` split (see that
 * file's own JSDoc for the identical `params`-is-a-Promise/`notFound()`
 * pattern this file follows).
 *
 * Editing a transaction's core fields (merchant/amount/category/notes/tags)
 * is unaffected — it continues to work exactly as before via
 * `transaction-table.tsx`'s existing "Edit" row action, which still opens
 * `transaction-form.tsx`. This page is purely additive: a new "Receipts" row
 * action (see transaction-table.tsx) links here to attach/view/remove
 * receipts (AC1-AC3), alongside a read-only summary of the transaction for
 * context.
 *
 * **Phase 4a addition:** `pendingSuggestion` is looked up from the same
 * `getPendingSuggestions(userId)` read `transactions/page.tsx` already uses
 * (see that file's JSDoc — it's a Server-Component-only call, not a
 * client-fetchable route, so it can only be resolved here). Filtered to this
 * one transaction's id since the detail view only ever needs at most one.
 *
 * `getTransactionDetail` returns `null` for both "doesn't exist" and
 * "belongs to another user" — deliberately non-distinguishable, the same
 * convention `getAccountById`/`getBillById` follow — so both cases render
 * Next.js's standard `notFound()` page, satisfying AC6 (never leaking
 * another user's data, not even its existence).
 */
export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const { id } = await params
  const transaction = await getTransactionDetail(user.id, id)

  if (!transaction) {
    notFound()
  }

  const pendingSuggestions = await getPendingSuggestions(user.id)
  const pendingSuggestion =
    pendingSuggestions.find((suggestion) => suggestion.transactionId === id) ?? null

  return (
    <TransactionDetailClient transaction={transaction} pendingSuggestion={pendingSuggestion} />
  )
}
