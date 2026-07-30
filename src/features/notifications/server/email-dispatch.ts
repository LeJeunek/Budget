import { createElement, type ReactElement } from "react"

import { db } from "@/lib/db"
import { getUserPreference } from "@/features/settings/server/service"
import { sendNotificationEmail } from "@/lib/email/send-notification-email"
import { generateUnsubscribeToken } from "@/lib/email/unsubscribe-token"
import { BudgetOverEmail } from "@/lib/email/templates/budget-over"
import { BillDueSoonEmail } from "@/lib/email/templates/bill-due-soon"
import { BillLateEmail } from "@/lib/email/templates/bill-late"
import { GoalAchievedEmail } from "@/lib/email/templates/goal-achieved"
import { LargePurchaseEmail } from "@/lib/email/templates/large-purchase"
import { LowBalanceEmail } from "@/lib/email/templates/low-balance"
import { MonthlySummaryReadyEmail } from "@/lib/email/templates/monthly-summary-ready"

import type { Notification } from "../types"
import { getEmailEnabledForType } from "./preferences"

/**
 * `dispatchNotificationEmail` — THE one shared step `service.ts`'s
 * `ensureNotifications` calls once per newly-created `Notification` row,
 * regardless of trigger type, per docs/architecture/phase-4b-technical-design.md
 * §6. Single responsibility: "given an already-created notification, maybe
 * email it" — this file never evaluates any trigger condition itself.
 *
 * Built with `React.createElement` rather than JSX so this file can stay a
 * plain `.ts` module — naming-standards.md's Phase 4b note names this file
 * `email-dispatch.ts`, and `server/` files in this codebase are otherwise
 * never `.tsx` (that suffix is reserved for actual rendering components,
 * e.g. `lib/email/templates/*.tsx`, which this file only *composes*, never
 * renders itself — rendering happens inside `sendNotificationEmail`/Resend).
 *
 * **Cross-user-leakage mitigation (phase-4b-technical-design.md §5):** the
 * `notification` parameter IS the exact same in-memory object the calling
 * trigger evaluator just built (via `../notification-mapper.ts`'s
 * `createNotificationIfNew`) from its own already-userId-scoped read — this
 * function never issues a second, independently-scoped query to
 * "re-fetch today's large purchase/goal/account/summary for this user." The
 * only additional reads here are `db.user.findUnique({ where: { id: userId } })`
 * for the recipient's own email address and (Phase 4c, below)
 * `getUserPreference(userId)` for the recipient's own display-currency
 * preference — both scoped by the exact same `userId` the caller already
 * resolved, never a second, independently-scoped lookup that could resolve to
 * a different user's preference.
 *
 * **Phase 4c (phase-4c-technical-design.md §3.6, docs/release/
 * phase-4c-notes.md §1's blocking finding):** every email template with a
 * currency-formatted figure (`BudgetOverEmail`, `BillDueSoonEmail`,
 * `BillLateEmail`, `LargePurchaseEmail`, `LowBalanceEmail`) now requires a
 * `currency` prop, resolved once here from `getUserPreference(userId).
 * currencyDisplay` and threaded into `buildEmailContent` below — the
 * identical "resolve once per already-authorized `userId`, thread down"
 * shape `server/service.ts`'s `generateReport` uses for Reports.
 * `GoalAchievedEmail`/`MonthlySummaryReadyEmail` render no currency figure at
 * all and are left unchanged.
 *
 * **AC7 ("an email failure never affects in-app delivery"):**
 * `sendNotificationEmail` never throws (see its own JSDoc), so a Resend
 * outage or a bounce can only ever result in this function writing
 * `emailSendError` — it can never propagate an exception back into
 * `ensureNotifications`'s caller, which has already durably persisted the
 * in-app `Notification` row before this function is ever called.
 *
 * Returns `{ sent: boolean }` purely for `evaluate-notifications`'s own
 * observability count (`{ processed, emailsSent }`, api-contracts.md) — the
 * caller never branches on this value for correctness, only for reporting.
 */
