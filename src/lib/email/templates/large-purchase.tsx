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
  /** Phase 4c: the recipient's own resolved `UserPreference.currencyDisplay`,
   * threaded from `email-dispatch.ts` — see `./format.ts`'s `formatCurrency`
   * JSDoc for the full cross-user-leakage rationale. */
  currency: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export function LargePurchaseEmail({
  merchant,
  amount,
  date,
  currency,
  unsubscribeUrl,
  preferencesUrl,
}: LargePurchaseEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`A large purchase was recorded: ${formatCurrency(amount, currency)} at ${merchant}`}
      heading="Large purchase detected"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        A {formatCurrency(amount, currency)} purchase at <strong>{merchant}</strong> on{" "}
        {formatLongDate(date)} met or exceeded your large-purchase threshold.
      </Text>
    </NotificationEmailLayout>
  )
}
