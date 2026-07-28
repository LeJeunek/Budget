import type { ReactElement } from "react"

import { getResendClient } from "./client"

/**
 * `sendNotificationEmail` — THE one function every trigger-evaluation
 * pipeline reaches the email provider through
 * (`features/notifications/server/email-dispatch.ts` is its one caller — see
 * that file's own JSDoc), per docs/architecture/phase-4b-technical-design.md
 * §4.
 *
 * **Never throws** — catches every failure internally (a thrown network
 * error from the Resend SDK, or Resend's own `{ error }` response shape) and
 * always resolves to a plain result object, the exact same "Result, not a
 * thrown error" philosophy `lib/ai/generate-structured-output.ts` already
 * established for a different third-party dependency. This is what
 * mechanically guarantees notifications-v2.md AC7 ("a failure to deliver an
 * email never affects or blocks the in-app notification for that same
 * event"): the caller literally cannot have an unhandled exception
 * propagate back out of this function into the in-app-notification code
 * path.
 *
 * Renders `template` (a plain React Email component tree — see
 * `./templates/*.tsx`) to both HTML and a plain-text fallback via Resend's
 * own `react` send parameter, which uses `@react-email/render` internally —
 * no second, hand-authored plain-text template to keep in sync (see
 * phase-4b-technical-design.md §4's "costs nothing in duplicated authoring
 * effort" reasoning).
 */

export interface SendNotificationEmailParams {
  to: string
  subject: string
  template: ReactElement
}

export interface SendNotificationEmailResult {
  sent: boolean
  /** Failure reason, present only when `sent` is `false` — observability
   * only (persisted onto `Notification.emailSendError` by `email-dispatch.ts`),
   * never surfaced to the user. */
  error?: string
}

export async function sendNotificationEmail(
  params: SendNotificationEmailParams,
): Promise<SendNotificationEmailResult> {
  try {
    const fromAddress = process.env.EMAIL_FROM_ADDRESS
    if (!fromAddress) {
      return { sent: false, error: "EMAIL_FROM_ADDRESS is not configured" }
    }

    const { error } = await getResendClient().emails.send({
      from: fromAddress,
      to: params.to,
      subject: params.subject,
      react: params.template,
    })

    if (error) {
      return { sent: false, error: error.message }
    }

    return { sent: true }
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown email send failure",
    }
  }
}
