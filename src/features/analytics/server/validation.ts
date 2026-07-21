import { z } from "zod"

import type { ReportingPeriod } from "../types"

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
