import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"
import { formatCurrency } from "./format"

/**
 * `BUDGET_OVER` email — Notifications v1's original trigger, gaining an
 * email channel for the first time in Phase 4b (notifications-v2.md's
 * "extended to v1's original two triggers too, not just the four new ones").
 * Props are exactly the same fields `BudgetOverNotification` (../../features/
 * notifications/types.ts) already shows in-app, plus the two required links
 * — per AC6's data-minimization rule.
 */
export interface BudgetOverEmailProps {
  categoryName: string
  allocated: number
  /** Phase 4c: the recipient's own resolved `UserPreference.currencyDisplay`,
   * threaded from `email-dispatch.ts` — see `./format.ts`'s `formatCurrency`
   * JSDoc for the full cross-user-leakage rationale. */
  currency: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export function BudgetOverEmail({
  categoryName,
  allocated,
  currency,
  unsubscribeUrl,
  preferencesUrl,
}: BudgetOverEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`You're over budget in ${categoryName}`}
      heading="You're over budget"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        Your spending in <strong>{categoryName}</strong> has gone over its
        allocated budget of {formatCurrency(allocated, currency)} for this month.
      </Text>
    </NotificationEmailLayout>
  )
}
