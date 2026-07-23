import { NextResponse } from "next/server"

import { captureAllUsersFinancialHealthScoreSnapshots } from "@/features/financial-health-score/server/snapshot"

/**
 * `POST /api/cron/financial-health-score-snapshot` — the Financial Health
 * Score's historical-snapshot-plus-narrative cron path
 * (docs/product/ai-features.md Feature 5 AC7, docs/architecture/
 * api-contracts.md's Feature 5 "Cron: capture snapshot + generate narrative
 * (one invocation)" row, docs/architecture/ai-features-design.md §6's
 * explicit "generate+persist the narrative in the same invocation" steer).
 * This is the fifth instance of the shared-secret cron Route Handler
 * exception `net-worth-snapshot` established in Phase 3a — mirrors that
 * route's auth check, response shape, and doc-comment structure exactly (see
 * `app/api/cron/net-worth-snapshot/route.ts`, `app/api/cron/
 * categorize-transactions/route.ts`, and `app/api/cron/monthly-summary/
 * route.ts` for the full reasoning behind each choice below).
 *
 * **Auth: shared secret, not a session.** Same `CRON_SECRET` env var as every
 * other cron route in this codebase — one shared secret, not a separate
 * secret per route. Returns `401` both when the header doesn't match *and*
 * when `CRON_SECRET` isn't configured at all, so an unconfigured secret is
 * never mistaken for "no auth required."
 *
 * **Response shape is deliberately not `ApiResult<T>`** — this is a
 * system-to-system integration surface with no client ever parsing an
 * `ApiResult` shape from it. `{ processed, narrativesGenerated }` matches
 * api-contracts.md's exact `{ processed: number }` contract for this route,
 * with `narrativesGenerated` as additive observability detail, the same
 * `{ processed, created, skipped }`/`{ processed, generated }` pattern
 * `net-worth-snapshot`'s/`monthly-summary`'s own routes already established,
 * not a redesign of that contract.
 *
 * This invocation is expected to run once per day, "piggybacked onto the
 * same periodic cadence that produces AC7's historical score snapshot" per
 * `ai-features-design.md`'s own framing — the actual scheduler/cadence
 * choice remains an explicitly out-of-scope DevOps/deployment-target
 * decision, per api-contracts.md, same as every other cron route here.
 *
 * No AI-calling logic lives in this file — it is wiring only, per
 * `ai-features-design.md` §8's Backend Engineer handoff note; the actual
 * score computation is `features/financial-health-score/server/service.ts`'s,
 * the capture/narrative-generation orchestration is `.../server/snapshot.ts`'s,
 * and the narrative generation itself is the AI Engineer's
 * `.../server/health-score-narrative.ts`.
 */
// Sequential per-user loop (see snapshot.ts's own doc comment on
// `captureAllUsersFinancialHealthScoreSnapshots`) plus a real network round
// trip to the Gemini API per user (for the narrative step) mean this
// invocation can run longer than a typical serverless default timeout well
// before the user base is large — mirrors net-worth-snapshot's/
// categorize-transactions'/monthly-summary's own identical `maxDuration`
// comment; the actual ceiling is bounded by the hosting plan's own cap, a
// DevOps/deployment-target decision out of scope here.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = getBearerToken(request.headers.get("authorization"))

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await captureAllUsersFinancialHealthScoreSnapshots()

  return NextResponse.json(summary, { status: 200 })
}

/** Extracts the token from a `Authorization: Bearer <token>` header value,
 * or `null` if the header is missing or not in the expected `Bearer` scheme.
 * Duplicated from `net-worth-snapshot`/`categorize-transactions`/
 * `monthly-summary`'s own identical helper rather than imported —
 * `app/api/cron/*` route handlers are not a shared import target across
 * each other in this codebase's module boundary, per those routes' own
 * identical doc comment. */
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
