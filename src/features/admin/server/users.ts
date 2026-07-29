import { db } from "@/lib/db"

import type { AdminUserSummary } from "@/features/admin/types"

/**
 * View Users (admin.md Capability 2) — Admin's own cross-user, admin-only
 * read over Better Auth's `User`/`Session` models. Per
 * phase-4c-technical-design.md §7.1: no new schema, reads existing Better
 * Auth tables only.
 *
 * **This is one of this codebase's first-ever query functions not scoped to
 * a single authenticated user's own data** (risk-register.md #33, alongside
 * `getAuditLog` and Reports' `getReportGenerationEvents`) — a deliberate,
 * narrow exception to the standing "every query scoped by the authenticated
 * user's own id" rule (risk-register.md #4). Safe **only** because this
 * function is never called from anywhere except `features/admin/server/
 * actions.ts` and Admin's own `getCurrentAdminUser()`-gated Server Components
 * — every caller MUST check `getCurrentAdminUser()` first; this file itself
 * performs no authorization check (per this codebase's standing convention
 * of resolving authorization once, at the Server Action/Server Component
 * boundary, not duplicated into every `service.ts`/`server/*.ts` read).
 *
 * **Never exposes a credential/secret field, by construction.** The
 * `select` below is an explicit, exhaustive allow-list — not a bare
 * `db.user.findMany()` — so a future column added to `User` (or to Better
 * Auth's own managed fields) can never silently leak into this view without
 * a deliberate edit to the list below. Session tokens/OAuth tokens live on
 * `Session`/`AuthAccount`, neither of which is queried for anything except
 * the aggregate `MAX(updatedAt)` used for `lastActiveAt`.
 */

const PAGE_SIZE = 50

export interface GetUsersOptions {
  /** Case-insensitive substring match against email OR name (admin.md
   * Capability 2 AC3). */
  search?: string
  /** The `id` of the last row from the previous page — mirrors Reports'
   * `getReportGenerationEvents` cursor convention exactly. Omit for the
   * first page. */
  cursor?: string
}

export interface GetUsersResult {
  users: AdminUserSummary[]
  /** `null` once the last page has been reached. */
  nextCursor: string | null
}

/**
 * Returns up to `PAGE_SIZE` accounts, most-recently-signed-up first,
 * optionally filtered by a case-insensitive substring `search` against
 * email or name (admin.md Capability 2 AC2/AC3 — mirrors Transactions' own
 * search/pagination convention).
 *
 * "Last active" = `MAX(Session.updatedAt)` per user, per the CTO resolution
 * pass's already-decided definition (phase-4c-technical-design.md §7.1) — no
 * separate fallback to `Session.createdAt` is coded here because Better
 * Auth's own `Session.updatedAt` (a plain `@updatedAt` column) is already
 * equal to `createdAt` at the moment a session is created and only ever
 * moves forward from there on renewal, so `MAX(updatedAt)` already *is*
 * "the most recent renewal, or creation if it was never renewed" — the
 * "falling back to `createdAt`" language in the design doc describes what
 * this single aggregate already does, not a second code path.
 */
export async function getUsers(
  options: GetUsersOptions = {},
): Promise<GetUsersResult> {
  const { search, cursor } = options

  const users = await db.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  if (users.length === 0) {
    return { users: [], nextCursor: null }
  }

  const userIds = users.map((user) => user.id)
  const lastActiveRows = await db.session.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _max: { updatedAt: true },
  })
  const lastActiveByUserId = new Map(
    lastActiveRows.map((row) => [row.userId, row._max.updatedAt]),
  )

  const summaries: AdminUserSummary[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastActiveAt: lastActiveByUserId.get(user.id) ?? null,
  }))

  return {
    users: summaries,
    nextCursor: users.length === PAGE_SIZE ? users[users.length - 1].id : null,
  }
}
