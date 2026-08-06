import type { ReactElement } from "react"

import { getResendClient } from "./client"

/**
 * `sendAuthEmail` — the send path for security-critical, transactional auth
 * emails (password reset today). Deliberately separate from
 * `sendNotificationEmail` (`./send-notification-email.ts`): that function
 * gates every send behind the `EMAIL_DELIVERY` feature flag
 * (`docs/product/admin.md` Capability 4's AI/email kill switch), which is
 * scoped to *optional* notification-preference emails a user opted into —
 * a password reset is not optional, and a user who can't sign in has no way
 * to be told the flag is off anyway. This function is never gated by that
 * flag.
 *
 * Same "never throws, always resolves a result object" shape as
 * `sendNotificationEmail` for the identical reason: a thrown error here
 * would otherwise propagate into Better Auth's `sendResetPassword` callback
 * and could surface as a raw 500 to a user who just wants to reset their
 * password.
 */

export interface SendAuthEmailParams {
  to: string
  subject: string
  template: ReactElement
}

export interface SendAuthEmailResult {
  sent: boolean
  error?: string
}

/** Mirrors `send-notification-email.ts`'s own `EMAIL_SEND_TIMEOUT_MS` choice
 * and reasoning — see that file's JSDoc for why 8s and why a `Promise.race`
 * (the installed `resend` SDK's `Emails.send` has no native abort/timeout
 * option). */
const EMAIL_SEND_TIMEOUT_MS = 8000

class EmailSendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Resend send timed out after ${timeoutMs}ms`)
    this.name = "EmailSendTimeoutError"
  }
}

function withTimeout<T>(sendPromise: Promise<T>, timeoutMs: number): Promise<T> {
  sendPromise.catch(() => {
    // Intentionally ignored — see send-notification-email.ts's identical
    // no-op catch for the full reasoning.
  })

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new EmailSendTimeoutError(timeoutMs))
    }, timeoutMs)

    sendPromise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

export async function sendAuthEmail(params: SendAuthEmailParams): Promise<SendAuthEmailResult> {
  try {
    const fromAddress = process.env.EMAIL_FROM_ADDRESS
    if (!fromAddress) {
      return { sent: false, error: "EMAIL_FROM_ADDRESS is not configured" }
    }

    const { error } = await withTimeout(
      getResendClient().emails.send({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        react: params.template,
      }),
      EMAIL_SEND_TIMEOUT_MS,
    )

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
