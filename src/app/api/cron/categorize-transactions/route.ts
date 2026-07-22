import { NextResponse } from "next/server"

import { generateAutomaticSuggestionsForAllUsers } from "@/features/transactions/server/categorization"

/**
 * `POST /api/cron/categorize-transactions` — Transaction Auto-Categorization's
 * automatic path (docs/product/ai-features.md Feature 1 AC1,
 * docs/architecture/api-contracts.md's Feature 1 section,
 * docs/architecture/ai-features-design.md §6). This is the third instance of
 * the shared-secret cron Route Handler exception `net-worth-snapshot`
 * established in Phase 3a — mirrors that route's auth check, response shape,
 * and doc-comment structure exactly (see
 * `app/api/cron/net-worth-snapshot/route.ts` for the full reasoning behind
 * each choice below).
 *
 * **Auth: shared secret, not a session.** Same `CRON_SECRET` env var as
 * `net-worth-snapshot` — one shared secret authenticates every cron route in
 * this codebase, not a separate secret per route. Returns `401` both when
 * the header doesn't match *and* when `CRON_SECRET` isn't configured at all,
 * so an unconfigured secret is never mistaken for "no auth required."
 *
 * **Response shape is deliberately not `ApiResult<T>`** — this is a
 * system-to-system integration surface with no client ever parsing an
 * `ApiResult` shape from it. `{ processed, suggested }` matches
 * api-contracts.md's exact contract for this route.
 *
 * No AI-calling logic lives in this file — it is wiring only, per
 * `ai-features-design.md` §8's Backend Engineer handoff note; the actual
 * prompt/generation/persistence logic is entirely
 * `features/transactions/server/categorization.ts`'s.
 */
// Sequential per-user loop (see categorization.ts's own doc comment on
// `generateAutomaticSuggestionsForAllUsers`) plus real network round trips
// to the Gemini API per batch mean this invocation can run longer than a
// typical serverless default timeout well before the user base is large —
// mirrors net-worth-snapshot's own `maxDuration` comment; the actual ceiling
// is bounded by the hosting plan's own cap, a DevOps/deployment-target
// decision out of scope here.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = getBearerToken(request.headers.get("authorization"))

  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await generateAutomaticSuggestionsForAllUsers()

  return NextResponse.json(summary, { status: 200 })
}

/** Extracts the token from a `Authorization: Bearer <token>` header value,
 * or `null` if the header is missing or not in the expected `Bearer` scheme.
 * Duplicated from `net-worth-snapshot`'s own identical helper rather than
 * imported — `app/api/cron/*` route handlers are not a shared import target
 * across each other in this codebase's module boundary, the same reasoning
 * `features/transactions/server/service.ts`'s `EXCLUDE_SPLIT_PARENTS` doc
 * comment gives for its own small, deliberate duplication. */
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
