"use client"

/**
 * NotificationPreferencesList — the six trigger types' In-App/Email toggle
 * grid (docs/product/notifications-v2.md's Email Delivery Channel AC2:
 * "A single notification-preferences screen lists every trigger type ...
 * each with two independent toggles: In-App and Email").
 *
 * Receives the Server Component page's already-fetched
 * `getNotificationPreferences(userId)` result as `initialPreferences`
 * (api-contracts.md's Phase 4b "Server Component direct call" read) and
 * seeds `useNotificationPreferences` with it — see that hook's own JSDoc for
 * why there is no independent client-side refetch path.
 *
 * **UI Component Engineer follow-up flagged here:** the In-App/Email toggle
 * below (`PreferenceToggleButton`) is a small `Button`-based `role="switch"`
 * composition, not a shadcn `Switch` primitive — no `Switch` (or
 * `Checkbox`/`Toggle`) component exists yet under `components/ui/` as of
 * this feature. Per the Frontend Lead's "assemble, never build reusable
 * components" mandate, adding a real shadcn `Switch` primitive there is the
 * UI Component Engineer's artifact to build, not this file's; this
 * `aria-checked`/`role="switch"` stand-in reuses the exact toggle-button
 * composition `components/shared/sidebar.tsx`'s own collapse control already
 * established as this codebase's one existing precedent for a boolean
 * toggle built from already-installed primitives alone, so this screen isn't
 * blocked on that follow-up landing first.
 *
 * **Bug fix (Phase 4b):** `PreferenceToggleButton` calls
 * `useUpdateNotificationPreference()` itself, giving each of the 14 toggle
 * buttons (7 trigger types × In-App/Email) its own independent `useMutation`
 * instance, rather than this list hoisting a single shared instance and
 * reusing it for every row. A single shared instance's `isPending`/
 * `variables` reflect only the most-recently-invoked `mutate()` call — with
 * 14 toggles sharing one instance, clicking a different row's toggle while
 * an earlier one was still in flight silently cleared the earlier row's
 * "pending" disabled state (`variables` had moved on to the new call),
 * permitting overlapping requests for the same preference row and a
 * stale-response-wins race in `onSuccess`'s unconditional cache write. See
 * docs/testing/bug-reports/
 * notification-preferences-shared-mutation-defeats-pending-guard.md. Giving
 * every toggle its own mutation instance (React's normal
 * one-hook-instance-per-component-instance behavior) makes each button's own
 * `isPending` exactly and only reflect its own in-flight request, with no
 * `variables`-matching guard needed at all.
 */

import { toast } from "sonner"

import type { NotificationPreferenceView, NotificationType } from "@/features/notifications/types"
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "@/features/notifications/hooks/use-notification-preferences"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Same six-type order `server/preferences.ts`'s `ALL_NOTIFICATION_TYPES`
// documents (v1's two, then the four Phase 4b additions) — duplicated here
// rather than imported, since that module lives under
// `features/notifications/server/` and can't be imported from a Client
// Component.
const NOTIFICATION_TYPE_ORDER: NotificationType[] = [
  "BUDGET_OVER",
  "BILL_DUE_SOON",
  "BILL_LATE",
  "GOAL_ACHIEVED",
  "LARGE_PURCHASE",
  "LOW_BALANCE",
  "MONTHLY_SUMMARY_READY",
]

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  BUDGET_OVER: "Over Budget",
  BILL_DUE_SOON: "Bill Due Soon",
  BILL_LATE: "Bill Late",
  GOAL_ACHIEVED: "Goal Achieved",
  LARGE_PURCHASE: "Large Purchase",
  LOW_BALANCE: "Low Balance",
  MONTHLY_SUMMARY_READY: "Monthly Summary Ready",
}

const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  BUDGET_OVER: "A budgeted category's spending exceeds its allocation this month.",
  BILL_DUE_SOON: "A bill is due within the next few days.",
  BILL_LATE: "A bill has passed its due date without being marked paid.",
  GOAL_ACHIEVED: "A Financial Goal reaches its target and completes.",
  LARGE_PURCHASE: "A single expense crosses your Large Purchase threshold.",
  LOW_BALANCE: "An eligible account's balance drops below your Low Balance threshold.",
  MONTHLY_SUMMARY_READY: "Your monthly recap narrative is ready to view.",
}

/**
 * One toggle button, fully self-contained: owns its own
 * `useUpdateNotificationPreference()` mutation instance (see this file's top
 * JSDoc "Bug fix" note for why), so its `disabled` state during an in-flight
 * update can never be affected by any other toggle being clicked elsewhere
 * on the screen.
 */
function PreferenceToggleButton({
  type,
  field,
  label,
  checked,
}: {
  type: NotificationType
  field: "inAppEnabled" | "emailEnabled"
  label: string
  checked: boolean
}) {
  const updatePreference = useUpdateNotificationPreference()

  function handleToggle() {
    updatePreference.mutate(
      { type, [field]: !checked },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not update notification preference.",
          ),
      },
    )
  }

  return (
    <Button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      variant={checked ? "default" : "outline"}
      size="sm"
      disabled={updatePreference.isPending}
      onClick={handleToggle}
      className="w-14 justify-center"
    >
      {checked ? "On" : "Off"}
    </Button>
  )
}

export interface NotificationPreferencesListProps {
  initialPreferences: NotificationPreferenceView[]
}

export function NotificationPreferencesList({
  initialPreferences,
}: NotificationPreferencesListProps) {
  const { data: preferences } = useNotificationPreferences(initialPreferences)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Choose which alerts you see in-app and which are also emailed to
          you. Email is off by default for every alert type until you turn
          it on here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 pb-2 text-xs font-medium text-muted-foreground">
            <span>Alert</span>
            <span className="text-center">In-App</span>
            <span className="text-center">Email</span>
          </div>
          {NOTIFICATION_TYPE_ORDER.map((type) => {
            const preference = preferences.find((item) => item.type === type)
            const inAppEnabled = preference?.inAppEnabled ?? true
            const emailEnabled = preference?.emailEnabled ?? false

            return (
              <div key={type} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {NOTIFICATION_TYPE_LABELS[type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {NOTIFICATION_TYPE_DESCRIPTIONS[type]}
                  </p>
                </div>
                <div className="flex justify-center">
                  <PreferenceToggleButton
                    type={type}
                    field="inAppEnabled"
                    label={`${NOTIFICATION_TYPE_LABELS[type]} in-app notifications`}
                    checked={inAppEnabled}
                  />
                </div>
                <div className="flex justify-center">
                  <PreferenceToggleButton
                    type={type}
                    field="emailEnabled"
                    label={`${NOTIFICATION_TYPE_LABELS[type]} email notifications`}
                    checked={emailEnabled}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
