import { db } from "@/lib/db"
import type { AiFeatureResult } from "@/lib/ai/types"

import { getTotalActiveMinimumPaymentsForHealthScore } from "@/features/debt/server/service"
import { getBudgetHealthScore } from "@/features/budgeting/server/service"
import { getMonthlySummary, getNetWorth } from "@/features/dashboard/server/service"
import { getNetWorthValueOnOrBefore } from "@/features/dashboard/server/net-worth-history"
import { getActualReceivedIncomeBySource } from "@/features/recurring-income/server/service"
import type { ActualReceivedIncomeRecord } from "@/features/recurring-income/types"

import type {
  FinancialHealthScoreBreakdown,
  FinancialHealthScoreComponents,
} from "../types"
import {
  aggregateFinancialHealthScore,
  computeDebtToIncomeScore,
  computeNetWorthTrendScore,
  computeSavingsRateScore,
} from "./formula"

/**
 * The Financial Health Score's deterministic 4-component read path
 * (`docs/product/ai-features.md` Feature 5, CTO-resolved 2026-07-22) and its
 * "latest narrative" read — per `docs/architecture/folder-tree.md`'s Phase
 * 4a additions: "service.ts — Backend Engineer's deterministic 4-component
 * formula: getFinancialHealthScore(userId), getLatestNarrative(userId)."
 * The actual scoring math lives in `./formula.ts` (a pure, no-Prisma sibling
 * file, split out purely for single-responsibility/file-size reasons); this
 * file owns gathering each component's raw inputs from the four other
 * domains below and calling into that math.
 *
 * **Zero AI dependency, by construction.** This file imports NOTHING from
 * `lib/ai/` for score computation — only `getLatestNarrative` below reads an
 * already-persisted narrative string (never generates one). Score
 * computation is a live, on-read calculation with no caching of its own,
 * matching this codebase's "compute at read time" convention already
 * established by `budgeting.service.getBudgetHealthScore`, `dashboard
 * .service.getNetWorth`, and `financial-goals`' own progress calculations —
 * none of those cache either, and this feature's own product spec never asks
 * for a cache (only the historical *snapshot*, `./snapshot.ts`, is cadenced).
 *
 * **Pure downstream leaf consumer — zero imports back into this file from
 * any of the four modules below**, mirroring `features/financial-goals/
 * server/service.ts`'s identical "leaf module" acyclicity note:
 *   -> `debt.service.getTotalActiveMinimumPaymentsForHealthScore` (Debt-to-Income)
 *   -> `recurring-income.service.getActualReceivedIncomeBySource` (Debt-to-Income,
 *      Net Worth Trend's income-relative denominator)
 *   -> `budgeting.service.getBudgetHealthScore`, reused verbatim, never
 *      independently recomputed (Budget Adherence — Feature 5's own DoD
 *      requirement)
 *   -> `dashboard.service.getNetWorth`/`getMonthlySummary`,
 *      `dashboard/server/net-worth-history.ts`'s `getNetWorthValueOnOrBefore`
 *      (Net Worth Trend, Savings Rate)
 *
 * **Deliberately does NOT implement `dashboard.service.getFinancialHealthScoreCard`**
 * — api-contracts.md documents that pass-through, mirroring the
 * already-documented-but-never-implemented `getBudgetHealthScoreCard` (the
 * real Dashboard page calls `budgeting.service.getBudgetHealthScore`
 * directly instead; see `app/(dashboard)/page.tsx`). Adding it to
 * `dashboard/server/service.ts` would make that file import from this one,
 * while this file already imports `getNetWorth`/`getMonthlySummary` FROM
 * `dashboard/server/service.ts` — a genuine cross-feature import cycle
 * (`dashboard/service.ts` <-> `financial-health-score/service.ts`). This
 * exact codebase already hit a production-only circular-import failure once
 * (commit `ccce00f`, "Fix Accounts page 500 in production: break circular
 * import" — a `ReferenceError: Cannot access '...' before initialization`
 * that Turbopack's production build surfaced but dev mode never reproduced).
 * Rather than risk a repeat for a pass-through row whose own sibling was
 * never actually wired up, the Dashboard's future summary card is expected
 * to call `getFinancialHealthScore(userId)` directly, exactly like the
 * Budget Health Score's own real, working precedent — flagged here for the
 * Solution Architect/Frontend Lead rather than silently deviating from
 * api-contracts.md without a note.
 *
 * Every exported function takes a pre-resolved `userId` from the caller's
 * `getCurrentUser()` (a Server Component, per api-contracts.md's Feature 5
 * mechanism table) and scopes every query by it — this module never calls
 * `getCurrentUser()` itself and never trusts a client-supplied user id.
 */

