/**
 * Financial Health Score (Phase 4a, Feature 5) — plain, client-safe types.
 * Per `docs/architecture/folder-tree.md`'s Phase 4a additions: "types.ts —
 * FinancialHealthScoreBreakdown, FinancialHealthScoreLabel (no hooks/ folder
 * — no client toggle/refetch need; the trend sparkline has no interactive
 * range selector per spec)."
 *
 * Every shape below is a plain value (no `Decimal`, no Prisma enum) — the
 * deterministic score has ZERO AI dependency and is never `AiFeatureResult`-
 * wrapped, per `docs/architecture/api-contracts.md`'s Feature 5 section:
 * "`FinancialHealthScoreBreakdown` — a plain value, never `AiFeatureResult`-
 * wrapped, per Feature 5's own strongest-degradation guarantee."
 */

/**
 * Reuses the Budget Health Score's own banded labels verbatim
 * (`docs/product/ai-features.md` Feature 5, Reasoning point 6 / AC3) — never
 * a new label set, and never re-derived independently of
 * `features/budgeting/types.ts`'s `BudgetHealthScore["label"]` string union
 * (kept as its own local type here, not imported, per this codebase's
 * "features/<domain> modules don't cross-import each other's types" module
 * boundary convention — see `server/service.ts`'s own note on this).
 */
export type FinancialHealthScoreLabel = "Good" | "Fair" | "Needs attention"

/** The four component keys, per `ai-features.md` Feature 5's formula. Matches
 * `FinancialHealthScoreSnapshot`'s four `*Score` columns (`prisma/schema.prisma`,
 * suffix removed) and `health-score-narrative-schema.ts`'s own
 * `HealthScoreNarrativeComponentKey` union structurally (that file's own
 * "Module boundary" note explains why it doesn't import this one). */
export type FinancialHealthScoreComponentKey =
  | "debtToIncome"
  | "savingsRate"
  | "budgetAdherence"
  | "netWorthTrend"

/**
 * One snapshot's four component values (0–100 each), independently nullable
 * per the formula's own "undefined component, not zero" rule
 * (`ai-features.md` Feature 5's "Undefined-component handling").
 */
export interface FinancialHealthScoreComponents {
  debtToIncome: number | null
  savingsRate: number | null
  budgetAdherence: number | null
  netWorthTrend: number | null
}

/**
 * `service.getFinancialHealthScore(userId)`'s return shape, matching
 * `docs/architecture/api-contracts.md`'s documented `FinancialHealthScoreBreakdown`
 * shape exactly:
 *
 * - `score`/`label` are `null` together exactly when **zero** components are
 *   computable (a brand-new user with no data anywhere) — Feature 5's own
 *   "never show a misleading 0" rule (AC4, Edge Cases).
 * - `undefinedComponents` names which component(s), if any, are currently
 *   undefined and why-labeled in the UI (AC4's "clearly annotated" partial
 *   score requirement) — derived from `components` (any `null` entry), never
 *   a separately-tracked, independently-settable field.
 */
export interface FinancialHealthScoreBreakdown {
  score: number | null
  label: FinancialHealthScoreLabel | null
  components: FinancialHealthScoreComponents
  undefinedComponents: FinancialHealthScoreComponentKey[]
}

/** `snapshot.getFinancialHealthScoreHistory(userId)`'s return shape
 * (api-contracts.md's Feature 5 "Get historical trend (sparkline)" row) — one
 * point per day that had a computable `totalScore`; a day with zero
 * computable components (per the formula's own null-total rule) contributes
 * no point at all, rather than a fabricated `0`, mirroring
 * `NetWorthHistoryPoint`'s own "never fabricate a data point" precedent. */
export interface FinancialHealthScoreHistoryPoint {
  date: string
  score: number
}
