"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { Account, GetAccountsOptions } from "@/features/accounts/types"

// Shared TanStack Query cache key prefix for this feature. Exported so
// Client Components that mutate an account (via the Server Actions in
// server/actions.ts) can call
// `queryClient.invalidateQueries({ queryKey: accountsQueryKey(...) })` after
// a create/update/archive/unarchive call, instead of each call site
// re-deriving the same array by hand and risking a typo that silently
// breaks cache invalidation.
export function accountsQueryKey(options: GetAccountsOptions = {}) {
  return ["accounts", options] as const
}

/**
 * Client-safe fetcher for the account list. Calls `GET /api/accounts` (see
 * src/app/api/accounts/route.ts) rather than `service.getAccounts` directly
 * — Server Component-only modules under `features/accounts/server` can't be
 * imported from a Client Component, so this thin route is the sanctioned
 * boundary crossing.
 */
async function fetchAccounts(options: GetAccountsOptions): Promise<Account[]> {
  const params = new URLSearchParams()
  if (options.includeArchived) {
    params.set("includeArchived", "true")
  }
  const queryString = params.toString()

  const response = await fetch(
    `/api/accounts${queryString ? `?${queryString}` : ""}`
  )
  const result = (await response.json()) as ApiResult<Account[]>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

/**
 * TanStack Query hook for the current user's account list, for Client
 * Components that need to refetch after a mutation (e.g. an account form's
 * dialog closing after `createAccount`/`updateAccount`, or an archive/
 * unarchive toggle) rather than waiting on a full page reload.
 *
 * Server Components should keep calling `service.getAccounts(userId)`
 * directly per docs/architecture/api-contracts.md — this hook is only for
 * the client-side refetch case; it is not a replacement for that direct
 * call on first render.
 *
 * `options.includeArchived` mirrors `GetAccountsOptions` (see
 * features/accounts/types.ts): false/omitted returns the active list (AC2),
 * true returns the dedicated archived list (AC5) — the same non-union
 * toggle semantics as `service.getAccounts`, kept consistent here so a
 * caller can't accidentally assume this hook behaves differently from the
 * Server Component path.
 */
export function useAccounts(
  options: GetAccountsOptions = {}
): UseQueryResult<Account[], Error> {
  return useQuery({
    queryKey: accountsQueryKey(options),
    queryFn: () => fetchAccounts(options),
  })
}
