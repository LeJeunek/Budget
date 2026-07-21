"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { GetIncomeStreamsOptions, IncomeStreamSummary } from "@/features/recurring-income/types"

// Mirrors `features/bills/hooks/use-bills.ts` exactly (per
// docs/architecture/folder-tree.md's Phase 3a note: this hook exists only
// for the `includeArchived` client-side refetch case, same as Bills/Goals —
// every page-level read in this feature otherwise uses a direct
// `service.getIncomeStreams` Server Component call, per
// api-contracts.md; this hook is not a replacement for that on first
// render, and — matching Bills'/Goals' own established precedent in this
// codebase — this feature's page/list components currently mutate via
// Server Actions followed by `router.refresh()` rather than invalidating
// this hook's query cache. It is still provided (rather than omitted) since
// folder-tree.md's Phase 3a tree explicitly lists it as part of this
// module's surface.

/**
 * Shared TanStack Query cache key prefix for this feature. Exported so a
 * Client Component that mutates a stream can call
 * `queryClient.invalidateQueries({ queryKey: incomeStreamsQueryKey(...) })`
 * instead of re-deriving the same array by hand — mirrors
 * `features/bills/hooks/use-bills.ts`'s `billsQueryKey`.
 */
export function incomeStreamsQueryKey(options: GetIncomeStreamsOptions = {}) {
  return ["income-streams", options] as const
}

/**
 * Client-safe fetcher for the income stream list. Calls `GET /api/income`
 * (see src/app/api/income/route.ts) rather than `service.getIncomeStreams`
 * directly — Server Component-only modules under
 * `features/recurring-income/server` can't be imported from a Client
 * Component, so this thin route is the sanctioned boundary crossing.
 */
async function fetchIncomeStreams(
  options: GetIncomeStreamsOptions,
): Promise<IncomeStreamSummary[]> {
  const params = new URLSearchParams()
  if (options.includeArchived) {
    params.set("includeArchived", "true")
  }
  const queryString = params.toString()

  const response = await fetch(`/api/income${queryString ? `?${queryString}` : ""}`)
  const result = (await response.json()) as ApiResult<IncomeStreamSummary[]>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

/**
 * TanStack Query hook for the current user's income stream list, for Client
 * Components that need to refetch after a mutation rather than waiting on a
 * full page reload.
 */
export function useIncomeStreams(
  options: GetIncomeStreamsOptions = {},
): UseQueryResult<IncomeStreamSummary[], Error> {
  return useQuery({
    queryKey: incomeStreamsQueryKey(options),
    queryFn: () => fetchIncomeStreams(options),
  })
}
