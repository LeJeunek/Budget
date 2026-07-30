import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"
import { formatCurrency } from "./format"

/** `LOW_BALANCE` email (notifications-v2.md's Low Balance trigger). Props
 * mirror `LowBalanceNotification`'s in-app fields exactly — the account name
 * and its current balance, nothing else (never a routing/account number,
 * per AC6). */
export interface LowBalanceEmailProps {
  accountName: string
  balance: number
  /** Phase 4c: the recipient's own resolved `UserPreference.currencyDisplay`,
   * threaded from `email-dispatch.ts` — see `./format.ts`'s `formatCurrency`
   * JSDoc for the full cross-user-leakage rationale. */
  currency: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export function LowBalanceEmail({
  accountName,
  balance,
  currency,
  unsubscribeUrl,
  preferencesUrl,
}: LowBalanceEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`${accountName} balance is low`}
      heading="Low balance alert"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        Your <strong>{accountName}</strong> balance has dropped below your
        low-balance threshold. Current balance: {formatCurrency(balance, currency)}.
      </Text>
    </NotificationEmailLayout>
  )
}
