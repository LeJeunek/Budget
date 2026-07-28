import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"
import { formatCurrency, formatLongDate } from "./format"

/** `BILL_DUE_SOON` email — see `budget-over.tsx`'s JSDoc for the "v1 trigger
 * gaining an email channel" framing, identical here. Props mirror
 * `BillDueSoonNotification`'s in-app fields exactly. */
export interface BillDueSoonEmailProps {
  billName: string
  dueDate: Date
  expectedAmount: number
  unsubscribeUrl: string
  preferencesUrl: string
}

export function BillDueSoonEmail({
  billName,
  dueDate,
  expectedAmount,
  unsubscribeUrl,
  preferencesUrl,
}: BillDueSoonEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`${billName} is due soon`}
      heading="A bill is due soon"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        <strong>{billName}</strong> ({formatCurrency(expectedAmount)}) is due
        on {formatLongDate(dueDate)}.
      </Text>
    </NotificationEmailLayout>
  )
}
