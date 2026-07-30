/**
 * Cursor-pagination URL bookkeeping shared by Admin's two cursor-paginated
 * Server Component pages (`app/admin/users/page.tsx`, `app/admin/audit-log/
 * page.tsx`).
 *
 * Per the Frontend Lead dispatch note: `components/shared/data-table/`
 * paginates client-side or via an imperative `onPaginationChange` callback,
 * NOT `?cursor=` URL navigation — so these two pages fetch one page
 * server-side themselves (using each domain function's own `{ cursor?,
 * nextCursor }` contract, `features/admin/server/{users,audit-log}.ts`) and
 * render their own Prev/Next links, with `DataTable` only ever rendering
 * that one already-fetched page (`enablePagination={false}`).
 *
 * Each underlying read function returns only a forward `nextCursor`, never a
 * `prevCursor` — going backward requires the page itself to remember the
 * chain of cursors that got here. This is done entirely via the URL (no
 * client state, keeping both pages Server Components): a `history` search
 * param carries the comma-separated stack of ancestor cursors (every page
 * before the current one, excluding page 1, which has no cursor at all).
 * Base64 cursors (audit-log.ts's own encoding) never contain a comma, so a
 * plain `,`-joined list round-trips safely; plain cuid cursors (users.ts's
 * own row-id cursor) don't either.
 *
 * This file is pure bookkeeping — it has no knowledge of what a cursor
 * string means; each domain's cursor format stays opaque to it.
 */

export interface CursorPageState {
  /** `undefined` means "page 1" — no `cursor` search param present at all. */
  cursor?: string
  /** Ancestor cursors, oldest first, excluding page 1's (non-existent) cursor. */
  history: string[]
}

/** Reads `cursor`/`history` off a page's already-`await`ed `searchParams`. */
export function parseCursorState(searchParams: {
  cursor?: string
  history?: string
}): CursorPageState {
  return {
    cursor: searchParams.cursor,
    history: searchParams.history ? searchParams.history.split(",").filter(Boolean) : [],
  }
}

/** `null` when already on page 1 — there is no previous page to link to. */
export function getPrevState(state: CursorPageState): CursorPageState | null {
  if (state.cursor === undefined) return null
  return {
    cursor: state.history.length > 0 ? state.history[state.history.length - 1] : undefined,
    history: state.history.slice(0, -1),
  }
}

/**
 * `null` when `nextCursor` is `null` — the read function's own "no more
 * pages" signal, which this file passes through unchanged.
 */
export function getNextState(
  state: CursorPageState,
  nextCursor: string | null,
): CursorPageState | null {
  if (nextCursor === null) return null
  return {
    cursor: nextCursor,
    history: state.cursor !== undefined ? [...state.history, state.cursor] : state.history,
  }
}

/**
 * Serializes a state back into the subset of search params it owns —
 * `null` (page 1's own "no cursor, no history" state, or "there is no such
 * page") serializes to no params at all. Merge the result with a page's
 * other filter params (search, type, start, end) before building an `href`.
 */
export function cursorStateToSearchParams(state: CursorPageState | null): Record<string, string> {
  if (state === null) return {}
  const params: Record<string, string> = {}
  if (state.cursor !== undefined) params.cursor = state.cursor
  if (state.history.length > 0) params.history = state.history.join(",")
  return params
}
