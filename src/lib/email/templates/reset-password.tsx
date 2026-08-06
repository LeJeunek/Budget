import { Button, Hr, Section, Text } from "@react-email/components"

import { AuthEmailLayout } from "./auth-email-layout"

/**
 * Password reset email — sent by `lib/auth.ts`'s `emailAndPassword.
 * sendResetPassword` callback via `send-auth-email.ts`.
 *
 * Deliberately does NOT reuse `NotificationEmailLayout` (`./shared-layout.tsx`):
 * that layout always renders an "unsubscribe from this notification type"
 * footer, which makes no sense for a security-critical transactional email
 * a user cannot opt out of. `AuthEmailLayout` is the plain frame this file
 * and any future auth email (e.g. email verification) shares instead.
 */
export interface ResetPasswordEmailProps {
  /** Better Auth's own already-built reset URL (`sendResetPassword`'s `url`
   * param) — this file renders it as-is, never constructs its own link. See
   * `send-auth-email.ts`'s own JSDoc for why. */
  resetUrl: string
}

export function ResetPasswordEmail({ resetUrl }: ResetPasswordEmailProps) {
  return (
    <AuthEmailLayout
      previewText="Reset your FinanceOS password"
      heading="Reset your password"
    >
      <Text style={{ fontSize: "14px", color: "#374151" }}>
        We received a request to reset the password for your FinanceOS
        account. Click the button below to choose a new one.
      </Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button
          href={resetUrl}
          style={{
            backgroundColor: "#111827",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Reset password
        </Button>
      </Section>
      <Text style={{ fontSize: "13px", color: "#6b7280" }}>
        This link expires in 1 hour. If you didn&apos;t request a password
        reset, you can safely ignore this email — your password won&apos;t
        be changed.
      </Text>
      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
      <Text style={{ fontSize: "12px", color: "#9ca3af", wordBreak: "break-all" }}>
        Or paste this link into your browser: {resetUrl}
      </Text>
    </AuthEmailLayout>
  )
}
