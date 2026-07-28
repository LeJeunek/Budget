import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"
import { formatCurrency, formatLongDate } from "./format"

/** `LARGE_PURCHASE` email (notifications-v2.md's Large Purchase trigger).
 * Props mirror `LargePurchaseNotification`'s in-app fields exactly — the
 * merchant, amount, and date, nothing beyond what the in-app card shows
 * (AC6). No merchant/notes text is ever rendered as HTML — `merchant` is a
 * plain text node here, never `dangerouslySetInnerHTML`. */
export interface LargePurchaseEmailProps {
  merchant: string
  amount: number
  date: Date
  unsubscribeUrl: string
  preferencesUrl: string
}

export function LargePurchaseEmail({
  merchant,
  amount,
  date,
  unsubscribeUrl,
  preferencesUrl,
}: LargePurchaseEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`A large purchase was recorded: ${formatCurrency(amount)} at ${merchant}`}
      heading="Large purchase detected"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        A {formatCurrency(amount)} purchase at <strong>{merchant}</strong> on{" "}
        {formatLongDate(date)} met or exceeded your large-purchase threshold.
      </Text>
    </NotificationEmailLayout>
  )
}
