import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

/**
 * Shared page frame for every notification email template — the
 * `lib/email/` equivalent of `features/reports/server/pdf/document-shell.tsx`'s
 * shared `<ReportDocument>` shell (same reasoning: one reusable structural
 * primitive every per-trigger-type template composes, rather than seven
 * near-duplicate top-level layouts). Not itself one of the seven
 * per-trigger-type templates naming-standards.md's Phase 4b note lists, so
 * it deliberately does NOT live at `templates/<trigger-type>.tsx` — mirrors
 * Reports' own "shared, non-suffixed layout primitives" precedent for the
 * identical reason.
 *
 * Renders the required unsubscribe + manage-preferences links on every
 * email (notifications-v2.md AC5: "every notification email includes a
 * clear, working way to manage or disable that email type going forward")
 * — callers never have to remember to add these themselves.
 */
export interface NotificationEmailLayoutProps {
  /** Short one-line summary shown in most email clients' inbox preview pane,
   * before the email is opened — never anything beyond what the in-app
   * notification itself already shows (AC6's data-minimization rule). */
  previewText: string
  heading: string
  children: ReactNode
  unsubscribeUrl: string
  preferencesUrl: string
}

export function NotificationEmailLayout({
  previewText,
  heading,
  children,
  unsubscribeUrl,
  preferencesUrl,
}: NotificationEmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "Arial, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            borderRadius: "8px",
            maxWidth: "480px",
          }}
        >
          <Heading as="h2" style={{ fontSize: "20px", color: "#111827" }}>
            {heading}
          </Heading>
          {children}
          <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
          <Section>
            <Text style={{ fontSize: "12px", color: "#6b7280" }}>
              FinanceOS sent you this email because you opted in to this
              notification type.{" "}
              <Link href={unsubscribeUrl} style={{ color: "#6b7280" }}>
                Unsubscribe from this notification type
              </Link>{" "}
              or{" "}
              <Link href={preferencesUrl} style={{ color: "#6b7280" }}>
                manage all notification preferences
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
