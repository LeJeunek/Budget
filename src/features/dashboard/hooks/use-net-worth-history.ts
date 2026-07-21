"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { NetWorthHistoryRange, NetWorthHistoryResponse } from "@/features/dashboard/types"

// Per docs/architecture/folder-tree.md's Phase 3b note: "same shape as
// use-debts.ts's includeArchived toggle" / `features/bills/hooks/use-bills.ts`
// — the established pattern for a Client Component control (here, the range
// selector) that needs to refetch after the initial Server Component render
// rather than trigger a full page reload.
//
// The Server Component (`app/(dashboard)/page.tsx`) still resolves the
// *initial* range and its data directly via `resolveDefaultRange`/
// `getNetWorthHistory` (see api-contracts.md's "initial load" row) — this
// hook is refetch-only, wired to `GET /api/dashboard/net-worth-history`, and
// is never the path for first render.

/** Shared TanStack Query cache key, keyed by range so switching the selector
 * is a distinct, independently-cacheable query per range rather than one
 * query object mutating in place. */
export function netWorthHistoryQueryKey(range: NetWorthHistoryRange) {
  return ["net-worth-history", range] as const
}

/**
 * Client-safe fetcher for one range's worth of Net Worth History. Calls
 * `GET /api/dashboard/net-worth-history` (see
 * src/app/api/dashboard/net-worth-history/route.ts) rather than
 * `getNetWorthHistory` directly — Server Component-only modules under
 * `features/dashboard/server` can't be imported from a Client Component.
 */
async function fetchNetWorthHistory(
  range: NetWorthHistoryRange,
): Promise<NetWorthHistoryResponse> {
  const response = await fetch(
    `/api/dashboard/net-worth-history?range=${range}`,
  )
  const result = (await response.json()) as ApiResult<NetWorthHistoryResponse>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

export interface UseNetWorthHistoryOptions {
  /** The range the Server Component already resolved and fetched on first
   * render (via `resolveDefaultRange`/`getNetWorthHistory`) — passed through
   * so this hook can seed that same query key with `initialData` instead of
   * re-fetching data the page already has. Has no effect once the user picks
   * a different `range`, since `initialData` only ever applies to the query
   * key matching `initialRange`. */
  initialRange: NetWorthHistoryRange
  initialData: NetWorthHistoryResponse
}

/**
 * TanStack Query hook backing the Net Worth History chart's range selector.
 * `range` drives the query key directly, so selecting a new range is a plain
 * `useState` update in the chart component — no manual refetch call needed.
 */
export function useNetWorthHistory(
  range: NetWorthHistoryRange,
  { initialRange, initialData }: UseNetWorthHistoryOptions,
): UseQueryResult<NetWorthHistoryResponse, Error> {
  return useQuery({
    queryKey: netWorthHistoryQueryKey(range),
    queryFn: () => fetchNetWorthHistory(range),
    initialData: range === initialRange ? initialData : undefined,
  })
}
