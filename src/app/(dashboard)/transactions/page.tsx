import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth"
import { getCategories, getCategoryUsageCount } from "@/features/categories/server/service"

import { TransactionsClient } from "./transactions-client"

/**
 * Transactions page (Phase 1) — replaces the Phase 0 placeholder.
 *
 * A Server Component, not a Client Component, specifically so it can fetch
 * categories: per docs/architecture/api-contracts.md's Categories "List
 * categories" row, that module has no client hook or REST list route
 * (unlike Accounts/Transactions) — it's "a Server Component direct call to
 * `service.getCategories(userId)`". `getCategoryUsageCount` is likewise a
 * plain Server-only function, not a Server Action, so it can only be called
 * from here too. Both are threaded down as props to `TransactionsClient`,
 * the Client Component that actually owns the interactive table/dialogs.
 *
 * `getCurrentUser()` + redirect mirrors `(dashboard)/layout.tsx`'s own
 * guard — defensive, not load-bearing (the layout already redirects
 * unauthenticated visitors before this page renders), but required so
 * `getCategories`/`getCategoryUsageCount` have a non-null `userId` to scope
 * their queries by, per folder-tree.md's rule that every server query must
 * be scoped by the authenticated user's id.
 *
 * Usage counts are only computed for custom (non-system) categories — only
 * those are deletable (system categories are protected), so a usage count
 * for a system category would never be read. Counts are precomputed once
 * per page load, not fetched live at delete-confirmation time; see
 * `CategoryManagerDialog`'s JSDoc for how it stays reasonably fresh
 * (`router.refresh()` on every dialog open and after every mutation).
 */
export default async function TransactionsPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }

  const categories = await getCategories(user.id)

  const customCategories = categories.filter((category) => !category.isSystem)
  const usageCountEntries = await Promise.all(
    customCategories.map(
      async (category) => [category.id, await getCategoryUsageCount(user.id, category.id)] as const,
    ),
  )
  const categoryUsageCounts = Object.fromEntries(usageCountEntries)

  return <TransactionsClient categories={categories} categoryUsageCounts={categoryUsageCounts} />
}
