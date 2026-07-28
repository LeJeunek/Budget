import { NextResponse } from "next/server"

import { evaluateNotificationsForAllUsers } from "@/features/notifications/server/service"

/**
 * `POST /api/cron/evaluate-notifications` — Notifications v2's all-user
 * evaluation sweep (docs/architecture/api-contracts.md's Phase 4b
 * "Evaluate all users (offline reach for email)" row,
 * docs/architecture/phase-4b-technical-design.md §6). This is the fifth
 * instance of the shared-secret cron Route Handler exception `net-worth-snapshot`
 * established in Phase 3a — mirrors that route's auth check, response
 * shape, and doc-comment structure exactly (see `app/api/cron/net-worth-snapshot/route.ts`,
 * `app/api/cron/categorize-transactions/route.ts`, `app/api/cron/monthly-summary/route.ts`,
 * and `app/api/cron/financial-health-score-snapshot/route.ts` for the full
 * reasoning behind each choice below).
 *
 * **Why this route exists alongside the lazy, poll-time `ensureNotifications`
 * path** (§6): a user who never opens the app never gets evaluated by the
 * lazy path alone, which defeats email's entire stated purpose — "reaching
 * a user even when they aren't in the app at all" (notifications-v2.md's own
 * Business Value). This route iterates every user and calls the identical
 * `ensureNotifications(userId)` a user's own request to `GET /api/notifications`
 * would call — see `features/notifications/server/service.ts`'s
 * `evaluateNotificationsForAllUsers` for the actual sequential-loop
 * orchestration; this file is wiring only.
 *
 * **Auth: shared secret, not a session.** Same `CRON_SECRET` env var as every
 * other cron route in this codebase — one shared secret, not a separate
 * secret per route. Returns `401` both when the header doesn't match *and*
 * when `CRON_SECRET` isn't configured at all, so an unconfigured secret is
 * never mistaken for "no auth required."
 *
 * **Response shape is deliberately not `ApiResult<T>`** — this is a
 * system-to-system integration surface with no client ever parsing an
 * `ApiResult` shape from it. `{ processed, emailsSent }` matches
 * api-contracts.md's exact contract for this route.
 *
 * **Safe under overlapping invocations** — every dedup/latch write this
 * route's evaluation touches (the `Notification` unique constraints,
 * `FinancialGoal.completionNotifiedAt`, `Account.lowBalanceNotifiedAt`) is
 * an atomic conditional update or a database unique-constraint rejection,
 * never a read-then-write (§6's atomicity note) — a user's own concurrent
 * poll racing this cron sweep can never double-fire or double-send for the
 * same event.
 */
// Sequential per-user loop, plus a real outbound Resend network call for
// each newly-created, email-enabled notification, mean this invocation can
// run longer than a typical serverless default timeout well before the user
// base is large — mirrors every other cron route's own identical
// `maxDuration` comment; the actual ceiling is bounded by the hosting plan's
// own cap, a DevOps/deployment-target decision out of scope here.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = getBearerToken(request.headers.get("authorization"))

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await evaluateNotificationsForAllUsers()

  return NextResponse.json(summary, { status: 200 })
}

/** Extracts the token from a `Authorization: Bearer <token>` header value,
 * or `null` if the header is missing or not in the expected `Bearer` scheme.
 * Duplicated from every other `app/api/cron/*` route's own identical
 * helper — `app/api/cron/*` route handlers are not a shared import target
 * across each other in this codebase's module boundary, per those routes'
 * own identical doc comment. */
function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }

  const [scheme, token] = authorizationHeader.split(" ")
  if (scheme !== "Bearer" || !token) {
    return null
  }

  return token
}
