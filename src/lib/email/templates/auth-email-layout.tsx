import { Body, Container, Head, Heading, Html, Preview } from "@react-email/components"
import type { ReactNode } from "react"

/**
 * Shared page frame for transactional auth emails (password reset today;
 * email verification would use this too if that's ever added). Mirrors
 * `./shared-layout.tsx`'s `NotificationEmailLayout` visual style (same
 * fonts/colors/container) but WITHOUT that layout's unsubscribe/manage-
 * preferences footer — these emails are security-critical and a user has
 * no notification-preference control over whether they're sent, so that
 * footer would be actively misleading here, not just unnecessary.
 */
export interface AuthEmailLayoutProps {
  previewText: string
  heading: string
  children: ReactNode
}

export function AuthEmailLayout({ previewText, heading, children }: AuthEmailLayoutProps) {
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
        </Container>
      </Body>
    </Html>
  )
}
