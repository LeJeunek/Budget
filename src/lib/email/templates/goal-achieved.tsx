import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"

/** `GOAL_ACHIEVED` email (notifications-v2.md's Goal Achieved trigger). Props
 * mirror `GoalAchievedNotification`'s in-app fields exactly — just the
 * goal's own name, nothing else, per AC6's data-minimization rule. */
export interface GoalAchievedEmailProps {
  goalName: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export function GoalAchievedEmail({
  goalName,
  unsubscribeUrl,
  preferencesUrl,
}: GoalAchievedEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`You reached your goal: ${goalName}`}
      heading="Goal achieved!"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        Congratulations — you&apos;ve reached your goal, <strong>{goalName}</strong>
        . Open FinanceOS to see the details.
      </Text>
    </NotificationEmailLayout>
  )
}
