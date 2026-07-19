"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { GetGoalsOptions, GoalWithProgress } from "@/features/goals/types"

// Shared TanStack Query cache key prefix for this feature. Exported so
// Client Components that mutate a goal (via the Server Actions in
// server/actions.ts — create/update/archive/unarchive/addContribution/
// deleteContribution) can call
// `queryClient.invalidateQueries({ queryKey: goalsQueryKey(...) })` after a
// mutation, instead of each call site re-deriving the same array by hand and
// risking a typo that silently breaks cache invalidation. Mirrors
// `features/accounts/hooks/use-accounts.ts`'s `accountsQueryKey` exactly.
export function goalsQueryKey(options: GetGoalsOptions = {}) {
  return ["goals", options] as const
}

/**
 * Client-safe fetcher for the goal list. Calls `GET /api/goals` (see
 * src/app/api/goals/route.ts) rather than `service.getGoals` directly —
 * Server Component-only modules under `features/goals/server` can't be
 * imported from a Client Component, so this thin route is the sanctioned
 * boundary crossing. Mirrors `features/accounts/hooks/use-accounts.ts`'s
 * `fetchAccounts`.
 */
async function fetchGoals(
  options: GetGoalsOptions,
): Promise<GoalWithProgress[]> {
  const params = new URLSearchParams()
  if (options.includeArchived) {
    params.set("includeArchived", "true")
  }
  const queryString = params.toString()

  const response = await fetch(
    `/api/goals${queryString ? `?${queryString}` : ""}`,
  )
  const result = (await response.json()) as ApiResult<GoalWithProgress[]>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

/**
 * TanStack Query hook for the current user's goal list, for Client
 * Components that need to refetch after a mutation (e.g. a goal form's
 * dialog closing after `createGoal`/`updateGoal`, a contribution being
 * logged/deleted, or an archive/unarchive toggle) rather than waiting on a
 * full page reload.
 *
 * Server Components should keep calling `service.getGoals(userId)` directly
 * per docs/architecture/api-contracts.md — this hook is only for the
 * client-side refetch case; it is not a replacement for that direct call on
 * first render.
 *
 * `options.includeArchived` mirrors `GetGoalsOptions` (see
 * features/goals/types.ts): false/omitted returns the active list (AC2),
 * true returns the dedicated archived list (AC6) — the same non-union
 * toggle semantics as `service.getGoals`, kept consistent here so a caller
 * can't accidentally assume this hook behaves differently from the Server
 * Component path. Mirrors `features/accounts/hooks/use-accounts.ts`'s
 * `useAccounts` exactly.
 */
export function useGoals(
  options: GetGoalsOptions = {},
): UseQueryResult<GoalWithProgress[], Error> {
  return useQuery({
    queryKey: goalsQueryKey(options),
    queryFn: () => fetchGoals(options),
  })
}
