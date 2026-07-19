import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getGoals } from "@/features/goals/server/service"

/**
 * `GET /api/goals` — thin wrapper around `service.getGoals`.
 *
 * Per docs/architecture/api-contracts.md, listing goals is primarily a
 * Server Component direct call (`service.getGoals(userId, ...)`), not a REST
 * resource — most of the app never needs this route. It exists solely so
 * `features/goals/hooks/use-goals.ts` has something to call: a Client
 * Component that just mutated a goal (create/update/archive/unarchive/
 * contribution add/delete) needs a client-safe way to refetch the list and
 * invalidate its TanStack Query cache, and a Server Component can't be
 * called directly from client code. Keep this route to exactly that one
 * job — list, with the same `includeArchived` toggle `service.getGoals`
 * already supports — rather than growing it into a parallel CRUD surface;
 * create/update/archive/contributions stay on the Server Actions in
 * `features/goals/server/actions.ts`. Mirrors
 * `src/app/api/accounts/route.ts` exactly.
 *
 * `?includeArchived=true` returns only archived goals (AC6's dedicated
 * archived view); omitted/anything else returns only active goals (AC2),
 * matching `GetGoalsOptions`'s toggle semantics in `features/goals/types.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get("includeArchived") === "true"

  const goals = await getGoals(user.id, { includeArchived })

  return NextResponse.json(ok(goals))
}
