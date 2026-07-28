# Bug Report: Notification Preferences screen shares one `useMutation` instance across all 14 toggle buttons — toggling any row silently re-enables a different row whose own update is still in flight, opening a stale-response-wins race that can leave the UI showing a preference state that doesn't match what's persisted

## Severity
**Medium** — no crash, but a genuine state-correctness bug in a settings screen that gates whether FinanceOS emails a user financial content (notifications-v2.md AC1: "email delivery is off by default... an explicit, per-trigger-type opt-in is required"); the failure mode is the UI silently disagreeing with the database after ordinary, plausible rapid interaction (toggling two different rows within the same round-trip window), with no error, no visual staleness indicator, and no way for the user to detect it short of reloading the page.

## Component
`src/features/notifications/components/notification-preferences-list.tsx` lines 112-186 (`NotificationPreferencesList`, `PreferenceToggle`, the shared `isPending` guard at line 155-156)
`src/features/notifications/hooks/use-notification-preferences.ts` lines 105-124 (`useUpdateNotificationPreference`)

## Summary
`NotificationPreferencesList` calls `useUpdateNotificationPreference()` **exactly once** (line 116), producing a single shared TanStack Query `useMutation` object reused across all 7 trigger types × 2 channels (In-App/Email) = 14 toggle buttons. Each row's own "disable while its own update is pending" guard is:

```ts
const isPending =
  updatePreference.isPending && updatePreference.variables?.type === type
```

(lines 155-156). A `useMutation` instance's `isPending`/`variables` reflect the state of the **most recently invoked** `mutate()` call on that shared instance — not a per-call or per-row pending set. When two different rows' toggles are clicked in quick succession (a single mutation instance supports concurrent in-flight `mutate()` calls; TanStack Query does not block a second `mutate()` while a first is still resolving), `variables` is overwritten by the second call the instant it's invoked, **before** the first call's request has resolved.

Concretely:
1. User clicks the In-App toggle for `BUDGET_OVER` → `updatePreference.mutate({ type: "BUDGET_OVER", inAppEnabled: false })`. `variables.type === "BUDGET_OVER"`, `isPending === true` → the `BUDGET_OVER` row's two buttons become `disabled` (line 172/180's `disabled={isPending}`), correctly.
2. Before that request resolves (any real-world latency — a Server Action cold start, a slow connection, or simply two clicks within the same network round-trip), the user clicks the Email toggle for a **different** row, `BILL_DUE_SOON` → `updatePreference.mutate({ type: "BILL_DUE_SOON", emailEnabled: true })` on the **same shared mutation instance**.
3. `variables` is now `{ type: "BILL_DUE_SOON", emailEnabled: true }`. Re-evaluating the guard for the `BUDGET_OVER` row: `isPending && variables?.type === "BUDGET_OVER"` is now **`false`** (`variables.type` no longer matches), even though `BUDGET_OVER`'s own update request is still genuinely in flight on the server. Its two toggle buttons become clickable again.
4. The user, seeing an apparently-idle `BUDGET_OVER` row, clicks its In-App toggle a second time (e.g. toggling it back on) — firing a **third** concurrent `mutate()` call against the same `(userId, "BUDGET_OVER")` preference row, overlapping with the still-unresolved first call from step 1.
5. Each call's `onSuccess` (lines 114-122) unconditionally overwrites the cached list entry for that `type` with whatever that call's own response payload was (`queryClient.setQueryData(..., (current) => current.map((p) => p.type === updated.type ? updated : p))`) — there is no request sequencing, no `AbortController`, no `cancelQueries`, and no comparison against a request timestamp/version. If the two overlapping `BUDGET_OVER` requests' responses arrive out of order relative to when they were sent (plausible under any real network jitter or backend latency variance — nothing in this code path guarantees FIFO response ordering for two independently-dispatched Server Action invocations), the **earlier, now-stale** response can overwrite the **later, more current** one in the query cache after both have completed, leaving the UI displaying a toggle state that does not match what is actually persisted in `NotificationPreference` — silently, with no toast, no error, and no staleness indicator (`isPending` is `false` again for that row by then, so it looks fully settled).

This is exactly the "rapid double-click on the same toggle... does the UI ever show a state that doesn't match what's persisted" scenario, made *more* likely to manifest here than an ordinary same-row double-click would be, because the guard's flaw is specifically triggered by clicking a **different** row in between — an entirely ordinary interaction pattern for a settings screen with 14 independent toggles, not an edge-case double-click.

## Reproduction Steps
1. Open the Notification Preferences settings screen (`/settings/notifications`).
2. Throttle the network (e.g. browser DevTools "Slow 3G") or otherwise introduce artificial latency to the `updateNotificationPreference` Server Action, so each toggle's round-trip takes a few seconds.
3. Click the In-App toggle for `BUDGET_OVER`. Confirm its two buttons become disabled (`role="switch"` `disabled`).
4. Before it resolves, click the Email toggle for `BILL_DUE_SOON` (a different row).
5. Observe: the `BUDGET_OVER` row's buttons become enabled again immediately, despite its own request from step 3 still being in flight (verify via the network panel — the first request has not yet completed).
6. Click the In-App toggle for `BUDGET_OVER` again right away (now re-toggling it), issuing a second, overlapping request for the same `(userId, "BUDGET_OVER")` row while the first is still outstanding.
7. Let both `BUDGET_OVER` requests resolve. Reload the page (forcing a fresh server-fetched `initialPreferences`, bypassing the client cache) and compare the persisted `In-App` state for `BUDGET_OVER` against what the UI showed immediately after step 6, before the reload — under adverse-but-plausible response ordering (the step-3 request's response completing after the step-6 request's), the two will disagree.

## Expected Behavior
A toggle's controls should remain disabled for the full duration of its **own** in-flight mutation, independent of whichever other row was clicked afterward — and the settings screen should never display a persisted preference state that disagrees with what the database actually holds once all in-flight requests for that row have settled, regardless of network response ordering.

## Actual Behavior
The shared `useMutation` instance's single `variables`/`isPending` state is keyed off only the most-recently-invoked call, so clicking any other row's toggle silently clears the "pending" disabled state for a row whose own update is still outstanding — permitting an overlapping second request for that same row and, because `onSuccess` writes each response into the cache unconditionally with no sequencing/cancellation, exposing a stale-response-wins race that can leave the UI showing a toggle state that does not match what is actually persisted.

## Suggested Owner
Frontend Lead / Feature owner of `src/features/notifications/components/notification-preferences-list.tsx` and `src/features/notifications/hooks/use-notification-preferences.ts` — the fix boundary is either giving each row its own mutation instance (e.g. one `useUpdateNotificationPreference()` call per rendered row rather than one shared instance for the whole list) or tracking per-row pending state independently of the shared mutation's own `variables`/`isPending`, plus guarding `onSuccess`'s cache write against being superseded by a since-completed, more-recent request for the same `type`.
