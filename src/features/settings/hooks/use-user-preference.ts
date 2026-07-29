"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type DefinedUseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { UserPreferenceView } from "@/features/settings/types"
import type {
  UpdateAccentColorInput,
  UpdateCurrencyDisplayInput,
  UpdateTimezoneInput,
} from "@/features/settings/server/validation"
import {
  updateAccentColor,
  updateCurrencyDisplay,
  updateTimezone,
} from "@/features/settings/server/actions"

/**
 * TanStack Query hooks for the accent-color / currency-display / timezone
 * settings screens, following the exact "Server Component fetches once,
 * Client Component mutates via `queryClient.setQueryData`" pattern
 * `features/notifications/hooks/use-notification-preferences.ts` already
 * established for this codebase's settings-style screens — see that file's
 * own top-of-file JSDoc for the full reasoning this mirrors.
 *
 * `getUserPreference` has no `GET` route/hook of its own (a Server Component
 * direct call, per phase-4c-technical-design.md §3.6) — `page.tsx` fetches it
 * once and seeds `useUserPreference`'s `initialData`; every later update to
 * this screen's displayed state comes from a mutation's own `onSuccess`
 * below, never a refetch.
 */

export const USER_PREFERENCE_QUERY_KEY = ["user-preference"] as const

/** Seeds the settings screen from `page.tsx`'s server-fetched `initialData` —
 * see this file's own top JSDoc for why there is no live refetch path.
 * Returns `DefinedUseQueryResult` since `initialData` guarantees `data` is
 * never `undefined`. */
export function useUserPreference(
  initialData: UserPreferenceView,
): DefinedUseQueryResult<UserPreferenceView, Error> {
  return useQuery({
    queryKey: USER_PREFERENCE_QUERY_KEY,
    queryFn: () => Promise.resolve(initialData),
    initialData,
    staleTime: Infinity,
  })
}

/** Unwraps an `ApiResult`, throwing on failure — same convention every other
 * mutation hook in this codebase already follows (e.g.
 * `use-notification-preferences.ts`'s own `unwrap`). */
function unwrap<T>(result: ApiResult<T>): T {
  if (!result.success) {
    throw new Error(result.error)
  }
  return result.data
}

/**
 * Shared `useMutation` wrapper for every accent-color/currency/timezone
 * mutation below. `TInput` must be supplied explicitly at each call site
 * (e.g. `useSetUserPreference<UpdateAccentColorInput>(updateAccentColor)`)
 * rather than left to inference: every Server Action this wraps declares its
 * own parameter as `input: unknown` (per this codebase's "Server Actions
 * validate their own input" convention), so inferring `TInput` from the
 * `mutationFn` argument's actual parameter type would always resolve to
 * `unknown` instead of the specific, narrower input shape each exported hook
 * below is declared to accept — an explicit type argument is what tells
 * TypeScript "trust this narrower type, `updateAccentColor` merely accepts it
 * as one of the many `unknown` values it happens to validate at runtime."
 */
function useSetUserPreference<TInput>(
  mutationFn: (input: TInput) => Promise<ApiResult<UserPreferenceView>>,
): UseMutationResult<UserPreferenceView, Error, TInput> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) => unwrap(await mutationFn(input)),
    onSuccess: (updated) => {
      queryClient.setQueryData(USER_PREFERENCE_QUERY_KEY, updated)
    },
  })
}

/** `useMutation` wrapper around the `updateAccentColor` Server Action. */
export function useUpdateAccentColor(): UseMutationResult<
  UserPreferenceView,
  Error,
  UpdateAccentColorInput
> {
  return useSetUserPreference<UpdateAccentColorInput>(updateAccentColor)
}

/** `useMutation` wrapper around the `updateCurrencyDisplay` Server Action. */
export function useUpdateCurrencyDisplay(): UseMutationResult<
  UserPreferenceView,
  Error,
  UpdateCurrencyDisplayInput
> {
  return useSetUserPreference<UpdateCurrencyDisplayInput>(updateCurrencyDisplay)
}

/** `useMutation` wrapper around the `updateTimezone` Server Action. */
export function useUpdateTimezone(): UseMutationResult<
  UserPreferenceView,
  Error,
  UpdateTimezoneInput
> {
  return useSetUserPreference<UpdateTimezoneInput>(updateTimezone)
}
