import { FinancialHealthScoreLabel as PrismaFinancialHealthScoreLabel } from "@prisma/client"

import { db } from "@/lib/db"

import {
  generateFinancialHealthScoreNarrative,
  type GenerateFinancialHealthScoreNarrativeResult,
} from "./health-score-narrative"
import type {
  HealthScoreNarrativeComponents,
  HealthScoreSnapshotValues,
} from "./health-score-narrative-schema"
import { getFinancialHealthScore } from "./service"
import type { FinancialHealthScoreHistoryPoint, FinancialHealthScoreLabel } from "../types"

/**
 * The Financial Health Score's historical-snapshot cron capture job
 * (`docs/product/ai-features.md` Feature 5 AC7, CTO-resolved 2026-07-22 — "a
 * new sibling table, reusing the proven *pattern* [...] rather than the same
 * rows"). Mirrors `features/dashboard/server/snapshot.ts`'s
 * `captureAllUsersNetWorthSnapshots`/`features/dashboard/server/
 * monthly-summary.ts`'s `generateMonthlySummariesForAllUsers` sequential-loop
 * pattern exactly, per `docs/architecture/folder-tree.md`'s "mirroring
 * dashboard/server/snapshot.ts's proven pattern" instruction, and per
 * `docs/architecture/ai-features-design.md` §6's explicit recommendation:
 * "generate+persist the narrative in the same invocation [as the score
 * snapshot], not a separate schedule."
 *
 * **This is a batch job with no calling user**, unlike every other exported
 * function under this feature's `server/` directory — called by
 * `app/api/cron/financial-health-score-snapshot/route.ts` (a
 * shared-secret-authenticated Route Handler, not a user session), acting
 * across every user in the system on a time cadence.
 *
 * **The narrative can never block or roll back the score.** Per
 * `prisma/schema.prisma`'s own `FinancialHealthScoreSnapshot.narrative`
 * comment and Feature 5's own strongest degradation guarantee: the score's
 * four component columns + `totalScore`/`label` are always upserted FIRST,
 * as their own independent write; the narrative is generated and persisted
 * as a SEPARATE, second write only after that first write has already
 * durably committed, wrapped in its own try/catch so a narrative-generation
 * exception can never surface as a failure of the score capture itself (see
 * `captureFinancialHealthScoreSnapshot`'s two-step body below).
 */

/** Result of attempting to capture one user's snapshot for "today." */
export interface FinancialHealthScoreSnapshotCaptureResult {
  userId: string
  /** Whether a NEW narrative was generated and persisted onto today's row
   * this invocation — `false` on a same-day retry that already has one (see
   * `captureFinancialHealthScoreSnapshot`'s own "at most once per
   * successfully-generated narrative per day" note), and `false` when
   * generation was attempted but failed/unavailable. */
  narrativeGenerated: boolean
}

/** UTC-truncated calendar date for `capturedAt` — matches
 * `NetWorthSnapshot.capturedDate`'s identical convention (risk-register.md
 * #8) and this model's own schema comment. */
function toUtcCapturedDate(capturedAt: Date): Date {
  return new Date(
    Date.UTC(capturedAt.getUTCFullYear(), capturedAt.getUTCMonth(), capturedAt.getUTCDate()),
  )
}

/** `"yyyy-MM-dd"` key for a UTC date, matching `net-worth-history.ts`'s/
 * `service.ts`'s identical `formatDateKey` convention. */
