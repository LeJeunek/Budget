import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token"

/**
 * `GET /api/notifications/unsubscribe?token=...` — the one-click email
 * unsubscribe link every notification email includes (docs/architecture/
 * phase-4b-technical-design.md §5, docs/architecture/api-contracts.md's
 * Phase 4b Notifications v2 row, docs/architecture/naming-standards.md's
 * Phase 4b note: "the first Route Handler authenticated by a signed token in
 * the URL rather than either a session or the cron shared secret").
 *
 * **Auth: a signed token, not a session, not the cron shared secret** — a
 * third, distinct authentication mode from every other Route Handler in
 * this codebase. `lib/email/unsubscribe-token.ts`'s `verifyUnsubscribeToken`
 * is the ONLY thing this route trusts: it is cryptographically bound to
 * exactly one `(userId, type)` pair at generation time, so a
 * tampered/guessed token fails signature verification and this route
 * rejects it outright — there is no way to use this endpoint to alter a
 * different user's preferences, or a different trigger type's preference
 * than the one the email was actually for (§5's own cross-user-leakage
 * reasoning).
 *
 * **Never touches `inAppEnabled`, never touches any other trigger type** —
 * only that exact `(userId, type)` pair's `emailEnabled` is set to `false`.
 * Upserts (rather than a plain `update`) since a user could click an
 * unsubscribe link before ever customizing that type's preference row at
 * all — the same lazy-materialization convention `preferences.ts` and
 * `updateNotificationPreference` already use, applied here so this endpoint
 * never needs the row to already exist.
 *
 * **Returns a plain HTML confirmation page, not JSON** (naming-standards.md's
 * exact Phase 4b note) — a link a user clicks from an email client, not a
 * `fetch` call a frontend parses. Deliberately minimal/unstyled: a Frontend
 * Lead may polish this page's presentation later (this Backend Engineer
 * role never writes UI/styling) — the content here is the honest,
 * functional confirmation text itself.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")

  if (!token) {
    return htmlResponse(
      "Invalid unsubscribe link",
      "This unsubscribe link is missing its token and could not be processed.",
      400,
    )
  }

  const payload = verifyUnsubscribeToken(token)
  if (!payload) {
    return htmlResponse(
      "Invalid or expired unsubscribe link",
      "This unsubscribe link could not be verified. If you still want to stop receiving this notification type by email, sign in and update your notification preferences directly.",
      400,
    )
  }

  await db.notificationPreference.upsert({
    where: { userId_type: { userId: payload.userId, type: payload.type } },
    create: {
      userId: payload.userId,
      type: payload.type,
      // `inAppEnabled` keeps its documented default (`true`) on first
      // materialization here — this endpoint only ever changes the email
      // channel, per this file's own JSDoc.
      emailEnabled: false,
    },
    update: { emailEnabled: false },
  })

  return htmlResponse(
    "Unsubscribed",
    "You've been unsubscribed from this email notification type. You can re-enable it, or adjust any other notification preference, at any time from your account's notification settings.",
    200,
  )
}

function htmlResponse(title: string, message: string, status: number): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} — FinanceOS</title>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

/** Minimal HTML-entity escaping for the two plain, developer-authored
 * strings this route ever interpolates into its response — neither string
 * is ever user-controlled (both are fixed literals passed by this file's
 * own two call sites above), but escaping here costs nothing and keeps this
 * route's only HTML-construction path defensively safe by construction. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