/** Rolling window for Savings Rate (ai-features.md Feature 5: "evaluated as
 * a rolling 3-month average... mirroring Financial Goals' own precedent")
 * and for Net Worth Trend's "change... over the trailing 3 months." One
 * shared constant since both components are explicitly the same 3-month
 * window, per the CTO's own "keeps the formula internally consistent"
 * framing for Net Worth Trend's corrected denominator. */
const TRAILING_WINDOW_MONTHS = 3

// ---------------------------------------------------------------------------
// Small date helpers — duplicated from `dashboard/server/service.ts`'s own
// `utcMonthStart`/`formatMonthKey` convention, per this module's "leaf
// module, no cross-imported internals" boundary rule stated above.
// ---------------------------------------------------------------------------

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** `"yyyy-MM"` key for `now`'s month — the `month` argument
 * `budgeting.service.getBudgetHealthScore` requires. */
function formatMonthKey(now: Date): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/** `"yyyy-MM-dd"` key for a UTC date, matching `net-worth-history.ts`'s
 * identical `formatDateKey` convention. */
function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** UTC `Date` exactly `TRAILING_WINDOW_MONTHS` calendar months before `now`
 * (same day-of-month) — the one shared cutoff both Net Worth Trend's
 * snapshot lookup and its trailing-income window start from. */
function trailingWindowCutoff(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - TRAILING_WINDOW_MONTHS, now.getUTCDate()),
  )
}

/**
 * Resolves the trailing `TRAILING_WINDOW_MONTHS` calendar months (including
 * the current, in-progress month) to evaluate Savings Rate's rolling average
 * over, dropping any month before `userCreatedAt`'s own month — the identical
 * technique `features/financial-goals/server/service.ts`'s
 * `resolveRollingSavingsRateWindowMonths` already established (duplicated
 * here per this module's own boundary rule above). A result shorter than
 * `TRAILING_WINDOW_MONTHS` means the account itself isn't old enough yet for
 * 3 qualifying months — the caller below short-circuits to `null` in that
 * case without ever calling `getMonthlySummary`.
 */
function resolveThreeMonthWindow(userCreatedAt: Date, now: Date): Date[] {
  const currentMonthStart = utcMonthStart(now)
  const signupMonthStart = utcMonthStart(userCreatedAt)

  const months: Date[] = []
  for (let offset = TRAILING_WINDOW_MONTHS - 1; offset >= 0; offset--) {
    const monthStart = new Date(
      Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - offset, 1),
    )
    if (monthStart < signupMonthStart) {
      continue
    }
    months.push(monthStart)
  }

  return months
}

function sumIncomeAmounts(records: ActualReceivedIncomeRecord[]): number {
  return records.reduce((sum, record) => sum + record.amount, 0)
}

// ---------------------------------------------------------------------------
// DB-touching component gatherers — one per component, each returning the
// already-scored `number | null` `./formula.ts`'s `computeXScore` produced.
// ---------------------------------------------------------------------------

/** Gathers and scores the Debt-to-Income component for `now`'s calendar
 * month (month-to-date actual income, matching `dashboard.service
 * .getMonthlySummary`'s/`budgeting.service.getBudgetHealthScore`'s own
 * "current month" basis — see `./formula.ts`'s own doc comment for why this
 * isn't rolling-averaged the way Savings Rate is). */
async function gatherDebtToIncomeComponent(userId: string, now: Date): Promise<number | null> {
  const [totalMinimumPayments, incomeRecords] = await Promise.all([
    getTotalActiveMinimumPaymentsForHealthScore(userId),
    getActualReceivedIncomeBySource(userId, { start: utcMonthStart(now), end: now }),
  ])

  return computeDebtToIncomeScore(totalMinimumPayments, sumIncomeAmounts(incomeRecords))
}

/** Gathers and scores the Savings Rate component: the trailing 3-month
 * rolling average of `dashboard.service.getMonthlySummary`'s own
 * `savingsRate`, per `ai-features.md` Feature 5's "mirroring Financial
 * Goals' own precedent" instruction. */
async function gatherSavingsRateComponent(userId: string, now: Date): Promise<number | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
  // Defensive only — callers resolve `userId` from an authenticated session,
  // so a missing user here would mean the session outlived the user record.
  if (!user) {
    return null
  }

  const windowMonths = resolveThreeMonthWindow(user.createdAt, now)
  if (windowMonths.length < TRAILING_WINDOW_MONTHS) {
    return null
  }

  const summaries = await Promise.all(
    windowMonths.map((month) => getMonthlySummary(userId, month)),
  )
  return computeSavingsRateScore(summaries.map((summary) => summary.savingsRate))
}

