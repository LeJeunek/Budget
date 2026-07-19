import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth"
import { fail, ok } from "@/lib/api-response"
import { listTransactions } from "@/features/transactions/server/service"
import { TransactionFilterSchema } from "@/features/transactions/server/validation"

/**
 * `GET /api/transactions?page=&pageSize=&accountId=&categoryId=&search=&dateFrom=&dateTo=&sortBy=&sortDir=`
 *
 * A real Route Handler (not a Server Action), per
 * docs/architecture/api-contracts.md's Transactions "List" row — TanStack
 * Table's client-side pagination needs a fetchable URL to page/filter/search
 * against, unlike the rest of this feature's mutations which are Server
 * Actions. `features/transactions/hooks/use-transactions.ts`'s
 * `useTransactions` is the sanctioned client-side caller of this route; a
 * Server Component that only needs the initial page can call
 * `service.listTransactions(userId, filters)` directly instead.
 *
 * Query params are parsed via `TransactionFilterSchema`, which supplies
 * `page`/`pageSize` defaults and caps `pageSize` — an invalid/missing filter
 * value never crashes this route, it just fails validation with a clear
 * message (e.g. `pageSize=abc`).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(fail("UNAUTHENTICATED"), { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawFilters = {
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
  }

  const parsed = TransactionFilterSchema.safeParse(rawFilters)
  if (!parsed.success) {
    return NextResponse.json(
      fail(parsed.error.issues[0]?.message ?? "Invalid filter parameters"),
      { status: 400 },
    )
  }

  const result = await listTransactions(user.id, parsed.data)

  return NextResponse.json(ok(result))
}
