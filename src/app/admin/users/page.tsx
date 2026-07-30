import { getUsers } from "@/features/admin/server/users"
import { UserTable } from "@/features/admin/components/user-table"
import { CursorPaginationControls } from "@/features/admin/components/cursor-pagination-controls"
import {
  cursorStateToSearchParams,
  getNextState,
  getPrevState,
  parseCursorState,
} from "@/features/admin/lib/cursor-pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * View Users (admin.md Capability 2). A Server Component: reads
 * `?search=`/`?cursor=`/`?history=` off `searchParams`, calls
 * `admin.server/users.getUsers({ search, cursor })` directly (no Route
 * Handler/client hook, per phase-4c-technical-design.md §7.2's "zero new
 * Route Handlers anywhere in this module"), and renders exactly one page via
 * `UserTable` (`DataTable` with `enablePagination={false}`) plus this file's
 * own Prev/Next links — see `features/admin/lib/cursor-pagination.ts`'s
 * header comment for why (`DataTable` doesn't drive `?cursor=` navigation
 * itself).
 *
 * The search input is a plain `<form method="GET">` — mirrors Transactions'
 * own search/pagination bar (AC2's explicit requirement) without needing any
 * client-side state: submitting navigates to `?search=...`, which
 * (deliberately) drops any existing `cursor`/`history` params, resetting
 * pagination to page 1 for the new search.
 */

export interface AdminUsersPageProps {
  searchParams: Promise<{ search?: string; cursor?: string; history?: string }>
}

function buildHref(search: string | undefined, params: Record<string, string>): string {
  const query = new URLSearchParams()
  if (search) query.set("search", search)
  for (const [key, value] of Object.entries(params)) query.set(key, value)
  const qs = query.toString()
  return qs ? `/admin/users?${qs}` : "/admin/users"
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const resolved = await searchParams
  const search = resolved.search?.trim() || undefined
  const cursorState = parseCursorState(resolved)

  const { users, nextCursor } = await getUsers({ search, cursor: cursorState.cursor })

  const prevState = getPrevState(cursorState)
  const nextState = getNextState(cursorState, nextCursor)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">
          Every registered account — read-only account-directory information. Nothing here
          modifies a user&apos;s account, financial data, or tier.
        </p>
      </div>

      <form action="/admin/users" method="GET" className="flex max-w-sm items-center gap-2">
        <Input
          type="search"
          name="search"
          defaultValue={search ?? ""}
          placeholder="Search by email or name..."
          aria-label="Search users"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <UserTable users={users} />

      <CursorPaginationControls
        prevHref={prevState ? buildHref(search, cursorStateToSearchParams(prevState)) : null}
        nextHref={nextState ? buildHref(search, cursorStateToSearchParams(nextState)) : null}
      />
    </div>
  )
}
