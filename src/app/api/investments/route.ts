import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getContainers } from "@/features/investments/server/service"

/**
 * `GET /api/investments` — thin wrapper around `service.getContainers`.
 *
 * Per docs/architecture/api-contracts.md, listing containers is primarily a
 * Server Component direct call (`service.getContainers(userId)`), not a REST
 * resource. This route exists solely so a future
 * `features/investments/hooks/use-holdings.ts` (Frontend Lead territory) has
 * something to call to refetch/invalidate its TanStack Query cache after a
 * mutation, the same "list, nothing else" job
 * `src/app/api/accounts/route.ts`/`src/app/api/goals/route.ts` already do —
 * create/update/close/logDividend all stay on the Server Actions in
 * `features/investments/server/actions.ts`.
 *
 * **Doc discrepancy, flagged rather than guessed at (Backend Engineer):**
 * docs/architecture/api-contracts.md's Investments table lists this route as
 * `GET /api/investments?includeClosed=` -> `ApiResult<ContainerSummary[]>`.
 * `includeClosed` has no meaning for a *container* list, though — Closed is
 * a Holding-level state (`Holding.closedAt`), not an Account-level one
 * (containers use `archivedAt`, like every other Account); `includeClosed`
 * only makes sense on `service.getHoldingsForContainer`, the per-container
 * *holdings* list, which is a Server Component direct call with no route at
 * all per that same table. Most likely this query param was copied from the
 * `includeArchived`/`includeClosed` toggle pattern used by every sibling
 * list route without re-deriving whether it actually applies to this one.
 * This route accepts the param but intentionally ignores it, returning the
 * caller's active containers exactly as `service.getContainers` already
 * does — this is the smallest change that satisfies the documented URL shape
 * without fabricating container-level "closed" semantics the schema/product
 * spec never defined. Revisit with the Solution Architect if a real
 * client-side use case for it emerges.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const containers = await getContainers(user.id)

  return NextResponse.json(ok(containers))
}
