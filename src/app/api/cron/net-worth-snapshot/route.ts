import { NextResponse } from "next/server"

import { captureAllUsersNetWorthSnapshots } from "@/features/dashboard/server/snapshot"

/**
 * `POST /api/cron/net-worth-snapshot` — the first Route Handler in this
 * codebase not gated by an authenticated browser session (per
 * docs/architecture/api-contracts.md's "Net Worth Snapshot job" section and
 * folder-tree.md's note above this file's path). There is no calling user:
 * an external scheduler (Vercel Cron, a GitHub Actions scheduled workflow, or
 * any equivalent — the actual scheduler/cadence choice is an explicitly
 * out-of-scope DevOps/deployment-target decision per api-contracts.md, not
 * made here) invokes this route on a time cadence, and it acts on every user
 * in the system via `dashboard.snapshot.captureAllUsersNetWorthSnapshots()`.
 *
 * **Auth: shared secret, not a session.** The request must send
 * `Authorization: Bearer <CRON_SECRET>`, compared against the server-only
 * `CRON_SECRET` env var (see `.env.example` for provisioning notes). Returns
 * `401` both when the header doesn't match *and* when `CRON_SECRET` isn't
 * configured at all — an unconfigured secret must never be treated as "no
 * auth required," which would leave this batch-write endpoint open to
 * anyone who finds the URL.
 *
 * **Response shape is deliberately not `ApiResult<T>`** — per
 * naming-standards.md's documented exception (mirroring
 * `app/api/uploadthing/route.ts`'s existing exception in Phase 2): this is a
 * system-to-system integration surface with no client ever parsing an
 * `ApiResult` shape from it, not our own app's client-facing contract.
 * `{ processed: number }` is the field api-contracts.md's table binds this
 * route to; `created`/`skipped` are additive observability detail from
 * `captureAllUsersNetWorthSnapshots`'s own result, not a redesign of that
 * contract.
 */
// Performance Engineer's Phase 3a gate review: captureAllUsersNetWorthSnapshots
// loops sequentially (one DB round trip per user, deliberately — see that
// function's own doc comment), so this route needs more than a typical
// serverless default timeout well before the user base is large enough to
// need the batching/cursor rework already scoped as the real long-term fix.
export const maxDuration = 60

export async function POST(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = getBearerToken(request.headers.get("authorization"))

  // Both branches collapse to the same 401 with the same message — a caller
  // must not be able to distinguish "you sent the wrong secret" from "this
  // deployment forgot to configure one," which would otherwise leak
  // deployment-configuration state to an unauthenticated caller.
  if (!cronSecret || !providedSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await captureAllUsersNetWorthSnapshots()

  return NextResponse.json(summary, { status: 200 })
}

/** Extracts the token from a `Authorization: Bearer <token>` header value,
 * or `null` if the header is missing or not in the expected `Bearer` scheme.
 * Kept as a small, isolated parse so the 401 check above stays a single
 * readable condition rather than inline string-slicing. */
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
