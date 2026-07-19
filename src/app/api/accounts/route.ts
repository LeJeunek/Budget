import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { getAccounts } from "@/features/accounts/server/service"

/**
 * `GET /api/accounts` — thin wrapper around `service.getAccounts`.
 *
 * Per docs/architecture/api-contracts.md, listing accounts is primarily a
 * Server Component direct call (`service.getAccounts(userId)`), not a REST
 * resource — most of the app never needs this route. It exists solely so
 * `features/accounts/hooks/use-accounts.ts` has something to call: a Client
 * Component that just mutated an account (create/update/archive/unarchive)
 * needs a client-safe way to refetch the list and invalidate its TanStack
 * Query cache, and a Server Component can't be called directly from client
 * code. Keep this route to exactly that one job — list, with the same
 * `includeArchived` toggle `service.getAccounts` already supports — rather
 * than growing it into a parallel CRUD surface; create/update/archive stay
 * on the Server Actions in `features/accounts/server/actions.ts`.
 *
 * `?includeArchived=true` returns only archived accounts (AC5's dedicated
 * archived view); omitted/anything else returns only active accounts (AC2),
 * matching `GetAccountsOptions`'s toggle semantics in `features/accounts/types.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get("includeArchived") === "true"

  const accounts = await getAccounts(user.id, { includeArchived })

  return NextResponse.json(ok(accounts))
}
