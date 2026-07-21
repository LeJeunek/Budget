import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import {
  getNetWorthHistory,
  NetWorthHistoryRangeSchema,
} from "@/features/dashboard/server/net-worth-history"

/**
 * `GET /api/dashboard/net-worth-history?range=` — the one new Dashboard
 * Route Handler introduced by Phase 3b's Net Worth History chart, per
 * docs/architecture/api-contracts.md's "Net Worth History chart" section.
 *
 * Unlike every other Dashboard read (Server Component direct calls only,
 * no client-refetchable routes — see `features/dashboard/server/service.ts`'s
 * module doc), this one route exists because the chart's range selector is a
 * Client Component control: `features/dashboard/hooks/use-net-worth-history.ts`
 * calls this route whenever the user changes the range *after* initial load.
 * The initial load itself still goes through the Server Component's direct
 * `getNetWorthHistory`/`resolveDefaultRange` calls — this route is refetch-only,
 * not a parallel initial-load path.
 *
 * `range` is required and validated via `NetWorthHistoryRangeSchema` — no
 * default is applied here (see that schema's own doc): a missing/invalid
 * value is always a client bug, since `use-net-worth-history.ts` only ever
 * calls this route with a range the initial load (or the user's own
 * selector) already resolved to a valid value.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = NetWorthHistoryRangeSchema.safeParse(
    searchParams.get("range") ?? undefined,
  )
  if (!parsed.success) {
    return NextResponse.json(
      fail(parsed.error.issues[0]?.message ?? "Invalid range parameter"),
      { status: 400 },
    )
  }

  const history = await getNetWorthHistory(user.id, parsed.data)

  return NextResponse.json(ok(history))
}