function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** `FinancialHealthScoreLabel` (this feature's plain `"Good" | "Fair" |
 * "Needs attention"` string union) <-> Prisma's `FinancialHealthScoreLabel`
 * enum (`GOOD` / `FAIR` / `NEEDS_ATTENTION`) — the one place this narrow
 * boundary is crossed, mirroring `MonthlySummary`'s own DTO-conversion
 * precedent for its `Prisma.JsonValue` columns. Exported (not just a private
 * helper) so this pure conversion is directly unit-testable without a
 * database, mirroring `net-worth-history.ts`'s `resolveRangeStart`/
 * `thinRows` "extract the pure calculation, test it in isolation"
 * precedent. See `snapshot.test.ts`. */
export function toPrismaLabel(
  label: FinancialHealthScoreLabel,
): PrismaFinancialHealthScoreLabel {
  switch (label) {
    case "Good":
      return PrismaFinancialHealthScoreLabel.GOOD
    case "Fair":
      return PrismaFinancialHealthScoreLabel.FAIR
    case "Needs attention":
      return PrismaFinancialHealthScoreLabel.NEEDS_ATTENTION
  }
}

export function fromPrismaLabel(
  label: PrismaFinancialHealthScoreLabel,
): FinancialHealthScoreLabel {
  switch (label) {
    case PrismaFinancialHealthScoreLabel.GOOD:
      return "Good"
    case PrismaFinancialHealthScoreLabel.FAIR:
      return "Fair"
    case PrismaFinancialHealthScoreLabel.NEEDS_ATTENTION:
      return "Needs attention"
  }
}

/** Narrow shape of a persisted `FinancialHealthScoreSnapshot` row this file
 * reads back — just enough columns for the narrative's `previous` argument
 * and for this file's own "already has a narrative today" idempotency
 * check. */
interface SnapshotRow {
  narrative: string | null
  totalScore: number | null
  label: PrismaFinancialHealthScoreLabel | null
  debtToIncomeScore: number | null
  savingsRateScore: number | null
  budgetAdherenceScore: number | null
  netWorthTrendScore: number | null
}

/** Converts a persisted row into `health-score-narrative-schema.ts`'s
 * `HealthScoreSnapshotValues` shape — the exact `previous` argument
 * `generateFinancialHealthScoreNarrative` expects, per that file's own
 * "Caller contract" doc comment. */
function toNarrativeSnapshotValues(row: SnapshotRow): HealthScoreSnapshotValues {
  const components: HealthScoreNarrativeComponents = {
    debtToIncome: row.debtToIncomeScore,
    savingsRate: row.savingsRateScore,
    budgetAdherence: row.budgetAdherenceScore,
    netWorthTrend: row.netWorthTrendScore,
  }

  return {
    totalScore: row.totalScore,
    label: row.label === null ? null : fromPrismaLabel(row.label),
    components,
  }
}

/**
 * Captures one Financial Health Score snapshot row for `userId`, keyed on
 * the UTC calendar date of `capturedAt` (defaults to "now"), then attempts
 * (at most once per day, per successful generation) the narrative that
 * explains it.
 *
 * **Step 1 — the score, via `upsert` on `(userId, capturedDate)`.**
 * `prisma/schema.prisma`'s own `FinancialHealthScoreSnapshot.capturedDate`
 * comment prescribes `upsert` (not `NetWorthSnapshot`'s create-then-
 * catch-P2002 "first attempt wins" idempotency) — a same-day retry
 * intentionally recomputes and overwrites that day's component/total/label
 * columns with fresh live data, since this score (unlike a point-in-time Net
 * Worth balance) is cheap, side-effect-free, and always "correct as of right
 * now" to recompute.
 *
 * **Step 2 — the narrative, only once per day.** Because `upsert` (unlike
 * `NetWorthSnapshot`'s create-only idempotency) does not by itself prevent
 * a same-day retry from reaching this function again, this function reads
 * today's row BEFORE step 1 and skips narrative generation entirely if it
 * already has one — reproducing "at most one successfully-generated
 * narrative per user per day" (the guarantee `health-score-narrative.ts`'s
 * own doc comment assumes its caller provides), while still allowing a
 * *retry after a prior failed/unavailable attempt* to try again later the
 * same day, which is a deliberate, desirable property (a transient provider
 * outage on the first attempt doesn't have to wait until tomorrow).
 *
 * The narrative step is wrapped in its own try/catch, independent of step
 * 1's write — a narrative exception here can never roll back or block the
 * score write that already committed, satisfying Feature 5's strongest
 * degradation guarantee structurally, not just by convention.
 */
export async function captureFinancialHealthScoreSnapshot(
  userId: string,
  capturedAt: Date = new Date(),
): Promise<FinancialHealthScoreSnapshotCaptureResult> {
  const capturedDate = toUtcCapturedDate(capturedAt)

  const [breakdown, existingRow, previousRow] = await Promise.all([
    getFinancialHealthScore(userId, capturedAt),
    db.financialHealthScoreSnapshot.findUnique({
      where: { userId_capturedDate: { userId, capturedDate } },
      select: {
        narrative: true,
        totalScore: true,
        label: true,
        debtToIncomeScore: true,
        savingsRateScore: true,
        budgetAdherenceScore: true,
        netWorthTrendScore: true,
      },
    }),
    db.financialHealthScoreSnapshot.findFirst({
      where: { userId, capturedDate: { lt: capturedDate } },
      orderBy: { capturedDate: "desc" },
      select: {
        narrative: true,
        totalScore: true,
        label: true,
        debtToIncomeScore: true,
        savingsRateScore: true,
        budgetAdherenceScore: true,
        netWorthTrendScore: true,
      },
    }),
  ])

  // Step 1: the deterministic score — always written, independent of
  // whatever happens with the narrative below.
  await db.financialHealthScoreSnapshot.upsert({
    where: { userId_capturedDate: { userId, capturedDate } },
    create: {
      userId,
      capturedAt,
      capturedDate,
      debtToIncomeScore: breakdown.components.debtToIncome,
      savingsRateScore: breakdown.components.savingsRate,
      budgetAdherenceScore: breakdown.components.budgetAdherence,
      netWorthTrendScore: breakdown.components.netWorthTrend,
      totalScore: breakdown.score,
      label: breakdown.label === null ? null : toPrismaLabel(breakdown.label),
    },
    update: {
      capturedAt,
      debtToIncomeScore: breakdown.components.debtToIncome,
      savingsRateScore: breakdown.components.savingsRate,
      budgetAdherenceScore: breakdown.components.budgetAdherence,
      netWorthTrendScore: breakdown.components.netWorthTrend,
      totalScore: breakdown.score,
      label: breakdown.label === null ? null : toPrismaLabel(breakdown.label),
      // `narrative` intentionally omitted — step 2 below owns that column.
    },
  })

  if (existingRow?.narrative) {
    return { userId, narrativeGenerated: false }
  }

  try {
    const current = {
      totalScore: breakdown.score,
      label: breakdown.label,
      components: breakdown.components,
    }
    const previous = previousRow ? toNarrativeSnapshotValues(previousRow) : null

    const narrativeResult = await generateFinancialHealthScoreNarrative(
      userId,
      current,
      previous,
      capturedAt,
    )

    if (narrativeResult.status !== "ok") {
      return { userId, narrativeGenerated: false }
    }

    await persistNarrative(userId, capturedDate, narrativeResult.data)
    return { userId, narrativeGenerated: true }
  } catch (error) {
    console.error(
      `[financial-health-score snapshot] Narrative generation failed for user ${userId}:`,
      error,
    )
    return { userId, narrativeGenerated: false }
  }
}

/** The narrative's own persistence step — deliberately separate from step
 * 1's `upsert` above (never re-touches the score columns), so a narrative
 * write can never accidentally clobber the score this same invocation just
 * committed. */
async function persistNarrative(
  userId: string,
  capturedDate: Date,
  data: GenerateFinancialHealthScoreNarrativeResult,
): Promise<void> {
  await db.financialHealthScoreSnapshot.update({
    where: { userId_capturedDate: { userId, capturedDate } },
    data: { narrative: data.narrative },
  })
}

export interface CaptureAllUsersFinancialHealthScoreSnapshotsResult {
  /** Number of users this invocation attempted to snapshot — every user in
   * the system. Unlike `captureAllUsersNetWorthSnapshots`'s "at least one
   * non-archived Account" gate, this feature has no single prerequisite data
   * source (a user might only have Debts, or only Recurring Income, or
   * neither yet) — `getFinancialHealthScore`'s own per-component `null`
   * handling, not a pre-filter here, is what correctly represents "this user
   * has no computable score yet" (mirrors `generateMonthlySummariesForAllUsers`'s
   * "still write a row for a zero-activity month" precedent over
   * `captureAllUsersNetWorthSnapshots`'s "skip a user with nothing to
   * snapshot" one — a deliberate choice between two established precedents,
   * flagged here since it's a genuine judgment call, not a copy-paste of
   * either). */
  processed: number
  /** Of `processed`, how many got a newly-persisted narrative this
   * invocation. */
  narrativesGenerated: number
}

/**
 * Captures a Financial Health Score snapshot for every user in the system.
 * Loops sequentially (not `Promise.all`), never concurrently — mirrors
 * `captureAllUsersNetWorthSnapshots`'s/`generateMonthlySummariesForAllUsers`'s
 * identical sequential-loop precedent, for the same connection-count/
 * performance reasoning and, independently, as the concrete mechanism
 * upholding `ai-features-design.md` §4.5's cross-user isolation invariant in
 * practice (every `generateStructuredOutput` call inside the narrative step
 * is for exactly one already-resolved `userId`, never a batch spanning more
 * than one user).
 *
 * A single user's failure (an unexpected error thrown by
 * `captureFinancialHealthScoreSnapshot` itself, not merely a
 * failed/unavailable narrative — that path already returns normally, see
 * that function's own try/catch) is caught and logged here rather than
 * aborting the whole run, per [Finding 7]'s "the rest keeps working"
 * standard, mirroring `generateMonthlySummariesForAllUsers`'s identical
 * per-user catch.
 */
export async function captureAllUsersFinancialHealthScoreSnapshots(
  capturedAt: Date = new Date(),
): Promise<CaptureAllUsersFinancialHealthScoreSnapshotsResult> {
  const users = await db.user.findMany({ select: { id: true } })

  let narrativesGenerated = 0

  for (const user of users) {
    try {
      const result = await captureFinancialHealthScoreSnapshot(user.id, capturedAt)
      if (result.narrativeGenerated) {
        narrativesGenerated += 1
      }
    } catch (error) {
      console.error(
        `[financial-health-score-snapshot cron] Failed to process user ${user.id}:`,
        error,
      )
    }
  }

  return { processed: users.length, narrativesGenerated }
}

// ---------------------------------------------------------------------------
// Read path — the historical trend sparkline (api-contracts.md's "Get
// historical trend (sparkline)" row).
// ---------------------------------------------------------------------------

/**
 * The user's historical Financial Health Score trend (AC7's sparkline) —
 * one point per day that had a computable `totalScore`. A day whose row
 * exists but has `totalScore: null` (zero components were computable that
 * day) contributes no point at all, rather than a fabricated `0`, mirroring
 * `NetWorthHistoryPoint`'s own "never fabricate a data point" precedent —
 * see `../types.ts`'s `FinancialHealthScoreHistoryPoint` doc comment.
 */
export async function getFinancialHealthScoreHistory(
  userId: string,
): Promise<FinancialHealthScoreHistoryPoint[]> {
  const rows = await db.financialHealthScoreSnapshot.findMany({
    where: { userId, totalScore: { not: null } },
    orderBy: { capturedDate: "asc" },
    select: { capturedDate: true, totalScore: true },
  })

  return rows
    .filter((row): row is { capturedDate: Date; totalScore: number } => row.totalScore !== null)
    .map((row) => ({ date: formatDateKey(row.capturedDate), score: row.totalScore }))
}
