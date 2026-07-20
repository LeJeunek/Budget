"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api-response"
import type { Notification } from "@/features/notifications/types"
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/server/actions"

/**
 * TanStack Query hook(s) for the notification bell
 * (`components/notification-bell.tsx`), following the exact pattern already
 * established by `features/bills/hooks/use-bills.ts` and
 * `features/transactions/hooks/use-transactions.ts`: a query key + fetcher
 * for the read (via `GET /api/notifications`, since the Server Component-only
 * `service.ts` can't be called from a Client Component — see that route's own
 * JSDoc), and `useMutation` wrappers around this feature's three Server
 * Actions for writes, each invalidating the cached inbox on success so the
 * bell/badge reflect the change without waiting for the next poll.
 */

/** Shared TanStack Query cache key for the notification inbox. Unlike
 * `transactionsQueryKey`/`billsQueryKey`, this takes no arguments — the
 * inbox has no filter/pagination surface (`GET /api/notifications` always
 * returns the same "active, newest first" list for the current user), so a
 * single fixed key is sufficient. Exported for the rare case a caller wants
 * to invalidate it directly rather than via one of the mutation hooks below. */
export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const

/**
 * Polling interval for the inbox: 60 seconds. The bell is meant to be
 * "ambient" per docs/product/calendar-and-notifications.md's AC3 (reachable
 * from anywhere without navigating, not a one-time toast), so it needs to
 * notice newly-materialized BUDGET_OVER/BILL_DUE_SOON/BILL_LATE rows without
 * a manual page refresh — but nothing in this feature is time-critical
 * enough (these are day-granularity conditions: over budget "this month",
 * due "in a few days") to justify sub-minute polling load on every
 * authenticated page for every signed-in user. TanStack Query's
 * `refetchOnWindowFocus` default (on) covers the common "came back to this
 * tab" case sooner than the next scheduled tick, so 60s only governs the
 * steady-state background cadence while a tab is left open and focused.
 */
const POLL_INTERVAL_MS = 60_000

export interface NotificationsInboxData {
  items: Notification[]
  unreadCount: number
}

/**
 * Client-safe fetcher for the inbox. Calls `GET /api/notifications` (see
 * src/app/api/notifications/route.ts) rather than `service.getNotifications`
 * directly — Server Component-only modules under `features/notifications/server`
 * can't be imported from a Client Component, same boundary every other
 * feature's hook already respects.
 */
async function fetchNotifications(): Promise<NotificationsInboxData> {
  const response = await fetch("/api/notifications")
  const result = (await response.json()) as ApiResult<NotificationsInboxData>

  if (!result.success) {
    throw new Error(result.error)
  }

  return result.data
}

/**
 * The notification bell's single data source: `{ items, unreadCount }`,
 * polled on `POLL_INTERVAL_MS`. `items` is already denormalized per-type
 * (see `../types.ts`) so the bell never needs a second fetch to render a
 * category/bill name.
 */
export function useNotifications(): UseQueryResult<NotificationsInboxData, Error> {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: fetchNotifications,
    refetchInterval: POLL_INTERVAL_MS,
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

/** Invalidates the cached inbox — shared by every mutation hook below since
 * a read/dismiss/mark-all-read always changes both `items` and
 * `unreadCount` together. */
function useInvalidateNotifications() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
}

/** `useMutation` wrapper around the `markNotificationRead` Server Action. */
export function useMarkNotificationRead(): UseMutationResult<
  Notification,
  Error,
  { id: string }
> {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await markNotificationRead(input)),
    onSuccess: () => invalidate(),
  })
}

/** `useMutation` wrapper around the `dismissNotification` Server Action.
 * Per AC4, this only removes the row from the inbox — it never touches
 * Budgeting/Bills data, so no other feature's query needs invalidating. */
export function useDismissNotification(): UseMutationResult<
  Notification,
  Error,
  { id: string }
> {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await dismissNotification(input)),
    onSuccess: () => invalidate(),
  })
}

/** `useMutation` wrapper around the `markAllNotificationsRead` Server Action
 * — the bell's "Mark all read" action. */
export function useMarkAllNotificationsRead(): UseMutationResult<
  { count: number },
  Error,
  void
> {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutationFn: async () => unwrap(await markAllNotificationsRead()),
    onSuccess: () => invalidate(),
  })
}
