"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type DefinedUseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { DashboardCardView } from "@/features/settings/types"
import type {
  ReorderDashboardCardsInput,
  UpdateDashboardCardVisibilityInput,
} from "@/features/settings/server/validation"
import {
  reorderDashboardCards,
  resetDashboardLayout,
  updateDashboardCardVisibility,
} from "@/features/settings/server/actions"

/**
 * TanStack Query hooks for `dashboard-layout-editor.tsx`, following the same
 * "Server Component seeds `initialData`, mutations write straight into the
 * cache" pattern as `use-user-preference.ts` / `use-notification-preferences.ts`.
 * Every mutation below returns the FULL, re-materialized card list (never a
 * partial patch — `server/actions.ts`'s own contract), so every `onSuccess`
 * here is a plain cache replace, never a merge.
 */

export const DASHBOARD_CARD_PREFERENCES_QUERY_KEY = [
  "dashboard-card-preferences",
] as const

/** Seeds the layout editor from `page.tsx`'s server-fetched `initialData`. */
export function useDashboardCardPreferences(
  initialData: DashboardCardView[],
): DefinedUseQueryResult<DashboardCardView[], Error> {
  return useQuery({
    queryKey: DASHBOARD_CARD_PREFERENCES_QUERY_KEY,
    queryFn: () => Promise.resolve(initialData),
    initialData,
    staleTime: Infinity,
  })
}

/** Unwraps an `ApiResult`, throwing on failure — same convention as every
 * other mutation hook in this codebase. */
function unwrap<T>(result: ApiResult<T>): T {
  if (!result.success) {
    throw new Error(result.error)
  }
  return result.data
}

/**
 * Shared `useMutation` wrapper for the dashboard-card-preference mutations
 * below. Same reasoning as `use-user-preference.ts`'s identical helper:
 * `TInput` must be supplied explicitly at each call site (e.g.
 * `useSetDashboardCards<UpdateDashboardCardVisibilityInput>(...)`) since
 * every wrapped Server Action declares its own parameter as `input: unknown`
 * — inference from the argument alone would always resolve `TInput` to
 * `unknown`, not the specific input shape each exported hook below declares.
 */
function useSetDashboardCards<TInput>(
  mutationFn: (input: TInput) => Promise<ApiResult<DashboardCardView[]>>,
): UseMutationResult<DashboardCardView[], Error, TInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) => unwrap(await mutationFn(input)),
    onSuccess: (updated) => {
      queryClient.setQueryData(DASHBOARD_CARD_PREFERENCES_QUERY_KEY, updated)
    },
  })
}

/** `useMutation` wrapper around `updateDashboardCardVisibility` — the
 * hide/unhide toggle. Rejects (via `unwrap`'s thrown `Error`) when AC3's
 * "at least one card must remain visible" guard blocks the request; the
 * component surfaces that message rather than optimistically hiding the
 * card. */
export function useUpdateDashboardCardVisibility(): UseMutationResult<
  DashboardCardView[],
  Error,
  UpdateDashboardCardVisibilityInput
> {
  return useSetDashboardCards<UpdateDashboardCardVisibilityInput>(updateDashboardCardVisibility)
}

/** `useMutation` wrapper around `reorderDashboardCards`. */
export function useReorderDashboardCards(): UseMutationResult<
  DashboardCardView[],
  Error,
  ReorderDashboardCardsInput
> {
  return useSetDashboardCards<ReorderDashboardCardsInput>(reorderDashboardCards)
}

/** `useMutation` wrapper around `resetDashboardLayout` — the "Reset to
 * Default Layout" action. Takes no input. */
export function useResetDashboardLayout(): UseMutationResult<
  DashboardCardView[],
  Error,
  void
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await resetDashboardLayout()),
    onSuccess: (updated) => {
      queryClient.setQueryData(DASHBOARD_CARD_PREFERENCES_QUERY_KEY, updated)
    },
  })
}
