import { z } from "zod"

import type { ReportingPeriod, SpendingInsightsPeriod } from "../types"

/**
 * Parses the shared reporting-period control's kebab-case searchParam value
 * (`?period=this-year|last-12-months|year-to-date|all-time`, per
 * docs/architecture/api-contracts.md's Analytics section and
 * naming-standards.md's URL-searchParam convention) into the `ReportingPeriod`
 * union `server/period.ts`'s `resolveReportingPeriodRange` expects.
 *
 * Defaults to `"this-year"` (`THIS_YEAR`) for a missing/unrecognized value —
 * api-contracts.md's stated default — rather than throwing, since this
 * schema's primary caller is `app/(dashboard)/analytics/page.tsx` reading an
 * optional, user-editable URL searchParam (a malformed/stale URL must never
 * 500 the page).
 */
const PERIOD_PARAM_TO_ENUM: Record<string, ReportingPeriod> = {
  "this-year": "THIS_YEAR",
  "last-12-months": "LAST_12_MONTHS",
  "year-to-date": "YEAR_TO_DATE",
  "all-time": "ALL_TIME",
}

const DEFAULT_REPORTING_PERIOD: ReportingPeriod = "THIS_YEAR"

export const ReportingPeriodSchema = z
  .string()
  .optional()
  .transform((value): ReportingPeriod => {
    if (!value) {
      return DEFAULT_REPORTING_PERIOD
    }
    return PERIOD_PARAM_TO_ENUM[value] ?? DEFAULT_REPORTING_PERIOD
  })

export type ReportingPeriodParam = z.infer<typeof ReportingPeriodSchema>

// ---------------------------------------------------------------------------
// Top Merchants / Largest Purchases' shared `limit` option
// ---------------------------------------------------------------------------

/** Upper bound on `limit` for `expense-breakdown.ts`'s `getTopMerchants`/
 * `getLargestPurchases` — both accept a caller-supplied `limit`, and this
 * guards against an accidentally huge value turning a "top N" read into an
 * unbounded one. Not part of api-contracts.md's contract (which only states
 * each function's *default* of 20), so this is an implementation-level
 * safety rail, not a product-specified limit. */
const MAX_TOP_N_LIMIT = 200

/** Clamps a caller-supplied `limit` to a positive integer no larger than
 * `MAX_TOP_N_LIMIT`, falling back to `fallback` (each caller's own default)
 * for a missing/non-finite/non-positive value. Shared by `getTopMerchants`
 * and `getLargestPurchases` so the same guard rule can't drift between the
 * two. */
export function resolveLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return fallback
  }
  const truncated = Math.trunc(limit)
  return Math.min(Math.max(truncated, 1), MAX_TOP_N_LIMIT)
}

// ---------------------------------------------------------------------------
// Subscription Cost Detection's dismiss action (Pass 2)
// ---------------------------------------------------------------------------

/**
 * Input schema for the `dismissSubscriptionCandidate` Server Action
 * (`server/actions.ts`), per api-contracts.md's Analytics section.
 *
 * `normalizedMerchantName` MUST already be the output of
 * `lib/merchant-normalization.ts`'s `normalizeMerchantName` — this schema
 * only validates shape (a non-empty string), not that it's a real,
 * currently-detected candidate; `actions.ts` upserts it as-is into
 * `DismissedSubscriptionMerchant`, per that model's own doc comment in
 * prisma/schema.prisma ("MUST be the exact output of ... normalizeMerchantName()").
 * The client always sources this value from a rendered
 * `SubscriptionCandidate.normalizedMerchantName` (never free-typed by a
 * user), so re-deriving/re-validating the normalization here would be
 * redundant, not a meaningful extra safety check.
 */
export const DismissSubscriptionCandidateSchema = z.object({
  normalizedMerchantName: z.string().min(1, "normalizedMerchantName is required"),
})

/**
 * Input schema for the `undismissSubscriptionMerchant` Server Action
 * (`server/actions.ts`) — the reversal of `dismissSubscriptionCandidate`
 * (bugfix: docs/testing/bug-reports/
 * subscription-dismissal-normalized-name-collision.md's "minimum viable
 * fix": make a dismissal recoverable). Same shape as
 * `DismissSubscriptionCandidateSchema` for the same reason: this value is
 * always sourced from a rendered `DismissedSubscriptionMerchantEntry.
 * normalizedMerchantName` (never free-typed), so only shape validation is
 * needed here, not re-derivation.
 */
export const UndismissSubscriptionMerchantSchema = z.object({
  normalizedMerchantName: z.string().min(1, "normalizedMerchantName is required"),
})

// ---------------------------------------------------------------------------
// Spending Insights' refresh action (Phase 4a)
// ---------------------------------------------------------------------------

/**
 * Kebab-case wire values for `SpendingInsightsPeriod` (`../types.ts`) -- the
 * same four `ReportingPeriod` values `PERIOD_PARAM_TO_ENUM` above already
 * uses, plus one addition (`"dashboard-default"`) for the Dashboard's own
 * fixed default (AC5). Deliberately a *separate* map from
 * `PERIOD_PARAM_TO_ENUM` above rather than a shared/extended one: that map's
 * job is parsing a possibly-stale/missing URL searchParam leniently (falling
 * back to a default), while this one is a Server-Action *mutation* input --
 * `RefreshSpendingInsightsSchema` below rejects an unrecognized value
 * outright, matching `SetAllocationSchema`/`RefreshBudgetAdvisorSchema`'s
 * strict-validation convention for Server Action inputs, rather than
 * silently defaulting the way a resilient URL param must.
 */
const SPENDING_INSIGHTS_PERIOD_PARAMS = [
  "this-year",
  "last-12-months",
  "year-to-date",
  "all-time",
  "dashboard-default",
] as const

const SPENDING_INSIGHTS_PERIOD_PARAM_TO_ENUM: Record<
  (typeof SPENDING_INSIGHTS_PERIOD_PARAMS)[number],
  SpendingInsightsPeriod
> = {
  "this-year": "THIS_YEAR",
  "last-12-months": "LAST_12_MONTHS",
  "year-to-date": "YEAR_TO_DATE",
  "all-time": "ALL_TIME",
  "dashboard-default": "DASHBOARD_DEFAULT",
}

/**
 * `refreshSpendingInsights` Server Action input (docs/product/ai-features.md
 * Feature 4 AC4, docs/architecture/api-contracts.md's Feature 4 section:
 * `{ period }`). Ordinary Server-Action *input* validation, per
 * naming-standards.md's Phase 4a convention -- this is deliberately not in
 * `insights-schema.ts`, which is reserved exclusively for the shape the AI
 * call itself must return.
 */
export const RefreshSpendingInsightsSchema = z.object({
  period: z
    .enum(SPENDING_INSIGHTS_PERIOD_PARAMS)
    .transform((value) => SPENDING_INSIGHTS_PERIOD_PARAM_TO_ENUM[value]),
})

export type RefreshSpendingInsightsInput = z.infer<typeof RefreshSpendingInsightsSchema>
