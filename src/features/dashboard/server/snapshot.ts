import { Prisma } from "@prisma/client"

import { db } from "@/lib/db"

import { getNetWorth } from "./service"

// The Net Worth Snapshot job (docs/architecture/api-contracts.md's "Net Worth
// Snapshot job" section, docs/database/er-diagram.md's Phase 3a design note
// #6). This is the first not-request-triggered write path in the codebase:
// unlike every other `server/*.ts` module, the functions here are not called
// with a single `userId` resolved from `getCurrentUser()` — they are called
// by `app/api/cron/net-worth-snapshot/route.ts` (a shared-secret-authenticated
// Route Handler, not a user session) and must act across every user in the
// system on a time cadence, independent of any user visiting any page.
//
// No new calculation logic lives here — `captureNetWorthSnapshot` calls the
// exact same `service.getNetWorth` the Dashboard page already renders from,
// and persists a timestamped copy of the numbers it returns. This keeps the
// Net Worth formula itself defined in exactly one place (`service.ts`); if
// that formula ever changes, both the live Dashboard figure and future
// snapshots pick up the change automatically, with zero duplication here.

/** Result of attempting to capture one user's snapshot for "today" (the UTC
 * calendar date derived from `capturedAt`). `created: false` means a snapshot
 * for that user/day already existed — the idempotency guard
 * (`@@unique([userId, capturedDate])`) rejected the insert, which is the
 * expected, non-error outcome of the cron route being invoked more than once
 * on the same day (a retry after a timeout, or a scheduler misconfiguration),
 * not a failure. */
export interface NetWorthSnapshotCaptureResult {
  userId: string
  created: boolean
}

/**
 * Captures one Net Worth Snapshot row for `userId`, keyed on the UTC calendar
 * date of `capturedAt` (defaults to "now").
 *
 * Uses `create` + catch-and-ignore the unique violation (P2002), one of the
 * two idempotency mechanisms api-contracts.md explicitly allows for this job
 * (the other being `upsert`) — chosen over `upsert` here specifically so a
 * second invocation on the same day is a true no-op that leaves the day's
 * first-captured numbers untouched, rather than silently overwriting them
 * with whatever the account/debt state happens to be at retry time. This
 * mirrors `features/bills/server/actions.ts`'s and
 * `features/recurring-income/server/actions.ts`'s own `@unique` +
 * P2002-catch precedent for a same-table uniqueness guard, applied here to a
 * time-triggered idempotency problem instead of a request-triggered one.
 *
 * `totalAccountBalance` is derived from `getNetWorth`'s own return shape
 * (`total + totalUnlinkedDebtLiability`, the inverse of `total`'s own
 * `totalAccountBalance - totalUnlinkedDebtLiability` computation in
 * `service.ts`) rather than queried a second time — `getNetWorth` is the one
 * place the Account-sum is computed, and this avoids re-deriving it here.
 */
export async function captureNetWorthSnapshot(
  userId: string,
  capturedAt: Date = new Date(),
): Promise<NetWorthSnapshotCaptureResult> {
  const netWorth = await getNetWorth(userId)
  const totalAccountBalance = netWorth.total + netWorth.totalUnlinkedDebtLiability

  // UTC-truncated calendar date, matching Transaction.date/Budget.month's
  // existing convention (per risk-register.md #8) and this model's own
  // `capturedDate @db.Date` comment in prisma/schema.prisma.
  const capturedDate = new Date(
    Date.UTC(
      capturedAt.getUTCFullYear(),
      capturedAt.getUTCMonth(),
      capturedAt.getUTCDate(),
    ),
  )

  try {
    await db.netWorthSnapshot.create({
      data: {
        userId,
        capturedAt,
        capturedDate,
        totalAccountBalance,
        totalUnlinkedDebtLiability: netWorth.totalUnlinkedDebtLiability,
        totalNetWorth: netWorth.total,
      },
    })
    return { userId, created: true }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { userId, created: false }
    }
    throw error
  }
}

/** Summary returned by `captureAllUsersNetWorthSnapshots`, surfaced as-is by
 * the cron Route Handler (with `processed` also satisfying
 * api-contracts.md's minimal `{ processed: number }` output contract —
 * `created`/`skipped` are additive detail for observability, not a
 * redesign of that contract). */
export interface CaptureAllUsersNetWorthSnapshotsResult {
  /** Number of users this invocation attempted to snapshot (every user with
   * at least one non-archived Account). */
  processed: number
  /** Of `processed`, how many got a brand-new row for today. */
  created: number
  /** Of `processed`, how many already had a row for today (idempotent
   * no-op — see `captureNetWorthSnapshot`'s doc). */
  skipped: number
}

/**
 * Captures a Net Worth Snapshot for every user with at least one
 * non-archived Account. This is a batch job with no calling user, unlike
 * every other exported function under any feature's `server` directory —
 * see this module's own top-of-file note.
 *
 * A user with zero non-archived Accounts is excluded rather than snapshotted
 * at `$0`: `getNetWorth` would return `total: 0` for such a user, which is
 * not "this user's net worth is zero" (a real, meaningful data point) but
 * "this user has no data yet" (dashboard-overview.md's own "brand-new user"
 * edge case) — recording a history of meaningless zeroes would misrepresent
 * this the moment Phase 3b's chart reads it back.
 *
 * Loops sequentially (not `Promise.all`) rather than issuing every user's
 * query concurrently: this is a batch job with no per-request latency
 * budget, and a sequential loop keeps this cron invocation from opening one
 * Prisma connection per user in the system at once. Per
 * api-contracts.md's own Performance Engineer flag, if the user base grows
 * large enough for a single invocation to run long, the fix is
 * batching/pagination within this function (process N users per invocation,
 * track a cursor) — not a switch to unbounded concurrency, which would make
 * that future problem worse, not better.
 */
export async function captureAllUsersNetWorthSnapshots(
  capturedAt: Date = new Date(),
): Promise<CaptureAllUsersNetWorthSnapshotsResult> {
  const usersWithAnAccount = await db.user.findMany({
    where: { financialAccounts: { some: { archivedAt: null } } },
    select: { id: true },
  })

  let created = 0
  let skipped = 0

  for (const user of usersWithAnAccount) {
    const result = await captureNetWorthSnapshot(user.id, capturedAt)
    if (result.created) {
      created += 1
    } else {
      skipped += 1
    }
  }

  return { processed: usersWithAnAccount.length, created, skipped }
}
