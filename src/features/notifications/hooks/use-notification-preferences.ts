"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type DefinedUseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type {
  NotificationPreferenceView,
  NotificationThresholdSettingsView,
} from "@/features/notifications/types"
import type {
  UpdateNotificationPreferenceInput,
  UpdateNotificationThresholdSettingsInput,
} from "@/features/notifications/server/validation"
import {
  updateNotificationPreference,
  updateNotificationThresholdSettings,
} from "@/features/notifications/server/actions"

/**
 * TanStack Query hooks for the Notification Preferences settings screen
 * (`features/notifications/components/notification-preferences-list.tsx`,
 * `notification-threshold-settings-form.tsx`).
 *
 * Unlike `use-notifications.ts`'s inbox hook, `getNotificationPreferences`/
 * `getNotificationThresholdSettings` are documented in
 * docs/architecture/api-contracts.md's Phase 4b section as a "Server
 * Component direct call," not a `GET` Route Handler — there is no
 * client-refetchable endpoint for either read.
 * `app/(dashboard)/settings/notifications/page.tsx` (the Server Component)
 * therefore fetches both once and passes them down as `initial*` props; the
 * `useQuery` calls below never independently re-fetch (each `queryFn`
 * simply resolves the same already-fetched value it was seeded with), so
 * every later update to this screen's displayed state comes from
 * `queryClient.setQueryData` inside each mutation's `onSuccess` below —
 * writing the mutation's own authoritative response straight into the
 * cache, rather than `invalidateQueries` (which would have no live
 * `queryFn` to actually refetch from).
 *
 * The two mutations below (`updateNotificationPreference`,
 * `updateNotificationThresholdSettings`) *are* ordinary Server Actions,
 * called directly from `mutationFn` exactly like every other mutation hook
 * in this codebase (e.g. `features/transactions/hooks/use-transactions.ts`)
 * — only the paired *reads* are unusual here, per the "Server Component
 * direct call" contract above.
 */

export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["notification-preferences"] as const
export const NOTIFICATION_THRESHOLD_SETTINGS_QUERY_KEY = [
  "notification-threshold-settings",
] as const

/** Seeds the settings screen's preference list from `page.tsx`'s
 * server-fetched `initialData` (api-contracts.md's "always exactly 6
 * entries" guarantee) — see this file's own top JSDoc for why there is no
 * live refetch path. Returns `DefinedUseQueryResult` (not the plain
 * `UseQueryResult`): `initialData` is supplied as a plain value here, which
 * is TanStack Query's documented signal that `data` can never be
 * `undefined`, so callers never need an extra "is `data` loaded yet" guard
 * before reading it. */
export function useNotificationPreferences(
  initialData: NotificationPreferenceView[],
): DefinedUseQueryResult<NotificationPreferenceView[], Error> {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: () => Promise.resolve(initialData),
    initialData,
    staleTime: Infinity,
  })
}

/** Seeds the settings screen's threshold inputs from `page.tsx`'s
 * server-fetched `initialData` — same reasoning as
 * `useNotificationPreferences` above. */
export function useNotificationThresholdSettings(
  initialData: NotificationThresholdSettingsView,
): DefinedUseQueryResult<NotificationThresholdSettingsView, Error> {
  return useQuery({
    queryKey: NOTIFICATION_THRESHOLD_SETTINGS_QUERY_KEY,
    queryFn: () => Promise.resolve(initialData),
    initialData,
    staleTime: Infinity,
  })
}

/** Unwraps an `ApiResult`, throwing on failure — same single, consistent
 * convention `features/transactions/hooks/use-transactions.ts`'s `unwrap`
 * establishes, reused here rather than duplicated. */
function unwrap<T>(result: ApiResult<T>): T {
  if (!result.success) {
    throw new Error(result.error)
  }
  return result.data
}

/** `useMutation` wrapper around the `updateNotificationPreference` Server
 * Action — flips one trigger type's In-App and/or Email toggle. On success,
 * merges the single updated row back into the cached 6-entry list (never a
 * full-list `invalidateQueries`, per this file's own top JSDoc). */
export function useUpdateNotificationPreference(): UseMutationResult<
  NotificationPreferenceView,
  Error,
  UpdateNotificationPreferenceInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateNotificationPreferenceInput) =>
      unwrap(await updateNotificationPreference(input)),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationPreferenceView[]>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
        (current) =>
          (current ?? []).map((preference) =>
            preference.type === updated.type ? updated : preference,
          ),
      )
    },
  })
}

/** `useMutation` wrapper around the `updateNotificationThresholdSettings`
 * Server Action. On success, replaces the cached threshold settings outright
 * with the mutation's own resolved response — that Server Action always
 * returns the fully-resolved view (row/column absence already materialized
 * to a system default, per its own JSDoc), never a partial patch, so a
 * plain replace is correct here. */
export function useUpdateNotificationThresholdSettings(): UseMutationResult<
  NotificationThresholdSettingsView,
  Error,
  UpdateNotificationThresholdSettingsInput
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateNotificationThresholdSettingsInput) =>
      unwrap(await updateNotificationThresholdSettings(input)),
    onSuccess: (updated) => {
      queryClient.setQueryData(NOTIFICATION_THRESHOLD_SETTINGS_QUERY_KEY, updated)
    },
  })
}
