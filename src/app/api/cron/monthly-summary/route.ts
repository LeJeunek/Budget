import { NextResponse } from "next/server"

import { generateMonthlySummariesForAllUsers } from "@/features/dashboard/server/monthly-summary"

/**
 * `POST /api/cron/monthly-summary` — Automatic Monthly Summaries' cron-driven
 * generation path (docs/product/ai-features.md Feature 3 AC1,
 * docs/architecture/api-contracts.md's Feature 3 section,
 * docs/architecture/ai-features-design.md §6's "mirrors
 * `captureAllUsersNetWorthSnapshots`'s sequential-loop pattern exactly" note).
 * This is the fourth instance of the shared-secret cron Route Handler
 * exception `net-worth-snapshot` established in Phase 3a — mirrors that
 * route's auth check, response shape, and doc-comment structure exactly (see
 * `app/api/cron/net-worth-snapshot/route.ts` and
 * `app/api/cron/categorize-transactions/route.ts` for the full reasoning
 * behind each choice below).
 *
 * **Auth: shared secret, not a session.** Same `CRON_SECRET` env var as every
 * other cron route in this codebase — one shared secret, not a separate
 * secret per route. Returns `401` both when the header doesn't match *and*
 * when `CRON_SECRET` isn't configured at all, so an unconfigured secret is
 * never mistaken for "no auth required."
 *
 * **Response shape is deliberately not `ApiResult<T>`** — this is a
 * system-to-system integration surface with no client ever parsing an
 * `ApiResult` shape from it. `{ processed, generated }` matches
 * api-contracts.md's exact `{ processed: number }` contract for this route,
 * with `generated` as additive observability detail (the same
 * `{ processed, created, skipped }`-over-`{ processed }` pattern
 * `net-worth-snapshot`'s own route already established), not a redesign of
 * that contract.
 *
 * This invocation targets exactly one calendar month — whichever one most
 * recently closed relative to when this route runs (see
 * `monthly-summary.ts`'s `resolveLastClosedMonth`) — so it is expected to run
 * once per calendar month (e.g. shortly after each month rolls over), not
 * daily like `net-worth-snapshot`/`categorize-transactions`. The actual
 * scheduler/cadence choice remains an explicitly out-of-scope DevOps/
 * deployment-target decision, per api-contracts.md.
 *
 * No AI-calling logic lives in this file — it is wiring only, per
 * `ai-features-design.md` §8's Backend Engineer handoff note; the actual
 * prompt/generation/persistence logic is entirely
 * `features/dashboard/server/monthly-summary.ts`'s.
 */
// Sequential per-user loop (see monthly-summary.ts's own doc comment on
// `generateMonthlySummariesForAllUsers`) plus real network round trips to the
// Gemini API per user mean this invocation can run longer than a typical
// serverless default timeout well before the user base is large — mirrors
// net-worth-snapshot's/categorize-transactions' own `maxDuration` comment;
// the actual ceiling is bounded by the hosting plan's own cap, a DevOps/
// deployment-target decision out of scope here.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = getBearerToken(request.headers.get("authorization"))

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await generateMonthlySummariesForAllUsers()

  return NextResponse.json(summary, { status: 200 })
}

/** Extracts the token from a `Authorization: Bearer <token>` header value,
 * or `null` if the header is missing or not in the expected `Bearer` scheme.
 * Duplicated from `net-worth-snapshot`/`categorize-transactions`' own
 * identical helper rather than imported — `app/api/cron/*` route handlers
 * are not a shared import target across each other in this codebase's module
 * boundary, per those routes' own identical doc comment. */
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
