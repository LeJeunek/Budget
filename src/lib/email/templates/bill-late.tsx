import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"
import { formatCurrency, formatLongDate } from "./format"

/** `BILL_LATE` email — see `budget-over.tsx`'s JSDoc for the "v1 trigger
 * gaining an email channel" framing, identical here. Props mirror
 * `BillLateNotification`'s in-app fields exactly. */
export interface BillLateEmailProps {
  billName: string
  dueDate: Date
  expectedAmount: number
  unsubscribeUrl: string
  preferencesUrl: string
}

export function BillLateEmail({
  billName,
  dueDate,
  expectedAmount,
  unsubscribeUrl,
  preferencesUrl,
}: BillLateEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`${billName} is overdue`}
      heading="A bill is overdue"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        <strong>{billName}</strong> ({formatCurrency(expectedAmount)}) was due
        on {formatLongDate(dueDate)} and has not been marked paid.
      </Text>
    </NotificationEmailLayout>
  )
}
