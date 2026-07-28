import { Text } from "@react-email/components"

import { NotificationEmailLayout } from "./shared-layout"

/** `MONTHLY_SUMMARY_READY` email (notifications-v2.md's Monthly Summary
 * trigger). `narrative` is rendered as a plain `<Text>` node — never
 * `dangerouslySetInnerHTML`, never a markdown-to-HTML pipeline — the exact
 * verbatim `MonthlySummary.narrative` text, per AC4's "never a new
 * paraphrase... if an email body includes any of the narrative itself, it
 * must be the persisted text exactly as stored." */
export interface MonthlySummaryReadyEmailProps {
  month: string
  narrative: string
  unsubscribeUrl: string
  preferencesUrl: string
}

export function MonthlySummaryReadyEmail({
  month,
  narrative,
  unsubscribeUrl,
  preferencesUrl,
}: MonthlySummaryReadyEmailProps) {
  return (
    <NotificationEmailLayout
      previewText={`Your ${month} recap is ready`}
      heading="Your monthly recap is ready"
      unsubscribeUrl={unsubscribeUrl}
      preferencesUrl={preferencesUrl}
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>{narrative}</Text>
    </NotificationEmailLayout>
  )
}
