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
 * error from the Resend SDK, Resend's own `{ error }` response shape, or this
 * function's own send timeout below) and always resolves to a plain result
 * object, the exact same "Result, not a thrown error" philosophy
 * `lib/ai/generate-structured-output.ts` already established for a different
 * third-party dependency. This is what mechanically guarantees
 * notifications-v2.md AC7 ("a failure to deliver an email never affects or
 * blocks the in-app notification for that same event"): the caller literally
 * cannot have an unhandled exception propagate back out of this function
 * into the in-app-notification code path.
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

/**
 * Upper bound on how long a single `resend.emails.send` call is allowed to
 * hang before this function gives up on it and resolves the already-correct
 * `{ sent: false, error }` failure path instead. The installed `resend`
 * SDK's `Emails.send(payload, options?: CreateEmailRequestOptions)` accepts
 * only `{ query, headers, idempotencyKey }` (`node_modules/resend/dist/
 * index.d.mts`'s `PostOptions`/`IdempotentRequest`) — no `AbortSignal`/timeout
 * option — so this is enforced with `Promise.race` against a timer instead
 * of an SDK-native option. 8s sits in the middle of the 5–10s range
 * docs/performance/phase-4b-performance-review.md Finding 6 recommends: long
 * enough that a normal (typically sub-second, per that finding's own
 * "steady state" framing) Resend response is never falsely cut off, short
 * enough to bound both a single poll's wall-clock time and the cron sweep's
 * fully-sequential per-user loop (`features/notifications/server/service.ts`'s
 * `evaluateNotificationsForAllUsers`). Exported (rather than kept private)
 * solely so `send-notification-email.test.ts` can drive a fake-timers test
 * up to exactly this boundary instead of guessing/over-advancing an opaque
 * duration.
 */
export const EMAIL_SEND_TIMEOUT_MS = 8000

/** Distinguishes "the send timed out" from any other thrown/rejected error
 * for `sendNotificationEmail`'s catch block below — its `message` is what
 * ultimately lands in `error`, so it reads clearly in logs/`Notification.
 * emailSendError` rather than a generic rejection message. */
class EmailSendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Resend send timed out after ${timeoutMs}ms`)
    this.name = "EmailSendTimeoutError"
  }
}

/**
 * Races `sendPromise` against an `EMAIL_SEND_TIMEOUT_MS` timer. If the timer
 * wins, `sendPromise` is deliberately left running rather than cancelled (the
 * SDK exposes no abort mechanism to cancel it with — see
 * `EMAIL_SEND_TIMEOUT_MS`'s own JSDoc) but is given a no-op `.catch` handler
 * so a late rejection from it can never surface as an unhandled promise
 * rejection after this function has already resolved via the timeout path.
 */
function withTimeout<T>(sendPromise: Promise<T>, timeoutMs: number): Promise<T> {
  sendPromise.catch(() => {
    // Intentionally ignored — see this function's own JSDoc. Any real
    // failure from `sendPromise` itself is still surfaced normally when the
    // timeout does NOT win the race (the `await` below rejects as usual).
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

export async function sendNotificationEmail(
  params: SendNotificationEmailParams,
): Promise<SendNotificationEmailResult> {
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
