"use client"

/**
 * NotificationThresholdSettingsForm — the two user-adjustable dollar
 * thresholds Large Purchase / Low Balance evaluate against
 * (notifications-v2.md's Large Purchase AC4 / Low Balance AC2: "a
 * system-proposed default the user can change at any time").
 *
 * Receives the Server Component page's already-fetched
 * `getNotificationThresholdSettings(userId)` result as `initialSettings`
 * (already resolved to the system defaults — $500 / $100, per
 * `server/preferences.ts` — when the user has never customized either
 * value) and seeds `useNotificationThresholdSettings` with it. See that
 * hook's own JSDoc for why there is no independent client-side refetch
 * path.
 */

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import type { NotificationThresholdSettingsView } from "@/features/notifications/types"
import {
  useNotificationThresholdSettings,
  useUpdateNotificationThresholdSettings,
} from "@/features/notifications/hooks/use-notification-preferences"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export interface NotificationThresholdSettingsFormProps {
  initialSettings: NotificationThresholdSettingsView
}

export function NotificationThresholdSettingsForm({
  initialSettings,
}: NotificationThresholdSettingsFormProps) {
  const { data: settings } = useNotificationThresholdSettings(initialSettings)
  const updateSettings = useUpdateNotificationThresholdSettings()

  const [largePurchaseThreshold, setLargePurchaseThreshold] = useState(
    String(settings.largePurchaseThreshold),
  )
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(
    String(settings.lowBalanceThreshold),
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const largePurchase = Number(largePurchaseThreshold)
    const lowBalance = Number(lowBalanceThreshold)

    if (!Number.isFinite(largePurchase) || largePurchase < 0) {
      toast.error("Large purchase threshold must be a non-negative number.")
      return
    }
    if (!Number.isFinite(lowBalance) || lowBalance < 0) {
      toast.error("Low balance threshold must be a non-negative number.")
      return
    }

    updateSettings.mutate(
      { largePurchaseThreshold: largePurchase, lowBalanceThreshold: lowBalance },
      {
        onSuccess: () => toast.success("Threshold settings saved"),
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not save threshold settings.",
          ),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alert thresholds</CardTitle>
        <CardDescription>
          A single expense at or above your Large Purchase threshold, or an
          eligible checking/savings/cash account balance that drops below
          your Low Balance threshold, triggers an alert.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="large-purchase-threshold">Large purchase threshold ($)</Label>
            <Input
              id="large-purchase-threshold"
              type="number"
              min={0}
              step="0.01"
              value={largePurchaseThreshold}
              onChange={(event) => setLargePurchaseThreshold(event.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="low-balance-threshold">Low balance threshold ($)</Label>
            <Input
              id="low-balance-threshold"
              type="number"
              min={0}
              step="0.01"
              value={lowBalanceThreshold}
              onChange={(event) => setLowBalanceThreshold(event.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save thresholds"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