export async function dispatchNotificationEmail(
  userId: string,
  notification: Notification,
): Promise<{ sent: boolean }> {
  const emailEnabled = await getEmailEnabledForType(userId, notification.type)
  if (!emailEnabled) {
    return { sent: false }
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  // Defensive only: `userId` is always resolved from an already-persisted
  // Notification row's own owning user, so a missing user here would mean
  // the row outlived its user — shouldn't happen (Notification.userId is
  // `onDelete: Cascade`), but this function must never throw regardless.
  if (!user) {
    return { sent: false }
  }

  const baseUrl = resolveAppBaseUrl()
  const unsubscribeToken = generateUnsubscribeToken({ userId, type: notification.type })
  const unsubscribeUrl = `${baseUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const preferencesUrl = `${baseUrl}/settings/notifications`

  const { currencyDisplay } = await getUserPreference(userId)

  const emailContent = buildEmailContent(notification, unsubscribeUrl, preferencesUrl, currencyDisplay)

  const result = await sendNotificationEmail({
    to: user.email,
    subject: emailContent.subject,
    template: emailContent.template,
  })

  await db.notification.update({
    where: { id: notification.id },
    data: {
      emailSentAt: result.sent ? new Date() : null,
      emailSendError: result.sent ? null : (result.error ?? "Unknown email send failure"),
    },
  })

  return { sent: result.sent }
}

/** The app's own base URL, for building an absolute link inside an email
 * (a relative link has no meaning inside a mail client). Mirrors
 * `lib/auth.ts`'s own `.trim()`-guarded `BETTER_AUTH_URL` read — same env
 * var, same production incident this guards against (a trailing pasted
 * space surviving into a broken URL). Falls back to the same local dev
 * default `lib/auth.ts`'s `trustedOrigins` list uses, so links still resolve
 * correctly in local development without `BETTER_AUTH_URL` set. */
function resolveAppBaseUrl(): string {
  return process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000"
}

interface EmailContent {
  subject: string
  template: ReactElement
}

/**
 * Resolves the subject line + fully-built template element for one
 * `Notification`, reusing exactly its own already-populated fields as the
 * template's props — never a second lookup of any kind (see this file's own
 * "cross-user-leakage mitigation" note above).
 */
function buildEmailContent(
  notification: Notification,
  unsubscribeUrl: string,
  preferencesUrl: string,
  currency: string,
): EmailContent {
  switch (notification.type) {
    case "BUDGET_OVER":
      return {
        subject: `You're over budget in ${notification.categoryName}`,
        template: createElement(BudgetOverEmail, {
          categoryName: notification.categoryName,
          allocated: notification.allocated,
          currency,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "BILL_DUE_SOON":
      return {
        subject: `${notification.billName} is due soon`,
        template: createElement(BillDueSoonEmail, {
          billName: notification.billName,
          dueDate: notification.dueDate,
          expectedAmount: notification.expectedAmount,
          currency,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "BILL_LATE":
      return {
        subject: `${notification.billName} is overdue`,
        template: createElement(BillLateEmail, {
          billName: notification.billName,
          dueDate: notification.dueDate,
          expectedAmount: notification.expectedAmount,
          currency,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "GOAL_ACHIEVED":
      return {
        subject: `You reached your goal: ${notification.goalName}`,
        template: createElement(GoalAchievedEmail, {
          goalName: notification.goalName,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "LARGE_PURCHASE":
      return {
        subject: `Large purchase detected: ${notification.merchant}`,
        template: createElement(LargePurchaseEmail, {
          merchant: notification.merchant,
          amount: notification.amount,
          date: notification.date,
          currency,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "LOW_BALANCE":
      return {
        subject: `${notification.accountName} balance is low`,
        template: createElement(LowBalanceEmail, {
          accountName: notification.accountName,
          balance: notification.balance,
          currency,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    case "MONTHLY_SUMMARY_READY":
      return {
        subject: `Your ${notification.month} recap is ready`,
        template: createElement(MonthlySummaryReadyEmail, {
          month: notification.month,
          narrative: notification.narrative,
          unsubscribeUrl,
          preferencesUrl,
        }),
      }
    default: {
      // Exhaustiveness guard — mirrors `notification-mapper.ts`'s
      // `toNotification` switch, so a new `NotificationType` member without
      // a matching email template fails loudly here too, not silently.
      const exhaustiveCheck: never = notification
      throw new Error(`Unsupported notification type for email: ${String(exhaustiveCheck)}`)
    }
  }
}