/** Gathers and scores the Budget Adherence component — reused verbatim from
 * `budgeting.service.getBudgetHealthScore`, per Feature 5's own DoD
 * requirement ("never independently recomputed with new logic"). Its `null`
 * return ("zero categories with an allocation set this month") is Budget
 * Health Score's own existing undefined signal, propagated as-is. */
async function gatherBudgetAdherenceComponent(userId: string, now: Date): Promise<number | null> {
  const budgetHealthScore = await getBudgetHealthScore(userId, formatMonthKey(now))
  return budgetHealthScore?.score ?? null
}

/** Gathers and scores the Net Worth Trend component: `currentNetWorth` is
 * `dashboard.service.getNetWorth`'s live figure (this score "recomputes at
 * next read from live data, same as the Budget Health Score, Debt Tracker,
 * and Financial Goals precedent" — Feature 5 Edge Cases); `priorNetWorth`
 * and `trailingIncome` are both read over the identical
 * `[trailingWindowCutoff(now), now]` window, per the CTO's own "keeps the
 * formula internally consistent" framing for this component's corrected
 * denominator. */
async function gatherNetWorthTrendComponent(userId: string, now: Date): Promise<number | null> {
  const cutoff = trailingWindowCutoff(now)

  const [priorNetWorth, currentNetWorth, incomeRecords] = await Promise.all([
    getNetWorthValueOnOrBefore(userId, cutoff),
    getNetWorth(userId),
    getActualReceivedIncomeBySource(userId, { start: cutoff, end: now }),
  ])

  return computeNetWorthTrendScore({
    priorNetWorth,
    currentNetWorth: currentNetWorth.total,
    trailingIncome: sumIncomeAmounts(incomeRecords),
  })
}

// ---------------------------------------------------------------------------
// Public entry points (api-contracts.md's Feature 5 section)
// ---------------------------------------------------------------------------

/**
 * The Financial Health Score's full breakdown (api-contracts.md's "Get
 * score + 4-component breakdown" row) — a live, on-read computation with no
 * caching of its own (see this file's own top-of-file note). Every one of
 * the four components is gathered concurrently (each is an independent read
 * across a different domain, with no ordering dependency between them).
 *
 * Never throws its own error to signal "not enough data" — that state is
 * represented by `score`/`label: null` (AC4's own empty state), not an
 * exception; an actual thrown error (e.g. a transient DB failure) is left to
 * propagate uncaught, matching every other plain deterministic read in this
 * codebase (`budgeting.service.getBudgetHealthScore`, `dashboard.service
 * .getNetWorth` — neither wraps itself in a try/catch either).
 */
export async function getFinancialHealthScore(
  userId: string,
  now: Date = new Date(),
): Promise<FinancialHealthScoreBreakdown> {
  const [debtToIncome, savingsRate, budgetAdherence, netWorthTrend] = await Promise.all([
    gatherDebtToIncomeComponent(userId, now),
    gatherSavingsRateComponent(userId, now),
    gatherBudgetAdherenceComponent(userId, now),
    gatherNetWorthTrendComponent(userId, now),
  ])

  const components: FinancialHealthScoreComponents = {
    debtToIncome,
    savingsRate,
    budgetAdherence,
    netWorthTrend,
  }
  const { score, label, undefinedComponents } = aggregateFinancialHealthScore(components)

  return { score, label, components, undefinedComponents }
}

/**
 * The most recently generated Financial Health Score narrative
 * (api-contracts.md's "Get the latest narrative" row) — a plain row read,
 * never a generation call (this feature has no on-demand refresh action; see
 * `health-score-narrative.ts`'s own doc comment). Reads whichever
 * `FinancialHealthScoreSnapshot` row is the most recent one with a
 * non-`null` `narrative` — not necessarily *today's* row, so a narrative
 * generated a few days ago still surfaces if the most recent snapshot
 * attempt(s) failed to generate one, per Feature 5's own "the narrative
 * explains the score but a failure never blocks anything else" degradation
 * guarantee.
 */
export async function getLatestNarrative(
  userId: string,
): Promise<AiFeatureResult<{ narrative: string; asOf: string }>> {
  const row = await db.financialHealthScoreSnapshot.findFirst({
    where: { userId, narrative: { not: null } },
    orderBy: { capturedDate: "desc" },
    select: { narrative: true, capturedDate: true },
  })

  if (!row || row.narrative === null) {
    return { status: "unavailable" }
  }

  return {
    status: "ok",
    data: { narrative: row.narrative, asOf: formatDateKey(row.capturedDate) },
  }
}
