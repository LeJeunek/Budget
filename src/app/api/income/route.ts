import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getIncomeStreams } from "@/features/recurring-income/server/service"

/**
 * `GET /api/income` — thin wrapper around `service.getIncomeStreams`.
 *
 * Per docs/architecture/api-contracts.md's Recurring Income section
 * ("List (client-side refetch) | GET /api/income?includeArchived= — mirrors
 * GET /api/bills"), listing income streams is primarily a Server Component
 * direct call (`service.getIncomeStreams(userId)`), not a REST resource.
 * This route exists solely so `features/recurring-income/hooks/
 * use-income-streams.ts` has something to call — mirrors
 * `src/app/api/bills/route.ts` exactly.
 *
 * `?includeArchived=true` returns only archived streams; omitted/anything
 * else returns only active streams, matching `GetIncomeStreamsOptions`'s
 * toggle semantics in `features/recurring-income/types.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get("includeArchived") === "true"

  const streams = await getIncomeStreams(user.id, { includeArchived })

  return NextResponse.json(ok(streams))
}
