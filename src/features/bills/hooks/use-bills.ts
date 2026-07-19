"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { BillWithNextOccurrence, GetBillsOptions } from "@/features/bills/types"

// Mirrors `features/accounts/hooks/use-accounts.ts` exactly (per
// docs/architecture/folder-tree.md's Phase 2 note: "Goals and Bills get a
// thin GET route + hook *only* because both have an `includeArchived` toggle
// exactly like Accounts").

/**
 * Shared TanStack Query cache key prefix for this feature. Exported so
 * Client Components that mutate a bill (via the Server Actions in
 * `server/actions.ts`) can call
 * `queryClient.invalidateQueries({ queryKey: billsQueryKey(...) })` after a
 * create/update/archive/unarchive/mark-paid/unmark call, instead of each
 * call site re-deriving the same array by hand.
 */
export function billsQueryKey(options: GetBillsOptions = {}) {
  return ["bills", options] as const
}

/**
 * Client-safe fetcher for the bill list. Calls `GET /api/bills` (see
 * src/app/api/bills/route.ts) rather than `service.getBills` directly —
 * Server Component-only modules under `features/bills/server` can't be
 * imported from a Client Component, so this thin route is the sanctioned
 * boundary crossing.
 */
async function fetchBills(
  options: GetBillsOptions,
): Promise<BillWithNextOccurrence[]> {
  const params = new URLSearchParams()
  if (options.includeArchived) {
    params.set("includeArchived", "true")
  }
  const queryString = params.toString()

  const response = await fetch(`/api/bills${queryString ? `?${queryString}` : ""}`)
  const result = (await response.json()) as ApiResult<BillWithNextOccurrence[]>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

/**
 * TanStack Query hook for the current user's bill list, for Client
 * Components that need to refetch after a mutation rather than waiting on a
 * full page reload.
 *
 * Server Components should keep calling `service.getBills(userId)` directly
 * per docs/architecture/api-contracts.md — this hook is only for the
 * client-side refetch case; it is not a replacement for that direct call on
 * first render.
 */
export function useBills(
  options: GetBillsOptions = {},
): UseQueryResult<BillWithNextOccurrence[], Error> {
  return useQuery({
    queryKey: billsQueryKey(options),
    queryFn: () => fetchBills(options),
  })
}
