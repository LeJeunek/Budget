import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getBills } from "@/features/bills/server/service"

/**
 * `GET /api/bills` — thin wrapper around `service.getBills`.
 *
 * Per docs/architecture/api-contracts.md, listing bills is primarily a
 * Server Component direct call (`service.getBills(userId)`), not a REST
 * resource. This route exists solely so `features/bills/hooks/use-bills.ts`
 * has something to call: a Client Component that just mutated a bill
 * (create/update/archive/unarchive/mark-paid/unmark) needs a client-safe way
 * to refetch the list and invalidate its TanStack Query cache — mirrors
 * `src/app/api/accounts/route.ts` exactly, per folder-tree.md's Phase 2 note.
 *
 * `?includeArchived=true` returns only archived bills; omitted/anything else
 * returns only active bills, matching `GetBillsOptions`'s toggle semantics in
 * `features/bills/types.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get("includeArchived") === "true"

  const bills = await getBills(user.id, { includeArchived })

  return NextResponse.json(ok(bills))
}
